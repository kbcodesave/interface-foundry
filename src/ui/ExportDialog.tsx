import { useMemo } from "react";
import { aiPrompt, buildDesignSystemZip, buildZip, compatWarnings, download, exportFiles, readme, slug } from "../export/package";
import { screenComponentName } from "../codegen/generate";
import { subtreeIds } from "../model/ops";
import type { CompatSettings, Project } from "../model/types";
import type { ValidationReport } from "../validate/validate";
import { Badge, Btn, Field, Glyph, Modal, Select, TextInput, copyText } from "./controls";

const PRESETS: { label: string; compat: Partial<CompatSettings> }[] = [
  { label: "Vite + React + TypeScript + Tailwind v4", compat: { framework: "react", language: "ts", styling: "tailwind", tailwindVersion: "4" } },
  { label: "Next.js (App Router) + TypeScript + Tailwind v4", compat: { framework: "nextjs", language: "ts", styling: "tailwind", tailwindVersion: "4" } },
  { label: "Next.js + TypeScript + Tailwind v3", compat: { framework: "nextjs", language: "ts", styling: "tailwind", tailwindVersion: "3" } },
  { label: "React + JavaScript + Tailwind v3", compat: { framework: "react", language: "js", styling: "tailwind", tailwindVersion: "3" } },
];

export function ExportDialog({ project, report, stale, selectedId, activeScreenId, onCompat, onClose, toast, onValidate }: {
  project: Project;
  report?: ValidationReport;
  stale: boolean;
  selectedId?: string;
  activeScreenId: string;
  onCompat: (c: CompatSettings) => void;
  onClose: () => void;
  toast: (m: string, tone?: "ok" | "bad") => void;
  onValidate: () => void;
}) {
  const c = project.compat;
  const { files, gen } = useMemo(() => exportFiles(project), [project]);
  const warnings = compatWarnings(c);
  const ext = c.language === "js" ? "jsx" : "tsx";
  const folder = slug(project.name);
  const screen = project.screens.find((s) => s.id === activeScreenId) ?? project.screens[0];
  const screenFile = `src/screens/${screenComponentName(screen)}.${ext}`;
  // The component that contains the selection (nearest ancestor with a component name).
  const compUnit = useMemo(() => {
    if (!selectedId) return undefined;
    return gen.units.filter((u) => u.kind === "component").find((u) => subtreeIds(project.nodes, u.rootId).includes(selectedId));
  }, [gen, selectedId, project.nodes]);
  const compFile = compUnit ? compUnit.file.replace(/\.tsx$/, `.${ext}`) : undefined;
  const transitive = (name: string, acc = new Set<string>()): Set<string> => {
    const u = gen.units.find((x) => x.name === name);
    if (!u || acc.has(u.file)) return acc;
    acc.add(u.file.replace(/\.tsx$/, `.${ext}`));
    u.childComponents.forEach((cc) => transitive(cc, acc));
    return acc;
  };
  const status = !report ? "untested" : stale ? "stale" : report.level;
  const set = (patch: Partial<CompatSettings>) => onCompat({ ...c, ...patch });
  const zipName = (suffix = "") => `${folder}${suffix}-ui.zip`;

  return (
    <Modal title="Export" onClose={onClose} wide>
      <div className="grid gap-5 md:grid-cols-[1fr_1fr]">
        <div className="space-y-3">
          <span className="label">Target project compatibility</span>
          <Select ariaLabel="Compatibility preset" value="" options={[{ value: "", label: "Apply a preset…" }, ...PRESETS.map((p, i) => ({ value: String(i), label: p.label }))]} onChange={(v) => v && set(PRESETS[Number(v)].compat)} />
          <Field label="Framework"><Select ariaLabel="Framework" value={c.framework} options={[{ value: "react", label: "React" }, { value: "nextjs", label: "Next.js" }]} onChange={(v) => set({ framework: v })} /></Field>
          <Field label="Language"><Select ariaLabel="Language" value={c.language} options={[{ value: "ts", label: "TypeScript" }, { value: "js", label: "JavaScript" }]} onChange={(v) => set({ language: v })} /></Field>
          <Field label="Styling"><Select ariaLabel="Styling" value={c.styling} options={[{ value: "tailwind", label: "Tailwind CSS" }, { value: "css-modules", label: "CSS Modules (planned)" }, { value: "plain-css", label: "HTML + CSS (planned)" }]} onChange={(v) => set({ styling: v })} /></Field>
          <Field label="Tailwind"><Select ariaLabel="Tailwind version" value={c.tailwindVersion} options={[{ value: "4", label: "v4" }, { value: "3", label: "v3" }]} onChange={(v) => set({ tailwindVersion: v })} /></Field>
          <Field label="Components"><Select ariaLabel="Component library" value={c.componentLibrary} options={["none", "shadcn/ui", "Radix", "MUI", "Chakra"]} onChange={(v) => set({ componentLibrary: v })} /></Field>
          <Field label="Icons"><Select ariaLabel="Icon library" value={c.iconLibrary} options={[{ value: "inline-svg", label: "Inline SVG (no dependency)" }, { value: "lucide-react", label: "lucide-react" }]} onChange={(v) => set({ iconLibrary: v })} /></Field>
          <Field label="Animation"><Select ariaLabel="Animation library" value={c.animationLibrary} options={[{ value: "css", label: "CSS keyframes" }, { value: "framer-motion", label: "Framer Motion" }]} onChange={(v) => set({ animationLibrary: v })} /></Field>
          <Field label="Conventions"><TextInput ariaLabel="Project conventions" value={c.conventions} placeholder="e.g. components live in src/ui" onChange={(v) => set({ conventions: v })} /></Field>
          {warnings.map((w, i) => (
            <p key={i} className={w.level === "warning" ? "text-[11px] text-warn" : "text-[11px] text-faint"}>{w.level === "warning" ? "⚠ " : "ℹ "}{w.message}</p>
          ))}
        </div>

        <div className="space-y-4">
          <div className="space-y-2 rounded-[3px] border border-line p-3">
            <div className="flex items-center gap-2">
              <span className="label">Validation</span>
              <Badge tone={status === "passed" ? "ok" : status === "failed" ? "bad" : "warn"}>{status}</Badge>
              {report?.readyForExport && !stale && <Badge tone="ok">ready for export</Badge>}
            </div>
            <p className="text-[11px] text-dim">
              {!report ? "No checks have run on this design. Exports will be labelled untested." : stale ? "The design changed after the last validation, so the result no longer applies. Exports will be labelled stale." : report.summary}
            </p>
            {(!report || stale) && <Btn size="sm" onClick={onValidate}>Run validation</Btn>}
          </div>

          <div className="space-y-2">
            <span className="label">Copy</span>
            <div className="flex flex-wrap gap-1.5">
              <Btn disabled={!compFile} title={compFile ? undefined : "Select an element inside an exported component (◆) first"} onClick={() => compFile && copyText(files[compFile]).then(() => toast(`Copied ${compUnit!.name}`))}><Glyph name="copy" size={12} /> Component code{compUnit ? `: ${compUnit.name}` : ""}</Btn>
              <Btn onClick={() => copyText(files[screenFile]).then(() => toast(`Copied ${screenComponentName(screen)}`))}><Glyph name="copy" size={12} /> Entire page: {screenComponentName(screen)}</Btn>
              <Btn onClick={() => copyText(aiPrompt(project, gen, folder)).then(() => toast("Copied AI integration prompt"))}><Glyph name="copy" size={12} /> AI integration prompt</Btn>
              <Btn onClick={() => copyText(readme(project, gen, folder)).then(() => toast("Copied integration instructions"))}><Glyph name="copy" size={12} /> Integration instructions</Btn>
            </div>
          </div>
          <div className="space-y-2">
            <span className="label">Download</span>
            <div className="flex flex-wrap gap-1.5">
              <Btn variant="primary" onClick={async () => { download(await buildZip(project, report, stale), zipName()); toast("Downloaded full UI package"); }}><Glyph name="download" size={12} /> Full UI package (.zip)</Btn>
              <Btn disabled={!compUnit} onClick={async () => { if (!compUnit) return; download(await buildZip(project, report, stale, [...transitive(compUnit.name)]), `${folder}-${slug(compUnit.name)}-component.zip`); toast(`Downloaded ${compUnit.name} package`); }}><Glyph name="download" size={12} /> Component package</Btn>
              <Btn onClick={async () => { download(await buildDesignSystemZip(project), `${folder}-design-system.zip`); toast("Downloaded design system"); }}><Glyph name="download" size={12} /> Design system</Btn>
            </div>
          </div>
          <p className="text-[10px] leading-snug text-faint">
            The package contains {Object.keys(files).length} source files plus manifest.json, README.md, AI_INTEGRATION_PROMPT.md and VALIDATION.md. It needs only React and Tailwind, adds no global CSS, and never touches files in your project. Copy it in yourself or hand it to your coding assistant with the prompt.
          </p>
        </div>
      </div>
    </Modal>
  );
}
