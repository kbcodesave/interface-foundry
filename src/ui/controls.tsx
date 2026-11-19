import { useEffect, useId, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "ghost" | "subtle" | "danger";

export function Btn({ variant = "ghost", size = "md", className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      {...rest}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[3px] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm" ? "h-6 px-2 text-[11px]" : "h-7 px-2.5 text-[12px]",
        variant === "primary" && "bg-accent font-medium text-[#140a03] hover:bg-[#ff7f38]",
        variant === "ghost" && "border border-line-strong text-fg hover:border-faint hover:bg-hover",
        variant === "subtle" && "text-dim hover:bg-hover hover:text-fg",
        variant === "danger" && "border border-bad/40 text-bad hover:bg-bad/10",
        className,
      )}
    />
  );
}

export function IconBtn({ label, active, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={cx("inline-flex size-7 items-center justify-center rounded-[3px] text-dim transition-colors hover:bg-hover hover:text-fg disabled:opacity-30", active && "bg-raised text-accent", className)}
    >
      {children}
    </button>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex h-8 items-center justify-between border-b border-line px-3">
      <span className="label">{children}</span>
      {right}
    </div>
  );
}

const inputCls = "h-6 w-full min-w-0 rounded-[2px] border border-line bg-ink px-1.5 text-[12px] text-fg outline-none placeholder:text-faint focus:border-accent";

/** Text input that commits on blur/Enter but shows live typing. */
export function TextInput({ value, onChange, placeholder, list, mono, live, className, ariaLabel }: { value: string | undefined; onChange: (v: string) => void; placeholder?: string; list?: string; mono?: boolean; live?: boolean; className?: string; ariaLabel?: string }) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);
  return (
    <input
      aria-label={ariaLabel}
      className={cx(inputCls, mono && "font-mono text-[11px]", className)}
      value={draft}
      list={list}
      placeholder={placeholder}
      onChange={(e) => {
        setDraft(e.target.value);
        if (live) onChange(e.target.value);
      }}
      onBlur={() => draft !== (value ?? "") && onChange(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setDraft(value ?? "");
      }}
    />
  );
}

export function TextArea({ value, onChange, rows = 3, placeholder, ariaLabel }: { value: string | undefined; onChange: (v: string) => void; rows?: number; placeholder?: string; ariaLabel?: string }) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);
  return (
    <textarea
      aria-label={ariaLabel}
      rows={rows}
      placeholder={placeholder}
      className="w-full resize-y rounded-[2px] border border-line bg-ink px-1.5 py-1 text-[12px] text-fg outline-none placeholder:text-faint focus:border-accent"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== (value ?? "") && onChange(draft)}
    />
  );
}

export function Select<T extends string>({ value, options, onChange, ariaLabel, className }: { value: T | undefined; options: (T | { value: T; label: string })[]; onChange: (v: T) => void; ariaLabel?: string; className?: string }) {
  return (
    <select aria-label={ariaLabel} className={cx(inputCls, "pr-5", className)} value={value ?? ""} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => {
        const v = typeof o === "string" ? o : o.value;
        const l = typeof o === "string" ? o : o.label;
        return (
          <option key={v} value={v}>
            {l}
          </option>
        );
      })}
    </select>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  const id = useId();
  return (
    <div className="grid grid-cols-[84px_1fr] items-center gap-2" id={id}>
      <span className="truncate text-[11px] text-dim" title={hint ?? label}>
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, ariaLabel }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; ariaLabel?: string }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-[3px] border border-line bg-ink p-[2px]">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx("h-6 rounded-[2px] px-2 text-[11px] transition-colors", value === o.value ? "bg-raised text-fg" : "text-faint hover:text-dim")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "warn" | "bad" | "accent"; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-[2px] border px-1.5 font-mono text-[10px] uppercase tracking-[0.06em]",
        tone === "neutral" && "border-line-strong text-dim",
        tone === "ok" && "border-ok/40 text-ok",
        tone === "warn" && "border-warn/40 text-warn",
        tone === "bad" && "border-bad/40 text-bad",
        tone === "accent" && "border-accent/40 text-accent",
      )}
    >
      {children}
    </span>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/60 p-6 pt-16" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cx("w-full rounded-[4px] border border-line-strong bg-panel shadow-2xl", wide ? "max-w-4xl" : "max-w-lg")}>
        <div className="flex h-10 items-center justify-between border-b border-line px-4">
          <span className="label text-dim">{title}</span>
          <IconBtn label="Close" onClick={onClose}>
            <Glyph name="x" />
          </IconBtn>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

const GLYPHS: Record<string, string> = {
  x: "M18 6 6 18M6 6l12 12",
  undo: "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3",
  redo: "m15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h3",
  desktop: "M3 4h18v12H3zM8 20h8M12 16v4",
  tablet: "M6 2h12a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1M11 18h2",
  mobile: "M8 2h8a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1M11 18h2",
  cursor: "m4 4 7 17 2.5-7.5L21 11z",
  hand: "M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8a8 8 0 0 0 16 0v-3a2 2 0 0 0-4 0",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  trash: "M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V3h6v3",
  dup: "M8 8h12v12H8zM4 16V4h12",
  up: "m18 15-6-6-6 6",
  down: "m6 9 6 6 6-6",
  plus: "M12 5v14M5 12h14",
  chevron: "m9 18 6-6-6-6",
  eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  eyeoff: "M17.94 17.94A10 10 0 0 1 12 20C5 20 1 12 1 12a18 18 0 0 1 5.06-5.94M9.9 4.24A9 9 0 0 1 12 4c7 0 11 8 11 8a18 18 0 0 1-2.16 3.19M1 1l22 22",
  component: "M12 2l4 4-4 4-4-4zM6 8l4 4-4 4-4-4zM18 8l4 4-4 4-4-4zM12 14l4 4-4 4-4-4z",
  spark: "M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8",
  check: "M20 6 9 17l-5-5",
  alert: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0M12 9v4M12 17h.01",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2",
  layers: "m12 2 10 5-10 5L2 7zM2 17l10 5 10-5M2 12l10 5 10-5",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  palette: "M12 22a10 10 0 1 1 10-10c0 2.5-2 3-3.5 3H16a2 2 0 0 0-1.5 3.3A2 2 0 0 1 12 22M7.5 11a1 1 0 1 0 0-2 1 1 0 0 0 0 2M12 7.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2M16.5 11a1 1 0 1 0 0-2 1 1 0 0 0 0 2",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2",
  code: "m16 18 6-6-6-6M8 6l-6 6 6 6",
  play: "M6 4l14 8-14 8z",
  folder: "M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z",
  star: "m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2-6.2 3.2L7 14.2 2 9.3l6.9-1z",
  archive: "M21 8v13H3V8M1 3h22v5H1zM10 12h4",
  image: "M3 3h18v18H3zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M21 15l-5-5L5 21",
  back: "m15 18-6-6 6-6",
};

export function Glyph({ name, size = 14, className }: { name: string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={GLYPHS[name] ?? GLYPHS.grid} />
    </svg>
  );
}

export function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  ta.remove();
  return Promise.resolve();
}

export function useToast(): [ReactNode, (msg: string, tone?: "ok" | "bad") => void] {
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "bad"; at: number } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);
  const el = toast ? (
    <div role="status" className={cx("fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded-[3px] border bg-panel px-3 py-2 text-[12px] shadow-xl", toast.tone === "ok" ? "border-ok/40 text-fg" : "border-bad/50 text-bad")}>
      {toast.msg}
    </div>
  ) : null;
  return [el, (msg, tone = "ok") => setToast({ msg, tone, at: Date.now() })];
}
