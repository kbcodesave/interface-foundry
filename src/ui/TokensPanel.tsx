import { useEffect, useRef, useState } from "react";
import { cleanTokens } from "../model/sanitize";
import { uid } from "../model/defaults";
import type { ColorMode, ProjectData, SavedDesignSystem, Tokens } from "../model/types";
import { deleteSystem, listSystems, saveSystem } from "../store/db";
import { tokensToJson } from "../codegen/tokensCss";
import { Btn, Glyph, IconBtn, SectionTitle, Segmented, Select, TextInput, cx } from "./controls";

type Group = "font" | "fontSize" | "fontWeight" | "space" | "radius" | "shadow" | "texture" | "motion" | "size";
const GROUPS: { id: Group; label: string }[] = [
  { id: "font", label: "Typography families" },
  { id: "fontSize", label: "Type scale" },
  { id: "fontWeight", label: "Font weights" },
  { id: "space", label: "Spacing" },
  { id: "radius", label: "Border radius" },
  { id: "shadow", label: "Shadows" },
  { id: "texture", label: "Surface textures" },
  { id: "motion", label: "Motion" },
  { id: "size", label: "Component dimensions" },
];

/**
 * Best-effort import of external token formats: Foundry tokens.json, W3C design-token
 * style {color: {x: {$value}}}, or a flat {colors, fonts, spacing, radii} theme object
 * (the shape we expect MOODLAB themes to resemble; adjust once its format is known).
 */
export function importTokens(raw: unknown, base: Tokens): Tokens {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (v.color && typeof v.color === "object" && ("dark" in (v.color as object) || "light" in (v.color as object))) return cleanTokens(v, base);
  const flat = (o: unknown): Record<string, string> => {
    const out: Record<string, string> = {};
    const walk = (x: unknown, prefix: string) => {
      if (x && typeof x === "object" && !Array.isArray(x)) {
        const r = x as Record<string, unknown>;
        if ("$value" in r || "value" in r) out[prefix] = String(r.$value ?? r.value);
        else for (const [k, val] of Object.entries(r)) walk(val, prefix ? `${prefix}-${k}` : k);
      } else if (typeof x === "string" || typeof x === "number") out[prefix] = String(x);
    };
    walk(o, "");
    return Object.fromEntries(Object.entries(out).map(([k, val]) => [k.toLowerCase().replace(/[^a-z0-9-]/g, "-"), val]));
  };
  const colors = flat(v.colors ?? v.color ?? v.palette);
  const next: Tokens = structuredClone(base);
  const mode: ColorMode = v.mode === "light" || v.appearance === "light" ? "light" : base.defaultMode;
  Object.assign(next.color[mode], colors);
  const pick = (keys: string[]) => keys.map((k) => v[k]).find((x) => x && typeof x === "object");
  const fonts = flat(pick(["fonts", "font", "fontFamily", "typography"]));
  for (const [k, val] of Object.entries(fonts)) if (/display|heading|body|text|mono|code|sans|serif/.test(k)) next.font[k.includes("mono") || k.includes("code") ? "mono" : k.includes("display") || k.includes("heading") ? "display" : "body"] = val;
  Object.assign(next.space, flat(pick(["spacing", "space"])));
  Object.assign(next.radius, flat(pick(["radii", "radius", "borderRadius"])));
  Object.assign(next.shadow, flat(pick(["shadows", "shadow", "elevation"])));
  return next;
}

function KV({ entries, onChange, onRemove, onAdd, swatch }: { entries: [string, string][]; onChange: (k: string, v: string) => void; onRemove: (k: string) => void; onAdd: (k: string) => void; swatch?: boolean }) {
  const [newKey, setNewKey] = useState("");
  return (
    <div className="space-y-1">
      {entries.map(([k, val]) => (
        <div key={k} className="group grid grid-cols-[92px_1fr_auto] items-center gap-1">
          <span className="truncate font-mono text-[11px] text-dim" title={k}>{k}</span>
          <div className="flex items-center gap-1">
            {swatch && (
              <label className="relative size-6 shrink-0 cursor-pointer overflow-hidden rounded-[2px] border border-line" title="Pick color">
                <span className="absolute inset-0" style={{ background: val }} />
                <input type="color" aria-label={`Pick ${k}`} className="absolute inset-0 opacity-0" value={/^#[0-9a-f]{6}$/i.test(val) ? val : "#000000"} onChange={(e) => onChange(k, e.target.value)} />
              </label>
            )}
            <TextInput ariaLabel={k} mono value={val} onChange={(v) => onChange(k, v)} />
          </div>
          <IconBtn label={`Remove ${k}`} className="size-5 opacity-0 group-hover:opacity-100" onClick={() => onRemove(k)}><Glyph name="x" size={10} /></IconBtn>
        </div>
      ))}
      <div className="flex gap-1 pt-1">
        <TextInput ariaLabel="New token name" mono placeholder="new-token" value={newKey} onChange={setNewKey} live />
        <Btn size="sm" disabled={!/^[a-z0-9-]+$/i.test(newKey) || entries.some(([k]) => k === newKey)} onClick={() => { onAdd(newKey); setNewKey(""); }}>Add</Btn>
      </div>
    </div>
  );
}

export function TokensPanel({ data, onCommit, projectName, toast }: { data: ProjectData; onCommit: (d: ProjectData, key?: string) => void; projectName: string; toast: (m: string, tone?: "ok" | "bad") => void }) {
  const [mode, setMode] = useState<ColorMode>(data.tokens.defaultMode);
  const [systems, setSystems] = useState<SavedDesignSystem[]>([]);
  const [chosen, setChosen] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { listSystems().then(setSystems); }, []);
  const t = data.tokens;
  const set = (next: Tokens, key: string) => onCommit({ ...data, tokens: next }, `tok:${key}`);

  const editColor = (k: string, v: string) => set({ ...t, color: { ...t.color, [mode]: { ...t.color[mode], [k]: v } } }, `c:${mode}:${k}`);
  const removeColor = (k: string) => {
    const c = { ...t.color[mode] };
    delete c[k];
    set({ ...t, color: { ...t.color, [mode]: c } }, `c-rm:${k}`);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SectionTitle right={<span className="font-mono text-[10px] text-faint">changes apply everywhere</span>}>Design tokens</SectionTitle>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3">
        <div className="space-y-2 rounded-[3px] border border-line p-2">
          <span className="label">Design systems</span>
          <div className="flex flex-wrap gap-1">
            <Btn size="sm" onClick={async () => { const s: SavedDesignSystem = { id: uid("ds"), name: `${projectName} identity`, createdAt: Date.now(), tokens: structuredClone(t), source: "foundry" }; await saveSystem(s); setSystems(await listSystems()); toast("Saved to your design systems"); }}>Save as design system</Btn>
            <Btn size="sm" onClick={() => fileRef.current?.click()}>Import tokens…</Btn>
            <Btn size="sm" onClick={() => { const b = new Blob([tokensToJson(t)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "tokens.json"; a.click(); }}>Download JSON</Btn>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              const next = importTokens(JSON.parse(await f.text()), t);
              set(next, `import:${Date.now()}`);
              toast(`Imported tokens from ${f.name}`);
            } catch { toast("That file isn't valid JSON.", "bad"); }
            e.target.value = "";
          }} />
          {systems.length > 0 && (
            <div className="flex gap-1">
              <Select ariaLabel="Saved design system" value={chosen} options={[{ value: "", label: "Apply a saved system…" }, ...systems.map((s) => ({ value: s.id, label: s.name }))]} onChange={setChosen} />
              <Btn size="sm" disabled={!chosen} onClick={() => { const s = systems.find((x) => x.id === chosen); if (s) { set(structuredClone(s.tokens), `apply:${s.id}:${Date.now()}`); toast(`Applied ${s.name}`); } }}>Apply</Btn>
              <IconBtn label="Delete saved system" disabled={!chosen} onClick={async () => { await deleteSystem(chosen); setChosen(""); setSystems(await listSystems()); }}><Glyph name="trash" size={12} /></IconBtn>
            </div>
          )}
          <p className="text-[10px] leading-snug text-faint">Import accepts Foundry tokens.json, W3C-style design tokens, or a flat theme object with colors/fonts/spacing/radii. MOODLAB themes can be imported once their file format is mapped; send a sample and it can be added.</p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="label">Colors</span>
            <Segmented<ColorMode> ariaLabel="Color mode" value={mode} onChange={setMode} options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }]} />
          </div>
          <div className="flex items-center gap-2 text-[11px] text-dim">
            Default mode
            <Select<ColorMode> ariaLabel="Default color mode" className="w-24" value={t.defaultMode} options={["dark", "light"]} onChange={(v) => set({ ...t, defaultMode: v }, "mode")} />
          </div>
          <KV swatch entries={Object.entries(t.color[mode])} onChange={editColor} onRemove={removeColor} onAdd={(k) => set({ ...t, color: { dark: { ...t.color.dark, [k]: t.color.dark[k] ?? "#888888" }, light: { ...t.color.light, [k]: t.color.light[k] ?? "#888888" } } }, `c-add:${k}`)} />
        </div>

        {GROUPS.map((g) => (
          <details key={g.id} className="border-t border-line pt-2" open={g.id === "font" || g.id === "space"}>
            <summary className={cx("label cursor-pointer list-none py-1 hover:text-dim")}>▸ {g.label}</summary>
            <div className="pt-1">
              <KV
                entries={Object.entries(t[g.id])}
                onChange={(k, v) => set({ ...t, [g.id]: { ...t[g.id], [k]: v } }, `${g.id}:${k}`)}
                onRemove={(k) => { const c = { ...t[g.id] }; delete c[k]; set({ ...t, [g.id]: c }, `${g.id}-rm:${k}`); }}
                onAdd={(k) => set({ ...t, [g.id]: { ...t[g.id], [k]: "" } }, `${g.id}-add:${k}`)}
              />
            </div>
          </details>
        ))}
        <div className="space-y-1 border-t border-line pt-2">
          <span className="label">Iconography & motion principles</span>
          <div className="grid grid-cols-2 gap-1">
            <TextInput ariaLabel="Icon style" value={t.iconography.style} onChange={(v) => set({ ...t, iconography: { ...t.iconography, style: v } }, "icon-style")} />
            <TextInput ariaLabel="Icon stroke width" mono value={t.iconography.strokeWidth} onChange={(v) => set({ ...t, iconography: { ...t.iconography, strokeWidth: v } }, "icon-stroke")} />
          </div>
          <TextInput ariaLabel="Animation principles" value={t.animationPrinciples} onChange={(v) => set({ ...t, animationPrinciples: v }, "anim")} />
          <p className="text-[10px] text-faint">Breakpoints: md {t.breakpoint.md}, lg {t.breakpoint.lg} (Tailwind defaults, used by the ≥768 / ≥1024 style states).</p>
        </div>
      </div>
    </div>
  );
}
