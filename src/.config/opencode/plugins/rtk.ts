// RTK OpenCode plugin — rewrites commands to use rtk for token savings.
// Requires: rtk >= 0.23.0 in PATH.
//
// This is a thin delegating plugin: all rewrite logic lives in `rtk rewrite`,
// which is the single source of truth (src/discover/registry.rs).
// To add or change rewrite rules, edit the Rust registry — not this file.
//
// Env: RTK_DISABLE=1 disables rewriting for the session.

const REWRITE_TIMEOUT_MS = 2000;

export default {
  id: "rtk",
  setup: async (ctx: any) => {
    if (process.env.RTK_DISABLE === "1") return;

    const rtk = Bun.which("rtk");
    if (!rtk) {
      console.warn("[rtk] rtk binary not found in PATH — plugin disabled");
      return;
    }

    const registration = await ctx.tool.hook("execute.before", async (event: any) => {
      const tool = String(event?.tool ?? "").toLowerCase();
      if (tool !== "bash" && tool !== "shell") return;
      const input = event?.input;
      if (!input || typeof input !== "object") return;

      const command = (input as Record<string, unknown>).command;
      if (typeof command !== "string" || !command) return;

      try {
        const proc = Bun.spawn([rtk, "rewrite", command], {
          stdout: "pipe",
          stderr: "pipe",
          signal: AbortSignal.timeout(REWRITE_TIMEOUT_MS),
        });
        const text = await new Response(proc.stdout).text();
        const rewritten = text.trim();
        if (rewritten && rewritten !== command) {
          (input as Record<string, unknown>).command = rewritten;
        }
      } catch {
        // rtk rewrite failed or timed out — pass through unchanged
      }
    });

    return () => registration?.dispose?.();
  },
};
