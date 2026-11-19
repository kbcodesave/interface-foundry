import { useState } from "react";
import type { Project } from "../model/types";
import { Btn, Field, Glyph, IconBtn, SectionTitle, TextArea, TextInput } from "./controls";

export function ProjectPanel({ project, onMeta, onSnapshot, onRestore, onRenameScreen, onRouteScreen }: {
  project: Project;
  onMeta: (p: Partial<Project>) => void;
  onSnapshot: (label: string) => void;
  onRestore: (id: string) => void;
  onRenameScreen: (id: string, name: string) => void;
  onRouteScreen: (id: string, route: string) => void;
}) {
  const [label, setLabel] = useState("");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SectionTitle>Project</SectionTitle>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3">
        <div className="space-y-1.5">
          <Field label="Name"><TextInput ariaLabel="Project name" value={project.name} onChange={(v) => onMeta({ name: v || "Untitled interface" })} /></Field>
          <Field label="Folder"><TextInput ariaLabel="Folder" value={project.folder} placeholder="e.g. Client work" onChange={(v) => onMeta({ folder: v })} /></Field>
          <Field label="Tags"><TextInput ariaLabel="Tags" value={project.tags.join(", ")} placeholder="comma separated" onChange={(v) => onMeta({ tags: v.split(",").map((t) => t.trim()).filter(Boolean) })} /></Field>
          <div className="space-y-1"><span className="text-[11px] text-dim">Notes</span><TextArea ariaLabel="Project notes" rows={3} value={project.notes} onChange={(v) => onMeta({ notes: v })} /></div>
        </div>
        <div className="space-y-1.5">
          <span className="label">Screens & routes</span>
          {project.screens.map((s) => (
            <div key={s.id} className="grid grid-cols-2 gap-1">
              <TextInput ariaLabel={`Screen name ${s.name}`} value={s.name} onChange={(v) => v && onRenameScreen(s.id, v)} />
              <TextInput ariaLabel={`Route of ${s.name}`} mono value={s.route} onChange={(v) => v && onRouteScreen(s.id, v.startsWith("/") ? v : `/${v}`)} />
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          <span className="label">Version history</span>
          <div className="flex gap-1">
            <TextInput ariaLabel="Version label" value={label} placeholder="Label this version" onChange={setLabel} live />
            <Btn size="sm" onClick={() => { onSnapshot(label || `Snapshot ${new Date().toLocaleString()}`); setLabel(""); }}>Save</Btn>
          </div>
          <p className="text-[10px] text-faint">Versions are also saved automatically before every AI generation and variation swap. Edits autosave to this browser.</p>
          {project.versions.map((v) => (
            <div key={v.id} className="group flex items-center gap-2 rounded-[2px] px-1 py-1 hover:bg-hover">
              <Glyph name="history" size={12} className="text-faint" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px]">{v.label}</p>
                <p className="font-mono text-[9px] text-faint">{new Date(v.createdAt).toLocaleString()} · {v.snapshot.screens.length} screen(s)</p>
              </div>
              <Btn size="sm" onClick={() => onRestore(v.id)}>Restore</Btn>
              <IconBtn label="Delete version" className="size-5 opacity-0 group-hover:opacity-100" onClick={() => onMeta({ versions: project.versions.filter((x) => x.id !== v.id) })}><Glyph name="trash" size={10} /></IconBtn>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
