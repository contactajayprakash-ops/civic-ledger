"use client";

import { useState } from "react";

export function ShareRow({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      const url = window.location.href;
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(`${title}\n${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // user cancelled the share sheet; nothing to do
    }
  }
  return (
    <button type="button" className="btn btn-ghost" onClick={copy}>
      {copied ? "Copied" : "Share"}
    </button>
  );
}
