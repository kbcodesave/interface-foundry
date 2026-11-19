import type { CompatSettings, ProjectData, Screen, UINode } from "../model/types";
import { styleToClasses } from "./classes";
import { ICONS } from "./icons";
import { ANIMATION_CSS, tokensToCss, tokensToJson } from "./tokensCss";

// ---------------------------------------------------------------------------
// Deterministic code generator. The same function produces the live preview
// (instrument: true adds data-if-* attributes for selection) and the export,
// so what you see in the editor is literally the exported code running.
// ---------------------------------------------------------------------------

export interface GenOptions {
  instrument?: boolean;
  compat?: Pick<CompatSettings, "framework" | "language">;
}

export type PropKind = "callback" | "string" | "number" | "rows" | "chart" | "route" | "values";

export interface PropSpec {
  name: string;
  kind: PropKind;
  tsType: string;
  doc: string;
  /** JS expression for the default (example) value, if any. */
  defaultExpr?: string;
  /** Node ids that introduced this prop. */
  sources: string[];
}

export interface DataType {
  name: string;
  fields: { key: string; label: string }[];
}

export interface UnitInfo {
  kind: "screen" | "component";
  name: string; // exported identifier
  file: string;
  rootId: string;
  props: PropSpec[];
  childComponents: string[];
  dataTypes: DataType[];
  usesIcons: boolean;
  usesChart: boolean;
  problems: string[];
}

export interface GenResult {
  files: Record<string, string>;
  units: UnitInfo[];
  /** Things the generator resolved on its own (e.g. renamed duplicate component names). */
  notices: string[];
  /** Tailwind classes emitted per node id (for checks). */
  classesByNode: Record<string, string>;
  problems: string[];
}

// ---------------------------------------------------------------------------

export function toIdent(raw: string, pascal = false): string {
  const words = (raw || "").replace(/[^a-zA-Z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  let s = words.map((w, i) => (i === 0 && !pascal ? w[0].toLowerCase() + w.slice(1) : w[0].toUpperCase() + w.slice(1))).join("");
  if (!s) s = pascal ? "Component" : "value";
  if (/^\d/.test(s)) s = (pascal ? "C" : "v") + s;
  return s;
}

const RESERVED = new Set(["default", "class", "function", "return", "new", "delete", "switch", "case", "var", "let", "const", "import", "export", "this", "theme", "className", "key", "ref", "children"]);

function safeProp(name: string): string {
  const id = toIdent(name);
  return RESERVED.has(id) ? `${id}Value` : id;
}

const J = (s: unknown) => JSON.stringify(s ?? "");

const BOX_TAGS = new Set(["div", "section", "header", "nav", "aside", "main", "footer", "form", "article", "ul", "li", "figure", "fieldset"]);
const TEXT_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "span", "label", "strong", "em", "small", "code", "blockquote", "figcaption", "legend"]);

function placeholderImage(label: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='400'><rect width='100%' height='100%' fill='#2a2d31'/><path d='M0 400L640 0M0 0l640 400' stroke='#3a3e43' stroke-width='2'/><text x='50%' y='50%' fill='#8b8a86' font-family='monospace' font-size='18' text-anchor='middle'>${label.replace(/[<&'"]/g, "")}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// ---------------------------------------------------------------------------

interface UnitCtx {
  info: UnitInfo;
  data: ProjectData;
  opts: GenOptions;
  props: Map<string, PropSpec>;
  states: Map<string, { var: string; setter: string; init: string; kind: "open" | "on" }>;
  constants: string[];
  classesByNode: Record<string, string>;
  componentNames: Map<string, string>; // rootId -> exported name
  componentProps: Map<string, PropSpec[]>;
  rootIsScreen: boolean;
}

function addProp(ctx: UnitCtx, spec: Omit<PropSpec, "sources">, source: string) {
  const existing = ctx.props.get(spec.name);
  if (existing) {
    if (existing.tsType !== spec.tsType) {
      ctx.info.problems.push(`Prop "${spec.name}" is used with two different types (${existing.tsType} and ${spec.tsType}) in ${ctx.info.name}. Rename one of them.`);
    }
    if (!existing.sources.includes(source)) existing.sources.push(source);
    return;
  }
  ctx.props.set(spec.name, { ...spec, sources: [source] });
}

function classesFor(node: UINode, ctx: UnitCtx, extra: string[] = []): string {
  const list = [
    ...styleToClasses(node.style),
    ...styleToClasses(node.md, "md:"),
    ...styleToClasses(node.lg, "lg:"),
    ...styleToClasses(node.hover, "hover:"),
    ...styleToClasses(node.focus, node.type === "input" || node.type === "textarea" || node.type === "select" ? "focus:" : "focus-visible:"),
  ];
  if (node.hover || node.focus) list.push("transition-[color,background-color,border-color,opacity,box-shadow,transform]", "duration-[var(--if-motion-fast)]");
  if (node.animation && node.animation !== "none") list.push(`if-anim-${node.animation}`);
  list.push(...extra);
  const uniq = [...new Set(list)].join(" ");
  ctx.classesByNode[node.id] = uniq;
  return uniq;
}

function stateFor(ctx: UnitCtx, target: UINode, kind: "open" | "on", init: string) {
  const existing = ctx.states.get(target.id);
  if (existing) return existing;
  const base = toIdent(target.name || target.id);
  const suffix = kind === "open" ? "Open" : "On";
  let v = `${base}${suffix}`;
  let i = 2;
  const used = new Set([...ctx.states.values()].map((s) => s.var));
  while (used.has(v) || ctx.props.has(v)) v = `${base}${suffix}${i++}`;
  const st = { var: v, setter: `set${v[0].toUpperCase()}${v.slice(1)}`, init, kind };
  ctx.states.set(target.id, st);
  return st;
}

/** Collect props + state for a unit (stops at nested component roots, which forward their props). */
function collect(ctx: UnitCtx, id: string) {
  const node = ctx.data.nodes[id];
  if (!node) return;
  if (id !== ctx.info.rootId && ctx.componentNames.has(id)) {
    // Forwarded props carry no default here: the child component owns its example defaults.
    for (const p of ctx.componentProps.get(id) ?? []) addProp(ctx, { ...p, defaultExpr: undefined }, id);
    ctx.info.childComponents.push(ctx.componentNames.get(id)!);
    return;
  }
  const ev = node.events ?? {};
  if (ev.onClick) addProp(ctx, { name: safeProp(ev.onClick), kind: "callback", tsType: "() => void", doc: `Called when "${node.name}" is activated.` }, id);
  if (ev.onChange) {
    const boolish = node.type === "checkbox" || node.type === "toggle";
    addProp(ctx, { name: safeProp(ev.onChange), kind: "callback", tsType: boolish ? "(checked: boolean) => void" : "(value: string) => void", doc: `Called when "${node.name}" changes.` }, id);
  }
  if (ev.onSubmit) addProp(ctx, { name: safeProp(ev.onSubmit), kind: "callback", tsType: "(values: Record<string, string>) => void", doc: `Called with the form's field values when "${node.name}" is submitted.` }, id);
  if (ev.navigate) addProp(ctx, { name: "onNavigate", kind: "route", tsType: "(route: string) => void", doc: "Called with a route when a navigation element is activated. Wire this to your router." }, id);
  if (ev.toggle) {
    const target = ctx.data.nodes[ev.toggle];
    if (!target) ctx.info.problems.push(`"${node.name}" toggles a node that no longer exists.`);
    else if (!inUnit(ctx, ev.toggle)) ctx.info.problems.push(`"${node.name}" toggles "${target.name}", which is outside the ${ctx.info.name} component. Move both into the same component or screen.`);
  }
  if (node.hidden && id !== ctx.info.rootId) {
    const init = ctx.opts.instrument ? `__IF_OPEN__.includes(${J(id)})` : "false";
    stateFor(ctx, node, "open", init);
  }
  if (node.type === "toggle") stateFor(ctx, node, "on", node.props?.checked ? "true" : "false");

  if (node.bind) {
    const name = safeProp(node.bind);
    if (node.type === "table") {
      const base = toIdent(node.bind, true).replace(/s$/, "");
      const typeName = base.endsWith("Row") ? base : `${base}Row`;
      const cols = node.props?.columns ?? [];
      const fields = cols.map((c, i) => ({ key: safeProp(c) || `col${i}`, label: c }));
      ctx.info.dataTypes.push({ name: typeName, fields });
      const constName = `EXAMPLE_${name.replace(/([A-Z])/g, "_$1").toUpperCase()}`;
      const rows = (node.props?.rows ?? []).map((r) => Object.fromEntries(fields.map((f, i) => [f.key, r[i] ?? ""])));
      ctx.constants.push(`/** Example data for layout only. Pass real rows through the \`${name}\` prop. */\nconst ${constName}: ${typeName}[] = ${JSON.stringify(rows, null, 2)};`);
      addProp(ctx, { name, kind: "rows", tsType: `${typeName}[]`, doc: `Rows for "${node.name}". Defaults to labelled example data.`, defaultExpr: constName }, id);
    } else if (node.type === "chart") {
      const constName = `EXAMPLE_${name.replace(/([A-Z])/g, "_$1").toUpperCase()}`;
      const labels = node.props?.labels ?? [];
      const values = node.props?.values ?? [];
      const rows = labels.map((l, i) => ({ label: l, value: values[i] ?? 0 }));
      ctx.constants.push(`/** Example data for layout only. Pass real values through the \`${name}\` prop. */\nconst ${constName}: ChartDatum[] = ${JSON.stringify(rows)};`);
      addProp(ctx, { name, kind: "chart", tsType: "ChartDatum[]", doc: `Data for "${node.name}". Defaults to labelled example data.`, defaultExpr: constName }, id);
    } else if (node.type === "progress") {
      addProp(ctx, { name, kind: "number", tsType: "number", doc: `Value for "${node.name}" (0 to ${node.props?.max ?? 100}).`, defaultExpr: String(node.props?.value ?? 0) }, id);
    } else if (node.type === "image") {
      addProp(ctx, { name, kind: "string", tsType: "string", doc: `Image URL for "${node.name}".`, defaultExpr: J(node.props?.src || placeholderImage(node.name)) }, id);
    } else {
      addProp(ctx, { name, kind: "string", tsType: "string", doc: `Text shown in "${node.name}". Example: ${J(node.text ?? "")}.`, defaultExpr: J(node.text ?? "") }, id);
    }
  }
  if (node.type === "icon") ctx.info.usesIcons = true;
  if (node.type === "chart") ctx.info.usesChart = true;
  node.children.forEach((c) => collect(ctx, c));
}

function inUnit(ctx: UnitCtx, id: string): boolean {
  // Walk up from id: must reach unit root before reaching another component root.
  let cur: string | undefined = id;
  const parents = parentMap(ctx.data);
  while (cur) {
    if (cur === ctx.info.rootId) return true;
    if (ctx.componentNames.has(cur)) return false;
    cur = parents.get(cur);
  }
  return false;
}

const parentCache = new WeakMap<object, Map<string, string>>();
function parentMap(data: ProjectData): Map<string, string> {
  let m = parentCache.get(data.nodes);
  if (!m) {
    m = new Map();
    for (const n of Object.values(data.nodes)) for (const c of n.children) m.set(c, n.id);
    parentCache.set(data.nodes, m);
  }
  return m;
}

function attrs(list: (string | false | undefined)[]): string {
  return list.filter(Boolean).join(" ");
}

function instr(node: UINode, ctx: UnitCtx): string {
  if (!ctx.opts.instrument) return "";
  return `data-if-id=${J(node.id)}${node.bind ? " data-if-example=\"true\"" : ""}`;
}

function clickHandler(node: UINode, ctx: UnitCtx): string | undefined {
  const ev = node.events ?? {};
  const parts: string[] = [];
  if (ev.toggle && ctx.data.nodes[ev.toggle] && inUnit(ctx, ev.toggle)) {
    const st = stateFor(ctx, ctx.data.nodes[ev.toggle], "open", ctx.opts.instrument ? `__IF_OPEN__.includes(${J(ev.toggle)})` : "false");
    parts.push(`${st.setter}((v) => !v);`);
  }
  if (ev.navigate) parts.push(`onNavigate?.(${J(ev.navigate)});`);
  if (ev.onClick) parts.push(`${safeProp(ev.onClick)}?.();`);
  if (node.type === "toggle") {
    const st = stateFor(ctx, node, "on", "false");
    const cb = ev.onChange ? ` ${safeProp(ev.onChange)}?.(!${st.var});` : "";
    parts.push(`${st.setter}((v) => !v);${cb}`);
  }
  if (!parts.length) return undefined;
  const prevent = node.type === "link" ? "e.preventDefault(); " : "";
  return `(${prevent ? "e" : ""}) => { ${prevent}${parts.join(" ")} }`;
}

function render(ctx: UnitCtx, id: string, depth: number): string {
  const node = ctx.data.nodes[id];
  const pad = "  ".repeat(depth);
  if (!node) return `${pad}{/* missing node ${id} */}`;

  if (id !== ctx.info.rootId && ctx.componentNames.has(id)) {
    const name = ctx.componentNames.get(id)!;
    const pass = (ctx.componentProps.get(id) ?? []).map((p) => `${p.name}={${p.name}}`);
    const el = `${pad}<${name}${pass.length ? " " + pass.join(" ") : ""} />`;
    return node.hidden ? wrapHidden(ctx, node, el, pad) : el;
  }

  const isRoot = id === ctx.info.rootId;
  const extra: string[] = [];
  if (isRoot && ctx.rootIsScreen) extra.push("if-root");
  const cls = classesFor(node, ctx, extra);
  const childPad = "  ".repeat(depth + 1);
  const kids = () => node.children.map((c) => render(ctx, c, depth + 1)).join("\n");
  const textExpr = node.bind && node.type !== "table" && node.type !== "chart" ? `{${safeProp(node.bind)}}` : node.text ? `{${J(node.text)}}` : "";
  const onClick = clickHandler(node, ctx);
  const ins = instr(node, ctx);
  const rootExtra = isRoot && ctx.rootIsScreen ? `data-theme={theme}` : "";
  let el: string;

  switch (node.type) {
    case "box":
    case "text": {
      const fallback = node.type === "box" ? "div" : "p";
      const allowed = node.type === "box" ? BOX_TAGS : TEXT_TAGS;
      const tag = node.tag && allowed.has(node.tag) ? node.tag : fallback;
      const a: (string | false | undefined)[] = [ins, rootExtra, cls && `className=${J(cls)}`];
      if (tag === "form" && node.events?.onSubmit) {
        a.push(`onSubmit={(e) => { e.preventDefault(); ${safeProp(node.events.onSubmit)}?.(Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>); }}`);
      }
      if (node.props?.role === "dialog") {
        a.push(`role="dialog"`, `aria-modal="true"`, node.props.label && `aria-label=${J(node.props.label)}`);
        const st = ctx.states.get(node.id);
        if (st) a.push(`tabIndex={-1}`, `onKeyDown={(e) => { if (e.key === "Escape") ${st.setter}(false); }}`, `onClick={(e) => { if (e.target === e.currentTarget) ${st.setter}(false); }}`);
      } else if (onClick) {
        a.push(`role="button"`, `tabIndex={0}`, `onClick={${onClick}}`, `onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); } }}`);
        if (node.props?.label) a.push(`aria-label=${J(node.props.label)}`);
      }
      const inner = [textExpr && `${childPad}${textExpr}`, node.children.length ? kids() : ""].filter(Boolean).join("\n");
      el = inner ? `${pad}<${tag} ${attrs(a)}>\n${inner}\n${pad}</${tag}>` : `${pad}<${tag} ${attrs(a)} />`;
      break;
    }
    case "button":
    case "link": {
      const isLink = node.type === "link";
      const tag = isLink ? "a" : "button";
      const a: (string | false | undefined)[] = [ins, `className=${J(cls)}`];
      if (isLink) a.push(`href=${J(node.events?.navigate || node.props?.href || "#")}`);
      else a.push(`type=${J(node.tag === "submit" ? "submit" : "button")}`);
      if (onClick) a.push(`onClick={${onClick}}`);
      if (node.props?.label) a.push(`aria-label=${J(node.props.label)}`);
      if (node.events?.toggle && ctx.data.nodes[node.events.toggle] && inUnit(ctx, node.events.toggle)) {
        const st = ctx.states.get(node.events.toggle);
        if (st) a.push(`aria-expanded={${st.var}}`);
      }
      const inner = [textExpr && `${childPad}${textExpr}`, node.children.length ? kids() : ""].filter(Boolean).join("\n");
      el = `${pad}<${tag} ${attrs(a)}>\n${inner || `${childPad}{${J(node.name)}}`}\n${pad}</${tag}>`;
      break;
    }
    case "input":
    case "textarea": {
      const tag = node.type === "textarea" ? "textarea" : "input";
      const a: (string | false | undefined)[] = [ins, `className=${J(cls)}`];
      if (tag === "input") a.push(`type=${J(node.props?.inputType || "text")}`);
      if (node.props?.name) a.push(`name=${J(node.props.name)}`);
      if (node.props?.placeholder) a.push(`placeholder=${J(node.props.placeholder)}`);
      if (node.props?.label) a.push(`aria-label=${J(node.props.label)}`);
      if (node.bind) a.push(`defaultValue={${safeProp(node.bind)}}`);
      if (node.events?.onChange) a.push(`onChange={(e) => ${safeProp(node.events.onChange)}?.(e.target.value)}`);
      el = `${pad}<${tag} ${attrs(a)} />`;
      break;
    }
    case "select": {
      const a: (string | false | undefined)[] = [ins, `className=${J(cls)}`];
      if (node.props?.name) a.push(`name=${J(node.props.name)}`);
      if (node.props?.label) a.push(`aria-label=${J(node.props.label)}`);
      if (node.events?.onChange) a.push(`onChange={(e) => ${safeProp(node.events.onChange)}?.(e.target.value)}`);
      const opts = (node.props?.options ?? []).map((o) => `${childPad}<option value=${J(o)}>{${J(o)}}</option>`).join("\n");
      el = `${pad}<select ${attrs(a)}>\n${opts}\n${pad}</select>`;
      break;
    }
    case "checkbox": {
      const a: (string | false | undefined)[] = [`type="checkbox"`, `className="accent-[var(--if-color-primary)] size-4"`];
      if (node.props?.name) a.push(`name=${J(node.props.name)}`);
      if (node.props?.checked) a.push(`defaultChecked`);
      if (node.events?.onChange) a.push(`onChange={(e) => ${safeProp(node.events.onChange)}?.(e.target.checked)}`);
      const label = node.props?.label ?? node.text ?? node.name;
      el = `${pad}<label ${attrs([ins, `className=${J(cls + " inline-flex items-center gap-[var(--if-space-2)]")}`])}>\n${childPad}<input ${attrs(a)} />\n${childPad}<span>{${J(label)}}</span>\n${pad}</label>`;
      break;
    }
    case "toggle": {
      const st = stateFor(ctx, node, "on", node.props?.checked ? "true" : "false");
      const label = node.props?.label ?? node.text ?? node.name;
      el = `${pad}<button ${attrs([ins, `type="button"`, `role="switch"`, `aria-checked={${st.var}}`, `aria-label=${J(label)}`, `onClick={${onClick}}`, `className=${J(cls + " relative inline-flex h-[20px] w-[36px] shrink-0 items-center rounded-full")}`, `style={{ background: ${st.var} ? "var(--if-color-primary)" : "var(--if-color-secondary)" }}`])}>\n${childPad}<span className="inline-block size-[14px] rounded-full bg-[color:var(--if-color-surface)] transition-transform duration-[var(--if-motion-fast)]" style={{ transform: ${st.var} ? "translateX(19px)" : "translateX(3px)" }} />\n${pad}</button>`;
      break;
    }
    case "image": {
      const src = node.bind ? `{${safeProp(node.bind)}}` : `{${J(node.props?.src || placeholderImage(node.name))}}`;
      el = `${pad}<img ${attrs([ins, `className=${J(cls)}`, `src=${src}`, `alt=${J(node.props?.alt ?? "")}`])} />`;
      break;
    }
    case "icon": {
      const name = node.props?.icon && ICONS[node.props.icon] ? node.props.icon : "box";
      el = `${pad}<Icon ${attrs([ins, `name=${J(name)}`, `className=${J(cls)}`])} />`;
      break;
    }
    case "badge": {
      el = `${pad}<span ${attrs([ins, `className=${J(cls)}`])}>\n${childPad}${textExpr || `{${J(node.name)}}`}\n${pad}</span>`;
      break;
    }
    case "divider": {
      el = `${pad}<hr ${attrs([ins, `className=${J(cls || "border-[color:var(--if-color-border)]")}`])} />`;
      break;
    }
    case "progress": {
      const max = node.props?.max ?? 100;
      const val = node.bind ? safeProp(node.bind) : String(node.props?.value ?? 0);
      el = `${pad}<div ${attrs([ins, `role="progressbar"`, `aria-label=${J(node.props?.label ?? node.name)}`, `aria-valuemin={0}`, `aria-valuemax={${max}}`, `aria-valuenow={${val}}`, `className=${J(cls)}`])}>\n${childPad}<div className="h-full rounded-[inherit] bg-[color:var(--if-color-primary)]" style={{ width: \`\${Math.min(100, (${val} / ${max}) * 100)}%\` }} />\n${pad}</div>`;
      break;
    }
    case "table": {
      const cols = node.props?.columns ?? [];
      const fields = cols.map((c, i) => safeProp(c) || `col${i}`);
      const th = `px-[var(--if-space-4)] py-[var(--if-space-3)] text-left font-[number:var(--if-font-weight-medium)] text-[length:var(--if-font-size-xs)] uppercase tracking-[0.06em] text-[color:var(--if-color-text-muted)] border-b border-solid border-[color:var(--if-color-border)]`;
      const td = `px-[var(--if-space-4)] py-[var(--if-space-3)] border-b border-solid border-[color:var(--if-color-border)]`;
      const head = cols.map((c) => `${childPad}    <th scope="col" className=${J(th)}>{${J(c)}}</th>`).join("\n");
      let body: string;
      if (node.bind) {
        const rowsVar = safeProp(node.bind);
        body = `${childPad}  {${rowsVar}.map((row, i) => (\n${childPad}    <tr key={i}>\n${fields.map((f) => `${childPad}      <td className=${J(td)}>{row.${f}}</td>`).join("\n")}\n${childPad}    </tr>\n${childPad}  ))}`;
      } else {
        body = (node.props?.rows ?? []).map((r) => `${childPad}  <tr>\n${cols.map((_, i) => `${childPad}    <td className=${J(td)}>{${J(r[i] ?? "")}}</td>`).join("\n")}\n${childPad}  </tr>`).join("\n");
      }
      el = `${pad}<table ${attrs([ins, `className=${J(cls)}`])}>\n${childPad}<thead>\n${childPad}  <tr>\n${head}\n${childPad}  </tr>\n${childPad}</thead>\n${childPad}<tbody>\n${body}\n${childPad}</tbody>\n${pad}</table>`;
      break;
    }
    case "chart": {
      const dataExpr = node.bind ? safeProp(node.bind) : JSON.stringify((node.props?.labels ?? []).map((l, i) => ({ label: l, value: node.props?.values?.[i] ?? 0 })));
      el = `${pad}<Chart ${attrs([ins, `type=${J(node.props?.chartType ?? "bar")}`, `data={${dataExpr}}`, `label=${J(node.props?.label ?? node.name)}`, `className=${J(cls)}`])} />`;
      break;
    }
    default:
      el = `${pad}{/* unsupported node type */}`;
  }
  return node.hidden && !isRoot ? wrapHidden(ctx, node, el, pad) : el;
}

function wrapHidden(ctx: UnitCtx, node: UINode, el: string, pad: string): string {
  const st = stateFor(ctx, node, "open", ctx.opts.instrument ? `__IF_OPEN__.includes(${J(node.id)})` : "false");
  return `${pad}{${st.var} && (\n${el.split("\n").map((l) => "  " + l).join("\n")}\n${pad})}`;
}

// ---------------------------------------------------------------------------

function structuralKey(data: ProjectData, rootId: string): string {
  const strip = (id: string): unknown => {
    const n = data.nodes[id];
    if (!n) return null;
    const { id: _id, children, events, ...rest } = n;
    return { ...rest, events: events ? { ...events, toggle: events.toggle ? "t" : undefined } : undefined, children: children.map(strip) };
  };
  return JSON.stringify(strip(rootId));
}

export function screenComponentName(screen: Screen): string {
  const base = toIdent(screen.name, true);
  return base.endsWith("Screen") ? base : `${base}Screen`;
}

export function generate(data: ProjectData, opts: GenOptions = {}): GenResult {
  const problems: string[] = [];
  const notices: string[] = [];
  const classesByNode: Record<string, string> = {};
  const framework = opts.compat?.framework ?? "react";

  // 1) Assign component names (dedupe structurally identical components).
  const componentNames = new Map<string, string>();
  const byKey = new Map<string, string>();
  const usedNames = new Set<string>();
  const reachable = new Set<string>();
  const walk = (id: string) => {
    if (reachable.has(id) || !data.nodes[id]) return;
    reachable.add(id);
    data.nodes[id].children.forEach(walk);
  };
  data.screens.forEach((s) => walk(s.rootId));
  const screenNames = new Set(data.screens.map(screenComponentName));
  const canonicalRoot = new Map<string, string>(); // rootId -> canonical rootId whose file is emitted
  for (const id of reachable) {
    const node = data.nodes[id];
    if (!node.component || data.screens.some((s) => s.rootId === id)) continue;
    const key = structuralKey(data, id);
    const existing = byKey.get(key);
    if (existing) {
      componentNames.set(id, componentNames.get(existing)!);
      canonicalRoot.set(id, existing);
      continue;
    }
    let name = toIdent(node.component, true);
    if (name === "Icon" || name === "Chart" || name === "ThemeScope" || screenNames.has(name)) name = `${name}Part`;
    let i = 2;
    const base = name;
    while (usedNames.has(name)) name = `${base}${i++}`;
    if (name !== base) notices.push(`Two different components were both named "${base}". The second one is exported as "${name}".`);
    usedNames.add(name);
    componentNames.set(id, name);
    byKey.set(key, id);
    canonicalRoot.set(id, id);
  }

  // 2) Build units bottom-up so parents know their children's props.
  const componentProps = new Map<string, PropSpec[]>();
  const units: UnitInfo[] = [];
  const emitted = new Map<string, string>(); // name -> code
  const depthOf = (id: string): number => {
    let d = 0;
    let cur: string | undefined = id;
    const pm = parentMap(data);
    while ((cur = pm.get(cur))) d++;
    return d;
  };
  const compRoots = [...componentNames.keys()].sort((a, b) => depthOf(b) - depthOf(a));

  const buildUnit = (kind: "screen" | "component", rootId: string, name: string, file: string): { info: UnitInfo; code: string } => {
    const info: UnitInfo = { kind, name, file, rootId, props: [], childComponents: [], dataTypes: [], usesIcons: false, usesChart: false, problems: [] };
    const ctx: UnitCtx = { info, data, opts, props: new Map(), states: new Map(), constants: [], classesByNode, componentNames, componentProps, rootIsScreen: kind === "screen" };
    collect(ctx, rootId);
    if (kind === "screen") {
      ctx.props.set("theme", { name: "theme", kind: "string", tsType: `"light" | "dark"`, doc: "Color mode of the design tokens.", defaultExpr: J(data.tokens.defaultMode), sources: [] });
    }
    const jsx = render(ctx, rootId, 2);
    info.props = [...ctx.props.values()];
    const propsType = `${name}Props`;
    const destructure = info.props.map((p) => (p.defaultExpr ? `${p.name} = ${p.defaultExpr}` : p.name));
    const usesState = ctx.states.size > 0;
    const imports: string[] = [];
    if (usesState) imports.push(`import { useState } from "react";`);
    const typeImports = [propsType, ...(info.props.some((p) => p.kind === "chart" && p.defaultExpr) ? ["ChartDatum"] : []), ...info.dataTypes.map((d) => d.name)];
    const rel = kind === "screen" ? "../components/" : "./";
    for (const c of [...new Set(info.childComponents)]) imports.push(`import { ${c} } from "${rel}${c}";`);
    if (info.usesIcons) imports.push(`import { Icon } from "${rel}Icon";`);
    if (info.usesChart) imports.push(`import { Chart } from "${rel}Chart";`);
    imports.push(`import type { ${[...new Set(typeImports)].join(", ")} } from "${kind === "screen" ? "../" : "../"}types";`);
    const stateLines = [...ctx.states.values()].map((s) => `  const [${s.var}, ${s.setter}] = useState(${s.init});`);
    const header = [
      framework === "nextjs" ? `"use client";\n` : "",
      `// Generated by Interface Foundry. Presentation only: no data fetching, routing or global styles.`,
      `// Connect your application through the props below.`,
      opts.instrument ? `declare const __IF_OPEN__: string[];` : "",
    ].filter(Boolean).join("\n");
    const code = `${header}
${imports.join("\n")}
${ctx.constants.length ? "\n" + ctx.constants.join("\n\n") + "\n" : ""}
export function ${name}(${destructure.length ? `{ ${destructure.join(", ")} }` : "_props"}: ${propsType}) {
${stateLines.join("\n")}${stateLines.length ? "\n" : ""}  return (
${jsx}
  );
}
`;
    problems.push(...info.problems);
    return { info, code };
  };

  for (const rootId of compRoots) {
    const name = componentNames.get(rootId)!;
    const canon = canonicalRoot.get(rootId)!;
    if (canon !== rootId) continue; // duplicates reuse the canonical file
    const { info, code } = buildUnit("component", rootId, name, `src/components/${name}.tsx`);
    componentProps.set(rootId, info.props);
    emitted.set(name, code);
    units.push(info);
  }
  for (const [rootId, canon] of canonicalRoot) if (rootId !== canon) componentProps.set(rootId, componentProps.get(canon) ?? []);

  for (const s of data.screens) {
    const name = screenComponentName(s);
    const { info, code } = buildUnit("screen", s.rootId, name, `src/screens/${name}.tsx`);
    emitted.set(name, code);
    units.push(info);
  }

  // 3) Shared files.
  const files: Record<string, string> = {};
  for (const u of units) files[u.file] = emitted.get(u.name)!;
  const anyIcons = units.some((u) => u.usesIcons);
  const anyChart = units.some((u) => u.usesChart);
  const usedIcons = new Set<string>();
  for (const id of reachable) {
    const n = data.nodes[id];
    if (n.type === "icon") usedIcons.add(n.props?.icon && ICONS[n.props.icon] ? n.props.icon : "box");
  }
  if (anyIcons) files["src/components/Icon.tsx"] = iconFile([...usedIcons].sort(), framework);
  if (anyChart) files["src/components/Chart.tsx"] = chartFile(framework);
  files["src/components/ThemeScope.tsx"] = themeScopeFile(data.tokens.defaultMode, framework);
  files["src/types.ts"] = typesFile(units, anyChart);
  files["src/foundry.css"] = tokensToCss(data.tokens) + "\n" + ANIMATION_CSS;
  files["src/index.ts"] = indexFile(units, anyIcons, anyChart);
  files["tokens/tokens.json"] = tokensToJson(data.tokens);

  return { files, units, classesByNode, problems: [...new Set(problems)], notices };
}

function typesFile(units: UnitInfo[], anyChart: boolean): string {
  const out: string[] = [`// Generated by Interface Foundry: the data structures and callbacks each component expects.\n`];
  if (anyChart || units.some((u) => u.props.some((p) => p.kind === "chart"))) out.push(`export interface ChartDatum {\n  label: string;\n  value: number;\n}\n`);
  const seen = new Set<string>();
  for (const u of units) for (const d of u.dataTypes) {
    if (seen.has(d.name)) continue;
    seen.add(d.name);
    out.push(`export interface ${d.name} {\n${d.fields.map((f) => `  /** ${f.label} */\n  ${f.key}: string | number;`).join("\n")}\n}\n`);
  }
  for (const u of units) {
    out.push(`export interface ${u.name}Props {\n${u.props.map((p) => `  /** ${p.doc} */\n  ${p.name}?: ${p.tsType};`).join("\n")}\n}\n`);
  }
  return out.join("\n");
}

function indexFile(units: UnitInfo[], icons: boolean, chart: boolean): string {
  const lines = [`// Generated by Interface Foundry.`, `// Import "./foundry.css" once (it is scoped to .if-root and changes nothing else).`];
  for (const u of units.filter((x) => x.kind === "screen")) lines.push(`export { ${u.name} } from "./screens/${u.name}";`);
  for (const u of units.filter((x) => x.kind === "component")) lines.push(`export { ${u.name} } from "./components/${u.name}";`);
  if (icons) lines.push(`export { Icon } from "./components/Icon";`);
  if (chart) lines.push(`export { Chart } from "./components/Chart";`);
  lines.push(`export { ThemeScope } from "./components/ThemeScope";`);
  lines.push(`export type * from "./types";`);
  return lines.join("\n") + "\n";
}

function iconFile(names: string[], framework: string): string {
  const map = names.map((n) => `  ${J(n)}: ${J(ICONS[n])},`).join("\n");
  return `${framework === "nextjs" ? `"use client";\n\n` : ""}// Generated by Interface Foundry: only the icons this interface uses (no icon dependency).
const PATHS = {
${map}
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className}>
      <path d={PATHS[name]} />
    </svg>
  );
}
`;
}

function chartFile(framework: string): string {
  return `${framework === "nextjs" ? `"use client";\n\n` : ""}// Generated by Interface Foundry: a dependency-free SVG chart that reads colors from the design tokens.
import type { ChartDatum } from "../types";

export function Chart({ data, type = "bar", label, className }: { data: ChartDatum[]; type?: "bar" | "line"; label: string; className?: string }) {
  const w = 600;
  const h = 220;
  const pad = 24;
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = data.length > 0 ? (w - pad * 2) / data.length : 0;
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const points = data.map((d, i) => \`\${pad + step * i + step / 2},\${y(d.value)}\`).join(" ");
  return (
    <figure className={className} role="img" aria-label={label}>
      <svg viewBox={\`0 0 \${w} \${h}\`} width="100%" height="100%" preserveAspectRatio="none">
        <line x1={pad} x2={w - pad} y1={h - pad} y2={h - pad} stroke="var(--if-color-border)" />
        {type === "bar"
          ? data.map((d, i) => (
              <rect key={i} x={pad + step * i + step * 0.2} width={step * 0.6} y={y(d.value)} height={h - pad - y(d.value)} fill="var(--if-color-primary)" rx={2} />
            ))
          : <polyline points={points} fill="none" stroke="var(--if-color-primary)" strokeWidth={2} />}
        {data.map((d, i) => (
          <text key={i} x={pad + step * i + step / 2} y={h - 6} textAnchor="middle" fontSize={11} fill="var(--if-color-text-muted)">{d.label}</text>
        ))}
      </svg>
    </figure>
  );
}
`;
}

function themeScopeFile(mode: string, framework: string): string {
  return `${framework === "nextjs" ? `"use client";\n\n` : ""}// Generated by Interface Foundry: wrap individual components with this so they receive the design tokens.
// Screens already include it on their root element.
import type { ReactNode } from "react";

export function ThemeScope({ children, theme = "${mode}", className = "" }: { children: ReactNode; theme?: "light" | "dark"; className?: string }) {
  return (
    <div className={\`if-root \${className}\`} data-theme={theme}>
      {children}
    </div>
  );
}
`;
}
