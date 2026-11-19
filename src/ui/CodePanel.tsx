import { useMemo, useState } from "react";
import { exportFiles } from "../export/package";
import type { Project } from "../model/types";
import { Btn, Glyph, copyText, cx } from "./controls";

// Lightweight syntax tint: comments, strings, JSX tags, keywords.
function highlight(code: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return code
    .split("\n")
    .map((line) => {
      if (/^\s*(\/\/|\/\*|\*)/.test(line)) return `<span style="color:#6e6d69">${esc(line)}</span>`;
      return esc(line)
        .replace(/(&quot;|"(?:[^"\\]|\\.)*")/g, '<span style="color:#c9a26b">$1</span>')
        .replace(/(&lt;\/?)([A-Za-z][\w.]*)/g, '$1<span style="color:#ff8a4c">$2</span>')
        .replace(/\b(import|from|export|function|const|return|type|interface|true|false)\b/g, '<span style="color:#8fb3ff">$1</span>');
    })
    .join("\n");
}

export function CodePanel({ project, selectedFile, onToast }: { project: Project; selectedFile?: string; onToast: (m: string) => void }) {
  const { files } = useMemo(() => exportFiles(project), [project]);
  const names = Object.keys(files).sort((a, b) => (a.includes("screens") ? -1 : 0) - (b.includes("screens") ? -1 : 0) || a.localeCompare(b));
  const [chosen, setChosen] = useState<string | undefined>();
  const file = chosen && files[chosen] ? chosen : selectedFile && files[selectedFile] ? selectedFile : names[0];
  const code = files[file] ?? "";
  const html = useMemo(() => highlight(code), [code]);
  return (
    <div className="flex h-full min-h-0">
      <div className="w-56 shrink-0 overflow-auto border-r border-line py-2">
        {names.map((n) => (
          <button key={n} onClick={() => setChosen(n)} className={cx("block w-full truncate px-3 py-1 text-left font-mono text-[11px]", n === file ? "bg-accent/10 text-fg" : "text-dim hover:bg-hover")}>
            {n.replace(/^src\//, "")}
          </button>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-9 items-center gap-2 border-b border-line px-3">
          <span className="font-mono text-[11px] text-dim">{file}</span>
          <span className="font-mono text-[10px] text-faint">{code.split("\n").length} lines</span>
          <Btn size="sm" className="ml-auto" onClick={() => copyText(code).then(() => onToast(`Copied ${file.split("/").pop()}`))}><Glyph name="copy" size={11} /> Copy file</Btn>
        </div>
        <pre className="min-h-0 flex-1 overflow-auto p-4 font-mono text-[11.5px] leading-[1.55] text-fg" dangerouslySetInnerHTML={{ __html: html }} />
        <p className="border-t border-line px-3 py-1.5 text-[10px] text-faint">This is the exact code that will be exported, regenerated live from the design. Edit the design, not the code: changes here would be overwritten.</p>
      </div>
    </div>
  );
}
