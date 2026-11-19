import { useEffect, useMemo, useState } from "react";
import { cloneSubtree, insertSubtree, parentOf } from "../model/ops";
import type { ProjectData, SavedComponent } from "../model/types";
import { TEMPLATES, type Template } from "../library/templates";
import { deleteComponent, listComponents } from "../store/db";
import { Glyph, IconBtn, SectionTitle, TextInput } from "./controls";

const CATS: Template["category"][] = ["Navigation", "Data & Management", "Forms & Interactions", "Visual Elements"];

export function LibraryPanel({ data, rootId, selectedId, onCommit, onSelect, refreshKey }: { data: ProjectData; rootId: string; selectedId?: string; onCommit: (d: ProjectData) => void; onSelect: (id: string) => void; refreshKey: number }) {
  const [q, setQ] = useState("");
  const [saved, setSaved] = useState<SavedComponent[]>([]);
  useEffect(() => { listComponents().then(setSaved); }, [refreshKey]);

  const target = useMemo(() => {
    const sel = selectedId && data.nodes[selectedId] ? data.nodes[selectedId] : undefined;
    if (!sel) return { parent: rootId, index: data.nodes[rootId]?.children.length ?? 0, label: "end of screen" };
    if (sel.type === "box") return { parent: sel.id, index: sel.children.length, label: `inside ${sel.name}` };
    const p = parentOf(data.nodes, sel.id) ?? rootId;
    return { parent: p, index: data.nodes[p].children.indexOf(sel.id) + 1, label: `after ${sel.name}` };
  }, [data, selectedId, rootId]);

  const insert = (sub: { rootId: string; nodes: ProjectData["nodes"] }) => {
    onCommit(insertSubtree(data, target.parent, target.index, sub));
    onSelect(sub.rootId);
  };
  const match = (s: string) => s.toLowerCase().includes(q.toLowerCase());

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SectionTitle>Component library</SectionTitle>
      <div className="space-y-1 border-b border-line p-2">
        <TextInput ariaLabel="Search components" placeholder="Search components" value={q} onChange={setQ} live />
        <p className="text-[10px] text-faint">Inserts {target.label}. Components use this project's design tokens.</p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {saved.filter((s) => match(s.name)).length > 0 && (
          <div className="mb-3">
            <div className="label mb-1 px-1">Saved components (all projects)</div>
            {saved.filter((s) => match(s.name)).map((s) => (
              <div key={s.id} className="group flex items-center">
                <button className="flex h-7 flex-1 items-center gap-2 rounded-[2px] px-2 text-left text-[12px] text-dim hover:bg-hover hover:text-fg" onClick={() => insert(cloneSubtree(s.nodes, s.rootId))}>
                  <Glyph name="component" size={12} className="text-warn" /> {s.name}
                  <span className="ml-auto font-mono text-[9px] text-faint">{Object.keys(s.nodes).length} el</span>
                </button>
                <IconBtn label={`Delete ${s.name}`} className="opacity-0 group-hover:opacity-100" onClick={async () => { await deleteComponent(s.id); setSaved(await listComponents()); }}><Glyph name="trash" size={11} /></IconBtn>
              </div>
            ))}
          </div>
        )}
        {CATS.map((c) => {
          const items = TEMPLATES.filter((t) => t.category === c && match(t.name));
          if (!items.length) return null;
          return (
            <div key={c} className="mb-3">
              <div className="label mb-1 px-1">{c}</div>
              <div className="grid grid-cols-2 gap-1">
                {items.map((t) => (
                  <button key={t.id} onClick={() => insert(t.build())} className="flex h-8 items-center gap-1.5 rounded-[2px] border border-line bg-raised px-2 text-left text-[11px] text-dim transition-colors hover:border-accent/50 hover:text-fg">
                    <Glyph name="plus" size={10} className="text-faint" />
                    <span className="truncate">{t.name}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
