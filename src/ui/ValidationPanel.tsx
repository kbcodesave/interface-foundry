import type { ValidationReport } from "../validate/validate";
import { Badge, Btn, Glyph, SectionTitle, cx } from "./controls";

const TONE = { pass: "ok", warn: "warn", fail: "bad", "not-run": "neutral" } as const;

export function ValidationPanel({ report, stale, running, step, onRun, onSelectNode }: { report?: ValidationReport; stale: boolean; running: boolean; step: string; onRun: () => void; onSelectNode: (id: string) => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SectionTitle right={<Btn size="sm" variant={report && !stale ? "ghost" : "primary"} disabled={running} onClick={onRun}>{running ? "Running…" : report ? "Re-run" : "Run checks"}</Btn>}>Quality & validation</SectionTitle>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
        {running && <p className="flex items-center gap-2 text-[11px] text-dim"><span className="size-2 animate-pulse rounded-full bg-accent" /> {step || "Running static checks"}</p>}
        {!report && !running && (
          <p className="text-[12px] leading-relaxed text-dim">
            Nothing has been validated yet, so this design counts as <b className="text-warn">untested</b>. Checks generate the export, transpile every file, resolve imports, render each screen at 375, 768 and 1280px, click through toggles, dialogs and navigation, and inspect accessibility, contrast, tokens, global CSS, animations, assets and performance.
          </p>
        )}
        {report && (
          <>
            <div className={cx("space-y-1 rounded-[3px] border p-2", stale ? "border-warn/40" : report.level === "passed" ? "border-ok/40" : report.level === "failed" ? "border-bad/40" : "border-warn/40")}>
              <div className="flex items-center gap-2">
                <Badge tone={stale ? "warn" : report.level === "passed" ? "ok" : report.level === "failed" ? "bad" : "warn"}>{stale ? "stale" : report.level}</Badge>
                {report.readyForExport && !stale && <Badge tone="ok">ready for export</Badge>}
                <span className="ml-auto font-mono text-[10px] text-faint">{new Date(report.at).toLocaleTimeString()}</span>
              </div>
              <p className="text-[11px] text-dim">{stale ? "The design changed after this run. Re-run to validate the current version." : report.summary}</p>
            </div>
            <div className="space-y-1">
              {report.checks.map((c) => (
                <details key={c.id} open={c.status === "fail"} className="rounded-[2px] border border-line">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-1.5 text-[12px]">
                    <Badge tone={TONE[c.status]}>{c.status === "not-run" ? "not run" : c.status}</Badge>
                    <span className="flex-1 truncate">{c.title}</span>
                    {c.findings.length > 0 && <span className="font-mono text-[10px] text-faint">{c.findings.length}</span>}
                  </summary>
                  <div className="space-y-1 border-t border-line px-2 py-1.5">
                    {c.note && <p className="text-[10px] text-faint">{c.note}</p>}
                    {c.findings.map((f, i) => (
                      <button key={i} disabled={!f.nodeId} onClick={() => f.nodeId && onSelectNode(f.nodeId)} className={cx("flex w-full items-start gap-1.5 text-left text-[11px]", f.nodeId && "hover:text-fg", f.severity === "error" ? "text-bad" : f.severity === "warning" ? "text-warn" : "text-dim")}>
                        <Glyph name={f.severity === "info" ? "check" : "alert"} size={11} className="mt-0.5 shrink-0" />
                        <span>{f.message}{f.file ? <span className="font-mono text-faint"> · {f.file}</span> : null}</span>
                      </button>
                    ))}
                    {!c.findings.length && c.status !== "not-run" && <p className="text-[11px] text-ok">No problems found.</p>}
                  </div>
                </details>
              ))}
            </div>
            <div className="space-y-1">
              <span className="label">Per component</span>
              {report.units.map((u) => (
                <div key={u.name} className="flex items-start gap-2 text-[11px]">
                  <Badge tone={u.status === "tested" ? "ok" : u.status === "partially-tested" ? "warn" : "neutral"}>{u.status.replace("-", " ")}</Badge>
                  <div><span className="font-mono text-fg">{u.name}</span> <span className="text-faint">{u.detail}</span></div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
