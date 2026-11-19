import { DEFAULT_TOKENS, uid } from "./defaults";
import { NODE_TYPES, STYLE_KEYS, type Animation, type NodeEvents, type NodeProps, type NodeType, type ProjectData, type Screen, type StyleSet, type Tokens, type UINode } from "./types";

// Turns untrusted model output into a well-formed ProjectData. The AI never
// writes executable code: it describes a node tree, and the generator writes
// the code. This keeps every AI result editable, exportable and safe to preview.

type Loose = Record<string, unknown>;

const isObj = (v: unknown): v is Loose => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max = 2000): string | undefined => (typeof v === "string" ? v.slice(0, max) : typeof v === "number" ? String(v) : undefined);

export function cleanStyle(v: unknown): StyleSet | undefined {
  if (!isObj(v)) return undefined;
  const out: StyleSet = {};
  for (const k of STYLE_KEYS) {
    const val = str(v[k], 400);
    if (val !== undefined && val.trim() !== "") out[k] = val.trim();
  }
  return Object.keys(out).length ? out : undefined;
}

/** Style patch: null/"" removes a key. */
export function cleanStylePatch(v: unknown): Record<string, string | null> | undefined {
  if (!isObj(v)) return undefined;
  const out: Record<string, string | null> = {};
  for (const k of STYLE_KEYS) {
    if (!(k in v)) continue;
    const raw = v[k];
    if (raw === null || raw === "") out[k] = null;
    else {
      const val = str(raw, 400);
      if (val !== undefined) out[k] = val.trim();
    }
  }
  return Object.keys(out).length ? out : undefined;
}

export function cleanProps(v: unknown): NodeProps | undefined {
  if (!isObj(v)) return undefined;
  const p: NodeProps = {};
  for (const k of ["placeholder", "label", "name", "inputType", "src", "alt", "href", "icon", "role"] as const) {
    const s = str(v[k], k === "src" ? 200_000 : 300);
    if (s !== undefined) p[k] = s;
  }
  if (Array.isArray(v.options)) p.options = v.options.map((o) => str(o, 200) ?? "").slice(0, 100);
  if (Array.isArray(v.columns)) p.columns = v.columns.map((o) => str(o, 120) ?? "").slice(0, 30);
  if (Array.isArray(v.rows)) p.rows = v.rows.filter(Array.isArray).slice(0, 200).map((r) => (r as unknown[]).map((c) => str(c, 300) ?? "").slice(0, 30));
  if (Array.isArray(v.labels)) p.labels = v.labels.map((o) => str(o, 60) ?? "").slice(0, 60);
  if (Array.isArray(v.values)) p.values = v.values.map((o) => Number(o) || 0).slice(0, 60);
  if (v.chartType === "bar" || v.chartType === "line") p.chartType = v.chartType;
  if (typeof v.value === "number") p.value = v.value;
  if (typeof v.max === "number") p.max = v.max;
  if (typeof v.checked === "boolean") p.checked = v.checked;
  return Object.keys(p).length ? p : undefined;
}

function cleanEvents(v: unknown): NodeEvents | undefined {
  if (!isObj(v)) return undefined;
  const e: NodeEvents = {};
  for (const k of ["onClick", "onChange", "onSubmit", "navigate", "toggle"] as const) {
    const s = str(v[k], 120);
    if (s) e[k] = s;
  }
  return Object.keys(e).length ? e : undefined;
}

const ANIMS: Animation[] = ["none", "fade-in", "slide-up", "scale-in", "pulse"];

export interface RawNode extends Loose {
  id?: unknown;
  parent?: unknown;
}

/** Build nodes from a flat list with parent references. Returns the root ids (nodes whose parent is missing/null). */
export function buildNodes(list: unknown, idMap: Map<string, string>, existing: Record<string, UINode> = {}): { nodes: Record<string, UINode>; roots: string[]; toggles: [string, string][] } {
  const nodes: Record<string, UINode> = {};
  const roots: string[] = [];
  const toggles: [string, string][] = [];
  if (!Array.isArray(list)) return { nodes, roots, toggles };
  const items = list.filter(isObj).slice(0, 1500) as RawNode[];
  // Assign ids first so parents can be referenced before they appear.
  for (const raw of items) {
    const given = str(raw.id, 80) || uid();
    const fresh = idMap.has(given) || existing[given] ? uid() : given.replace(/[^a-zA-Z0-9_-]/g, "_");
    idMap.set(given, fresh);
    (raw as Loose).__id = fresh;
  }
  for (const raw of items) {
    const id = raw.__id as string;
    const type: NodeType = NODE_TYPES.includes(raw.type as NodeType) ? (raw.type as NodeType) : "box";
    const node: UINode = {
      id,
      type,
      name: str(raw.name, 80) || type,
      tag: str(raw.tag, 20),
      text: str(raw.text, 4000),
      props: cleanProps(raw.props),
      style: cleanStyle(raw.style) ?? {},
      md: cleanStyle(raw.md),
      lg: cleanStyle(raw.lg),
      hover: cleanStyle(raw.hover),
      focus: cleanStyle(raw.focus),
      events: cleanEvents(raw.events),
      bind: str(raw.bind, 60),
      component: str(raw.component, 60),
      hidden: raw.hidden === true ? true : undefined,
      animation: ANIMS.includes(raw.animation as Animation) ? (raw.animation as Animation) : undefined,
      children: [],
    };
    nodes[id] = node;
    if (node.events?.toggle) toggles.push([id, node.events.toggle]);
  }
  for (const raw of items) {
    const id = raw.__id as string;
    const parentRaw = str(raw.parent, 80);
    const parent = parentRaw ? idMap.get(parentRaw) ?? (existing[parentRaw] ? parentRaw : undefined) : undefined;
    if (parent && nodes[parent] && parent !== id) nodes[parent].children.push(id);
    else if (parent && existing[parent]) roots.push(`${parent}>${id}`);
    else roots.push(id);
  }
  // Remap toggle targets to new ids.
  for (const [src, target] of toggles) {
    const mapped = idMap.get(target) ?? (existing[target] ? target : undefined);
    nodes[src].events = { ...nodes[src].events, toggle: mapped };
  }
  return { nodes, roots, toggles };
}

function cleanRecord(v: unknown, fallback: Record<string, string>): Record<string, string> {
  if (!isObj(v)) return { ...fallback };
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    const s = str(val, 600);
    if (s && /^[a-zA-Z0-9-]{1,40}$/.test(k)) out[k] = s;
  }
  return Object.keys(out).length ? out : { ...fallback };
}

export function cleanTokens(v: unknown, base: Tokens = DEFAULT_TOKENS): Tokens {
  if (!isObj(v)) return structuredClone(base);
  const color = isObj(v.color) ? v.color : {};
  return {
    color: {
      dark: { ...base.color.dark, ...cleanRecord((color as Loose).dark ?? v.colorDark, base.color.dark) },
      light: { ...base.color.light, ...cleanRecord((color as Loose).light ?? v.colorLight, base.color.light) },
    },
    defaultMode: v.defaultMode === "light" ? "light" : v.defaultMode === "dark" ? "dark" : base.defaultMode,
    font: cleanRecord(v.font, base.font),
    fontSize: cleanRecord(v.fontSize, base.fontSize),
    fontWeight: cleanRecord(v.fontWeight, base.fontWeight),
    space: cleanRecord(v.space, base.space),
    radius: cleanRecord(v.radius, base.radius),
    shadow: cleanRecord(v.shadow, base.shadow),
    texture: { none: "none", ...cleanRecord(v.texture, base.texture) },
    motion: { ...base.motion, ...cleanRecord(v.motion, base.motion) },
    size: cleanRecord(v.size, base.size),
    breakpoint: { ...base.breakpoint },
    iconography: isObj(v.iconography) ? { style: str(v.iconography.style, 40) ?? base.iconography.style, strokeWidth: str(v.iconography.strokeWidth, 10) ?? base.iconography.strokeWidth } : { ...base.iconography },
    animationPrinciples: str(v.animationPrinciples, 600) ?? base.animationPrinciples,
  };
}

/** Partial token merge for AI edits: only groups/keys present are changed. */
export function mergeTokens(base: Tokens, patch: unknown): Tokens {
  if (!isObj(patch)) return base;
  const next: Tokens = structuredClone(base);
  const groups = ["font", "fontSize", "fontWeight", "space", "radius", "shadow", "texture", "motion", "size"] as const;
  for (const g of groups) if (isObj(patch[g])) Object.assign(next[g], cleanRecord(patch[g], {}));
  const color = isObj(patch.color) ? patch.color : undefined;
  if (color && isObj(color.dark)) Object.assign(next.color.dark, cleanRecord(color.dark, {}));
  if (color && isObj(color.light)) Object.assign(next.color.light, cleanRecord(color.light, {}));
  if (patch.defaultMode === "light" || patch.defaultMode === "dark") next.defaultMode = patch.defaultMode;
  if (typeof patch.animationPrinciples === "string") next.animationPrinciples = patch.animationPrinciples.slice(0, 600);
  return next;
}

/** Convert a full generated interface (emit_interface tool input) into ProjectData. */
export function interfaceFromAI(input: unknown): { data: ProjectData; name?: string; summary?: string; warnings: string[] } {
  const warnings: string[] = [];
  const v = isObj(input) ? input : {};
  const tokens = cleanTokens(v.tokens);
  const nodes: Record<string, UINode> = {};
  const screens: Screen[] = [];
  const idMap = new Map<string, string>();
  const rawScreens = Array.isArray(v.screens) ? v.screens.filter(isObj).slice(0, 20) : [];
  for (const s of rawScreens) {
    const built = buildNodes(s.nodes, idMap, nodes);
    Object.assign(nodes, built.nodes);
    let rootId: string;
    const roots = built.roots.filter((r) => !r.includes(">"));
    if (roots.length === 1) rootId = roots[0];
    else {
      rootId = uid();
      nodes[rootId] = { id: rootId, type: "box", name: str(s.name, 60) ?? "Screen", style: { minHeight: "100vh", bg: "$color.bg", color: "$color.text", fontFamily: "$font.body" }, children: roots };
      if (roots.length === 0) warnings.push(`Screen "${str(s.name) ?? "?"}" came back empty.`);
    }
    screens.push({ id: uid("s"), name: str(s.name, 60) || `Screen ${screens.length + 1}`, route: str(s.route, 120) || `/${screens.length ? `screen-${screens.length + 1}` : ""}`, rootId });
  }
  if (!screens.length) throw new Error("The model did not return any screens.");
  // Drop toggle targets that do not exist.
  for (const n of Object.values(nodes)) if (n.events?.toggle && !nodes[n.events.toggle]) n.events = { ...n.events, toggle: undefined };
  return { data: { tokens, nodes, screens }, name: str(v.name, 80), summary: str(v.summary, 2000), warnings };
}
