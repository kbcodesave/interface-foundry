import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generate, screenComponentName } from "../codegen/generate";
import { uid } from "../model/defaults";
import { cloneSubtree, duplicateNode, fingerprint, parentOf, pickData, removeNode, subtreeIds } from "../model/ops";
import type { Project, ProjectData, SavedComponent } from "../model/types";
import { PreviewFrame } from "../preview/PreviewFrame";
import { saveComponent, type AppSettings } from "../store/db";
import { useProject } from "../store/useProject";
import { validateProject, type ValidationReport } from "../validate/validate";
import { AIPanel } from "./AIPanel";
import { CodePanel } from "./CodePanel";
import { Badge, Btn, Glyph, IconBtn, Modal, Segmented, cx, useToast } from "./controls";
import { ExportDialog } from "./ExportDialog";
import { Inspector, TokenDatalists } from "./Inspector";
import { LayersPanel } from "./LayersPanel";
import { LibraryPanel } from "./LibraryPanel";
import { ProjectPanel } from "./ProjectPanel";
import { TokensPanel } from "./TokensPanel";
import { ValidationPanel } from "./ValidationPanel";

type LeftTab = "layers" | "library" | "tokens" | "project";
type RightTab = "inspect" | "ai" | "checks";
type View = "design" | "code" | "split";
type Device = "desktop" | "tablet" | "mobile" | "fill";
const NO_OPEN: string[] = [];
const WIDTH: Record<Device, number | "fill"> = { desktop: 1280, tablet: 768, mobile: 375, fill: "fill" };

export function Editor({ initial, settings, onBack, onOpenSettings }: { initial: Project; settings: AppSettings; onBack: () => void; onOpenSettings: () => void }) {
  const store = useProject(initial);
  const { project, commit } = store;
  const [screenId, setScreenId] = useState(project.screens[0]?.id);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [left, setLeft] = useState<LeftTab>("layers");
  const [right, setRight] = useState<RightTab>("inspect");
  const [view, setView] = useState<View>("design");
  const [device, setDevice] = useState<Device>("desktop");
  const [mode, setMode] = useState<"select" | "interact">("select");
  const [theme, setTheme] = useState(project.tokens.defaultMode);
  const [showExample, setShowExample] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [compare, setCompare] = useState<string[] | null>(null);
  const [report, setReport] = useState<ValidationReport | undefined>();
  const [validating, setValidating] = useState(false);
  const [step, setStep] = useState("");
  const [libKey, setLibKey] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [toastEl, toast] = useToast();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasW, setCanvasW] = useState(1200);

  const screen = project.screens.find((s) => s.id === screenId) ?? project.screens[0];
  useEffect(() => {
    if (!project.screens.some((s) => s.id === screenId)) setScreenId(project.screens[0]?.id);
  }, [project.screens, screenId]);
  useEffect(() => setTheme(project.tokens.defaultMode), [project.tokens.defaultMode]);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCanvasW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  const data = pickData(project);
  const gen = useMemo(() => generate(data, { instrument: true }), [project.nodes, project.tokens, project.screens]); // eslint-disable-line react-hooks/exhaustive-deps
  const fp = useMemo(() => fingerprint(data), [project.nodes, project.tokens, project.screens]); // eslint-disable-line react-hooks/exhaustive-deps
  const stale = !!report && report.fingerprint !== fp;
  const persistedStatus = project.validation && project.validation.fingerprint === fp ? project.validation.level : project.validation ? "stale" : "untested";
  const status = report ? (stale ? "stale" : report.level) : persistedStatus;

  // Keep hidden overlays open while one of their descendants is selected.
  const openIds = useMemo(() => {
    const out: string[] = [];
    let cur = selectedId;
    while (cur) {
      if (project.nodes[cur]?.hidden) out.push(cur);
      cur = parentOf(project.nodes, cur);
    }
    return out;
  }, [selectedId, project.nodes]);
  const openKey = openIds.join(",");
  const stableOpen = useMemo(() => openIds, [openKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const unit = gen.units.find((u) => u.kind === "screen" && u.rootId === screen?.rootId);

  const onCommit = useCallback((d: ProjectData, key?: string) => commit(d, key), [commit]);
  const replace = (d: ProjectData, label: string, meta?: Partial<Project>) => {
    store.snapshot(label);
    commit(d);
    if (meta) store.updateMeta(meta);
    setScreenId(d.screens[0]?.id);
  };

  const runValidation = async () => {
    setValidating(true);
    setRight("checks");
    try {
      const r = await validateProject(data, fp, setStep);
      setReport(r);
      store.updateMeta({ validation: { fingerprint: r.fingerprint, level: r.level, at: r.at, readyForExport: r.readyForExport } });
    } catch (e) {
      toast(`Validation could not run: ${e instanceof Error ? e.message : e}`, "bad");
    } finally {
      setValidating(false);
      setStep("");
    }
  };

  const saveToLibrary = async (id: string) => {
    const sub = cloneSubtree(project.nodes, id);
    const c: SavedComponent = { id: uid("c"), name: project.nodes[id].component || project.nodes[id].name, tags: project.tags, createdAt: Date.now(), rootId: sub.rootId, nodes: sub.nodes };
    await saveComponent(c);
    setLibKey((k) => k + 1);
    toast(`Saved "${c.name}" to the component library`);
  };

  const addScreen = () => {
    const root = uid();
    const n = project.screens.length + 1;
    const s = { id: uid("s"), name: `Screen ${n}`, route: `/screen-${n}`, rootId: root };
    commit({ ...data, nodes: { ...data.nodes, [root]: { id: root, type: "box", name: s.name, style: { display: "flex", direction: "column", minHeight: "100vh", padding: "$space.6", gap: "$space.4", bg: "$color.bg", color: "$color.text", fontFamily: "$font.body" }, children: [] } }, screens: [...data.screens, s] });
    setScreenId(s.id);
    setSelectedId(root);
  };
  const removeScreen = (id: string) => {
    if (project.screens.length < 2) return;
    const s = project.screens.find((x) => x.id === id)!;
    const ids = new Set(subtreeIds(project.nodes, s.rootId));
    const nodes = Object.fromEntries(Object.entries(project.nodes).filter(([k]) => !ids.has(k)));
    commit({ ...data, nodes, screens: data.screens.filter((x) => x.id !== id) });
  };

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z" && !typing) { e.preventDefault(); if (e.shiftKey) store.redo(); else store.undo(); }
      else if (mod && e.key.toLowerCase() === "y" && !typing) { e.preventDefault(); store.redo(); }
      else if (mod && e.key.toLowerCase() === "d" && !typing && selectedId && selectedId !== screen?.rootId) { e.preventDefault(); const r = duplicateNode(data, selectedId); commit(r.data); setSelectedId(r.newId); }
      else if ((e.key === "Delete" || e.key === "Backspace") && !typing && selectedId && selectedId !== screen?.rootId) { e.preventDefault(); const p = parentOf(project.nodes, selectedId); commit(removeNode(data, selectedId)); setSelectedId(p); }
      else if (e.key === "Escape" && !typing) setSelectedId(undefined);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const width = WIDTH[device];
  const scale = width === "fill" ? 1 : Math.min(1, (canvasW - 48) / width);
  const frameW = width === "fill" ? "fill" : width;

  const preview = screen && unit && (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={canvasRef} className="canvas-grid relative min-h-0 flex-1 overflow-auto">
        <div className="flex min-h-full justify-center p-6" style={width === "fill" ? { padding: 0 } : undefined}>
          <div
            className="relative shadow-[0_0_0_1px_#2a2d31,0_24px_60px_rgba(0,0,0,0.5)]"
            style={width === "fill" ? { width: "100%", height: "100%" } : { width: width * scale, height: `calc((100vh - 140px) )`, minHeight: 480 }}
          >
            <div style={width === "fill" ? { width: "100%", height: "100%" } : { width, height: `calc((100vh - 140px) / ${scale})`, transform: `scale(${scale})`, transformOrigin: "top left" }}>
              <PreviewFrame
                files={gen.files}
                css={gen.files["src/foundry.css"]}
                screenFile={unit.file}
                screenName={unit.name}
                width={frameW}
                mode={mode}
                theme={theme}
                selectedId={selectedId}
                openIds={stableOpen}
                showExample={showExample}
                onSelect={(id) => { setSelectedId(id); setRight("inspect"); }}
                onNavigate={(route) => {
                  const target = project.screens.find((s) => s.route === route);
                  if (target) { setScreenId(target.id); setSelectedId(undefined); }
                  else toast(`"${route}" isn't a screen in this project. In your app, onNavigate("${route}") is called.`);
                }}
                onRenderError={setRenderError}
              />
            </div>
          </div>
        </div>
      </div>
      <div className="flex h-7 shrink-0 items-center gap-3 border-t border-line bg-panel px-3 font-mono text-[10px] text-faint">
        <span>{screenComponentName(screen)}</span>
        <span>{width === "fill" ? "fluid" : `${width}px`}{scale < 1 ? ` @ ${Math.round(scale * 100)}%` : ""}</span>
        <span>{subtreeIds(project.nodes, screen.rootId).length} elements</span>
        <span>{mode === "select" ? "Click to select · Interact mode to use the UI" : "Interacting: buttons, menus and navigation are live"}</span>
        {renderError && <span className="ml-auto text-bad">render error</span>}
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <TokenDatalists data={data} />
      {/* Top bar */}
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-panel px-2">
        <IconBtn label="Back to library" onClick={onBack}><Glyph name="back" /></IconBtn>
        <div className="flex items-baseline gap-2 pr-2">
          <span className="font-mono text-[11px] font-medium tracking-[0.18em] text-accent">IF</span>
          <span className="max-w-48 truncate text-[13px] font-medium">{project.name}</span>
        </div>
        <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto border-l border-line pl-2">
          {project.screens.map((s) => (
            <div key={s.id} className={cx("group flex h-7 items-center rounded-[3px] pl-2.5 pr-1 text-[12px]", s.id === screen?.id ? "bg-raised text-fg" : "text-dim hover:text-fg")}>
              <button onClick={() => { setScreenId(s.id); setSelectedId(undefined); }} className="whitespace-nowrap">{s.name}</button>
              {project.screens.length > 1 && <button aria-label={`Delete screen ${s.name}`} className="ml-1 text-faint opacity-0 hover:text-bad group-hover:opacity-100" onClick={() => removeScreen(s.id)}><Glyph name="x" size={10} /></button>}
            </div>
          ))}
          <IconBtn label="Add screen" onClick={addScreen}><Glyph name="plus" size={12} /></IconBtn>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Segmented<View> ariaLabel="View" value={view} onChange={setView} options={[{ value: "design", label: "Design" }, { value: "split", label: "Split" }, { value: "code", label: "Code" }]} />
          <Segmented<Device>
            ariaLabel="Device width"
            value={device}
            onChange={setDevice}
            options={[
              { value: "desktop", label: <Glyph name="desktop" size={13} />, title: "Desktop 1280px" },
              { value: "tablet", label: <Glyph name="tablet" size={13} />, title: "Tablet 768px" },
              { value: "mobile", label: <Glyph name="mobile" size={13} />, title: "Mobile 375px" },
              { value: "fill", label: "Fluid", title: "Fill the canvas (resize the window to test)" },
            ]}
          />
          <Segmented<"select" | "interact"> ariaLabel="Canvas mode" value={mode} onChange={setMode} options={[{ value: "select", label: <Glyph name="cursor" size={13} />, title: "Select elements" }, { value: "interact", label: <Glyph name="hand" size={13} />, title: "Interact with the live UI" }]} />
          <IconBtn label={`Preview ${theme === "dark" ? "light" : "dark"} mode`} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}><Glyph name={theme === "dark" ? "moon" : "sun"} /></IconBtn>
          <IconBtn label="Label example data" active={showExample} onClick={() => setShowExample((v) => !v)}><Glyph name="eye" /></IconBtn>
          <span className="mx-1 h-5 w-px bg-line" />
          <IconBtn label="Undo (Ctrl+Z)" disabled={!store.canUndo} onClick={store.undo}><Glyph name="undo" /></IconBtn>
          <IconBtn label="Redo (Ctrl+Shift+Z)" disabled={!store.canRedo} onClick={store.redo}><Glyph name="redo" /></IconBtn>
          <span className="w-14 text-center font-mono text-[10px] text-faint" aria-live="polite">{store.saveState === "saved" ? "saved" : store.saveState === "error" ? <span className="text-bad">save failed</span> : "saving…"}</span>
          <button onClick={() => (status === "passed" ? setRight("checks") : runValidation())} title="Validation status">
            <Badge tone={status === "passed" ? "ok" : status === "failed" ? "bad" : "warn"}>{validating ? "checking" : status}</Badge>
          </button>
          <IconBtn label="Settings" onClick={onOpenSettings}><Glyph name="settings" /></IconBtn>
          <Btn variant="primary" onClick={() => setExportOpen(true)}><Glyph name="download" size={12} /> Export</Btn>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left */}
        <aside className="panel-texture flex w-64 shrink-0 flex-col border-r border-line bg-panel">
          <nav className="grid grid-cols-4 border-b border-line" aria-label="Left panels">
            {([["layers", "layers", "Layers"], ["library", "grid", "Library"], ["tokens", "palette", "Tokens"], ["project", "folder", "Project"]] as const).map(([id, g, l]) => (
              <button key={id} onClick={() => setLeft(id)} aria-pressed={left === id} className={cx("flex h-9 flex-col items-center justify-center gap-0.5 text-[9px] uppercase tracking-[0.08em]", left === id ? "text-accent shadow-[inset_0_-1px_0_#ff6b1a]" : "text-faint hover:text-dim")}>
                <Glyph name={g} size={13} />{l}
              </button>
            ))}
          </nav>
          {screen && left === "layers" && <LayersPanel data={data} rootId={screen.rootId} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); if (id) setRight("inspect"); }} onCommit={onCommit} />}
          {screen && left === "library" && <LibraryPanel data={data} rootId={screen.rootId} selectedId={selectedId} onCommit={onCommit} onSelect={setSelectedId} refreshKey={libKey} />}
          {left === "tokens" && <TokensPanel data={data} onCommit={onCommit} projectName={project.name} toast={toast} />}
          {left === "project" && (
            <ProjectPanel
              project={project}
              onMeta={store.updateMeta}
              onSnapshot={(l) => { store.snapshot(l); toast("Version saved"); }}
              onRestore={(id) => { store.snapshot("Before restoring a version"); store.restore(id); toast("Version restored. Undo is available."); }}
              onRenameScreen={(id, name) => commit({ ...data, screens: data.screens.map((s) => (s.id === id ? { ...s, name } : s)) })}
              onRouteScreen={(id, route) => commit({ ...data, screens: data.screens.map((s) => (s.id === id ? { ...s, route } : s)) })}
            />
          )}
        </aside>

        {/* Canvas */}
        <main className="flex min-w-0 flex-1 flex-col">
          {view === "design" && preview}
          {view === "code" && <CodePanel project={project} selectedFile={unit?.file} onToast={toast} />}
          {view === "split" && (
            <div className="grid min-h-0 flex-1 grid-cols-2">
              <div className="min-w-0 border-r border-line">{preview}</div>
              <div className="min-w-0"><CodePanel project={project} selectedFile={unit?.file} onToast={toast} /></div>
            </div>
          )}
        </main>

        {/* Right */}
        <aside className="flex w-80 shrink-0 flex-col border-l border-line bg-panel">
          <nav className="grid grid-cols-3 border-b border-line" aria-label="Right panels">
            {([["inspect", "Inspect"], ["ai", "AI"], ["checks", "Checks"]] as const).map(([id, l]) => (
              <button key={id} onClick={() => setRight(id)} aria-pressed={right === id} className={cx("h-9 text-[11px] font-medium", right === id ? "text-fg shadow-[inset_0_-1px_0_#ff6b1a]" : "text-faint hover:text-dim")}>{l}</button>
            ))}
          </nav>
          <div className={cx("min-h-0 flex-1 overflow-auto", right !== "inspect" && "hidden")}>
            <Inspector data={data} selectedId={selectedId} onCommit={onCommit} onSelect={setSelectedId} screenRoutes={project.screens.map((s) => s.route)} onSaveComponent={saveToLibrary} />
          </div>
          <div className={cx("flex min-h-0 flex-1 flex-col", right !== "ai" && "hidden")}>
            <AIPanel project={project} settings={settings} selectedId={selectedId} onCommit={onCommit} onReplace={replace} onMeta={store.updateMeta} onSelect={setSelectedId} onOpenSettings={onOpenSettings} onCompare={setCompare} toast={toast} />
          </div>
          {right === "checks" && <ValidationPanel report={report} stale={stale} running={validating} step={step} onRun={runValidation} onSelectNode={(id) => { setSelectedId(id); const s = project.screens.find((x) => subtreeIds(project.nodes, x.rootId).includes(id)); if (s) setScreenId(s.id); }} />}
        </aside>
      </div>

      {exportOpen && screen && (
        <ExportDialog project={project} report={report} stale={stale || (!report && persistedStatus === "stale")} selectedId={selectedId} activeScreenId={screen.id} onCompat={(c) => store.updateMeta({ compat: c })} onClose={() => setExportOpen(false)} toast={toast} onValidate={() => { setExportOpen(false); runValidation(); }} />
      )}
      {compare && <CompareModal project={project} ids={compare} onClose={() => setCompare(null)} />}
      {toastEl}
    </div>
  );
}

function CompareModal({ project, ids, onClose }: { project: Project; ids: string[]; onClose: () => void }) {
  const vars = project.variations.filter((v) => ids.includes(v.id));
  const [w, setW] = useState<Device>("desktop");
  const width = WIDTH[w] as number;
  const scale = Math.min(0.5, 1 / vars.length);
  const gens = useMemo(() => vars.map((v) => generate(v.data, { instrument: true })), [vars.map((v) => v.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal title="Compare variations" onClose={onClose} wide>
      <div className="mb-3 flex items-center gap-2">
        <Segmented<Device> ariaLabel="Compare width" value={w} onChange={setW} options={[{ value: "desktop", label: "Desktop" }, { value: "tablet", label: "Tablet" }, { value: "mobile", label: "Mobile" }]} />
        <span className="text-[11px] text-faint">Previews are live: switch to them to click through.</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {vars.map((v, i) => {
          const g = gens[i];
          const u = g.units.find((x) => x.kind === "screen")!;
          return (
            <div key={v.id} className="shrink-0">
              <p className="mb-1 font-mono text-[11px] text-dim">{v.label}</p>
              <div className="overflow-hidden border border-line" style={{ width: width * scale, height: 820 * scale }}>
                <div style={{ width, height: 820, transform: `scale(${scale})`, transformOrigin: "top left" }}>
                  <PreviewFrame files={g.files} css={g.files["src/foundry.css"]} screenFile={u.file} screenName={u.name} width={width} mode="interact" theme={v.data.tokens.defaultMode} openIds={NO_OPEN} showExample={false} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
