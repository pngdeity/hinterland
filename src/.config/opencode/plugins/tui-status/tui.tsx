/**
 * tui-status — sidebar context/git panel plus a compact prompt-footer readout.
 *
 * Renders into two slots:
 *   sidebar.content      Context occupancy, the 1M budget, and git status.
 *   prompt.footer.status One-line `ctx <used>/<budget> <pct>%` summary.
 *
 * Occupancy formula
 *   occupancy = last input + cache.read + cache.write + output
 * taken from the newest message carrying token usage. Cache is included
 * because the provider caches the whole prompt and bills it as a cache read;
 * `input` alone is only the uncached delta. A session-summed figure is not
 * occupancy — it is cumulative API traffic and will read in the millions.
 *
 * Git block
 *   Reports the repository at the cwd only; it never walks up the tree, so a
 *   cwd outside any repo renders an explicit `no repository` state. Counts come
 *   from `git status --porcelain=v2 --branch`, with staged (X) and unstaged (Y)
 *   split apart. File rows are capped at GIT_FILE_ROWS with a `+N more` tail —
 *   a 36-file repo must not flood a ~30-column pane. Paths are shortened
 *   because `git status` emits absolute paths when the cwd is a repo
 *   subdirectory.
 *
 * Layout constraints
 *   The file must be `tui.tsx`, not `tui.ts`: a directory plugin resolves its
 *   TUI entrypoint by `resolve(dir, "tui")`, and Bun's resolver prefers `.tsx`.
 *   A plugin cannot remove the built-in `opencode.sidebar.context` panel; it
 *   appends to the same slot, so the built-in block renders above this one.
 */
/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui";
import { createSignal, onCleanup, onMount, type Accessor } from "solid-js";

const GIT_POLL_MS = 10_000;
const STATUS_POLL_MS = 5_000;
const GIT_TIMEOUT_MS = 2_000;
const BAR_WIDTH = 16;

const COLOR = {
  text: "#cdd6f4",
  muted: "#6c7086",
  subtle: "#a6adc8",
  ok: "#a6e3a1",
  warn: "#f9e2af",
  bad: "#f38ba8",
  info: "#94e2d5",
} as const;

type Tokens = {
  input?: number;
  output?: number;
  reasoning?: number;
  cache?: { read?: number; write?: number };
};

type Usage = {
  tokens: Tokens;
  model?: { id?: string; providerID?: string; variant?: string };
};

type GitFile = { code: string; path: string };

type GitStatus = {
  branch: string;
  detached: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  staged: { modified: number; added: number; deleted: number };
  unstaged: { modified: number; deleted: number };
  untracked: number;
  conflicted: number;
  files: GitFile[];
  changed: number;
  dirty: boolean;
  lastCommit: { subject: string; ageMs: number } | null;
};

type TuiPluginContext = {
  readonly location: unknown;
  readonly data: {
    location: {
      default: () => Location | undefined;
      model: { list: (location: Location | undefined) => ReadonlyArray<ModelEntry> | undefined };
    };
    session: {
      message: { list: (sessionID: string) => ReadonlyArray<MessageEntry> | undefined };
    };
  };
  readonly ui: {
    router: { current: () => { type?: string; sessionID?: string } | undefined };
    slot: (input: { append: string; render: () => unknown }) => unknown;
  };
};

type Location = string | { directory?: string } | undefined;

type ModelEntry = {
  providerID?: string;
  id?: string;
  limit?: { context?: number };
};

type MessageEntry = {
  tokens?: Tokens;
  model?: { id?: string; providerID?: string; variant?: string };
};

function occupancyOf(tokens: Tokens): number {
  return (
    (tokens.input ?? 0) +
    (tokens.cache?.read ?? 0) +
    (tokens.cache?.write ?? 0) +
    (tokens.output ?? 0)
  );
}

function formatTokens(n?: number): string {
  if (n == null) return "?";
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function occupancyBar(used: number, limit: number | null): string {
  const filled = limit ? Math.min(BAR_WIDTH, Math.round((used / limit) * BAR_WIDTH)) : 0;
  return "▓".repeat(filled) + "░".repeat(BAR_WIDTH - filled);
}

function occupancyColor(used: number, limit: number | null): string {
  if (!limit) return COLOR.muted;
  if (used >= limit) return COLOR.bad;
  return used / limit >= 0.8 ? COLOR.warn : COLOR.ok;
}

function resolveLocation(ctx: TuiPluginContext): Location {
  return ctx.location ?? ctx.data.location.default();
}

function lastUsage(ctx: TuiPluginContext, sessionID: string): Usage | null {
  const messages = ctx.data.session.message.list(sessionID) ?? [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.tokens?.input !== undefined) {
      return { tokens: message.tokens, model: message.model };
    }
  }
  return null;
}

function modelBudget(ctx: TuiPluginContext, usage: Usage | null): number | null {
  const providerID = usage?.model?.providerID;
  const id = usage?.model?.id;
  if (!providerID || !id) return null;
  try {
    const models = ctx.data.location.model.list(resolveLocation(ctx)) ?? [];
    const match = models.find((m) => m.providerID === providerID && m.id === id);
    return match?.limit?.context ?? null;
  } catch {
    return null;
  }
}

type Occupancy = {
  used: number;
  limit: number | null;
  percent: number | null;
  input: number | undefined;
  cached: number | undefined;
};

function useOccupancy(
  ctx: TuiPluginContext,
  intervalMs: number,
): { read: Accessor<Occupancy | null> } {
  const [value, setValue] = createSignal<Occupancy | null>(null);

  function refresh() {
    const route = ctx.ui.router.current();
    if (route?.type !== "session") {
      setValue(null);
      return;
    }
    const usage = lastUsage(ctx, route.sessionID);
    if (!usage) {
      setValue(null);
      return;
    }
    const used = occupancyOf(usage.tokens);
    const limit = modelBudget(ctx, usage);
    setValue({
      used,
      limit,
      percent: limit ? Math.round((used / limit) * 100) : null,
      input: usage.tokens.input,
      cached: usage.tokens.cache?.read,
    });
  }

  onMount(() => {
    refresh();
    const timer = setInterval(refresh, intervalMs);
    onCleanup(() => clearInterval(timer));
  });

  return { read: value };
}

async function readGitStatus(directory: string): Promise<GitStatus | null> {
  try {
    const proc = Bun.spawn(
      ["git", "status", "--porcelain=v2", "--branch", "--untracked-files=normal"],
      { cwd: directory, stdout: "pipe", stderr: "ignore" },
    );
    const timeout = setTimeout(() => proc.kill(), GIT_TIMEOUT_MS);
    const text = await new Response(proc.stdout).text();
    const code = await proc.exited;
    clearTimeout(timeout);
    if (code !== 0) return null;

    let branch = "?";
    let detached = false;
    let upstream: string | null = null;
    let ahead = 0;
    let behind = 0;
    let untracked = 0;
    let conflicted = 0;
    const staged = { modified: 0, added: 0, deleted: 0 };
    const unstaged = { modified: 0, deleted: 0 };
    const files: GitFile[] = [];

    for (const line of text.split("\n")) {
      if (line.startsWith("# branch.head ")) {
        branch = line.slice(14).trim();
        detached = branch === "(detached)";
      } else if (line.startsWith("# branch.upstream ")) {
        upstream = line.slice(18).trim();
      } else if (line.startsWith("# branch.ab ")) {
        const match = line.match(/\+(\d+)\s+-(\d+)/);
        if (match) {
          ahead = Number(match[1]);
          behind = Number(match[2]);
        }
      } else if (line.startsWith("? ")) {
        untracked++;
        files.push({ code: "??", path: line.slice(2).trim() });
      } else if (line.startsWith("u ")) {
        conflicted++;
        files.push({ code: "UU", path: line.slice(2).trim() });
      } else if (line.startsWith("1 ") || line.startsWith("2 ")) {
        const parts = line.split(" ");
        const xy = parts[1] ?? "..";
        const rest = parts.slice(8).join(" ");
        const path = (line.startsWith("2 ") ? rest.split("\t")[0] : rest).trim();
        if (xy[0] !== ".") {
          if (xy[0] === "A") staged.added++;
          else if (xy[0] === "D") staged.deleted++;
          else staged.modified++;
        }
        if (xy[1] !== ".") {
          if (xy[1] === "D") unstaged.deleted++;
          else unstaged.modified++;
        }
        files.push({ code: xy, path });
      }
    }

    const stagedTotal = staged.modified + staged.added + staged.deleted;
    const unstagedTotal = unstaged.modified + unstaged.deleted;
    const changed = stagedTotal + unstagedTotal + untracked + conflicted;

    return {
      branch,
      detached,
      upstream,
      ahead,
      behind,
      staged,
      unstaged,
      untracked,
      conflicted,
      files,
      changed,
      dirty: changed > 0,
      lastCommit: await readLastCommit(directory),
    };
  } catch {
    return null;
  }
}

async function readLastCommit(directory: string): Promise<GitStatus["lastCommit"]> {
  try {
    const proc = Bun.spawn(["git", "log", "-1", "--pretty=%s%x00%ct"], {
      cwd: directory,
      stdout: "pipe",
      stderr: "ignore",
    });
    const timeout = setTimeout(() => proc.kill(), GIT_TIMEOUT_MS);
    const text = await new Response(proc.stdout).text();
    const code = await proc.exited;
    clearTimeout(timeout);
    if (code !== 0) return null;
    const [subject, epoch] = text.trim().split("\x00");
    if (!subject || !epoch) return null;
    return { subject, ageMs: Date.now() - Number(epoch) * 1000 };
  } catch {
    return null;
  }
}

function ContextPanel(props: { ctx: TuiPluginContext }) {
  const occupancy = useOccupancy(props.ctx, STATUS_POLL_MS);
  const [git, setGit] = createSignal<GitStatus | null>(null);

  onMount(() => {
    const refresh = async () => {
      const location = resolveLocation(props.ctx);
      const directory =
        typeof location === "string" ? location : (location as { directory?: string })?.directory;
      setGit(directory ? await readGitStatus(directory) : null);
    };
    void refresh();
    const timer = setInterval(() => void refresh(), GIT_POLL_MS);
    onCleanup(() => clearInterval(timer));
  });

  return (
    <box flexDirection="column">
      <ContextBlock occupancy={occupancy.read} />
      <box height={1} />
      <GitBlock status={git} />
    </box>
  );
}

function ContextBlock(props: { occupancy: Accessor<Occupancy | null> }) {
  const data = () => props.occupancy();

  return (
    <box flexDirection="column">
      <text fg={COLOR.text}>
        <b>Context</b>{" "}
        <span fg={COLOR.muted}>
          {data()?.limit != null ? `budget ${formatTokens(data()?.limit)}` : "budget unknown"}
        </span>
      </text>
      {(() => {
        const value = data();
        if (!value) return <text fg={COLOR.muted}> no session</text>;
        const placed = value.limit != null ? value.limit - value.used : undefined;
        return (
          <>
            <text fg={occupancyColor(value.used, value.limit)}>
              {`  ${occupancyBar(value.used, value.limit)}  ${formatTokens(value.used)}`}
              {value.percent !== null ? `  ${value.percent}%` : ""}
            </text>
            <text fg={COLOR.subtle}>
              {`  last call ${formatTokens(value.input)} in · ${formatTokens(value.cached)} cache`}
            </text>
            <text fg={placed !== undefined && placed < 0 ? COLOR.bad : COLOR.muted}>
              {placed === undefined
                ? "  headroom ?"
                : placed >= 0
                  ? `  headroom ${formatTokens(placed)}`
                  : `  over budget ${formatTokens(-placed)}`}
            </text>
          </>
        );
      })()}
    </box>
  );
}

const GIT_FILE_ROWS = 3;

function truncate(text: string, width: number): string {
  return text.length > width ? text.slice(0, Math.max(1, width - 1)) + "…" : text;
}

function shortPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const marker = normalized.lastIndexOf("/src/");
  if (marker === -1) return normalized.replace(/^\.\//, "");
  return normalized.slice(marker + 1);
}

function GitBlock(props: { status: Accessor<GitStatus | null> }) {
  const status = () => props.status();

  return (
    <box flexDirection="column">
      {(() => {
        const value = status();
        if (!value) return <text fg={COLOR.muted}>Git: no repository</text>;

        const stagedTotal = value.staged.modified + value.staged.added + value.staged.deleted;
        const unstagedTotal = value.unstaged.modified + value.unstaged.deleted;
        const sync = [value.ahead ? `↑${value.ahead}` : "", value.behind ? `↓${value.behind}` : ""]
          .filter(Boolean)
          .join(" ");
        const marks = [
          stagedTotal ? `S${stagedTotal}` : "",
          unstagedTotal ? `M${unstagedTotal}` : "",
          value.untracked ? `?${value.untracked}` : "",
          value.conflicted ? `!${value.conflicted}` : "",
        ]
          .filter(Boolean)
          .join(" ");
        const shown = value.files.slice(0, GIT_FILE_ROWS);
        const hidden = value.files.length - shown.length;

        return (
          <>
            <text fg={COLOR.text}>
              <b>Git</b>{" "}
              <span fg={value.dirty ? COLOR.warn : COLOR.ok}>
                {value.detached ? "(detached)" : value.branch}
              </span>
              {sync ? <span fg={COLOR.muted}>{`  ${sync}`}</span> : null}
            </text>
            <text fg={value.dirty ? COLOR.warn : COLOR.muted}>
              {value.dirty ? `  ${marks}` : "  clean"}
            </text>
            {shown.map((file) => (
              <text
                fg={COLOR.subtle}
              >{`  ${file.code} ${truncate(shortPath(file.path), 26)}`}</text>
            ))}
            {hidden > 0 ? <text fg={COLOR.muted}>{`  +${hidden} more`}</text> : null}
            {value.lastCommit ? (
              <text fg={COLOR.muted}>
                {`  ${truncate(value.lastCommit.subject, 24)} · ${formatAgo(value.lastCommit.ageMs)}`}
              </text>
            ) : null}
          </>
        );
      })()}
    </box>
  );
}

function FooterStatus(props: { ctx: TuiPluginContext }) {
  const occupancy = useOccupancy(props.ctx, STATUS_POLL_MS);

  return (
    <text fg={COLOR.info}>
      {(() => {
        const value = occupancy.read();
        if (!value) return "";
        const budget = value.limit ? `/${formatTokens(value.limit)}` : "";
        const percent = value.percent !== null ? ` ${value.percent}%` : "";
        return `ctx ${formatTokens(value.used)}${budget}${percent}`;
      })()}
    </text>
  );
}

function formatAgo(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d`;
  if (seconds < 31536000) return `${Math.floor(seconds / 2592000)}mo`;
  return `${Math.floor(seconds / 31536000)}y`;
}

export default Plugin.define({
  id: "local:tui-status",
  setup(ctx) {
    ctx.ui.slot({ append: "sidebar.content", render: () => <ContextPanel ctx={ctx} /> });
    ctx.ui.slot({ append: "prompt.footer.status", render: () => <FooterStatus ctx={ctx} /> });
  },
});
