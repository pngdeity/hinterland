import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createSignal, onCleanup, onMount } from "solid-js";

const DCP_DIR = join(
  process.env.HOME!,
  ".local/share/opencode/storage/plugin/dcp",
);
const POLL_MS = 5000;

function findLatest(): string | null {
  try {
    const files = readdirSync(DCP_DIR)
      .filter((f) => f.startsWith("ses_") && f.endsWith(".json"))
      .sort();
    return files.length ? join(DCP_DIR, files[files.length - 1]) : null;
  } catch {
    return null;
  }
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return String(n);
}

function ago(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function DcpHomeBottom() {
  const [text, setText] = createSignal("");

  let timer: ReturnType<typeof setInterval>;

  function poll() {
    const file = findLatest();
    if (!file) {
      setText("DCP: no session data");
      return;
    }

    let raw: string;
    try {
      raw = readFileSync(file, "utf-8");
    } catch {
      setText("DCP: read error");
      return;
    }

    const data = JSON.parse(raw);
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
      ? (last.compressedTokens / last.summaryTokens).toFixed(0)
      : "?";
    const topic = last.topic.length > 45
      ? last.topic.slice(0, 45) + "…"
      : last.topic;
    const age = last.createdAt
      ? Math.round((Date.now() - (last.createdAt as number)) / 1000)
      : 0;

    setText(
      `DCP ${blocks.length} block${blocks.length > 1 ? "s" : ""} | ${
        fmt(last.compressedTokens)
      }→${fmt(last.summaryTokens)} (${ratio}:1) | ${topic} | ${ago(age)}`,
    );
  }

  onMount(() => {
    poll();
    timer = setInterval(poll, POLL_MS);
  });

  onCleanup(() => clearInterval(timer));

  return () =>
    text()
      ? (
        <div
          style={{
            color: "#94e2d5",
            "font-size": "12px",
            padding: "2px 8px",
            "white-space": "nowrap",
            overflow: "hidden",
            "text-overflow": "ellipsis",
          }}
        >
          {text()}
        </div>
      )
      : null;
}

export default {
  tui(api: any) {
    api.slots.register({
      slots: { home_bottom: () => <DcpHomeBottom /> },
    });
  },
};
