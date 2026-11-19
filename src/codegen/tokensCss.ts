import type { Tokens } from "../model/types";
import { cssVarName } from "./classes";

const GROUPS: (keyof Tokens)[] = ["font", "fontSize", "fontWeight", "space", "radius", "shadow", "texture", "motion", "size"];

function block(vars: [string, string][], indent = "  "): string {
  return vars.map(([k, v]) => `${indent}${k}: ${v};`).join("\n");
}

/**
 * Design tokens as CSS custom properties, scoped to `.if-root` so they can't
 * leak into or override anything in the host application.
 */
export function tokensToCss(tokens: Tokens): string {
  const shared: [string, string][] = [];
  for (const g of GROUPS) {
    const group = tokens[g] as Record<string, string>;
    for (const [name, value] of Object.entries(group)) shared.push([cssVarName(g, name), value]);
  }
  const colors = (mode: "light" | "dark") =>
    Object.entries(tokens.color[mode]).map(([name, value]) => [cssVarName("color", name), value] as [string, string]);
  const def = tokens.defaultMode;
  const other = def === "dark" ? "light" : "dark";
  return `/* Interface Foundry design tokens. Everything is scoped to .if-root. */
.if-root {
${block(shared)}
${block(colors(def))}
}
.if-root[data-theme="${other}"] {
${block(colors(other))}
}
.if-root[data-theme="${def}"] {
${block(colors(def))}
}
`;
}

export const ANIMATION_CSS = `/* Animations: keyframes are prefixed if- to avoid name collisions; classes are scoped to .if-root. */
@keyframes if-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes if-slide-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes if-scale-in { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: none; } }
@keyframes if-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
.if-root .if-anim-fade-in, .if-root.if-anim-fade-in { animation: if-fade-in var(--if-motion-base) var(--if-motion-easing) both; }
.if-root .if-anim-slide-up, .if-root.if-anim-slide-up { animation: if-slide-up var(--if-motion-slow) var(--if-motion-easing) both; }
.if-root .if-anim-scale-in, .if-root.if-anim-scale-in { animation: if-scale-in var(--if-motion-base) var(--if-motion-easing) both; }
.if-root .if-anim-pulse, .if-root.if-anim-pulse { animation: if-pulse 1.6s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .if-root *, .if-root { animation-duration: 1ms !important; animation-iteration-count: 1 !important; transition-duration: 1ms !important; }
}
/* No element resets here on purpose: unlayered resets would override Tailwind utilities.
   Tailwind's own Preflight (on by default) provides the base styles these components expect. */
`;

export const ANIMATION_KEYFRAMES = ["if-fade-in", "if-slide-up", "if-scale-in", "if-pulse"];

export function tokensToJson(tokens: Tokens): string {
  return JSON.stringify({ $schema: "interface-foundry/tokens@1", ...tokens }, null, 2);
}
