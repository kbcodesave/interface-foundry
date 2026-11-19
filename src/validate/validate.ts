import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import tailwindUrl from "@tailwindcss/browser?url";
import { rawColorValues, resolveValue, tokenRefs } from "../codegen/classes";
import { generate, type GenResult } from "../codegen/generate";
import { ANIMATION_KEYFRAMES } from "../codegen/tokensCss";
import { parentOf, subtreeIds } from "../model/ops";
import type { ColorMode, ProjectData, StyleSet, UINode, ValidationLevel } from "../model/types";
import { compileFiles, frameDoc, transpile } from "../preview/runtime";

export type Severity = "error" | "warning" | "info";

export interface Finding {
  severity: Severity;
  message: string;
  nodeId?: string;
  file?: string;
}

export interface CheckResult {
  id: string;
  title: string;
  status: "pass" | "warn" | "fail" | "not-run";
  findings: Finding[];
  /** Why a check did not run, or how it ran. */
  note?: string;
}

export interface ValidationReport {
  at: number;
  fingerprint: string;
  level: ValidationLevel;
  readyForExport: boolean;
  checks: CheckResult[];
  units: { name: string; kind: string; status: "tested" | "partially-tested" | "untested"; detail: string }[];
  summary: string;
}

export const ALLOWED_DEPENDENCIES = ["react", "react/jsx-runtime", "react-dom"];

function check(id: string, title: string, findings: Finding[], note?: string): CheckResult {
  const status = findings.some((f) => f.severity === "error") ? "fail" : findings.some((f) => f.severity === "warning") ? "warn" : "pass";
  return { id, title, status, findings, note };
}

// ---------------------------------------------------------------------------
// Static checks (run on the generated files and the model)

function syntaxCheck(files: Record<string, string>): CheckResult {
  const f: Finding[] = [];
  let n = 0;
  for (const [file, code] of Object.entries(files)) {
    if (!/\.(tsx?|jsx?)$/.test(file)) continue;
    n++;
    const r = transpile(file, code);
    if (r.error) f.push({ severity: "error", message: r.error, file });
  }
  return check("syntax", "Syntax and transpile", f, `Parsed ${n} source files with the TypeScript/JSX transpiler.`);
}

const IMPORT_RE = /^\s*import\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["'];?/gm;

function importsCheck(files: Record<string, string>): CheckResult {
  const f: Finding[] = [];
  const has = (p: string) => [p, `${p}.tsx`, `${p}.ts`, `${p}.jsx`, `${p}.js`, `${p}/index.ts`].some((c) => c in files);
  for (const [file, code] of Object.entries(files)) {
    if (!/\.(tsx?|jsx?)$/.test(file)) continue;
    for (const m of code.matchAll(IMPORT_RE)) {
      const spec = m[1];
      if (spec.startsWith(".")) {
        const parts = file.split("/").slice(0, -1);
        for (const seg of spec.split("/")) {
          if (seg === "..") parts.pop();
          else if (seg !== ".") parts.push(seg);
        }
        const target = parts.join("/");
        if (!has(target)) f.push({ severity: "error", message: `Broken import "${spec}"`, file });
      } else if (!ALLOWED_DEPENDENCIES.includes(spec)) {
        f.push({ severity: "error", message: `Import "${spec}" is not in the dependency manifest`, file });
      }
    }
  }
  return check("imports", "Imports and dependencies", f, "Every relative import must resolve inside the package; every package import must be listed in manifest.json.");
}

function undefinedComponentsCheck(files: Record<string, string>): CheckResult {
  const f: Finding[] = [];
  for (const [file, code] of Object.entries(files)) {
    if (!/\.(tsx|jsx)$/.test(file)) continue;
    const defined = new Set<string>();
    for (const m of code.matchAll(/import\s+(?:type\s+)?\{([^}]+)\}/g)) m[1].split(",").forEach((s) => defined.add(s.trim().split(/\s+as\s+/).pop()!.trim()));
    for (const m of code.matchAll(/(?:function|const|class)\s+([A-Z][A-Za-z0-9]*)/g)) defined.add(m[1]);
    for (const m of code.matchAll(/<([A-Z][A-Za-z0-9]*)[\s/>]/g)) {
      if (!defined.has(m[1])) f.push({ severity: "error", message: `<${m[1]}> is used but never imported or defined`, file });
    }
  }
  return check("components", "Undefined components", dedupe(f));
}

function dedupe(f: Finding[]): Finding[] {
  const seen = new Set<string>();
  return f.filter((x) => {
    const k = `${x.severity}|${x.message}|${x.file}|${x.nodeId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function reachableNodes(data: ProjectData): UINode[] {
  const ids = new Set<string>();
  for (const s of data.screens) subtreeIds(data.nodes, s.rootId).forEach((i) => ids.add(i));
  return [...ids].map((i) => data.nodes[i]);
}

function textOf(data: ProjectData, id: string): string {
  const n = data.nodes[id];
  if (!n) return "";
  return [n.text ?? "", ...n.children.map((c) => (data.nodes[c]?.type === "icon" ? "" : textOf(data, c)))].join(" ").trim();
}

function a11yStaticCheck(data: ProjectData): CheckResult {
  const f: Finding[] = [];
  for (const n of reachableNodes(data)) {
    if ((n.type === "input" || n.type === "textarea" || n.type === "select") && !n.props?.label?.trim())
      f.push({ severity: "error", message: `Form control "${n.name}" has no accessible label (set Label in the inspector).`, nodeId: n.id });
    if ((n.type === "button" || n.type === "link") && !n.props?.label?.trim() && !textOf(data, n.id))
      f.push({ severity: "error", message: `"${n.name}" has no text or accessible label, so screen readers can't name it.`, nodeId: n.id });
    if (n.type === "image" && n.props?.alt === undefined)
      f.push({ severity: "warning", message: `Image "${n.name}" has no alt text (set an empty alt only if it is decorative).`, nodeId: n.id });
    if (n.props?.role === "dialog" && !n.props.label) f.push({ severity: "warning", message: `Dialog "${n.name}" has no accessible label.`, nodeId: n.id });
    if (n.hidden && n.props?.role === "dialog") {
      const closers = reachableNodes(data).filter((x) => x.events?.toggle === n.id && subtreeIds(data.nodes, n.id).includes(x.id));
      if (!closers.length) f.push({ severity: "warning", message: `Dialog "${n.name}" has no close control inside it (Escape and backdrop click still close it).`, nodeId: n.id });
    }
  }
  return check("a11y", "Accessible form controls and names", f);
}

function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  let r: number, g: number, b: number;
  if (m) {
    const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
    [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  } else {
    const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+))?\s*\)$/i.exec(hex.trim());
    if (!rgb) return null;
    if (rgb[4] !== undefined && Number(rgb[4]) < 1) return null; // translucent: can't judge statically
    [r, g, b] = [rgb[1], rgb[2], rgb[3]].map(Number);
  }
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: string, b: string): number | null {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function contrastCheck(data: ProjectData): CheckResult {
  const f: Finding[] = [];
  const modes: ColorMode[] = ["dark", "light"];
  const effective = (id: string, key: keyof StyleSet): string | undefined => {
    let cur: string | undefined = id;
    while (cur) {
      const v = data.nodes[cur]?.style[key];
      if (v && v !== "transparent") return v;
      cur = parentOf(data.nodes, cur);
    }
    return undefined;
  };
  let checked = 0;
  for (const n of reachableNodes(data)) {
    const hasText = !!n.text || n.type === "button" || n.type === "badge" || n.type === "link";
    if (!hasText || n.type === "icon") continue;
    const color = effective(n.id, "color");
    const bg = effective(n.id, "bg");
    if (!color || !bg) continue;
    for (const mode of modes) {
      if (mode !== data.tokens.defaultMode && !Object.keys(data.tokens.color[mode] ?? {}).length) continue;
      const c = resolveValue(color, data.tokens, mode)!;
      const b = resolveValue(bg, data.tokens, mode)!;
      const ratio = contrastRatio(c, b);
      if (ratio === null) continue;
      checked++;
      const size = parseFloat(resolveValue(n.style.fontSize, data.tokens) ?? "15");
      const weight = parseFloat(resolveValue(n.style.fontWeight, data.tokens) ?? "400");
      const large = size >= 24 || (size >= 18.6 && weight >= 700);
      const need = large ? 3 : 4.5;
      if (ratio < need) f.push({ severity: mode === data.tokens.defaultMode ? "warning" : "info", message: `"${n.name}" text contrast is ${ratio.toFixed(2)}:1 in ${mode} mode (needs ${need}:1).`, nodeId: n.id });
    }
  }
  return check("contrast", "Text contrast (WCAG AA)", dedupe(f), `Computed ${checked} text/background pairs from resolved design tokens. Translucent or image backgrounds are skipped.`);
}

function tokenCheck(data: ProjectData): CheckResult {
  const f: Finding[] = [];
  let raw = 0;
  for (const n of reachableNodes(data)) {
    for (const slot of ["style", "md", "lg", "hover", "focus"] as const) {
      const s = n[slot];
      if (!s) continue;
      raw += rawColorValues(s).length;
      for (const v of Object.values(s)) {
        if (typeof v !== "string") continue;
        for (const ref of tokenRefs(v)) {
          const group = ref.group === "color" ? data.tokens.color[data.tokens.defaultMode] : (data.tokens as unknown as Record<string, Record<string, string> | undefined>)[ref.group];
          if (!group || !(ref.name in group)) f.push({ severity: "error", message: `"${n.name}" references $${ref.group}.${ref.name}, which is not defined in the design tokens.`, nodeId: n.id });
        }
      }
    }
  }
  const dark = Object.keys(data.tokens.color.dark);
  const light = Object.keys(data.tokens.color.light);
  for (const k of dark) if (!light.includes(k)) f.push({ severity: "warning", message: `Color token "${k}" exists in dark mode but not in light mode.` });
  for (const k of light) if (!dark.includes(k)) f.push({ severity: "warning", message: `Color token "${k}" exists in light mode but not in dark mode.` });
  if (raw > 0) f.push({ severity: raw > 8 ? "warning" : "info", message: `${raw} color value${raw === 1 ? "" : "s"} bypass the design tokens (hard-coded hex/rgb). They won't follow token or theme changes.` });
  return check("tokens", "Design token consistency", dedupe(f));
}

function globalStyleCheck(files: Record<string, string>): CheckResult {
  const f: Finding[] = [];
  const css = files["src/foundry.css"] ?? "";
  // Strip comments and @keyframes blocks, then examine every top-level selector.
  const body = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
  const flat = body.replace(/@media[^{]+\{/g, "").replace(/\}\s*\}/g, "}");
  for (const m of flat.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    const selectors = m[1].split(",").map((s) => s.trim()).filter(Boolean);
    for (const sel of selectors) if (!sel.startsWith(".if-root")) f.push({ severity: "error", message: `Unscoped CSS selector "${sel}" could affect the host application.`, file: "src/foundry.css" });
  }
  for (const m of css.matchAll(/@keyframes\s+([\w-]+)/g)) if (!m[1].startsWith("if-")) f.push({ severity: "warning", message: `Keyframes "${m[1]}" are not prefixed and may collide with the host app.` });
  return check("global-css", "No global style changes", f, "Every selector in foundry.css must be scoped under .if-root.");
}

function animationCheck(data: ProjectData, files: Record<string, string>): CheckResult {
  const f: Finding[] = [];
  const css = files["src/foundry.css"] ?? "";
  for (const k of ANIMATION_KEYFRAMES) if (!css.includes(`@keyframes ${k}`)) f.push({ severity: "error", message: `Keyframes ${k} are missing from foundry.css.` });
  for (const n of reachableNodes(data)) {
    if (n.animation && n.animation !== "none" && !css.includes(`.if-anim-${n.animation}`)) f.push({ severity: "error", message: `"${n.name}" uses animation "${n.animation}", which has no definition.`, nodeId: n.id });
  }
  if (!css.includes("prefers-reduced-motion")) f.push({ severity: "warning", message: "No reduced-motion handling." });
  return check("animations", "Animations defined", f);
}

function assetCheck(data: ProjectData): CheckResult {
  const f: Finding[] = [];
  for (const n of reachableNodes(data)) {
    const src = n.props?.src;
    if (n.type !== "image" || !src) continue;
    if (/^data:/.test(src)) {
      if (src.length > 400_000) f.push({ severity: "warning", message: `Image "${n.name}" is embedded as a ${(src.length / 1024).toFixed(0)} KB data URL. Consider hosting it as a file.`, nodeId: n.id });
    } else if (/^https?:/.test(src)) f.push({ severity: "warning", message: `Image "${n.name}" loads from an external URL (${new URL(src).host}). It is not included in the package; check you have the rights to use it.`, nodeId: n.id });
    else f.push({ severity: "error", message: `Image "${n.name}" points to "${src}", which is not part of the package.`, nodeId: n.id });
  }
  return check("assets", "Assets present", f);
}

function performanceCheck(data: ProjectData): CheckResult {
  const f: Finding[] = [];
  for (const s of data.screens) {
    const count = subtreeIds(data.nodes, s.rootId).length;
    if (count > 800) f.push({ severity: "warning", message: `Screen "${s.name}" has ${count} elements. Consider splitting it.` });
  }
  for (const n of reachableNodes(data)) {
    if (n.type === "table" && (n.props?.rows?.length ?? 0) > 200) f.push({ severity: "warning", message: `Table "${n.name}" renders ${n.props!.rows!.length} rows without virtualisation.`, nodeId: n.id });
    if (n.style.backdropBlur && n.style.position === "fixed") f.push({ severity: "info", message: `"${n.name}" combines fixed positioning with backdrop blur, which is costly on low-end devices.`, nodeId: n.id });
  }
  return check("performance", "Obvious performance problems", f);
}

function generatorCheck(gen: GenResult): CheckResult {
  return check("generator", "Component boundaries and props", [
    ...gen.problems.map((m) => ({ severity: "error" as const, message: m })),
    ...gen.notices.map((m) => ({ severity: "warning" as const, message: m })),
  ]);
}

// ---------------------------------------------------------------------------
// Rendering + interaction tests (run in a hidden iframe in this browser)

const WIDTHS = [375, 768, 1280];

async function makeFrame(width: number): Promise<HTMLIFrameElement> {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;height:900px;border:0;visibility:hidden;`;
  frame.srcdoc = frameDoc(tailwindUrl);
  await new Promise<void>((res) => {
    frame.onload = () => res();
    document.body.appendChild(frame);
  });
  return frame;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function domTests(data: ProjectData, onStep?: (s: string) => void): Promise<{ render: CheckResult; responsive: CheckResult; interaction: CheckResult; keyboard: CheckResult; tested: Map<string, string> }> {
  const gen = generate(data, { instrument: true });
  const css = gen.files["src/foundry.css"];
  const compiled = compileFiles(gen.files);
  const renderF: Finding[] = [];
  const respF: Finding[] = [];
  const interF: Finding[] = [];
  const keyF: Finding[] = [];
  const tested = new Map<string, string>();
  let interactions = 0;
  if (compiled.errors.length) {
    for (const e of compiled.errors) renderF.push({ severity: "error", message: e.message, file: e.file });
  }
  for (const s of data.screens) {
    const unit = gen.units.find((u) => u.kind === "screen" && u.rootId === s.rootId)!;
    const Screen = compiled.modules[unit.file]?.[unit.name] as ((p: Record<string, unknown>) => unknown) | undefined;
    if (!Screen) {
      renderF.push({ severity: "error", message: `Screen "${s.name}" could not be loaded.`, file: unit.file });
      continue;
    }
    for (const width of WIDTHS) {
      onStep?.(`Rendering ${s.name} at ${width}px`);
      const frame = await makeFrame(width);
      const doc = frame.contentDocument!;
      doc.getElementById("if-foundry-css")!.textContent = css;
      const errors: string[] = [];
      const win = frame.contentWindow as Window & typeof globalThis;
      win.addEventListener("error", (e) => errors.push(e.message));
      const routes: string[] = [];
      const root = createRoot(doc.getElementById("if-mount")!, { onUncaughtError: (e) => errors.push(e instanceof Error ? e.message : String(e)), onCaughtError: (e) => errors.push(e instanceof Error ? e.message : String(e)) });
      try {
        flushSync(() => root.render(createElement(Screen as never, { onNavigate: (r: string) => routes.push(r) })));
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
      await wait(350); // let the Tailwind runtime generate styles
      if (errors.length) renderF.push({ severity: "error", message: `${s.name} @${width}px: ${errors[0]}` });
      else if (!doc.querySelector("[data-if-id]")) renderF.push({ severity: "error", message: `${s.name} @${width}px rendered nothing.` });

      // Responsive: horizontal overflow at this width.
      const sw = doc.documentElement.scrollWidth;
      if (sw > width + 1) {
        const culprits = Array.from(doc.querySelectorAll<HTMLElement>("[data-if-id]"))
          .filter((el) => el.getBoundingClientRect().right > width + 1 && el.getBoundingClientRect().width > 0)
          .filter((el) => !el.parentElement?.closest("[data-if-id]") || el.parentElement.closest<HTMLElement>("[data-if-id]")!.getBoundingClientRect().right <= width + 1);
        const first = culprits[0]?.getAttribute("data-if-id") ?? undefined;
        respF.push({ severity: width === 375 ? "error" : "warning", message: `${s.name} overflows horizontally at ${width}px (content is ${sw}px wide)${first ? `, starting at "${data.nodes[first]?.name}"` : ""}.`, nodeId: first });
      }

      if (width === 1280 && !errors.length) {
        // Keyboard: interactive elements must be focusable.
        doc.querySelectorAll<HTMLElement>("[role=button]").forEach((el) => {
          if (el.tabIndex < 0) keyF.push({ severity: "error", message: `Clickable element "${data.nodes[el.dataset.ifId!]?.name}" can't be reached with the keyboard.`, nodeId: el.dataset.ifId });
        });
        doc.querySelectorAll<HTMLElement>("[role=dialog]").forEach((el) => {
          if (!el.hasAttribute("aria-label")) keyF.push({ severity: "warning", message: `Dialog "${data.nodes[el.dataset.ifId!]?.name}" has no aria-label.`, nodeId: el.dataset.ifId });
        });

        // Interaction: every toggler opens and closes its target.
        const togglers = subtreeIds(data.nodes, s.rootId).map((id) => data.nodes[id]).filter((n) => n.events?.toggle && !n.hidden);
        for (const t of togglers) {
          const targetId = t.events!.toggle!;
          const el = doc.querySelector<HTMLElement>(`[data-if-id="${CSS.escape(t.id)}"]`);
          if (!el) continue; // inside another closed overlay
          const before = !!doc.querySelector(`[data-if-id="${CSS.escape(targetId)}"]`);
          flushSync(() => el.click());
          await wait(30);
          const after = !!doc.querySelector(`[data-if-id="${CSS.escape(targetId)}"]`);
          interactions++;
          if (before === after) interF.push({ severity: "error", message: `Clicking "${t.name}" did not open or close "${data.nodes[targetId]?.name}".`, nodeId: t.id });
          else {
            tested.set(t.id, "toggle");
            // Keyboard close for dialogs.
            const dialog = doc.querySelector<HTMLElement>(`[data-if-id="${CSS.escape(targetId)}"][role=dialog]`);
            if (after && dialog) {
              flushSync(() => dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
              await wait(30);
              interactions++;
              if (doc.querySelector(`[data-if-id="${CSS.escape(targetId)}"]`)) interF.push({ severity: "warning", message: `Escape does not close "${data.nodes[targetId]?.name}".`, nodeId: targetId });
            } else if (after) {
              const again = doc.querySelector<HTMLElement>(`[data-if-id="${CSS.escape(t.id)}"]`);
              if (again) flushSync(() => again.click());
              await wait(20);
            }
          }
        }
        // Navigation: links call onNavigate with their route.
        const navs = subtreeIds(data.nodes, s.rootId).map((id) => data.nodes[id]).filter((n) => n.events?.navigate && !n.hidden);
        for (const nv of navs) {
          const el = doc.querySelector<HTMLElement>(`[data-if-id="${CSS.escape(nv.id)}"]`);
          if (!el) continue;
          routes.length = 0;
          flushSync(() => el.click());
          interactions++;
          if (routes[0] !== nv.events!.navigate) interF.push({ severity: "error", message: `"${nv.name}" did not call onNavigate("${nv.events!.navigate}").`, nodeId: nv.id });
          else tested.set(nv.id, "navigate");
          if (!data.screens.some((x) => x.route === nv.events!.navigate)) interF.push({ severity: "info", message: `"${nv.name}" navigates to ${nv.events!.navigate}, which isn't a screen in this project (your app's router must handle it).`, nodeId: nv.id });
        }
      }
      root.unmount();
      frame.remove();
    }
  }
  return {
    render: check("render", "Renders without errors", renderF, `Rendered ${data.screens.length} screen(s) at ${WIDTHS.join(", ")}px in a sandboxed frame.`),
    responsive: check("responsive", "Responsive layout (no horizontal overflow)", respF, `Measured at ${WIDTHS.join(", ")}px.`),
    interaction: check("interaction", "Interaction tests", interF, `Ran ${interactions} simulated clicks/key presses on toggles, dialogs and navigation.`),
    keyboard: check("keyboard", "Keyboard access", keyF),
    tested,
  };
}

// ---------------------------------------------------------------------------

export async function validateProject(data: ProjectData, fingerprint: string, onStep?: (s: string) => void): Promise<ValidationReport> {
  const gen = generate(data);
  const checks: CheckResult[] = [
    syntaxCheck(gen.files),
    importsCheck(gen.files),
    undefinedComponentsCheck(gen.files),
    generatorCheck(gen),
    a11yStaticCheck(data),
    contrastCheck(data),
    tokenCheck(data),
    globalStyleCheck(gen.files),
    animationCheck(data, gen.files),
    assetCheck(data),
    performanceCheck(data),
  ];
  let domOk = false;
  let tested = new Map<string, string>();
  try {
    const dom = await domTests(data, onStep);
    checks.push(dom.render, dom.responsive, dom.keyboard, dom.interaction);
    tested = dom.tested;
    domOk = true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    for (const [id, title] of [["render", "Renders without errors"], ["responsive", "Responsive layout"], ["keyboard", "Keyboard access"], ["interaction", "Interaction tests"]])
      checks.push({ id, title, status: "not-run", findings: [], note: `Could not run: ${msg}` });
  }
  checks.push(
    { id: "typecheck", title: "TypeScript type check", status: "not-run", findings: [], note: "Not run inside the browser. Run `npx tsc --noEmit` in your project after integrating." },
    { id: "host-build", title: "Build inside your application", status: "not-run", findings: [], note: "Can only run in your project. Your Tailwind setup must scan the package folder (see README)." },
    { id: "backend", title: "Backend / data integration", status: "not-run", findings: [], note: "Out of scope by design: components only expose props and callbacks. All data shown is example data." },
  );

  const hasError = checks.some((c) => c.status === "fail");
  const level: ValidationLevel = hasError ? "failed" : domOk ? "passed" : "partial";

  const units = gen.units.map((u) => {
    const ids = subtreeIds(data.nodes, u.rootId);
    const interactive = ids.filter((id) => data.nodes[id]?.events?.toggle || data.nodes[id]?.events?.navigate);
    const exercised = interactive.filter((id) => tested.has(id));
    const callbacks = u.props.filter((p) => p.kind === "callback").length;
    let status: "tested" | "partially-tested" | "untested" = "untested";
    if (domOk) status = interactive.length === exercised.length ? "tested" : "partially-tested";
    if (domOk && callbacks > 0 && status === "tested") status = "partially-tested";
    const detail = !domOk
      ? "Not rendered."
      : `Rendered at ${WIDTHS.length} widths; ${exercised.length}/${interactive.length} built-in interactions exercised${callbacks ? `; ${callbacks} callback prop${callbacks === 1 ? "" : "s"} are wired by your app and not tested here` : ""}.`;
    return { name: u.name, kind: u.kind, status, detail };
  });

  const errors = checks.reduce((a, c) => a + c.findings.filter((f) => f.severity === "error").length, 0);
  const warnings = checks.reduce((a, c) => a + c.findings.filter((f) => f.severity === "warning").length, 0);
  const ran = checks.filter((c) => c.status !== "not-run").length;
  const summary =
    level === "failed"
      ? `${errors} error${errors === 1 ? "" : "s"} must be fixed before export is marked ready (${warnings} warning${warnings === 1 ? "" : "s"}).`
      : level === "passed"
        ? `${ran} of ${checks.length} checks ran and passed${warnings ? ` with ${warnings} warning${warnings === 1 ? "" : "s"}` : ""}. Type checking and your app's own build have not run yet.`
        : `Static checks passed, but rendering tests could not run. Output is partially tested.`;
  return { at: Date.now(), fingerprint, level, readyForExport: !hasError && domOk, checks, units, summary };
}
