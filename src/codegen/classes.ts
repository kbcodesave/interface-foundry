import type { ColorMode, StyleSet, Tokens } from "../model/types";

/** Token groups that may be referenced from style values as $group.name. */
export const TOKEN_GROUPS = ["color", "font", "fontSize", "fontWeight", "space", "radius", "shadow", "texture", "motion", "size"] as const;
export type TokenGroup = (typeof TOKEN_GROUPS)[number];

const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

export function cssVarName(group: string, name: string): string {
  return `--if-${kebab(group)}-${name.replace(/[^a-zA-Z0-9-]/g, "-")}`;
}

const TOKEN_RE = /\$([a-zA-Z]+)\.([a-zA-Z0-9-]+)/g;

/** Replace $group.name references with CSS variables. */
export function tokenToVar(value: string): string {
  return value.replace(TOKEN_RE, (_m, g: string, n: string) => `var(${cssVarName(g, n)})`);
}

/** Resolve token references to literal values (for checks such as contrast). */
export function resolveValue(value: string | undefined, tokens: Tokens, mode: ColorMode = tokens.defaultMode): string | undefined {
  if (value == null) return value;
  return value.replace(TOKEN_RE, (m, g: string, n: string) => {
    if (g === "color") return tokens.color[mode]?.[n] ?? m;
    const group = (tokens as unknown as Record<string, Record<string, string> | undefined>)[g];
    return group?.[n] ?? m;
  });
}

export function tokenRefs(value: string): { group: string; name: string }[] {
  return [...value.matchAll(TOKEN_RE)].map((m) => ({ group: m[1], name: m[2] }));
}

/** Escape a CSS value for use inside a Tailwind arbitrary value [..]. */
function arb(value: string): string {
  return tokenToVar(value.trim())
    .replace(/['"]/g, "")
    .replace(/_/g, "\\_")
    .replace(/\s*,\s*/g, ",")
    .replace(/\s+/g, "_");
}

const SIMPLE: Record<string, Record<string, string>> = {
  display: { flex: "flex", grid: "grid", block: "block", none: "hidden", "inline-flex": "inline-flex", "inline-block": "inline-block", inline: "inline" },
  direction: { column: "flex-col", row: "flex-row", "column-reverse": "flex-col-reverse", "row-reverse": "flex-row-reverse" },
  wrap: { wrap: "flex-wrap", nowrap: "flex-nowrap" },
  align: { start: "items-start", center: "items-center", end: "items-end", stretch: "items-stretch", baseline: "items-baseline" },
  justify: { start: "justify-start", center: "justify-center", end: "justify-end", between: "justify-between", around: "justify-around", evenly: "justify-evenly" },
  position: { relative: "relative", absolute: "absolute", fixed: "fixed", sticky: "sticky", static: "static" },
  overflow: { auto: "overflow-auto", hidden: "overflow-hidden", visible: "overflow-visible", scroll: "overflow-scroll" },
  textAlign: { left: "text-left", center: "text-center", right: "text-right", justify: "text-justify" },
  textTransform: { uppercase: "uppercase", lowercase: "lowercase", capitalize: "capitalize", none: "normal-case" },
  cursor: { pointer: "cursor-pointer", default: "cursor-default", "not-allowed": "cursor-not-allowed" },
};

const SIDE: Record<string, string> = { all: "", top: "-t", right: "-r", bottom: "-b", left: "-l", x: "-x", y: "-y" };

function one(key: keyof StyleSet, raw: string, style: StyleSet): string[] {
  const v = raw.trim();
  if (!v) return [];
  const simple = SIMPLE[key];
  if (simple) return simple[v] ? [simple[v]] : [];
  switch (key) {
    case "gap": return [`gap-[${arb(v)}]`];
    case "gridCols": return /^\d+$/.test(v) ? [`grid-cols-${Math.min(12, Number(v))}`] : [`grid-cols-[${arb(v)}]`];
    case "colSpan": return v === "full" ? ["col-span-full"] : /^\d+$/.test(v) ? [`col-span-${v}`] : [];
    case "padding": return [`p-[${arb(v)}]`];
    case "paddingX": return [`px-[${arb(v)}]`];
    case "paddingY": return [`py-[${arb(v)}]`];
    case "margin": return v === "auto" ? ["m-auto"] : v === "0 auto" ? ["mx-auto"] : [`m-[${arb(v)}]`];
    case "width": return v === "100%" ? ["w-full"] : v === "auto" ? ["w-auto"] : [`w-[${arb(v)}]`, "shrink-0"];
    case "height": return v === "100%" ? ["h-full"] : v === "auto" ? ["h-auto"] : [`h-[${arb(v)}]`];
    case "minHeight": return v === "100vh" ? ["min-h-screen"] : [`min-h-[${arb(v)}]`];
    case "maxWidth": return v === "none" ? ["max-w-none"] : [`max-w-[${arb(v)}]`];
    case "flex": return v === "1" ? ["flex-1", "min-w-0"] : v === "none" ? ["flex-none"] : [`flex-[${arb(v)}]`];
    case "inset": return v === "0" ? ["inset-0"] : [`inset-[${arb(v)}]`];
    case "zIndex": return [`z-[${arb(v)}]`];
    case "bg": return v === "transparent" ? ["bg-transparent"] : [`bg-[color:${arb(v)}]`];
    case "bgImage": {
      if (v === "none" || v === "$texture.none") return [];
      const out = [`bg-[image:${arb(v)}]`];
      if (v.includes("texture.grid")) out.push("bg-[size:24px_24px]");
      return out;
    }
    case "color": return [`text-[color:${arb(v)}]`];
    case "fontFamily": return [`font-[family-name:${arb(v)}]`];
    case "fontSize": return [`text-[length:${arb(v)}]`];
    case "fontWeight": return [`font-[number:${arb(v)}]`];
    case "lineHeight": return [`leading-[${arb(v)}]`];
    case "letterSpacing": return [`tracking-[${arb(v)}]`];
    case "borderWidth": {
      const side = SIDE[style.borderSide ?? "all"] ?? "";
      return [`border${side}-[length:${arb(v)}]`, "border-solid"];
    }
    case "borderColor": return [`border-[color:${arb(v)}]`];
    case "borderSide": return [];
    case "radius": return [`rounded-[${arb(v)}]`];
    case "shadow": return v === "none" || v === "$shadow.none" ? ["shadow-none"] : [`shadow-[${arb(v)}]`];
    case "opacity": return [`opacity-[${arb(v)}]`];
    case "backdropBlur": return [`backdrop-blur-[${arb(v)}]`];
    default: return [];
  }
}

export function styleToClasses(style: StyleSet | undefined, variant = ""): string[] {
  if (!style) return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(style)) {
    if (typeof v !== "string") continue;
    for (const c of one(k as keyof StyleSet, v, style)) out.push(variant + c);
  }
  return out;
}

/** Literal CSS values a node uses that bypass the token system (used by the consistency check). */
export function rawColorValues(style: StyleSet | undefined): string[] {
  if (!style) return [];
  return (["bg", "color", "borderColor"] as const)
    .map((k) => style[k])
    .filter((v): v is string => !!v && !v.includes("$") && /#|rgb|hsl/.test(v));
}
