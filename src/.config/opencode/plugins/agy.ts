// agy — one-shot prompts to the Google Gemini CLI, exposed as OpenCode V2 tools.
// V2 resolves plugin imports at runtime; local plugins avoid `@opencode/plugin`
// so no bare-specifier resolution is needed (same pattern as rtk.ts).
//
// Model inventory is derived at load time from `agy models` so the tool
// description and the `agy_models` passthrough stay current without edits.
// Timeouts are fully rules-based; pass an explicit `timeout` for exceptions.

const FALLBACK_MODELS: [string, string][] = [
  ["gemini-3.8-flash-low", "Gemini 3.8 Flash (Low)"],
  ["gemini-3.8-flash-medium", "Gemini 3.8 Flash (Medium)"],
  ["gemini-3.8-flash-high", "Gemini 3.8 Flash (High)"],
  ["gemini-3.1-pro-low", "Gemini 3.1 Pro (Low)"],
  ["gemini-3.1-pro-high", "Gemini 3.1 Pro (High)"],
];

type ModelEntry = { id: string; label: string };

function fetchModels(): ModelEntry[] {
  try {
    const proc = Bun.spawnSync(["agy", "models"], { stdout: "pipe", stderr: "pipe" });
    if (proc.exitCode !== 0) return [];
    const out = proc.stdout.toString();
    const models: ModelEntry[] = [];
    for (const line of out.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const [id, ...rest] = trimmed.split("\t");
      if (!id || id.includes(" ")) continue;
      const label = rest.join("\t").trim();
      if (!label) continue;
      models.push({ id, label });
    }
    return models;
  } catch {
    return [];
  }
}

// Fully rules-based: flash-low 30, flash-medium 45, flash-high 60,
// pro-low 75, pro-high 90. Unknown shapes fall back to the default.
function getTimeout(model?: string, explicit?: number): number {
  if (explicit) return explicit;
  if (!model) return 120;
  if (model.includes("flash")) {
    if (model.includes("low")) return 30;
    if (model.includes("medium")) return 45;
    if (model.includes("high")) return 60;
    return 60;
  }
  if (model.includes("pro")) {
    if (model.includes("low")) return 75;
    if (model.includes("high")) return 90;
    return 90;
  }
  return 120;
}

function buildDescription(models: ModelEntry[]): string {
  const parts = models.map((m) => `${m.id} (${m.label}): ${getTimeout(m.id)}s`);
  const inventory = parts.length > 0 ? parts.join(", ") : "inventory unavailable";
  return (
    "Send a one-shot prompt to agy (Google Gemini CLI) and return the response. " +
    "Model-aware timeouts: " +
    inventory +
    ". Pass `model` with an ID from the `agy_models` tool, and `timeout` (seconds) to override. " +
    "Unknown model IDs fail explicitly rather than silently."
  );
}

export default {
  id: "local:agy",
  setup: (ctx: any) => {
    const models = fetchModels();
    const inventory: ModelEntry[] =
      models.length > 0 ? models : FALLBACK_MODELS.map(([id, label]) => ({ id, label }));

    ctx.tool.transform((editor: any) => {
      editor.add({
        name: "agy",
        description: buildDescription(inventory),
        input: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "The prompt to send to agy" },
            model: {
              type: "string",
              description:
                "Model ID from the `agy_models` tool (e.g. 'gemini-3.8-flash-high'). " +
                "Omit to let agy choose its default.",
            },
            timeout: {
              type: "integer",
              minimum: 10,
              maximum: 300,
              description:
                "Timeout in seconds. Overrides the model-aware default. Use for long-running analysis.",
            },
          },
          required: ["prompt"],
          additionalProperties: false,
        },
        execute: async (
          input: { prompt: string; model?: string; timeout?: number },
          context: any,
        ) => {
          const modelArg = input.model ? ["--model", input.model] : [];
          const addDir = ctx.location?.directory ? ["--add-dir", ctx.location.directory] : [];
          const timeout = getTimeout(input.model, input.timeout);
          const proc = Bun.spawn(
            [
              "agy",
              "--print",
              input.prompt,
              "--print-timeout",
              `${timeout}s`,
              "--dangerously-skip-permissions",
              ...addDir,
              ...modelArg,
            ],
            { stdout: "pipe", stderr: "pipe" },
          );
          const abort = () => proc.kill();
          context?.signal?.addEventListener("abort", abort, { once: true });
          try {
            const [text, err, exit] = await Promise.all([
              new Response(proc.stdout).text(),
              new Response(proc.stderr).text(),
              proc.exited,
            ]);
            if (exit !== 0) {
              return { content: `agy failed (exit ${exit}): ${err || text}` };
            }
            return { content: text };
          } finally {
            context?.signal?.removeEventListener("abort", abort);
          }
        },
      });

      editor.add({
        name: "agy_models",
        description:
          "List the models currently available to the agy tool (Google Gemini CLI), one `id\\tlabel` per line. Source of truth for the `model` argument.",
        input: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        execute: async () => {
          const live = fetchModels();
          if (live.length === 0) {
            const fallback = inventory.map((m) => `${m.id}\t${m.label}`).join("\n");
            return { content: `agy models unavailable; cached inventory:\n${fallback}` };
          }
          const body = live.map((m) => `${m.id}\t${m.label}`).join("\n");
          return { content: body };
        },
      });
    });
  },
};
