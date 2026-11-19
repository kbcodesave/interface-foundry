import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import tailwindUrl from "@tailwindcss/browser?url";
import { compileFiles, frameDoc } from "./runtime";

export interface PreviewProps {
  files: Record<string, string>;
  css: string;
  screenFile: string;
  screenName: string;
  width: number | "fill";
  mode: "select" | "interact";
  theme: "light" | "dark";
  selectedId?: string;
  openIds: string[];
  showExample: boolean;
  onSelect?: (id: string) => void;
  onNavigate?: (route: string) => void;
  onRenderError?: (message: string | null) => void;
  /** Called with the iframe window once content has rendered (used by validation). */
  onReady?: (win: Window) => void;
  className?: string;
}

class Boundary extends Component<{ children: ReactNode; onError: (e: Error) => void }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    this.props.onError(error);
  }
  render() {
    if (this.state.error)
      return (
        <pre style={{ color: "#ef5b4c", padding: 16, font: "12px/1.5 monospace", whiteSpace: "pre-wrap" }}>
          Render error: {this.state.error.message}
        </pre>
      );
    return this.props.children;
  }
}

function fontFaceCss(): string {
  const out: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) if (rule instanceof CSSFontFaceRule) out.push(rule.cssText);
    } catch {
      /* cross-origin sheet */
    }
  }
  return out.join("\n");
}

export function PreviewFrame(props: PreviewProps) {
  const ref = useRef<HTMLIFrameElement>(null);
  const rootRef = useRef<Root | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  const handlers = useRef(props);
  handlers.current = props;
  const srcDoc = useMemo(() => frameDoc(tailwindUrl), []);

  // Compile generated files into modules.
  const compiled = useMemo(() => compileFiles(props.files, props.openIds), [props.files, props.openIds]);

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    const onLoad = () => {
      const doc = frame.contentDocument!;
      const fonts = doc.createElement("style");
      fonts.textContent = fontFaceCss();
      doc.head.appendChild(fonts);
      rootRef.current = createRoot(doc.getElementById("if-mount")!);
      // Selection + link handling.
      doc.addEventListener(
        "click",
        (e) => {
          const target = e.target as HTMLElement;
          const anchor = target.closest?.("a");
          if (anchor) e.preventDefault();
          if (handlers.current.mode !== "select") return;
          const el = target.closest?.("[data-if-id]");
          e.preventDefault();
          e.stopPropagation();
          if (el) handlers.current.onSelect?.(el.getAttribute("data-if-id")!);
        },
        true,
      );
      doc.addEventListener("submit", (e) => e.preventDefault(), true);
      let hovered: Element | null = null;
      doc.addEventListener("mouseover", (e) => {
        if (handlers.current.mode !== "select") return;
        const el = (e.target as HTMLElement).closest?.("[data-if-id]") ?? null;
        if (hovered && hovered !== el) hovered.removeAttribute("data-if-hover");
        if (el) el.setAttribute("data-if-hover", "");
        hovered = el;
      });
      doc.addEventListener("mouseleave", () => hovered?.removeAttribute("data-if-hover"));
      setLoaded(true);
    };
    frame.addEventListener("load", onLoad);
    return () => {
      frame.removeEventListener("load", onLoad);
      const r = rootRef.current;
      rootRef.current = null;
      setTimeout(() => r?.unmount(), 0);
    };
  }, []);

  // Render.
  useEffect(() => {
    if (!loaded || !rootRef.current) return;
    const doc = ref.current!.contentDocument!;
    doc.getElementById("if-foundry-css")!.textContent = props.css;
    doc.body.setAttribute("data-if-mode", props.mode);
    if (props.showExample) doc.body.setAttribute("data-if-show-example", "");
    else doc.body.removeAttribute("data-if-show-example");
    const err = compiled.errors[0];
    if (err) {
      const msg = `${err.file}: ${err.message}`;
      setCompileError(msg);
      props.onRenderError?.(msg);
      return;
    }
    const Screen = compiled.modules[props.screenFile]?.[props.screenName] as ((p: Record<string, unknown>) => ReactNode) | undefined;
    if (!Screen) {
      setCompileError(`Screen ${props.screenName} not found`);
      return;
    }
    setCompileError(null);
    props.onRenderError?.(null);
    rootRef.current.render(
      <Boundary key={props.screenFile + JSON.stringify(props.openIds)} onError={(e) => handlers.current.onRenderError?.(e.message)}>
        <Screen theme={props.theme} onNavigate={(r: string) => handlers.current.onNavigate?.(r)} />
      </Boundary>,
    );
    const t = setTimeout(() => props.onReady?.(ref.current!.contentWindow!), 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, compiled, props.css, props.screenFile, props.screenName, props.theme, props.mode, props.showExample]);

  // Selection highlight.
  useEffect(() => {
    if (!loaded) return;
    const doc = ref.current!.contentDocument!;
    const apply = () => {
      doc.querySelectorAll("[data-if-selected]").forEach((el) => el.removeAttribute("data-if-selected"));
      if (props.selectedId && props.mode === "select") {
        const el = doc.querySelector(`[data-if-id="${CSS.escape(props.selectedId)}"]`);
        el?.setAttribute("data-if-selected", "");
      }
    };
    apply();
    const t = setTimeout(apply, 50);
    return () => clearTimeout(t);
  }, [loaded, props.selectedId, props.mode, compiled, props.screenFile]);

  return (
    <div className={props.className} style={{ position: "relative", width: props.width === "fill" ? "100%" : props.width, height: "100%" }}>
      <iframe ref={ref} title={`Preview of ${props.screenName}`} srcDoc={srcDoc} style={{ width: "100%", height: "100%", border: 0, display: "block", background: "#0c0d0e" }} />
      {compileError && (
        <div className="absolute inset-x-0 bottom-0 bg-[#2a1210] px-3 py-2 font-mono text-[11px] text-[#ef5b4c] border-t border-[#ef5b4c]/40">{compileError}</div>
      )}
    </div>
  );
}
