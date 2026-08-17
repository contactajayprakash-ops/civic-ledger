// A small OpenAI-compatible chat client. Featherless AI is the default
// provider (open-weight models, one API), but any compatible endpoint works
// by setting LLM_BASE_URL / LLM_API_KEY / LLM_MODEL.

import { sleep } from "./util";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string; // primary model
  models: string[]; // primary + fallbacks, tried in order when a daily quota runs out
  concurrency: number;
  provider: "featherless" | "groq" | "custom";
}

export function llmConfig(): LlmConfig | null {
  const apiKey = process.env.LLM_API_KEY || process.env.FEATHERLESS_API_KEY;
  if (!apiKey) return null;
  const baseUrl = (process.env.LLM_BASE_URL || "https://api.featherless.ai/v1").replace(/\/$/, "");
  const models = (process.env.LLM_MODELS || process.env.LLM_MODEL || "Qwen/Qwen2.5-72B-Instruct")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    baseUrl,
    apiKey,
    model: models[0],
    models,
    concurrency: Number(process.env.LLM_CONCURRENCY || 2),
    provider: baseUrl.includes("featherless") ? "featherless" : baseUrl.includes("groq") ? "groq" : "custom",
  };
}

// Models whose daily quota is spent for this process. We skip them rather
// than hammering the endpoint.
const exhausted = new Set<string>();
export function activeModel(cfg: LlmConfig, requested?: string) {
  if (requested && !exhausted.has(requested)) return requested;
  return cfg.models.find((m) => !exhausted.has(m)) || cfg.models[0];
}
export function exhaustedModels() {
  return [...exhausted];
}

export function llmAvailable() {
  return llmConfig() !== null;
}

// A tiny semaphore so bulk enrichment respects the plan's concurrency limit.
class Gate {
  private active = 0;
  private queue: (() => void)[] = [];
  constructor(private limit: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((r) => this.queue.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}
let gate: Gate | null = null;
function getGate(limit: number) {
  if (!gate) gate = new Gate(limit);
  return gate;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  signal?: AbortSignal;
  model?: string;
}

export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  const cfg = llmConfig();
  if (!cfg) throw new Error("No language model configured (set FEATHERLESS_API_KEY)");
  return getGate(cfg.concurrency).run(async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 8; attempt++) {
      const model = activeModel(cfg, opts.model);
      try {
        const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
          signal: opts.signal,
          body: JSON.stringify({
            model,
            messages,
            temperature: opts.temperature ?? 0.2,
            max_tokens: opts.maxTokens ?? 900,
            ...(opts.json ? { response_format: { type: "json_object" } } : {}),
          }),
        });
        if (res.status === 429 || res.status >= 500) {
          const body = await res.text().catch(() => "");
          // A spent daily quota (Groq: "tokens per day", "requests per day")
          // won't clear by waiting; move on to the next model.
          if (res.status === 429 && /per ?day|TPD|RPD|daily/i.test(body)) {
            exhausted.add(model);
            if (cfg.models.some((m) => !exhausted.has(m))) continue;
            throw new Error(`LLM daily quota exhausted for all models: ${cfg.models.join(", ")}`);
          }
          // Groq spells out the wait: "Please try again in 7m41.4s" / "in 23.5s".
          const m = body.match(/try again in (?:(\d+)m)?([\d.]+)s/);
          const suggested = m ? (Number(m[1] || 0) * 60 + parseFloat(m[2])) * 1000 : 0;
          const retryAfter = Number(res.headers.get("retry-after")) * 1000 || 0;
          const wait = Math.max(suggested, retryAfter) || 1500 * 2 ** attempt;
          await sleep(Math.min(wait + 500, 90000));
          lastErr = new Error(`LLM ${res.status}: ${body.slice(0, 200)}`);
          continue;
        }
        if (!res.ok) {
          const body = await res.text();
          // Some providers reject response_format; retry once without it.
          if (opts.json && /response_format|json_object/i.test(body)) {
            return chat(messages, { ...opts, json: false });
          }
          throw new Error(`LLM ${res.status}: ${body.slice(0, 300)}`);
        }
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        return stripThinking(data.choices?.[0]?.message?.content ?? "");
      } catch (e) {
        lastErr = e;
        if ((e as Error).name === "AbortError") throw e;
        await sleep(1000 * (attempt + 1));
      }
    }
    throw lastErr;
  });
}

// Streams assistant text as it arrives. Yields plain text deltas.
// Fails over to the next configured model when one's daily quota is spent.
export async function* chatStream(messages: ChatMessage[], opts: ChatOptions = {}): AsyncGenerator<string> {
  const cfg = llmConfig();
  if (!cfg) throw new Error("No language model configured (set FEATHERLESS_API_KEY)");
  let res: Response | null = null;
  const skipThisCall = new Set<string>();
  for (let attempt = 0; attempt < cfg.models.length + 1; attempt++) {
    const preferred = attempt === 0 ? opts.model : undefined;
    const model =
      (preferred && !exhausted.has(preferred) && !skipThisCall.has(preferred) && preferred) ||
      cfg.models.find((m) => !exhausted.has(m) && !skipThisCall.has(m)) ||
      cfg.models[0];
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
      signal: opts.signal,
      body: JSON.stringify({
        model,
        messages,
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 700,
        stream: true,
      }),
    });
    if (res.ok) break;
    const body = await res.text().catch(() => "");
    if (res.status === 429) {
      // A spent daily quota is sticky; a per-minute limit only skips this call.
      if (/per ?day|TPD|RPD|daily/i.test(body)) exhausted.add(model);
      else skipThisCall.add(model);
      if (cfg.models.some((m) => !exhausted.has(m) && !skipThisCall.has(m))) continue;
    }
    throw new Error(`LLM ${res.status}: ${body.slice(0, 300)}`);
  }
  if (!res || !res.ok || !res.body) throw new Error(`LLM unavailable after trying: ${cfg.models.join(", ")}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const j = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
        const delta = j.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // partial line; keep buffering
      }
    }
  }
}

// Reasoning models sometimes prepend their scratchpad in <think> tags,
// or emit it bare before the answer. Keep only the part meant for people.
export function stripThinking(text: string) {
  let out = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const open = out.search(/<think>/i);
  if (open >= 0) out = out.slice(0, open); // unterminated block: drop the tail
  // A leading "Here's a thinking process..." style preamble followed by the
  // real answer after a blank line + no more meta-language.
  return out.trim();
}

// Wraps a delta stream, holding back anything inside <think>…</think>.
export async function* stripThinkingStream(deltas: AsyncGenerator<string>): AsyncGenerator<string> {
  let buf = "";
  let inThink = false;
  let started = false;
  for await (const d of deltas) {
    buf += d;
    while (buf) {
      if (inThink) {
        const end = buf.search(/<\/think>/i);
        if (end < 0) {
          buf = buf.slice(-9); // keep a tail in case the closing tag is split
          break;
        }
        buf = buf.slice(end + 8);
        inThink = false;
        if (!started) buf = buf.replace(/^\s+/, "");
        continue;
      }
      const start = buf.search(/<think>/i);
      if (start >= 0) {
        const before = buf.slice(0, start);
        if (before) {
          started = true;
          yield before;
        }
        buf = buf.slice(start + 7);
        inThink = true;
        continue;
      }
      // No tag in sight; hold back a small tail in case "<think" is split.
      if (buf.length > 8) {
        const emit = buf.slice(0, -8);
        buf = buf.slice(-8);
        if (emit) {
          started = true;
          yield emit;
        }
      }
      break;
    }
  }
  if (buf && !inThink) yield buf;
}

// Models sometimes wrap JSON in prose or code fences. Dig it out.
export function parseJson<T = unknown>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], text];
  for (const c of candidates) {
    if (!c) continue;
    const start = Math.min(...["{", "["].map((ch) => c.indexOf(ch)).filter((i) => i >= 0));
    if (!isFinite(start)) continue;
    const end = Math.max(c.lastIndexOf("}"), c.lastIndexOf("]"));
    if (end <= start) continue;
    try {
      return JSON.parse(c.slice(start, end + 1)) as T;
    } catch {
      const repaired = repairTruncatedJson(c.slice(start));
      if (repaired) return repaired as T;
    }
  }
  return null;
}

// A response cut off mid-object can usually be saved: keep everything up to
// the last completely-closed value, then close the brackets still open there.
function repairTruncatedJson(s: string): unknown | null {
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  let lastSafe = -1;
  let safeStack: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === "\\") {
      esc = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") {
      stack.pop();
      lastSafe = i;
      safeStack = [...stack];
    }
  }
  if (lastSafe < 0) return null;
  const candidate = s.slice(0, lastSafe + 1) + safeStack.reverse().join("");
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}
