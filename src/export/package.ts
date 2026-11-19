import JSZip from "jszip";
import { transform } from "sucrase";
import { generate, type GenResult, type UnitInfo } from "../codegen/generate";
import { tokensToCss, tokensToJson } from "../codegen/tokensCss";
import type { CompatSettings, Project } from "../model/types";
import type { ValidationReport } from "../validate/validate";

// Builds the standardized integration package: components, scoped styles, tokens,
// dependency manifest, prop/callback definitions, integration instructions,
// an AI integration prompt and the honest validation report.

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "interface";
}

export interface CompatWarning {
  level: "warning" | "info";
  message: string;
}

export function compatWarnings(c: CompatSettings): CompatWarning[] {
  const w: CompatWarning[] = [];
  if (c.styling !== "tailwind") w.push({ level: "warning", message: `${c.styling === "css-modules" ? "CSS Modules" : "Plain CSS"} output is planned but not available in this version. The export uses Tailwind CSS classes; your project needs Tailwind to render it.` });
  if (c.componentLibrary !== "none") w.push({ level: "info", message: `Mapping to ${c.componentLibrary} components is not available yet. The export uses plain elements styled with Tailwind, which work alongside it.` });
  if (c.iconLibrary === "lucide-react") w.push({ level: "info", message: "lucide-react output is not available yet. Icons are exported as inline SVG with no dependency." });
  if (c.animationLibrary === "framer-motion") w.push({ level: "info", message: "Framer Motion output is not available yet. Animations use scoped CSS keyframes." });
  if (c.language === "js") w.push({ level: "info", message: "JavaScript output is produced by stripping types from the TypeScript source. Prop types are documented in manifest.json instead of types.ts." });
  return w;
}

function toJs(files: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, code] of Object.entries(files)) {
    if (path === "src/types.ts") continue;
    if (/\.tsx?$/.test(path)) {
      const isX = path.endsWith(".tsx");
      let js = transform(code, { transforms: ["typescript", ...(isX ? (["jsx"] as const) : [])], jsxRuntime: "preserve", disableESTransforms: true, filePath: path }).code;
      js = js.replace(/^export type \* from "\.\/types";\n?/m, "");
      out[path.replace(/\.tsx$/, ".jsx").replace(/\.ts$/, ".js")] = js;
    } else out[path] = code;
  }
  return out;
}

export function exportFiles(project: Project): { files: Record<string, string>; gen: GenResult } {
  const gen = generate(project, { compat: project.compat });
  const files = project.compat.language === "js" ? toJs(gen.files) : { ...gen.files };
  return { files, gen };
}

function propsTable(u: UnitInfo): string {
  if (!u.props.length) return "_No props._\n";
  return ["| Prop | Type | Description |", "| --- | --- | --- |", ...u.props.map((p) => `| \`${p.name}\` | \`${p.tsType.replace(/\|/g, "\\|")}\` | ${p.doc}${p.defaultExpr ? " (has example default)" : ""} |`)].join("\n") + "\n";
}

export function manifest(project: Project, gen: GenResult, report?: ValidationReport) {
  return {
    $schema: "interface-foundry/manifest@1",
    name: project.name,
    generatedAt: new Date().toISOString(),
    generator: "Interface Foundry 0.1",
    target: project.compat,
    dependencies: { react: ">=18" },
    peerRequirements: { tailwindcss: project.compat.tailwindVersion === "3" ? ">=3.3" : ">=4.0" },
    styles: { file: "src/foundry.css", scope: ".if-root", global: false },
    entry: project.compat.language === "js" ? "src/index.js" : "src/index.ts",
    screens: gen.units.filter((u) => u.kind === "screen").map((u) => ({ name: u.name, file: u.file, route: project.screens.find((s) => s.rootId === u.rootId)?.route, props: u.props.map(({ sources: _s, ...p }) => p), components: [...new Set(u.childComponents)] })),
    components: gen.units.filter((u) => u.kind === "component").map((u) => ({ name: u.name, file: u.file, props: u.props.map(({ sources: _s, ...p }) => p) })),
    dataStructures: gen.units.flatMap((u) => u.dataTypes).filter((d, i, a) => a.findIndex((x) => x.name === d.name) === i),
    callbacks: gen.units.flatMap((u) => u.props.filter((p) => p.kind === "callback" || p.kind === "route").map((p) => ({ component: u.name, name: p.name, signature: p.tsType, description: p.doc }))),
    validation: report ? { level: report.level, readyForExport: report.readyForExport, at: new Date(report.at).toISOString(), summary: report.summary } : { level: "untested", readyForExport: false },
  };
}

export function readme(project: Project, gen: GenResult, folder: string): string {
  const ext = project.compat.language === "js" ? "jsx" : "tsx";
  const screens = gen.units.filter((u) => u.kind === "screen");
  const comps = gen.units.filter((u) => u.kind === "component");
  const first = screens[0];
  const tw = project.compat.tailwindVersion === "3"
    ? `**Tailwind v3:** add the package to \`content\` in \`tailwind.config.js\`:\n\n\`\`\`js\ncontent: [\n  // ...your existing globs\n  "./src/${folder}/**/*.{ts,tsx,js,jsx}",\n],\n\`\`\``
    : `**Tailwind v4:** add one line to the CSS file that imports Tailwind:\n\n\`\`\`css\n@import "tailwindcss";\n@source "./${folder}";\n\`\`\`\n(Adjust the path so it points at this folder from that CSS file.)`;
  const callbacks = first?.props.filter((p) => p.kind === "callback" || p.kind === "route") ?? [];
  return `# ${project.name}: UI package

Generated by Interface Foundry. This folder contains **presentation components only**: no data fetching, routing, authentication, global CSS or state management. Your application stays in control of all of that and connects through props and callbacks.

## What's inside

| Path | Purpose |
| --- | --- |
| \`src/screens/\` | Complete screens (${screens.map((s) => s.name).join(", ") || "none"}) |
| \`src/components/\` | Reusable components (${comps.map((c) => c.name).join(", ") || "none"}), plus \`ThemeScope\`${gen.files["src/components/Icon.tsx"] ? ", \`Icon\`" : ""}${gen.files["src/components/Chart.tsx"] ? ", \`Chart\`" : ""} |
| \`src/types.ts\` | Prop interfaces and data structures${project.compat.language === "js" ? " (TypeScript only; see manifest.json)" : ""} |
| \`src/foundry.css\` | Design tokens as CSS variables + animations, all scoped to \`.if-root\` |
| \`tokens/tokens.json\` | The design system as JSON (import it into Foundry or other tools) |
| \`manifest.json\` | Dependencies, components, props, data structures, callbacks, validation status |
| \`AI_INTEGRATION_PROMPT.md\` | A prompt to hand to Claude, Replit or another coding assistant |
| \`VALIDATION.md\` | Exactly which checks ran and what they found |

## Install

1. Copy this folder into your project, e.g. \`src/${folder}/\`. It doesn't overwrite any of your files.
2. Dependencies: only \`react\` (18 or newer) and Tailwind CSS, which your project already needs. No new npm packages.
3. Make Tailwind scan the folder:

${tw}

4. Import the scoped stylesheet once, for example in your root layout or \`main.${ext}\`:

\`\`\`ts
import "./${folder}/src/foundry.css";
\`\`\`
${project.compat.framework === "nextjs" ? `\n**Next.js:** components are marked \`"use client"\` because they handle clicks and local UI state. Render them from a Server Component and pass serialisable data down as props; pass callbacks from a Client Component wrapper or use Server Actions.\n` : ""}
## Use

\`\`\`${ext}
import { ${first?.name ?? "Screen"} } from "./${folder}/src";

export function Page() {
  return (
    <${first?.name ?? "Screen"}
${callbacks.map((p) => `      ${p.name}={${p.kind === "route" ? "(route) => router.push(route)" : p.tsType.startsWith("()") ? "() => { /* your existing handler */ }" : "(value) => { /* your existing handler */ }"}}`).join("\n")}
    />
  );
}
\`\`\`

Every data-bearing prop has **example data as its default** so the screen renders on its own. Replace it with your real data by passing the prop. Example data is labelled in the source with \`EXAMPLE_\` constants.

To use a single component outside a screen, wrap it in \`ThemeScope\` so it receives the design tokens:

\`\`\`${ext}
import { ThemeScope${comps[0] ? `, ${comps[0].name}` : ""} } from "./${folder}/src";

<ThemeScope theme="${project.tokens.defaultMode}">${comps[0] ? `\n  <${comps[0].name} />\n` : ""}</ThemeScope>
\`\`\`

## Props

${gen.units.map((u) => `### ${u.name}\n\n${propsTable(u)}`).join("\n")}
## Integration boundaries

- Presentation only. Business logic, data loading, auth and routing stay in your app.
- No global CSS: every rule in \`foundry.css\` is under \`.if-root\`; keyframes are prefixed \`if-\`.
- No new dependencies beyond React and Tailwind.
- Don't edit generated files by hand if you plan to re-export from Foundry; change the design in Foundry and re-export instead, or treat this copy as yours from now on.

## Verify after integrating

\`\`\`sh
npx tsc --noEmit   # type check
npm run build      # your normal build
\`\`\`
`;
}

export function aiPrompt(project: Project, gen: GenResult, folder: string): string {
  const screens = gen.units.filter((u) => u.kind === "screen");
  const callbacks = gen.units.flatMap((u) => u.props.filter((p) => p.kind === "callback" || p.kind === "route").map((p) => `- \`${u.name}.${p.name}: ${p.tsType}\`: ${p.doc}`));
  const data = gen.units.flatMap((u) => u.props.filter((p) => p.kind === "rows" || p.kind === "chart" || p.kind === "string" || p.kind === "number").filter((p) => p.name !== "theme").map((p) => `- \`${u.name}.${p.name}: ${p.tsType}\`: ${p.doc}`));
  return `# AI integration prompt

Copy everything below the line into Claude, Replit, or another coding assistant, together with this folder.

---

Integrate the supplied UI package (folder \`${folder}/\`, generated by Interface Foundry) into my existing project.

**Preserve** all backend functionality, business logic, database structures, authentication, API routes and existing API connections. **Replace only** the presentation layer of the screens listed below. Map my existing data and event handlers to the new components' props. **Do not** refactor, rename or restyle unrelated application code, and do not redesign the supplied components.

## Rules

1. Copy \`${folder}/\` into the project as-is (e.g. \`src/${folder}/\`). Do not overwrite any existing file without asking me first.
2. Do not add npm dependencies. The package needs only React${project.compat.tailwindVersion ? ` and Tailwind CSS v${project.compat.tailwindVersion}` : ""}. If Tailwind isn't set up, stop and tell me rather than installing a different styling system.
3. Make Tailwind scan the package folder (see README.md, "Install" step 3), and import \`${folder}/src/foundry.css\` once at the app root. It is scoped to \`.if-root\` and changes nothing else.
4. For each screen below, find the existing page/route that serves the same purpose, keep its data loading and handlers exactly as they are, and render the Foundry screen in place of the old markup, passing real data and handlers through props.
5. Every data prop has example data as its default. Replace every example default with real data, or leave the prop unset only where I confirm example data is acceptable. Never ship \`EXAMPLE_\` data as if it were real.
6. Navigation: wire \`onNavigate(route)\` to the existing router. Routes in the package are suggestions; map them to my real routes.
7. Do not modify files inside \`${folder}/\` except to fix import paths. If a component can't express something my app needs, tell me instead of editing it.
8. When done, run the type checker and the build, and report what you connected, what still uses example data, and anything you could not map.

## Screens to integrate

${screens.map((s) => `- \`${s.name}\` (suggested route \`${project.screens.find((x) => x.rootId === s.rootId)?.route}\`), file \`${s.file}\``).join("\n")}

## Callbacks to connect to existing handlers

${callbacks.join("\n") || "- none"}

## Data to supply from the existing app

${data.join("\n") || "- none"}

The full machine-readable contract (props, data structures, callbacks) is in \`${folder}/manifest.json\`.
`;
}

export function validationMd(report?: ValidationReport, stale?: boolean): string {
  if (!report) return `# Validation\n\n**Status: UNTESTED.** No validation was run before this export. Treat this code as untested output.\n`;
  const icon = (s: string) => ({ pass: "PASS", warn: "WARN", fail: "FAIL", "not-run": "NOT RUN" })[s] ?? s;
  return `# Validation

**Status: ${report.level.toUpperCase()}${stale ? " (STALE: the design changed after this validation ran)" : ""}** · run ${new Date(report.at).toLocaleString()}

${report.summary}

| Check | Result | Notes |
| --- | --- | --- |
${report.checks.map((c) => `| ${c.title} | ${icon(c.status)} | ${(c.note ?? "").replace(/\|/g, "\\|")}${c.findings.length ? ` ${c.findings.length} finding(s).` : ""} |`).join("\n")}

## Findings

${report.checks.flatMap((c) => c.findings.map((f) => `- **${f.severity.toUpperCase()}** [${c.title}] ${f.message}`)).join("\n") || "None."}

## Per component

${report.units.map((u) => `- \`${u.name}\` (${u.kind}): **${u.status}**. ${u.detail}`).join("\n")}

"Passed" means the checks listed as PASS/WARN ran in Interface Foundry's browser sandbox and found no errors. It does not mean the code is production-ready in your application: the type check, your app's build, and the connection to real data have not run until you run them.
`;
}

export async function buildZip(project: Project, report: ValidationReport | undefined, stale: boolean, only?: string[]): Promise<Blob> {
  const folder = slug(project.name);
  const { files, gen } = exportFiles(project);
  const zip = new JSZip();
  const root = zip.folder(folder)!;
  const include = (path: string) => !only || only.some((o) => path === o || path.startsWith("src/types") || path === "src/foundry.css" || path.startsWith("tokens/") || path.endsWith("ThemeScope.tsx") || path.endsWith("ThemeScope.jsx") || path.endsWith("Icon.tsx") || path.endsWith("Icon.jsx") || path.endsWith("Chart.tsx") || path.endsWith("Chart.jsx"));
  for (const [path, code] of Object.entries(files)) {
    if (path === "src/index.ts" || path === "src/index.js") continue;
    if (include(path)) root.file(path, code);
  }
  // Index only re-exports what's included.
  const indexPath = project.compat.language === "js" ? "src/index.js" : "src/index.ts";
  const index = (files[indexPath] ?? "").split("\n").filter((line) => {
    const m = /from "\.\/(.+)"/.exec(line);
    if (!m || m[1] === "types") return true;
    return Object.keys(files).some((p) => p.startsWith(`src/${m[1]}.`) && include(p));
  });
  root.file(indexPath, index.join("\n"));
  root.file("manifest.json", JSON.stringify(manifest(project, gen, report), null, 2));
  root.file("README.md", readme(project, gen, folder));
  root.file("AI_INTEGRATION_PROMPT.md", aiPrompt(project, gen, folder));
  root.file("VALIDATION.md", validationMd(report, stale));
  return zip.generateAsync({ type: "blob" });
}

export async function buildDesignSystemZip(project: Project): Promise<Blob> {
  const zip = new JSZip();
  const root = zip.folder(`${slug(project.name)}-design-system`)!;
  root.file("tokens.json", tokensToJson(project.tokens));
  root.file("tokens.css", tokensToCss(project.tokens));
  root.file("README.md", `# ${project.name} design system\n\n- \`tokens.json\`: the full token set (colors for light and dark, type, spacing, radii, shadows, textures, motion, component sizes, iconography and animation principles). Import it into another Interface Foundry project from the Tokens panel.\n- \`tokens.css\`: the same tokens as CSS custom properties scoped to \`.if-root\`.\n`);
  return zip.generateAsync({ type: "blob" });
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
