import { useMemo, useState } from "react";
import { resolveValue } from "../codegen/classes";
import { ICON_NAMES } from "../codegen/icons";
import { toIdent } from "../codegen/generate";
import { parentOf, setStyle, subtreeIds, updateNode } from "../model/ops";
import { NODE_TYPES, type Animation, type NodeEvents, type NodeProps, type ProjectData, type StyleSet, type UINode } from "../model/types";
import { Btn, Field, Glyph, Segmented, Select, TextArea, TextInput, cx } from "./controls";

type Slot = "style" | "md" | "lg" | "hover" | "focus";

const GROUP_FOR: Partial<Record<keyof StyleSet, string[]>> = {
  bg: ["color"], color: ["color"], borderColor: ["color"],
  gap: ["space"], padding: ["space"], paddingX: ["space"], paddingY: ["space"], margin: ["space"],
  width: ["size", "space"], height: ["size", "space"], minHeight: ["size"], maxWidth: ["size"],
  fontFamily: ["font"], fontSize: ["fontSize"], fontWeight: ["fontWeight"], radius: ["radius"], shadow: ["shadow"], bgImage: ["texture"],
};

const ENUMS: Partial<Record<keyof StyleSet, string[]>> = {
  display: ["", "flex", "grid", "block", "inline-flex", "inline-block", "none"],
  direction: ["", "row", "column"],
  wrap: ["", "wrap", "nowrap"],
  align: ["", "start", "center", "end", "stretch", "baseline"],
  justify: ["", "start", "center", "end", "between", "around", "evenly"],
  position: ["", "relative", "absolute", "fixed", "sticky"],
  overflow: ["", "auto", "hidden", "visible"],
  textAlign: ["", "left", "center", "right"],
  textTransform: ["", "uppercase", "lowercase", "capitalize", "none"],
  borderSide: ["", "all", "top", "right", "bottom", "left"],
  cursor: ["", "pointer", "default", "not-allowed"],
};

const SECTIONS: { title: string; keys: (keyof StyleSet)[] }[] = [
  { title: "Layout", keys: ["display", "direction", "wrap", "align", "justify", "gap", "gridCols", "colSpan", "position", "inset", "zIndex", "overflow"] },
  { title: "Size", keys: ["width", "height", "minHeight", "maxWidth", "flex"] },
  { title: "Spacing", keys: ["padding", "paddingX", "paddingY", "margin"] },
  { title: "Typography", keys: ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "textAlign", "textTransform", "color"] },
  { title: "Fill & border", keys: ["bg", "bgImage", "borderWidth", "borderSide", "borderColor", "radius"] },
  { title: "Effects", keys: ["shadow", "opacity", "backdropBlur", "cursor"] },
];

const LABELS: Partial<Record<keyof StyleSet, string>> = {
  gridCols: "Grid columns", colSpan: "Column span", paddingX: "Padding X", paddingY: "Padding Y", minHeight: "Min height", maxWidth: "Max width",
  fontFamily: "Font", fontSize: "Font size", fontWeight: "Weight", lineHeight: "Line height", letterSpacing: "Tracking", textAlign: "Align text",
  textTransform: "Case", bg: "Background", bgImage: "Texture", borderWidth: "Border", borderSide: "Border side", borderColor: "Border color", backdropBlur: "Backdrop blur", zIndex: "Z index",
};

function tokenOptions(data: ProjectData, groups: string[]): string[] {
  const out: string[] = [];
  for (const g of groups) {
    const src = g === "color" ? data.tokens.color[data.tokens.defaultMode] : (data.tokens as unknown as Record<string, Record<string, string>>)[g];
    for (const k of Object.keys(src ?? {})) out.push(`$${g}.${k}`);
  }
  return out;
}

function StyleField({ data, node, slot, k, onChange }: { data: ProjectData; node: UINode; slot: Slot; k: keyof StyleSet; onChange: (v: string | undefined) => void }) {
  const value = node[slot]?.[k];
  const inherited = slot !== "style" ? node.style[k] : undefined;
  const enums = ENUMS[k];
  const groups = GROUP_FOR[k];
  const listId = groups ? `tok-${groups.join("-")}` : undefined;
  const resolved = resolveValue(value ?? inherited, data.tokens);
  const isColor = groups?.[0] === "color";
  return (
    <Field label={LABELS[k] ?? k[0].toUpperCase() + k.slice(1)}>
      <div className="flex items-center gap-1">
        {enums ? (
          <Select ariaLabel={k} value={value ?? ""} options={enums.map((e) => ({ value: e, label: e || (inherited ? `(${inherited})` : "—") }))} onChange={(v) => onChange(v || undefined)} />
        ) : (
          <TextInput ariaLabel={k} mono value={value} placeholder={inherited ? `${inherited}` : ""} list={listId} onChange={(v) => onChange(v.trim() || undefined)} />
        )}
        {isColor && (
          <label className="relative size-6 shrink-0 cursor-pointer overflow-hidden rounded-[2px] border border-line" title={resolved ? `${resolved}. Click to set a literal color (bypasses tokens).` : "Set a literal color"}>
            <span className="absolute inset-0" style={{ background: resolved && !resolved.includes("$") ? resolved : "transparent" }} />
            <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={/^#[0-9a-f]{6}$/i.test(resolved ?? "") ? resolved : "#000000"} onChange={(e) => onChange(e.target.value)} aria-label={`Pick literal ${k}`} />
          </label>
        )}
      </div>
    </Field>
  );
}

export function TokenDatalists({ data }: { data: ProjectData }) {
  const lists = new Set(Object.values(GROUP_FOR).map((g) => g!.join("-")));
  return (
    <>
      {[...lists].map((l) => (
        <datalist key={l} id={`tok-${l}`}>
          {tokenOptions(data, l.split("-").filter((x) => x !== "")).map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      ))}
    </>
  );
}

const PROP_FIELDS: Partial<Record<UINode["type"], (keyof NodeProps)[]>> = {
  input: ["label", "name", "placeholder", "inputType"],
  textarea: ["label", "name", "placeholder"],
  select: ["label", "name"],
  checkbox: ["label", "name"],
  toggle: ["label"],
  image: ["src", "alt"],
  icon: ["icon"],
  button: ["label"],
  link: ["href", "label"],
  progress: ["label"],
  chart: ["label"],
  box: ["role", "label"],
};

export function Inspector({ data, selectedId, onCommit, onSelect, screenRoutes, onSaveComponent }: {
  data: ProjectData;
  selectedId?: string;
  onCommit: (next: ProjectData, key?: string) => void;
  onSelect: (id: string) => void;
  screenRoutes: string[];
  onSaveComponent: (id: string) => void;
}) {
  const [slot, setSlot] = useState<Slot>("style");
  const node = selectedId ? data.nodes[selectedId] : undefined;
  const siblingsInScope = useMemo(() => {
    if (!node) return [] as UINode[];
    const screen = data.screens.find((s) => subtreeIds(data.nodes, s.rootId).includes(node.id));
    return screen ? subtreeIds(data.nodes, screen.rootId).map((i) => data.nodes[i]).filter((n) => n.hidden) : [];
  }, [data, node]);
  if (!node) return <div className="p-4 text-[12px] text-faint">Select an element in the preview or the layer list to edit its properties.</div>;

  const patch = (p: Partial<UINode>, key?: string) => onCommit(updateNode(data, node.id, p), key);
  const setProp = (k: keyof NodeProps, v: unknown) => patch({ props: { ...(node.props ?? {}), [k]: v === "" ? undefined : v } }, `prop:${node.id}:${k}`);
  const setEvent = (k: keyof NodeEvents, v: string) => patch({ events: { ...(node.events ?? {}), [k]: v || undefined } }, `ev:${node.id}:${k}`);
  const parent = parentOf(data.nodes, node.id);
  const textLike = node.type === "text" || node.type === "button" || node.type === "link" || node.type === "badge";

  return (
    <div className="flex flex-col">
      <div className="space-y-2 border-b border-line p-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-accent">{node.type}</span>
          {node.component && <span className="font-mono text-[10px] text-warn">◆ {node.component}</span>}
          {parent && (
            <button className="ml-auto text-[11px] text-faint hover:text-fg" onClick={() => onSelect(parent)}>
              Select parent
            </button>
          )}
        </div>
        <Field label="Layer name"><TextInput ariaLabel="Layer name" value={node.name} onChange={(v) => patch({ name: v || node.type })} /></Field>
        <Field label="Type">
          <Select ariaLabel="Type" value={node.type} options={NODE_TYPES} onChange={(v) => patch({ type: v })} />
        </Field>
        {(node.type === "box" || node.type === "text") && (
          <Field label="HTML tag">
            <Select ariaLabel="HTML tag" value={node.tag ?? ""} options={node.type === "box" ? ["", "div", "section", "header", "nav", "aside", "main", "footer", "form", "article", "ul", "li", "figure"] : ["", "h1", "h2", "h3", "h4", "h5", "h6", "p", "span", "label", "small", "strong", "code"]} onChange={(v) => patch({ tag: v || undefined })} />
          </Field>
        )}
        {node.type === "button" && (
          <Field label="Button type">
            <Select ariaLabel="Button type" value={node.tag === "submit" ? "submit" : "button"} options={["button", "submit"]} onChange={(v) => patch({ tag: v === "submit" ? "submit" : undefined })} />
          </Field>
        )}
        {textLike && <Field label="Text"><TextArea ariaLabel="Text" rows={2} value={node.text} onChange={(v) => patch({ text: v || undefined })} /></Field>}
      </div>

      <div className="space-y-2 border-b border-line p-3">
        <span className="label">Content & data</span>
        {(PROP_FIELDS[node.type] ?? []).map((k) =>
          k === "icon" ? (
            <Field key={k} label="Icon"><Select ariaLabel="Icon" value={node.props?.icon ?? "box"} options={ICON_NAMES} onChange={(v) => setProp("icon", v)} /></Field>
          ) : k === "inputType" ? (
            <Field key={k} label="Input type"><Select ariaLabel="Input type" value={node.props?.inputType ?? "text"} options={["text", "email", "password", "number", "search", "date", "tel", "url"]} onChange={(v) => setProp("inputType", v)} /></Field>
          ) : k === "role" ? (
            <Field key={k} label="Role"><Select ariaLabel="Role" value={node.props?.role ?? ""} options={["", "dialog", "status", "tooltip", "region"]} onChange={(v) => setProp("role", v)} /></Field>
          ) : (
            <Field key={k} label={k === "label" ? "Label (a11y)" : k[0].toUpperCase() + k.slice(1)}>
              <TextInput ariaLabel={k} value={node.props?.[k] as string | undefined} onChange={(v) => setProp(k, v)} />
            </Field>
          ),
        )}
        {node.type === "select" && <Field label="Options"><TextArea ariaLabel="Options" rows={3} value={(node.props?.options ?? []).join("\n")} onChange={(v) => setProp("options", v.split("\n").filter(Boolean))} /></Field>}
        {(node.type === "checkbox" || node.type === "toggle") && (
          <Field label="Checked"><input type="checkbox" aria-label="Checked by default" checked={!!node.props?.checked} onChange={(e) => setProp("checked", e.target.checked || undefined)} className="accent-accent" /></Field>
        )}
        {node.type === "progress" && (
          <>
            <Field label="Value"><TextInput ariaLabel="Value" mono value={String(node.props?.value ?? 0)} onChange={(v) => setProp("value", Number(v) || 0)} /></Field>
            <Field label="Max"><TextInput ariaLabel="Max" mono value={String(node.props?.max ?? 100)} onChange={(v) => setProp("max", Number(v) || 100)} /></Field>
          </>
        )}
        {node.type === "table" && (
          <>
            <Field label="Columns"><TextInput ariaLabel="Columns" value={(node.props?.columns ?? []).join(", ")} onChange={(v) => setProp("columns", v.split(",").map((s) => s.trim()).filter(Boolean))} /></Field>
            <Field label="Rows" hint="One row per line, cells separated by |"><TextArea ariaLabel="Rows" rows={4} value={(node.props?.rows ?? []).map((r) => r.join(" | ")).join("\n")} onChange={(v) => setProp("rows", v.split("\n").filter(Boolean).map((l) => l.split("|").map((c) => c.trim())))} /></Field>
          </>
        )}
        {node.type === "chart" && (
          <>
            <Field label="Chart"><Select ariaLabel="Chart type" value={node.props?.chartType ?? "bar"} options={["bar", "line"]} onChange={(v) => setProp("chartType", v)} /></Field>
            <Field label="Labels"><TextInput ariaLabel="Labels" value={(node.props?.labels ?? []).join(", ")} onChange={(v) => setProp("labels", v.split(",").map((s) => s.trim()))} /></Field>
            <Field label="Values"><TextInput ariaLabel="Values" mono value={(node.props?.values ?? []).join(", ")} onChange={(v) => setProp("values", v.split(",").map((s) => Number(s.trim()) || 0))} /></Field>
          </>
        )}
        <Field label="Bind to prop" hint="Exported code receives this content through a prop; the current content becomes labelled example data.">
          <TextInput ariaLabel="Bind to prop" mono placeholder="e.g. revenueTotal" value={node.bind} onChange={(v) => patch({ bind: v ? toIdent(v) : undefined })} />
        </Field>
      </div>

      <div className="space-y-2 border-b border-line p-3">
        <span className="label">Behavior</span>
        <Field label="On click" hint="Callback prop your app provides"><TextInput ariaLabel="On click callback" mono placeholder="onSomething" value={node.events?.onClick} onChange={(v) => setEvent("onClick", v ? toIdent(v) : "")} /></Field>
        {(node.type === "input" || node.type === "textarea" || node.type === "select" || node.type === "checkbox" || node.type === "toggle") && (
          <Field label="On change"><TextInput ariaLabel="On change callback" mono placeholder="onValueChange" value={node.events?.onChange} onChange={(v) => setEvent("onChange", v ? toIdent(v) : "")} /></Field>
        )}
        {node.tag === "form" && <Field label="On submit"><TextInput ariaLabel="On submit callback" mono placeholder="onSubmit" value={node.events?.onSubmit} onChange={(v) => setEvent("onSubmit", v ? toIdent(v) : "")} /></Field>}
        <Field label="Navigate to">
          <TextInput ariaLabel="Navigate to route" mono list="screen-routes" placeholder="/route" value={node.events?.navigate} onChange={(v) => setEvent("navigate", v)} />
          <datalist id="screen-routes">{screenRoutes.map((r) => <option key={r} value={r} />)}</datalist>
        </Field>
        <Field label="Toggles" hint="Open/close a hidden element (modal, menu, drawer)">
          <Select ariaLabel="Toggles" value={node.events?.toggle ?? ""} options={[{ value: "", label: "—" }, ...siblingsInScope.filter((n) => n.id !== node.id).map((n) => ({ value: n.id, label: n.name }))]} onChange={(v) => setEvent("toggle", v)} />
        </Field>
        <Field label="Hidden at start"><input type="checkbox" aria-label="Hidden until toggled" className="accent-accent" checked={!!node.hidden} onChange={(e) => patch({ hidden: e.target.checked || undefined })} /></Field>
        <Field label="Animation"><Select ariaLabel="Animation" value={node.animation ?? "none"} options={["none", "fade-in", "slide-up", "scale-in", "pulse"]} onChange={(v) => patch({ animation: v === "none" ? undefined : (v as Animation) })} /></Field>
        <Field label="Component" hint="Export this subtree as its own component file">
          <TextInput ariaLabel="Component name" mono placeholder="e.g. KpiCard" value={node.component} onChange={(v) => patch({ component: v ? toIdent(v, true) : undefined })} />
        </Field>
        <div className="pt-1"><Btn size="sm" onClick={() => onSaveComponent(node.id)}><Glyph name="component" size={12} /> Save to component library</Btn></div>
      </div>

      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-panel px-3 py-2">
        <span className="label">Style</span>
        <Segmented<Slot>
          ariaLabel="Style state"
          value={slot}
          onChange={setSlot}
          options={[
            { value: "style", label: "Base", title: "Mobile-first base style" },
            { value: "md", label: "≥768", title: "Tablet and up" },
            { value: "lg", label: "≥1024", title: "Desktop and up" },
            { value: "hover", label: "Hover" },
            { value: "focus", label: "Focus" },
          ]}
        />
      </div>
      {slot !== "style" && <p className="px-3 pt-2 text-[11px] text-faint">Values here override the base style {slot === "md" ? "from 768px up" : slot === "lg" ? "from 1024px up" : `on ${slot}`}. Placeholders show the base value.</p>}
      {SECTIONS.map((sec) => (
        <details key={sec.title} open={sec.title !== "Effects"} className="border-b border-line">
          <summary className="flex h-8 cursor-pointer list-none items-center px-3 text-[11px] font-medium text-dim hover:text-fg">
            <span className={cx("mr-1.5 inline-block transition-transform")}>▸</span>
            {sec.title}
            {sec.keys.some((k) => node[slot]?.[k]) && <span className="ml-2 size-1.5 rounded-full bg-accent" />}
          </summary>
          <div className="space-y-1.5 px-3 pb-3">
            {sec.keys.map((k) => (
              <StyleField key={k} data={data} node={node} slot={slot} k={k} onChange={(v) => onCommit(setStyle(data, node.id, slot, k, v), `style:${node.id}:${slot}:${k}`)} />
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
