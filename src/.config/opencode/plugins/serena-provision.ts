// serena-provision — create a Serena project config for the current repository.
// V2 resolves plugin imports at runtime; local plugins avoid `@opencode/plugin`
// so no bare-specifier resolution is needed (same pattern as rtk.ts and agy.ts).
//
// Serena selects language servers per project via
// `$SERENA_HOME/projects/<name>/project.yml`. A repository with a `.git` but no
// Serena project resolves to a degraded, project-less instance whose symbol
// tools fail. This tool writes that file from a real `git ls-files` census and
// then hands off to `serena.activate_project`, which registers the project.
//
// This plugin never writes serena_config.yml: Serena's own
// `_persist_projects` owns that file and preserves its comments (ruamel.yaml).
// It also never overwrites an existing project.yml.

const SERENA_HOME = process.env.SERENA_HOME ?? `${process.env.HOME}/.config/serena`;

// Extension -> Serena LanguageServerId, transcribed from SolidLSP's
// `LanguageServerId.get_source_fn_matcher` (solidlsp/ls_config.py). Only the
// servers whose extensions are plausible in a source repository are listed;
// umbrella entries that need an explicit project marker (angular, deno, ...)
// are intentionally omitted.
const EXTENSION_SERVERS: Record<string, string> = {
  py: "python",
  pyi: "python",
  java: "java",
  ts: "typescript",
  tsx: "typescript",
  js: "typescript",
  jsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  mjs: "typescript",
  cjs: "typescript",
  cs: "csharp",
  rs: "rust",
  go: "go",
  rb: "ruby",
  erb: "ruby",
  c: "cpp",
  h: "cpp",
  cc: "cpp",
  cp: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  "c++": "cpp",
  hh: "cpp",
  hpp: "cpp",
  hxx: "cpp",
  inl: "cpp",
  ipp: "cpp",
  tpp: "cpp",
  txx: "cpp",
  cu: "cpp",
  hip: "cpp",
  kt: "kotlin",
  kts: "kotlin",
  dart: "dart",
  php: "php",
  phtml: "php",
  r: "r",
  rmd: "r",
  rnw: "r",
  pl: "perl",
  pm: "perl",
  clj: "clojure",
  cljs: "clojure",
  cljc: "clojure",
  ex: "elixir",
  exs: "elixir",
  elm: "elm",
  tf: "terraform",
  tfvars: "terraform",
  swift: "swift",
  sh: "bash",
  bash: "bash",
  cr: "crystal",
  cue: "cue",
  zig: "zig",
  zon: "zig",
  lua: "lua",
  luau: "luau",
  nix: "nix",
  erl: "erlang",
  hrl: "erlang",
  escript: "erlang",
  ml: "ocaml",
  mli: "ocaml",
  re: "ocaml",
  rei: "ocaml",
  al: "al",
  dal: "al",
  fs: "fsharp",
  fsx: "fsharp",
  fsi: "fsharp",
  rego: "rego",
  scala: "scala",
  sbt: "scala",
  jl: "julia",
  f90: "fortran",
  f95: "fortran",
  f03: "fortran",
  f08: "fortran",
  f: "fortran",
  for: "fortran",
  hs: "haskell",
  lhs: "haskell",
  hx: "haxe",
  html: "html",
  htm: "html",
  css: "scss",
  scss: "scss",
  sass: "scss",
  json: "json",
  jsonc: "json",
  toml: "toml",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  markdown: "markdown",
  tex: "latex",
  bib: "latex",
  sty: "latex",
  cls: "latex",
  sol: "solidity",
  ps1: "powershell",
  psm1: "powershell",
  psd1: "powershell",
  sv: "systemverilog",
  svh: "systemverilog",
  v: "systemverilog",
  vh: "systemverilog",
  hlsl: "hlsl",
  hlsli: "hlsl",
  fx: "hlsl",
  glsl: "hlsl",
  vert: "hlsl",
  frag: "hlsl",
  comp: "hlsl",
  wgsl: "hlsl",
  vue: "vue",
  svelte: "svelte",
  gleam: "gleam",
  qml: "qml",
  nf: "nextflow",
};

// Ordered so that a file claimed by several servers goes to the more specific
// one. Serena uses the first language server that supports a given file.
const ORDER = [
  "python",
  "java",
  "typescript",
  "csharp",
  "rust",
  "go",
  "ruby",
  "cpp",
  "kotlin",
  "dart",
  "php",
  "r",
  "perl",
  "clojure",
  "elixir",
  "elm",
  "terraform",
  "swift",
  "bash",
  "crystal",
  "cue",
  "zig",
  "lua",
  "luau",
  "nix",
  "erlang",
  "ocaml",
  "al",
  "fsharp",
  "rego",
  "scala",
  "julia",
  "fortran",
  "haskell",
  "haxe",
  "html",
  "scss",
  "json",
  "toml",
  "yaml",
  "markdown",
  "latex",
  "solidity",
  "powershell",
  "systemverilog",
  "hlsl",
  "vue",
  "svelte",
  "gleam",
  "qml",
  "nextflow",
];

type Census = {
  root: string;
  name: string;
  extCounts: Map<string, number>;
  servers: string[];
  unmapped: string[];
  tracked: number;
};

function git(cwd: string, args: string[]): { code: number; out: string; err: string } {
  const proc = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe" });
  return {
    code: proc.exitCode ?? 1,
    out: proc.stdout.toString(),
    err: proc.stderr.toString(),
  };
}

function extensionOf(path: string): string | null {
  const base = path.split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return null;
  return base.slice(dot + 1).toLowerCase();
}

function census(directory: string): Census | { error: string } {
  const top = git(directory, ["rev-parse", "--show-toplevel"]);
  if (top.code !== 0) {
    return { error: `not inside a git repository (git rev-parse failed: ${top.err.trim()})` };
  }
  const root = top.out.trim();
  const ls = git(directory, ["ls-files"]);
  if (ls.code !== 0) {
    return { error: `git ls-files failed: ${ls.err.trim()}` };
  }
  const files = ls.out.split("\n").filter((l) => l.length > 0);

  const extCounts = new Map<string, number>();
  for (const file of files) {
    const ext = extensionOf(file);
    if (!ext) continue;
    extCounts.set(ext, (extCounts.get(ext) ?? 0) + 1);
  }

  const present = new Set<string>();
  const unmapped: string[] = [];
  for (const ext of extCounts.keys()) {
    const server = EXTENSION_SERVERS[ext];
    if (server) present.add(server);
    else unmapped.push(ext);
  }

  const servers = ORDER.filter((s) => present.has(s));
  const name = root.split("/").filter(Boolean).pop() ?? "project";
  return { root, name, extCounts, servers, unmapped: unmapped.sort(), tracked: files.length };
}

function projectDir(name: string): string {
  return `${SERENA_HOME}/projects/${name}`;
}

function renderProjectYml(name: string, servers: string[]): string {
  const list = servers.map((s) => `  - ${s}`).join("\n");
  return [
    `project_name: "${name}"`,
    "language_servers:",
    list,
    'encoding: "utf-8"',
    "activation_command:",
    "activation_command_timeout: 180.0",
    "line_ending:",
    "language_backend:",
    "ignore_all_files_in_gitignore: true",
    "ls_specific_settings: {}",
    'ls_workspace_folders: ["."]',
    "ls_additional_workspace_folders: []",
    "ignored_paths: []",
    "read_only: false",
    "excluded_tools: []",
    "included_optional_tools: []",
    "fixed_tools: []",
    "default_modes:",
    "added_modes:",
    "",
  ].join("\n");
}

function report(c: Census, target: string, written: boolean): string {
  const top = [...c.extCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([ext, n]) => `.${ext}=${n}`)
    .join(" ");

  const lines = [
    written
      ? `Wrote Serena project config for ${c.name}.`
      : `Serena project config already exists for ${c.name}; left unchanged.`,
    "",
    `  repo root : ${c.root}`,
    `  config    : ${target}`,
    `  tracked   : ${c.tracked} files`,
    `  census    : ${top}`,
    `  servers   : ${c.servers.join(", ") || "(none)"}`,
  ];
  if (c.unmapped.length > 0) {
    lines.push(`  unmapped  : ${c.unmapped.map((e) => `.${e}`).join(" ")}`);
  }
  if (written) {
    lines.push(
      "",
      `Run \`serena.activate_project\` with project="${c.root}" to register and activate it.`,
    );
  } else {
    lines.push(
      "",
      "Delete the file first if you intend to regenerate it.",
      `Then run \`serena.activate_project\` with project="${c.root}".`,
    );
  }
  return lines.join("\n");
}

export default {
  id: "local:serena-provision",
  setup: (ctx: any) => {
    ctx.tool.transform((editor: any) => {
      editor.add({
        name: "serena-provision",
        description:
          "Create a Serena project config for the current git repository by running a " +
          "`git ls-files` extension census and mapping it to Serena language servers. " +
          "Writes only $SERENA_HOME/projects/<name>/project.yml; never writes " +
          "serena_config.yml and never overwrites an existing config. Use when Serena " +
          "reports no active project, or `Cannot extract symbols ... Active language " +
          "servers: [...]`. Follow with `serena.activate_project`.",
        input: {
          type: "object",
          properties: {
            force: {
              type: "boolean",
              description:
                "Replace an existing project.yml. Use to overwrite a stub that Serena " +
                "autogenerated with only one language server.",
            },
            project_name: {
              type: "string",
              description:
                "Override the project name, which defaults to the repository directory " +
                "name. Only needed when two repositories share a directory name.",
            },
          },
          additionalProperties: false,
        },
        execute: async (input: { force?: boolean; project_name?: string }) => {
          const directory = ctx.location?.directory ?? process.cwd();
          const result = census(directory);
          if ("error" in result) {
            return { content: `serena-provision: ${result.error}` };
          }
          if (input.project_name) result.name = input.project_name;
          const directoryPath = projectDir(result.name);
          const target = `${directoryPath}/project.yml`;

          if (!input.force && (await Bun.file(target).exists())) {
            return { content: report(result, target, false) };
          }

          const body = renderProjectYml(result.name, result.servers);
          const { chmod, mkdir, writeFile } = await import("node:fs/promises");
          try {
            await mkdir(directoryPath, { recursive: true });
            await writeFile(target, body, { mode: 0o600 });
          } catch (error) {
            return {
              content: `serena-provision: failed to write ${target}: ${String(error)}`,
            };
          }
          await chmod(target, 0o600);

          return { content: report(result, target, true) };
        },
      });
    });
  },
};
