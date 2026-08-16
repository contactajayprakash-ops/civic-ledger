// Legistar (Granicus) is the meeting-management system used by a few hundred
// US cities and counties. Its public Web API returns meetings, agenda items,
// roll-call votes and full legislative text as JSON, so for these cities we
// don't need to scrape anything: we read the record straight from the source.
//
// Docs: https://webapi.legistar.com/Help

import type { Action, Matter, Meeting, Outcome, Vote } from "../types";
import { classify, extractMoney, extractDistrict } from "../heuristics";
import { mapLimit } from "../util";

const API = "https://webapi.legistar.com/v1";

interface LegistarEvent {
  EventId: number;
  EventGuid: string;
  EventBodyName: string;
  EventDate: string;
  EventTime: string | null;
  EventLocation: string | null;
  EventAgendaFile: string | null;
  EventMinutesFile: string | null;
  EventAgendaStatusName: string | null;
  EventMinutesStatusName: string | null;
  EventInSiteURL: string | null;
  EventVideoPath?: string | null;
}

interface LegistarEventItem {
  EventItemId: number;
  EventItemGuid: string;
  EventItemAgendaSequence: number | null;
  EventItemMatterId: number | null;
  EventItemMatterGuid: string | null;
  EventItemMatterFile: string | null;
  EventItemMatterName: string | null;
  EventItemMatterType: string | null;
  EventItemMatterStatus: string | null;
  EventItemTitle: string | null;
  EventItemActionName: string | null;
  EventItemPassedFlagName: string | null;
  EventItemTally: string | null;
  EventItemVoteInfo?: LegistarVote[];
}

interface LegistarVote {
  VotePersonName: string;
  VoteValueName: string;
}

interface LegistarMatter {
  MatterId: number;
  MatterGuid: string;
  MatterFile: string;
  MatterTitle: string;
  MatterTypeName: string;
  MatterStatusName: string;
  MatterBodyName: string;
  MatterIntroDate: string | null;
  MatterPassedDate: string | null;
  MatterAgendaDate: string | null;
}

interface LegistarSponsor {
  MatterSponsorName: string;
}

export interface LegistarFetchOptions {
  client: string;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  bodies?: RegExp; // which meeting bodies to keep; default = anything with "council"
  concurrency?: number;
  fetchText?: boolean;
  fetchVotes?: boolean;
  onProgress?: (msg: string) => void;
  fetchImpl?: typeof fetch;
}

async function getJson<T>(url: string, fetchImpl: typeof fetch = fetch, tries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetchImpl(url, { headers: { accept: "application/json" } });
      if (res.status === 404) return [] as unknown as T;
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastErr;
}

export function legistarWebBase(client: string) {
  return `https://${client}.legistar.com`;
}

function normalizeVote(raw: string): Vote["value"] {
  const v = raw.toLowerCase();
  if (/^(aye|yes|yea|in favor|approve)/.test(v)) return "yes";
  if (/^(nay|no|against|oppose)/.test(v)) return "no";
  if (/abstain|recuse|present/.test(v)) return "abstain";
  if (/absent|excused|not present|out of room/.test(v)) return "absent";
  return "other";
}

export function outcomeFromAction(action: string | null, passedFlag: string | null): Outcome {
  const a = (action || "").toLowerCase();
  const p = (passedFlag || "").toLowerCase();
  if (/withdraw/.test(a)) return "withdrawn";
  if (/refer|read and referred|committee|first reading|introduc/.test(a)) return "referred";
  if (/held|hold|postpone|tabled|table|defer|continued|recommit/.test(a)) return "held";
  if (/fail|defeat|not pass|denied|reject/.test(a) || p === "fail") return "failed";
  if (
    /pass|adopt|approve|enact|confirm|waived|received and filed|filed|carried|granted|accepted/.test(a) ||
    p === "pass"
  )
    return "passed";
  if (/discuss|present|hearing|briefing|report/.test(a)) return "discussed";
  if (!a) return "unknown";
  return "discussed";
}

function tallyOf(votes: Vote[]) {
  const t = { yes: 0, no: 0, abstain: 0, absent: 0 };
  for (const v of votes) {
    if (v.value === "yes") t.yes++;
    else if (v.value === "no") t.no++;
    else if (v.value === "abstain") t.abstain++;
    else if (v.value === "absent") t.absent++;
  }
  return t;
}

export interface LegistarPull {
  meetings: Meeting[];
  matters: Matter[];
  bodies: string[];
}

export async function pullLegistar(opts: LegistarFetchOptions): Promise<LegistarPull> {
  const {
    client,
    from,
    to,
    bodies = /council/i,
    concurrency = 6,
    fetchText = true,
    fetchVotes = true,
    onProgress = () => {},
    fetchImpl = fetch,
  } = opts;

  const filter = encodeURIComponent(
    `EventDate ge datetime'${from}' and EventDate lt datetime'${to}'`,
  );
  const events = await getJson<LegistarEvent[]>(
    `${API}/${client}/events?$filter=${filter}&$orderby=EventDate asc&$top=500`,
    fetchImpl,
  );
  const kept = events.filter((e) => bodies.test(e.EventBodyName));
  onProgress(`Found ${events.length} meetings, keeping ${kept.length} that match ${bodies}`);

  const web = legistarWebBase(client);
  const meetings: Meeting[] = [];
  const matterMap = new Map<number, Matter>();
  const actionsByMatter = new Map<number, Action[]>();

  await mapLimit(kept, concurrency, async (ev) => {
    const items = await getJson<LegistarEventItem[]>(
      `${API}/${client}/events/${ev.EventId}/eventitems?AgendaNote=1&MinutesNote=1&Votes=1`,
      fetchImpl,
    );
    const date = ev.EventDate.slice(0, 10);
    const meeting: Meeting = {
      id: `${client}-ev-${ev.EventId}`,
      body: ev.EventBodyName,
      date,
      time: ev.EventTime || undefined,
      location: ev.EventLocation?.replace(/\r?\n/g, ", ") || undefined,
      agendaUrl: ev.EventAgendaFile || undefined,
      minutesUrl: ev.EventMinutesFile || undefined,
      sourceUrl: ev.EventInSiteURL || `${web}/MeetingDetail.aspx?ID=${ev.EventId}&GUID=${ev.EventGuid}`,
      matterIds: [],
      status: ev.EventMinutesStatusName === "Final" ? "Final" : ev.EventAgendaStatusName || undefined,
    };

    // Items appear twice when a body votes on the same matter in one sitting
    // (e.g. "Read and referred" then "Waived under Rule 8"). Keep both actions,
    // but only one matter entry.
    for (const it of items) {
      if (!it.EventItemMatterId || !it.EventItemMatterFile) continue;
      const mid = it.EventItemMatterId;
      const matterId = `${client}-m-${mid}`;
      if (!meeting.matterIds.includes(matterId)) meeting.matterIds.push(matterId);
      if (!matterMap.has(mid)) {
        matterMap.set(mid, {
          id: matterId,
          file: it.EventItemMatterFile,
          type: it.EventItemMatterType || "Item",
          title: (it.EventItemTitle || it.EventItemMatterName || "").trim(),
          category: "other",
          tags: [],
          sponsors: [],
          status: it.EventItemMatterStatus || "",
          latestOutcome: "unknown",
          actions: [],
          sourceUrl: `${web}/LegislationDetail.aspx?ID=${mid}&GUID=${it.EventItemMatterGuid || ""}`,
        });
      }
      let votes: Vote[] = (it.EventItemVoteInfo || []).map((v) => ({
        person: v.VotePersonName,
        value: normalizeVote(v.VoteValueName),
        raw: v.VoteValueName,
      }));
      if (fetchVotes && votes.length === 0 && it.EventItemPassedFlagName) {
        const vs = await getJson<LegistarVote[]>(
          `${API}/${client}/eventitems/${it.EventItemId}/votes`,
          fetchImpl,
        );
        votes = (vs || []).map((v) => ({
          person: v.VotePersonName,
          value: normalizeVote(v.VoteValueName),
          raw: v.VoteValueName,
        }));
      }
      const action: Action = {
        meetingId: meeting.id,
        date,
        body: ev.EventBodyName,
        action: it.EventItemActionName || "",
        outcome: outcomeFromAction(it.EventItemActionName, it.EventItemPassedFlagName),
        votes,
        tally: votes.length ? tallyOf(votes) : undefined,
      };
      if (!action.action && !votes.length) continue; // an agenda header, not an action
      const list = actionsByMatter.get(mid) || [];
      list.push(action);
      actionsByMatter.set(mid, list);
    }
    meetings.push(meeting);
    onProgress(`Read ${ev.EventBodyName} on ${date}: ${meeting.matterIds.length} items`);
  });

  // Matter details: type, status, sponsors, and the legislative text itself.
  const ids = [...matterMap.keys()];
  onProgress(`Loading details for ${ids.length} legislative items`);
  await mapLimit(ids, concurrency, async (mid) => {
    const m = matterMap.get(mid)!;
    try {
      const d = await getJson<LegistarMatter>(`${API}/${client}/matters/${mid}`, fetchImpl);
      if (d && d.MatterId) {
        m.type = d.MatterTypeName || m.type;
        m.status = d.MatterStatusName || m.status;
        m.title = (d.MatterTitle || m.title).trim();
        m.introducedOn = d.MatterIntroDate?.slice(0, 10) || undefined;
        m.decidedOn = d.MatterPassedDate?.slice(0, 10) || undefined;
        m.sourceUrl = `${web}/LegislationDetail.aspx?ID=${mid}&GUID=${d.MatterGuid}`;
      }
      const sponsors = await getJson<LegistarSponsor[]>(`${API}/${client}/matters/${mid}/sponsors`, fetchImpl);
      m.sponsors = (sponsors || []).map((s) => s.MatterSponsorName).filter(Boolean);
      if (fetchText) {
        const versions = await getJson<{ Key: string; Value: string }[]>(
          `${API}/${client}/matters/${mid}/versions`,
          fetchImpl,
        );
        const latest = versions?.[versions.length - 1];
        if (latest) {
          const t = await getJson<{ MatterTextPlain: string | null }>(
            `${API}/${client}/matters/${mid}/texts/${latest.Key}`,
            fetchImpl,
          );
          const plain = (t?.MatterTextPlain || "").replace(/\r/g, "").trim();
          if (plain) {
            m.textLength = plain.length;
            m.textExcerpt = plain.slice(0, 2500);
          }
        }
      }
    } catch (e) {
      onProgress(`Could not load details for ${m.file}: ${(e as Error).message}`);
    }
    m.actions = (actionsByMatter.get(mid) || []).sort((a, b) => a.date.localeCompare(b.date));
    m.latestOutcome = finalOutcome(m.actions);
    if (m.actions.length && !m.decidedOn && (m.latestOutcome === "passed" || m.latestOutcome === "failed")) {
      m.decidedOn = m.actions[m.actions.length - 1].date;
    }
    m.category = classify(m.title, m.type, m.textExcerpt);
    m.money = extractMoney(m.title, m.textExcerpt) || undefined;
    m.district = extractDistrict(m.title) || undefined;
    m.enrichment = "heuristic";
  });

  // Some clients publish a Draft and a Final record for the same sitting.
  // Merge them: one meeting per body per day, keeping the Final metadata.
  const merged = new Map<string, Meeting>();
  for (const m of meetings) {
    const key = `${m.body}|${m.date}`;
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, m);
      continue;
    }
    const winner = m.status === "Final" || (prev.status !== "Final" && m.matterIds.length > prev.matterIds.length) ? m : prev;
    const loser = winner === m ? prev : m;
    winner.matterIds = [...new Set([...winner.matterIds, ...loser.matterIds])];
    winner.agendaUrl ||= loser.agendaUrl;
    winner.minutesUrl ||= loser.minutesUrl;
    for (const list of actionsByMatter.values()) for (const a of list) if (a.meetingId === loser.id) a.meetingId = winner.id;
    merged.set(key, winner);
  }
  meetings.length = 0;
  meetings.push(...merged.values());
  meetings.sort((a, b) => a.date.localeCompare(b.date));
  for (const m of matterMap.values()) {
    const seen = new Set<string>();
    m.actions = m.actions.filter((a) => {
      const k = `${a.meetingId}|${a.action}|${a.tally ? a.tally.yes + "-" + a.tally.no : ""}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    m.latestOutcome = finalOutcome(m.actions);
  }
  const matters = [...matterMap.values()].filter((m) => m.actions.length > 0);
  const bodiesSeen = [...new Set(kept.map((e) => e.EventBodyName))];
  return { meetings, matters, bodies: bodiesSeen };
}

// The outcome that matters most: a final pass/fail beats a referral, and the
// most recent decisive action wins.
export function finalOutcome(actions: Action[]): Outcome {
  const decisive = actions.filter((a) => a.outcome === "passed" || a.outcome === "failed" || a.outcome === "withdrawn");
  if (decisive.length) return decisive[decisive.length - 1].outcome;
  const rest = actions.filter((a) => a.outcome !== "unknown");
  if (rest.length) return rest[rest.length - 1].outcome;
  return "unknown";
}
