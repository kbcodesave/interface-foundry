import { useState } from "react";
import { uid } from "../model/defaults";
import { duplicateNode, insertSubtree, moveNode, parentOf, removeNode } from "../model/ops";
import type { NodeType, ProjectData, UINode } from "../model/types";
import { Glyph, IconBtn, SectionTitle, Select, cx } from "./controls";

const CONTAINER: NodeType[] = ["box", "button", "link"];

function blank(type: NodeType): UINode {
  const base: UINode = { id: uid(), type, name: type[0].toUpperCase() + type.slice(1), style: {}, children: [] };
  switch (type) {
    case "box": return { ...base, style: { display: "flex", direction: "column", gap: "$space.3", padding: "$space.4" } };
    case "text": return { ...base, tag: "p", text: "Text", style: { color: "$color.text", fontSize: "$fontSize.md" } };
    case "button": return { ...base, text: "Button", style: { display: "inline-flex", align: "center", height: "$size.control-h", paddingX: "$space.4", bg: "$color.primary", color: "$color.primary-text", radius: "$radius.sm", fontSize: "$fontSize.sm", fontWeight: "$fontWeight.semibold" } };
    case "link": return { ...base, text: "Link", style: { color: "$color.primary", fontSize: "$fontSize.sm" } };
    case "input": return { ...base, props: { label: "Field", placeholder: "Type here", inputType: "text" }, style: { height: "$size.control-h", paddingX: "$space.3", bg: "$color.bg", color: "$color.text", borderWidth: "1px", borderColor: "$color.border", radius: "$radius.sm", width: "100%" }, focus: { borderColor: "$color.primary" } };
    case "textarea": return { ...base, props: { label: "Notes" }, style: { padding: "$space.3", bg: "$color.bg", color: "$color.text", borderWidth: "1px", borderColor: "$color.border", radius: "$radius.sm", width: "100%", minHeight: "96px" } };
    case "select": return { ...base, props: { label: "Choice", options: ["Option A", "Option B"] }, style: { height: "$size.control-h", paddingX: "$space.2", bg: "$color.bg", color: "$color.text", borderWidth: "1px", borderColor: "$color.border", radius: "$radius.sm" } };
    case "checkbox": return { ...base, props: { label: "Checkbox" }, style: { color: "$color.text", fontSize: "$fontSize.sm" } };
    case "toggle": return { ...base, props: { label: "Toggle" } };
    case "image": return { ...base, props: { alt: "" }, style: { width: "100%", height: "160px", radius: "$radius.md", display: "block" } };
    case "icon": return { ...base, props: { icon: "box" }, style: { width: "16px", height: "16px", color: "$color.text-muted" } };
    case "badge": return { ...base, text: "Badge", style: { display: "inline-block", paddingX: "$space.2", radius: "$radius.sm", fontSize: "$fontSize.xs", bg: "$color.surface-raised", color: "$color.text" } };
    case "progress": return { ...base, props: { value: 50, max: 100, label: "Progress" }, style: { height: "6px", width: "100%", bg: "$color.secondary", radius: "$radius.full", overflow: "hidden" } };
    case "divider": return { ...base, style: { borderColor: "$color.border" } };
    case "table": return { ...base, props: { columns: ["Name", "Status"], rows: [["Example row", "Active"]] }, style: { width: "100%", color: "$color.text", fontSize: "$fontSize.sm" } };
    case "chart": return { ...base, props: { chartType: "bar", labels: ["A", "B", "C"], values: [3, 5, 2], label: "Chart" }, style: { height: "180px", width: "100%" } };
  }
}

function Row({ data, id, depth, selectedId, onSelect, collapsed, toggleCollapse, onDrop }: {
  data: ProjectData; id: string; depth: number; selectedId?: string; onSelect: (id: string) => void;
  collapsed: Set<string>; toggleCollapse: (id: string) => void; onDrop: (dragId: string, targetId: string, pos: "before" | "after" | "inside") => void;
}) {
  const node = data.nodes[id];
  const [over, setOver] = useState<"before" | "after" | "inside" | null>(null);
  if (!node) return null;
  const isOpen = !collapsed.has(id);
  const hasKids = node.children.length > 0;
  return (
    <>
      <div
        role="treeitem"
        aria-selected={selectedId === id}
        aria-expanded={hasKids ? isOpen : undefined}
        tabIndex={selectedId === id ? 0 : -1}
        draggable={depth > 0}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/if-node", id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("text/if-node")) return;
          e.preventDefault();
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const y = (e.clientY - r.top) / r.height;
          setOver(depth === 0 ? "inside" : y < 0.28 ? "before" : y > 0.72 ? "after" : CONTAINER.includes(node.type) ? "inside" : y < 0.5 ? "before" : "after");
        }}
        onDragLeave={() => setOver(null)}
        onDrop={(e) => {
          e.preventDefault();
          const dragId = e.dataTransfer.getData("text/if-node");
          if (dragId && over) onDrop(dragId, id, over);
          setOver(null);
        }}
        onClick={() => onSelect(id)}
        className={cx(
          "group relative flex h-6 cursor-default select-none items-center gap-1 pr-2 text-[12px]",
          selectedId === id ? "bg-accent/15 text-fg" : "text-dim hover:bg-hover hover:text-fg",
          over === "inside" && "outline outline-1 -outline-offset-1 outline-accent",
        )}
        style={{ paddingLeft: 6 + depth * 12 }}
      >
        {over === "before" && <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-accent" />}
        {over === "after" && <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-accent" />}
        <button
          aria-label={isOpen ? "Collapse" : "Expand"}
          className={cx("flex size-4 items-center justify-center text-faint", !hasKids && "invisible")}
          onClick={(e) => {
            e.stopPropagation();
            toggleCollapse(id);
          }}
        >
          <Glyph name="chevron" size={10} className={cx("transition-transform", isOpen && "rotate-90")} />
        </button>
        <span className="w-11 shrink-0 truncate font-mono text-[9px] uppercase text-faint">{node.tag && node.type === "box" ? node.tag : node.type}</span>
        <span className="truncate">{node.name}</span>
        {node.component && <span className="ml-1 shrink-0 font-mono text-[9px] text-warn" title={`Exported as <${node.component}>`}>◆</span>}
        {node.hidden && <Glyph name="eyeoff" size={11} className="ml-1 shrink-0 text-faint" />}
        {node.bind && <span className="ml-auto shrink-0 font-mono text-[9px] text-faint" title={`Bound to prop ${node.bind}`}>{`{${node.bind}}`}</span>}
      </div>
      {isOpen && node.children.map((c) => <Row key={c} data={data} id={c} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} collapsed={collapsed} toggleCollapse={toggleCollapse} onDrop={onDrop} />)}
    </>
  );
}

export function LayersPanel({ data, rootId, selectedId, onSelect, onCommit }: { data: ProjectData; rootId: string; selectedId?: string; onSelect: (id: string | undefined) => void; onCommit: (d: ProjectData) => void }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [addType, setAddType] = useState<NodeType>("box");
  const sel = selectedId && data.nodes[selectedId] ? selectedId : undefined;
  const isRoot = sel === rootId;
  const parent = sel ? parentOf(data.nodes, sel) : undefined;

  const add = () => {
    const node = blank(addType);
    const target = sel && CONTAINER.includes(data.nodes[sel].type) ? sel : parent ?? rootId;
    const index = target === sel ? data.nodes[target].children.length : data.nodes[target].children.indexOf(sel!) + 1;
    onCommit(insertSubtree(data, target, index, { rootId: node.id, nodes: { [node.id]: node } }));
    onSelect(node.id);
  };
  const shift = (dir: -1 | 1) => {
    if (!sel || !parent) return;
    const idx = data.nodes[parent].children.indexOf(sel);
    onCommit(moveNode(data, sel, parent, dir === -1 ? idx - 1 : idx + 2));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SectionTitle
        right={
          <div className="flex items-center">
            <IconBtn label="Move up" disabled={!parent} onClick={() => shift(-1)}><Glyph name="up" size={12} /></IconBtn>
            <IconBtn label="Move down" disabled={!parent} onClick={() => shift(1)}><Glyph name="down" size={12} /></IconBtn>
            <IconBtn label="Duplicate (Ctrl+D)" disabled={!sel || isRoot} onClick={() => { const r = duplicateNode(data, sel!); onCommit(r.data); if (r.newId) onSelect(r.newId); }}><Glyph name="dup" size={12} /></IconBtn>
            <IconBtn label="Delete (Del)" disabled={!sel || isRoot} onClick={() => { onCommit(removeNode(data, sel!)); onSelect(parent); }}><Glyph name="trash" size={12} /></IconBtn>
          </div>
        }
      >
        Layers
      </SectionTitle>
      <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
        <Select<NodeType> ariaLabel="Element type to add" value={addType} options={["box", "text", "button", "link", "input", "textarea", "select", "checkbox", "toggle", "image", "icon", "badge", "progress", "divider", "table", "chart"]} onChange={setAddType} />
        <IconBtn label="Add element" onClick={add}><Glyph name="plus" /></IconBtn>
      </div>
      <div role="tree" aria-label="Component hierarchy" className="min-h-0 flex-1 overflow-auto py-1">
        <Row
          data={data}
          id={rootId}
          depth={0}
          selectedId={sel}
          onSelect={onSelect}
          collapsed={collapsed}
          toggleCollapse={(id) => setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
          onDrop={(dragId, targetId, pos) => {
            if (dragId === targetId) return;
            if (pos === "inside") onCommit(moveNode(data, dragId, targetId, data.nodes[targetId].children.length));
            else {
              const p = parentOf(data.nodes, targetId);
              if (!p) return;
              const idx = data.nodes[p].children.indexOf(targetId);
              onCommit(moveNode(data, dragId, p, pos === "before" ? idx : idx + 1));
            }
          }}
        />
      </div>
      <p className="border-t border-line px-3 py-2 text-[10px] leading-snug text-faint">Drag layers to reorder or nest them. ◆ marks an exported component; {"{prop}"} marks content bound to a prop.</p>
    </div>
  );
}
