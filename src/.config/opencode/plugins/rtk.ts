import type { Plugin } from "@opencode-ai/plugin";

// RTK OpenCode plugin — rewrites commands to use rtk for token savings.
// Requires: rtk >= 0.23.0 in PATH.
//
// This is a thin delegating plugin: all rewrite logic lives in `rtk rewrite`,
// which is the single source of truth (src/discover/registry.rs).
// To add or change rewrite rules, edit the Rust registry — not this file.
//
// Performance: command prefixes that rtk has no handler for (exit 1) are
// cached in knownNative to avoid redundant subprocess spawns.  Commands
// that produce a rewrite (exit 3) always re-query — rewrites may depend on
// arguments beyond the first word.
//
// Debug: set RTK_DEBUG=1 to write structured event log to
// ~/.local/state/opencode/rtk-debug.log  (appended, session-scoped).
// Events: QUERY, REWRITE, CACHE:add, SKIP:cached, SKIP:rtk-prefix.
//
// Shell operators: commands containing &&, ||, ;, |, or & are always
// passed to rtk rewrite (not cache-skipped).  rtk rewrite rewrites
// each segment independently; firstWord caching only applies to simple
// single-command invocations where the heuristic is safe.

// process & HOME are available at runtime in Bun; both are declared here
// because @types/node is not installed for this plugin workspace.
declare const process: { env: Record<string, string | undefined> };
const HOME: string = (globalThis as any).process?.env?.HOME ?? "/tmp/opencode";

const knownNative = new Set<string>();
const SHELL_OP = /&&|\|\||[;&|]/;

function firstWord(cmd: string): string {
  const trimmed = cmd.trimStart();
  const space = /\s/.exec(trimmed);
  return space ? trimmed.substring(0, space.index) : trimmed;
}

export const RtkOpenCodePlugin: Plugin = async ({ $ }) => {
  try {
    await $`which rtk`.quiet();
  } catch {
    console.warn("[rtk] rtk binary not found in PATH — plugin disabled");
    return {};
  }

  const debug = process.env.RTK_DEBUG === "1"
    ? async (event: string, detail: string) => {
      const ts = new Date().toISOString();
      const line = `[${ts}] ${event} ${detail}\n`;
      const path = HOME + "/.local/state/opencode/rtk-debug.log";
      await $`printf '%s' "${line}" >> "${path}"`.quiet().nothrow();
    }
    : async () => {};

  return {
    "tool.execute.before": async (input, output) => {
      const tool = String(input?.tool ?? "").toLowerCase();
      if (tool !== "bash" && tool !== "shell") return;
      const args = output?.args;
      if (!args || typeof args !== "object") return;

      const command = (args as Record<string, unknown>).command;
      if (typeof command !== "string" || !command) return;

      if (command.startsWith("rtk ")) {
        await debug("SKIP:rtk-prefix", command);
        return;
      }

      const fw = firstWord(command);
      if (!SHELL_OP.test(command) && knownNative.has(fw)) {
        await debug("SKIP:cached", `${fw} (from ${command})`);
        return;
      }

      await debug("QUERY", command);
      const result = await $`rtk rewrite ${command}`.quiet().nothrow();
      const rewritten = String(result.stdout).trim();

      if (rewritten && rewritten !== command) {
        await debug("REWRITE", `${command} → ${rewritten}`);
        (args as Record<string, unknown>).command = rewritten;
      } else if (!rewritten) {
        await debug("CACHE:add", fw);
        knownNative.add(fw);
      }
    },
  };
};
