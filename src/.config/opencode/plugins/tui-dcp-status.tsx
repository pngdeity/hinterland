import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createSignal, onCleanup, onMount } from "solid-js";

const DCP_DIR = join(
  process.env.HOME ?? "/tmp/opencode",
  ".local/share/opencode/storage/plugin/dcp",
);
const POLL_MS = 5000;

async function findLatest(): Promise<string | null> {
  try {
    const files = (await readdir(DCP_DIR))
      .filter((f) => f.startsWith("ses_") && f.endsWith(".json"))
      .sort();
    return files.length ? join(DCP_DIR, files[files.length - 1]) : null;
  } catch {
    return null;
  }
}

function fmt(n?: number): string {
  if (n == null) return "?";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return String(n);
}

function ago(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function DcpHomeBottom() {
  const [text, setText] = createSignal("");

  let timer: ReturnType<typeof setInterval>;

  async function poll() {
    const file = await findLatest();
    if (!file) {
      setText("DCP: no session data");
      return;
    }

    let data: any;
    try {
      const raw = await readFile(file, "utf-8");
      data = JSON.parse(raw);
    } catch {
      setText("DCP: data error");
      return;
    }

    const blocks: any[] = Object.values(data?.prune?.messages?.blocksById ?? {})
      .sort(
        (a: any, b: any) =>
          Number(a.endId?.slice(1) ?? 0) - Number(b.endId?.slice(1) ?? 0),
      );

    if (!blocks.length) {
      setText("DCP: no compressions yet");
      return;
    }

    const last = blocks[blocks.length - 1];
    const ratio = last.compressedTokens > 0 && last.summaryTokens > 0
      ? (() => {
        const r = last.compressedTokens / last.summaryTokens;
        return r >= 1 ? r.toFixed(0) : r.toFixed(1);
      })()
      : "?";
    const safeTopic = typeof last.topic === "string" && last.topic.length > 45
      ? last.topic.slice(0, 45) + "\u2026"
      : typeof last.topic === "string"
      ? last.topic
      : "?";
    const age = last.createdAt
      ? Math.round((Date.now() - (last.createdAt as number)) / 1000)
      : 0;

    setText(
      `DCP ${blocks.length} block${blocks.length > 1 ? "s" : ""} | ${
        fmt(last.compressedTokens)
      }\u2192${fmt(last.summaryTokens)} (${ratio}:1) | ${safeTopic} | ${
        ago(age)
      }`,
    );
  }

  onMount(async () => {
    await poll();
    timer = setInterval(poll, POLL_MS);
  });

  onCleanup(() => clearInterval(timer));

  return () => (text() ? <text fg="#94e2d5">{text()}</text> : null);
}

export default {
  id: "local:dcp-status",
  tui(api: any) {
    api.slots.register({
      slots: { home_bottom: () => <DcpHomeBottom /> },
    });
  },
};
