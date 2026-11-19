import { useEffect, useMemo, useState } from "react";
import { newProject, uid } from "../model/defaults";
import type { Project } from "../model/types";
import { deleteProject, listProjects, saveProject } from "../store/db";
import { Badge, Btn, Glyph, IconBtn, Segmented, Select, TextInput, cx } from "./controls";

type Filter = "active" | "favorites" | "archived";

function blankData() {
  const p = newProject();
  const root = uid();
  return {
    tokens: p.tokens,
    nodes: { [root]: { id: root, type: "box" as const, name: "Home", style: { display: "flex", direction: "column", minHeight: "100vh", padding: "$space.6", gap: "$space.4", bg: "$color.bg", color: "$color.text", fontFamily: "$font.body" }, children: [] } },
    screens: [{ id: uid("s"), name: "Home", route: "/", rootId: root }],
  };
}

export function Home({ onOpen, onOpenSettings, hasKey }: { onOpen: (p: Project) => void; onOpenSettings: () => void; hasKey: boolean }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const [folder, setFolder] = useState("");
  const reload = () => listProjects().then(setProjects);
  useEffect(() => { reload(); }, []);

  const folders = useMemo(() => [...new Set((projects ?? []).map((p) => p.folder).filter(Boolean))].sort(), [projects]);
  const shown = (projects ?? []).filter((p) => {
    if (filter === "archived" ? !p.archived : p.archived) return false;
    if (filter === "favorites" && !p.favorite) return false;
    if (folder && p.folder !== folder) return false;
    const hay = [p.name, p.description, p.notes, p.folder, ...p.tags].join(" ").toLowerCase();
    return !q || q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
  });

  const update = async (p: Project, patch: Partial<Project>) => {
    await saveProject({ ...p, ...patch, updatedAt: Date.now() });
    reload();
  };

  const create = async (starter: boolean) => {
    const p = starter ? newProject("Construction ops (starter)") : newProject("Untitled interface", blankData());
    await saveProject(p);
    onOpen(p);
  };

  return (
    <div className="canvas-grid h-full overflow-auto">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-10 flex flex-wrap items-end gap-6 border-b border-line pb-6">
          <div>
            <p className="font-mono text-[11px] tracking-[0.3em] text-accent">INTERFACE FOUNDRY</p>
            <h1 className="mt-2 text-[28px] font-semibold tracking-tight">Design the interface. Export the code. Keep your app.</h1>
            <p className="mt-2 max-w-2xl text-[13px] text-dim">Generate and refine complete application UIs, then export clean React + TypeScript + Tailwind packages that plug into existing projects through props and callbacks, without touching their logic.</p>
          </div>
          <div className="ml-auto flex gap-2">
            <Btn onClick={onOpenSettings}><Glyph name="settings" size={12} /> {hasKey ? "Settings" : "Add API key"}</Btn>
            <Btn onClick={() => create(true)}>Open starter</Btn>
            <Btn variant="primary" onClick={() => create(false)}><Glyph name="plus" size={12} /> New interface</Btn>
          </div>
        </header>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="w-64"><TextInput ariaLabel="Search projects" placeholder="Search name, tags, notes…" value={q} onChange={setQ} live /></div>
          <Segmented<Filter> ariaLabel="Filter" value={filter} onChange={setFilter} options={[{ value: "active", label: "All" }, { value: "favorites", label: "Favorites" }, { value: "archived", label: "Archived" }]} />
          {folders.length > 0 && <div className="w-44"><Select ariaLabel="Folder" value={folder} options={[{ value: "", label: "All folders" }, ...folders.map((f) => ({ value: f, label: f }))]} onChange={setFolder} /></div>}
          <span className="ml-auto font-mono text-[10px] text-faint">Stored in this browser · autosaved</span>
        </div>

        {projects === null ? (
          <p className="text-faint">Loading…</p>
        ) : shown.length === 0 ? (
          <div className="rounded-[4px] border border-dashed border-line-strong p-10 text-center text-dim">
            {projects.length === 0 ? (
              <>
                <p className="text-[14px] text-fg">No interfaces yet.</p>
                <p className="mt-1 text-[12px]">Start from the hand-built construction dashboard to explore the editor, or create a new interface and describe it to the AI.</p>
              </>
            ) : (
              <p>No projects match.</p>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((p) => (
              <article key={p.id} className="group flex flex-col rounded-[4px] border border-line bg-panel transition-colors hover:border-line-strong">
                <button className="flex-1 p-4 text-left" onClick={() => onOpen(p)}>
                  <div className="mb-3 flex h-20 items-end gap-1 rounded-[2px] border border-line p-2" style={{ background: p.tokens.color[p.tokens.defaultMode].bg }}>
                    {["surface", "primary", "accent", "text", "border"].map((k) => (
                      <span key={k} className="h-6 flex-1 rounded-[1px]" style={{ background: p.tokens.color[p.tokens.defaultMode][k] }} />
                    ))}
                  </div>
                  <h2 className="truncate text-[14px] font-medium">{p.name}</h2>
                  <p className="mt-1 font-mono text-[10px] text-faint">{p.screens.length} screen{p.screens.length === 1 ? "" : "s"} · {Object.keys(p.nodes).length} elements · {new Date(p.updatedAt).toLocaleDateString()}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.folder && <Badge>{p.folder}</Badge>}
                    {p.tags.map((t) => <Badge key={t}>{t}</Badge>)}
                    {p.validation && <Badge tone={p.validation.level === "passed" ? "ok" : p.validation.level === "failed" ? "bad" : "warn"}>{p.validation.level}</Badge>}
                  </div>
                </button>
                <div className="flex items-center border-t border-line px-2 py-1">
                  <IconBtn label={p.favorite ? "Unfavorite" : "Favorite"} active={p.favorite} onClick={() => update(p, { favorite: !p.favorite })}><Glyph name="star" size={13} /></IconBtn>
                  <IconBtn label="Duplicate" onClick={async () => { const c = { ...structuredClone(p), id: uid("p"), name: `${p.name} copy`, createdAt: Date.now(), updatedAt: Date.now() }; await saveProject(c); reload(); }}><Glyph name="dup" size={13} /></IconBtn>
                  <IconBtn label={p.archived ? "Unarchive" : "Archive"} onClick={() => update(p, { archived: !p.archived })}><Glyph name="archive" size={13} /></IconBtn>
                  <span className="flex-1" />
                  {p.archived && <IconBtn label="Delete permanently" className={cx("hover:text-bad")} onClick={async () => { if (window.confirm(`Delete "${p.name}" permanently?`)) { await deleteProject(p.id); reload(); } }}><Glyph name="trash" size={13} /></IconBtn>}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
