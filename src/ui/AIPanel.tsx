import { useRef, useState } from "react";
import { AIError, analyzeReferences, combineVariations, directEdit, generateInterface } from "../ai/claude";
import { CREATIVE_MODES } from "../ai/prompts";
import { applyOps } from "../model/applyOps";
import { uid } from "../model/defaults";
import { pickData } from "../model/ops";
import { cleanTokens, interfaceFromAI } from "../model/sanitize";
import type { Project, ProjectData, Reference, Variation } from "../model/types";
import type { AppSettings } from "../store/db";
import { Badge, Btn, Glyph, IconBtn, SectionTitle, Segmented, Select, TextArea, cx } from "./controls";

type Tab = "generate" | "director" | "references" | "variations";

const KINDS = ["auto", "full application interface", "single page or screen", "dashboard", "navigation system", "settings page", "forms and input system", "authentication screens", "data tables and reports", "mobile interface", "modals and overlays", "analytics visualizations", "administrative panel", "complete design system showcase"];

export interface AIPanelProps {
  project: Project;
  settings: AppSettings;
  selectedId?: string;
  onCommit: (d: ProjectData, key?: string) => void;
  onReplace: (d: ProjectData, label: string, meta?: Partial<Project>) => void;
  onMeta: (p: Partial<Project>) => void;
  onSelect: (id: string | undefined) => void;
  onOpenSettings: () => void;
  onCompare: (ids: string[]) => void;
  toast: (m: string, tone?: "ok" | "bad") => void;
}

function useBusy() {
  const [busy, setBusy] = useState<string | null>(null);
  const [chars, setChars] = useState(0);
  const ctrl = useRef<AbortController | null>(null);
  const run = async <T,>(label: string, fn: (signal: AbortSignal, onProgress: (n: number) => void) => Promise<T>): Promise<T | undefined> => {
    ctrl.current = new AbortController();
    setBusy(label);
    setChars(0);
    try {
      return await fn(ctrl.current.signal, setChars);
    } finally {
      setBusy(null);
      ctrl.current = null;
    }
  };
  return { busy, chars, run, cancel: () => ctrl.current?.abort() };
}

function readAsDataUrl(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });
}

export function AIPanel(p: AIPanelProps) {
  const [tab, setTab] = useState<Tab>("generate");
  const [prompt, setPrompt] = useState(p.project.description || "");
  const [kind, setKind] = useState("auto");
  const [mode, setMode] = useState("custom");
  const [useRefs, setUseRefs] = useState(true);
  const [refInstruction, setRefInstruction] = useState("");
  const [command, setCommand] = useState("");
  const [lock, setLock] = useState(true);
  const [log, setLog] = useState<{ at: number; text: string; applied: string[]; rejected: string[] }[]>([]);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [varModes, setVarModes] = useState<string[]>(["industrial", "editorial", "technical"]);
  const [picked, setPicked] = useState<string[]>([]);
  const [combineText, setCombineText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { busy, chars, run, cancel } = useBusy();
  const opts = (signal: AbortSignal, onProgress: (n: number) => void) => ({ settings: p.settings, signal, onProgress });
  const refs = p.project.references;
  const noKey = !p.settings.apiKey;

  const guard = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof AIError ? e.message : `Unexpected error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const doGenerate = (append: boolean) =>
    guard(async () => {
      const m = CREATIVE_MODES.find((x) => x.id === mode);
      const input = await run("Generating interface", (s, pr) => generateInterface({ prompt, kind, mode: m, references: useRefs ? refs : [], referenceInstruction: refInstruction }, opts(s, pr)));
      if (!input) return;
      const { data, name, summary, warnings } = interfaceFromAI(input);
      if (append) {
        const next: ProjectData = { ...p.project, nodes: { ...p.project.nodes, ...data.nodes }, screens: [...p.project.screens, ...data.screens] };
        p.onReplace(next, "Before adding generated screens");
      } else {
        p.onReplace(data, "Before AI generation", { name: p.project.name === "Untitled interface" && name ? name : p.project.name, description: prompt });
      }
      p.onSelect(undefined);
      setLog((l) => [{ at: Date.now(), text: summary ?? "Generated.", applied: [`${data.screens.length} screen(s), ${Object.keys(data.nodes).length} elements`], rejected: warnings }, ...l]);
      p.toast(append ? "Added generated screens" : "Interface generated. The previous design is saved in version history.");
    });

  const doDirect = () =>
    guard(async () => {
      const sel = p.selectedId ? p.project.nodes[p.selectedId] : undefined;
      const input = await run("Design Director is editing", (s, pr) => directEdit(command, pickData(p.project), { selectedId: sel?.id, selectedName: sel?.name, lock: lock && !!sel }, [], opts(s, pr)));
      if (!input) return;
      const res = applyOps(pickData(p.project), input.ops, lock && sel ? sel.id : undefined);
      if (res.applied.length) p.onCommit(res.data);
      setLog((l) => [{ at: Date.now(), text: `“${command}”: ${String(input.summary ?? "")}`, applied: res.applied, rejected: res.rejected }, ...l]);
      if (!res.applied.length) setError("No edits could be applied. See the log below.");
      else setCommand("");
    });

  const addRefs = async (files: FileList | null) => {
    if (!files) return;
    const next: Reference[] = [...refs];
    for (const f of Array.from(files)) {
      if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) { p.toast(`${f.name}: only PNG, JPEG, WebP or GIF`, "bad"); continue; }
      if (f.size > 4.5 * 1024 * 1024) { p.toast(`${f.name} is over 4.5 MB`, "bad"); continue; }
      next.push({ id: uid("r"), name: f.name, mediaType: f.type, dataUrl: await readAsDataUrl(f) });
    }
    p.onMeta({ references: next.slice(0, 12) });
  };

  const doAnalyze = () =>
    guard(async () => {
      const out = await run("Analysing references", (s, pr) => analyzeReferences(refs, refInstruction, opts(s, pr)));
      if (out) setReport(out);
    });

  const doVariations = () =>
    guard(async () => {
      const modes = CREATIVE_MODES.filter((m) => varModes.includes(m.id));
      const results = await run(`Generating ${modes.length} variations`, async (s, pr) => {
        const counts = new Array(modes.length).fill(0);
        return Promise.allSettled(modes.map((m, i) => generateInterface({ prompt, kind, mode: m }, { settings: p.settings, signal: s, onProgress: (n) => { counts[i] = n; pr(counts.reduce((a, b) => a + b, 0)); } })));
      });
      if (!results) return;
      const made: Variation[] = [];
      const failed: string[] = [];
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          try {
            const { data } = interfaceFromAI(r.value);
            made.push({ id: uid("var"), label: `${String.fromCharCode(65 + ((p.project.variations.length + made.length) % 26))} · ${modes[i].label}`, mode: modes[i].id, createdAt: Date.now(), data });
          } catch (e) { failed.push(`${modes[i].label}: ${e instanceof Error ? e.message : e}`); }
        } else failed.push(`${modes[i].label}: ${r.reason instanceof Error ? r.reason.message : r.reason}`);
      });
      p.onMeta({ variations: [...made, ...p.project.variations] });
      if (failed.length) setError(`Some variations failed: ${failed.join("; ")}`);
      if (made.length) p.toast(`${made.length} variation${made.length === 1 ? "" : "s"} saved`);
    });

  const doCombine = () =>
    guard(async () => {
      const chosen = p.project.variations.filter((v) => picked.includes(v.id));
      const out = await run("Combining variations", (s, pr) => combineVariations(combineText, chosen.map((v) => ({ label: `Version ${v.label}`, data: v.data })), opts(s, pr)));
      if (!out) return;
      const { data } = interfaceFromAI(out);
      p.onMeta({ variations: [{ id: uid("var"), label: `Combined (${chosen.map((c) => c.label.split(" ")[0]).join("+")})`, mode: "custom", createdAt: Date.now(), data }, ...p.project.variations] });
      p.toast("Combined variation saved");
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SectionTitle right={<Badge tone={noKey ? "warn" : "ok"}>{noKey ? "no key" : p.settings.model.replace("claude-", "")}</Badge>}>AI studio</SectionTitle>
      <div className="border-b border-line p-2">
        <Segmented<Tab> ariaLabel="AI tool" value={tab} onChange={setTab} options={[{ value: "generate", label: "Generate" }, { value: "director", label: "Director" }, { value: "references", label: "References" }, { value: "variations", label: "Variations" }]} />
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
        {noKey && (
          <div className="rounded-[3px] border border-warn/40 bg-warn/5 p-2 text-[11px] text-dim">
            AI features need your Anthropic API key. It's stored only in this browser. <button className="text-accent underline" onClick={p.onOpenSettings}>Open settings</button>
          </div>
        )}
        {busy && (
          <div className="flex items-center gap-2 rounded-[3px] border border-accent/40 bg-accent/5 p-2 text-[11px]">
            <span className="size-2 animate-pulse rounded-full bg-accent" />
            <span className="flex-1">{busy}… {chars > 0 && <span className="font-mono text-faint">{(chars / 1000).toFixed(1)}k chars received</span>}</span>
            <Btn size="sm" onClick={cancel}>Cancel</Btn>
          </div>
        )}
        {error && <div role="alert" className="rounded-[3px] border border-bad/40 bg-bad/5 p-2 text-[11px] text-bad">{error}</div>}

        {tab === "generate" && (
          <>
            <TextArea ariaLabel="Describe the interface" rows={6} value={prompt} onChange={setPrompt} placeholder="e.g. A sophisticated construction management dashboard with a black-and-orange industrial design, project tracking, financial summaries and employee management." />
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1"><span className="label">Output</span><Select ariaLabel="Output type" value={kind} options={KINDS} onChange={setKind} /></label>
              <label className="space-y-1"><span className="label">Direction</span><Select ariaLabel="Creative direction" value={mode} options={[{ value: "custom", label: "Custom (from prompt)" }, ...CREATIVE_MODES.map((m) => ({ value: m.id, label: m.label }))]} onChange={setMode} /></label>
            </div>
            {refs.length > 0 && (
              <label className="flex items-center gap-2 text-[11px] text-dim"><input type="checkbox" className="accent-accent" checked={useRefs} onChange={(e) => setUseRefs(e.target.checked)} /> Use {refs.length} reference image{refs.length === 1 ? "" : "s"} (see References tab)</label>
            )}
            <div className="flex gap-2">
              <Btn variant="primary" disabled={!!busy || noKey || !prompt.trim()} onClick={() => doGenerate(false)}><Glyph name="spark" size={12} /> Generate</Btn>
              <Btn disabled={!!busy || noKey || !prompt.trim()} onClick={() => doGenerate(true)}>Add as new screens</Btn>
            </div>
            <p className="text-[10px] leading-snug text-faint">Generate replaces the current design (the old one goes to version history). Claude designs a structured model; Foundry writes the code from it, so everything stays editable.</p>
          </>
        )}

        {tab === "director" && (
          <>
            <TextArea ariaLabel="Design Director command" rows={3} value={command} onChange={setCommand} placeholder="Make the navigation more compact. / Change the materials to brushed aluminum and translucent glass, keep the layout." />
            <label className="flex items-center gap-2 text-[11px] text-dim">
              <input type="checkbox" className="accent-accent" checked={lock} onChange={(e) => setLock(e.target.checked)} />
              {p.selectedId ? <>Only edit the selection: <span className="text-fg">{p.project.nodes[p.selectedId]?.name}</span></> : "Only edit the selection (nothing selected: global)"}
            </label>
            <div className="flex flex-wrap gap-1">
              {["Make the navigation more compact", "Give the buttons more deliberate microinteractions", "Make the typography reminiscent of early-2000s internet design", "Increase information density in tables"].map((s) => (
                <button key={s} onClick={() => setCommand(s)} className="rounded-[2px] border border-line px-1.5 py-0.5 text-[10px] text-faint hover:border-line-strong hover:text-dim">{s}</button>
              ))}
            </div>
            <Btn variant="primary" disabled={!!busy || noKey || !command.trim()} onClick={doDirect}><Glyph name="spark" size={12} /> Apply edit</Btn>
            <p className="text-[10px] leading-snug text-faint">The Director returns targeted operations (style patches, token changes, inserts). With the lock on, edits outside the selection are rejected. Every edit is one undo step.</p>
          </>
        )}

        {tab === "references" && (
          <>
            <label className="flex h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-[3px] border border-dashed border-line-strong text-[11px] text-dim hover:border-accent/60">
              <Glyph name="image" /> Add reference images (interfaces, artwork, moodboards, type)
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple className="hidden" onChange={(e) => { addRefs(e.target.files); e.target.value = ""; }} />
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {refs.map((r, i) => (
                <figure key={r.id} className="group relative overflow-hidden rounded-[2px] border border-line">
                  <img src={r.dataUrl} alt={r.name} className="h-16 w-full object-cover" />
                  <figcaption className="truncate px-1 py-0.5 font-mono text-[9px] text-faint">{i + 1}. {r.name}</figcaption>
                  <IconBtn label={`Remove ${r.name}`} className="absolute right-0.5 top-0.5 size-5 bg-black/60 opacity-0 group-hover:opacity-100" onClick={() => p.onMeta({ references: refs.filter((x) => x.id !== r.id) })}><Glyph name="x" size={10} /></IconBtn>
                </figure>
              ))}
            </div>
            <TextArea ariaLabel="How to use the references" rows={2} value={refInstruction} onChange={setRefInstruction} placeholder="Take the typography from image 1, the colors from image 2 and the layout from image 3." />
            <Btn disabled={!!busy || noKey || !refs.length} onClick={doAnalyze}>Analyse references</Btn>
            <p className="text-[10px] leading-snug text-faint">Foundry extracts characteristics and builds an original interface from them. It won't reproduce logos, trademarks or a recognisable copy of a composition. Use the Generate tab with references switched on to build from them.</p>
            {report && (
              <div className="space-y-2 rounded-[3px] border border-line p-2 text-[11px]">
                {(report.references as Record<string, unknown>[] | undefined)?.map((r, i) => (
                  <details key={i} open={i === 0}>
                    <summary className="cursor-pointer font-medium text-fg">Reference {String(r.index ?? i + 1)}</summary>
                    <dl className="mt-1 space-y-1 text-dim">
                      {Object.entries(r).filter(([k]) => k !== "index").map(([k, v]) => (
                        <div key={k}><dt className={cx("label", k === "doNotCopy" && "text-warn")}>{k === "doNotCopy" ? "Do not copy" : k}</dt><dd>{String(v)}</dd></div>
                      ))}
                    </dl>
                  </details>
                ))}
                {report.synthesis != null && <p className="text-dim"><span className="label">Synthesis</span><br />{String(report.synthesis)}</p>}
                {report.tokens != null && (
                  <Btn size="sm" onClick={() => { p.onCommit({ ...pickData(p.project), tokens: cleanTokens(report.tokens, p.project.tokens) }); p.toast("Applied suggested tokens"); }}>Apply suggested tokens</Btn>
                )}
              </div>
            )}
          </>
        )}

        {tab === "variations" && (
          <>
            <TextArea ariaLabel="Requirements for variations" rows={4} value={prompt} onChange={setPrompt} placeholder="The application requirements to explore." />
            <div>
              <span className="label">Creative modes ({varModes.length}/4)</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {CREATIVE_MODES.map((m) => (
                  <button key={m.id} title={m.brief} aria-pressed={varModes.includes(m.id)} onClick={() => setVarModes((v) => (v.includes(m.id) ? v.filter((x) => x !== m.id) : v.length < 4 ? [...v, m.id] : v))} className={cx("rounded-[2px] border px-1.5 py-0.5 text-[10px]", varModes.includes(m.id) ? "border-accent/60 text-accent" : "border-line text-faint hover:text-dim")}>{m.label}</button>
                ))}
              </div>
            </div>
            <Btn variant="primary" disabled={!!busy || noKey || !prompt.trim() || !varModes.length} onClick={doVariations}><Glyph name="spark" size={12} /> Generate {varModes.length} variation{varModes.length === 1 ? "" : "s"}</Btn>
            <div className="space-y-1">
              {p.project.variations.map((v) => (
                <div key={v.id} className="flex items-center gap-1 rounded-[2px] border border-line px-2 py-1">
                  <input type="checkbox" aria-label={`Pick ${v.label}`} className="accent-accent" checked={picked.includes(v.id)} onChange={(e) => setPicked((s) => (e.target.checked ? [...s, v.id] : s.filter((x) => x !== v.id)))} />
                  <span className="flex-1 truncate text-[11px]">{v.label}</span>
                  <IconBtn label={v.favorite ? "Unfavorite" : "Favorite"} className="size-5" active={v.favorite} onClick={() => p.onMeta({ variations: p.project.variations.map((x) => (x.id === v.id ? { ...x, favorite: !x.favorite } : x)) })}><Glyph name="star" size={11} /></IconBtn>
                  <Btn size="sm" onClick={() => { p.onReplace(structuredClone(v.data), `Before opening variation ${v.label}`); p.toast(`Opened ${v.label}. Previous design saved in history.`); }}>Open</Btn>
                  <IconBtn label="Delete variation" className="size-5" onClick={() => p.onMeta({ variations: p.project.variations.filter((x) => x.id !== v.id) })}><Glyph name="trash" size={11} /></IconBtn>
                </div>
              ))}
              {p.project.variations.length === 0 && <p className="text-[11px] text-faint">Variations you generate are saved here with the project.</p>}
            </div>
            {p.project.variations.length > 0 && (
              <div className="space-y-2 border-t border-line pt-2">
                <Btn size="sm" disabled={picked.length < 1} onClick={() => p.onCompare(picked)}>Compare side by side ({picked.length})</Btn>
                <TextArea ariaLabel="Combine instruction" rows={2} value={combineText} onChange={setCombineText} placeholder="Use the sidebar from Version A, the typography from Version B and the data cards from Version C." />
                <Btn size="sm" disabled={!!busy || noKey || picked.length < 2 || !combineText.trim()} onClick={doCombine}>Combine picked variations</Btn>
              </div>
            )}
          </>
        )}

        {log.length > 0 && (
          <div className="space-y-2 border-t border-line pt-3">
            <span className="label">AI log</span>
            {log.map((l) => (
              <div key={l.at} className="space-y-1 text-[11px]">
                <p className="text-dim">{l.text}</p>
                {l.applied.map((a, i) => <p key={i} className="font-mono text-[10px] text-ok">+ {a}</p>)}
                {l.rejected.map((a, i) => <p key={i} className="font-mono text-[10px] text-warn">! {a}</p>)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
