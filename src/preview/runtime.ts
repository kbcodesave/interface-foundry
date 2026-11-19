import * as React from "react";
import * as JsxRuntime from "react/jsx-runtime";
import { transform } from "sucrase";

// A tiny CommonJS module system that runs the generated files as-is.
// The preview executes the same code that gets exported (plus data-if-*
// attributes for selection), so preview and export cannot drift apart.

export interface CompileError {
  file: string;
  message: string;
}

export interface CompiledModules {
  modules: Record<string, Record<string, unknown>>;
  errors: CompileError[];
}

export function transpile(file: string, code: string): { code?: string; error?: string } {
  try {
    const out = transform(code, {
      transforms: ["typescript", "jsx", "imports"],
      jsxRuntime: "automatic",
      production: true,
      filePath: file,
    });
    return { code: out.code };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function normalize(from: string, spec: string): string {
  const parts = from.split("/").slice(0, -1);
  for (const seg of spec.split("/")) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

const EXTERNALS: Record<string, unknown> = { react: React, "react/jsx-runtime": JsxRuntime };

export function compileFiles(files: Record<string, string>, openIds: string[] = []): CompiledModules {
  const errors: CompileError[] = [];
  const compiled: Record<string, string> = {};
  for (const [file, code] of Object.entries(files)) {
    if (!/\.(tsx?|jsx?)$/.test(file)) continue;
    const r = transpile(file, code);
    if (r.error) errors.push({ file, message: r.error });
    else compiled[file] = r.code!;
  }
  const cache: Record<string, Record<string, unknown>> = {};
  const load = (file: string): Record<string, unknown> => {
    if (cache[file]) return cache[file];
    const src = compiled[file];
    if (src === undefined) throw new Error(`Module not found: ${file}`);
    const module = { exports: {} as Record<string, unknown> };
    cache[file] = module.exports;
    const req = (spec: string) => {
      if (spec in EXTERNALS) return EXTERNALS[spec];
      if (!spec.startsWith(".")) throw new Error(`Unsupported import "${spec}" in ${file}`);
      const base = normalize(file, spec);
      for (const cand of [base, `${base}.tsx`, `${base}.ts`, `${base}.jsx`, `${base}.js`, `${base}/index.ts`]) {
        if (cand in compiled) return load(cand);
      }
      if (`${base}.css` in files || base.endsWith(".css")) return {};
      throw new Error(`Broken import "${spec}" in ${file}`);
    };
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function("require", "module", "exports", "__IF_OPEN__", src);
    fn(req, module, module.exports, openIds);
    cache[file] = module.exports;
    return module.exports;
  };
  for (const file of Object.keys(compiled)) {
    try {
      load(file);
    } catch (e) {
      errors.push({ file, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return { modules: cache, errors };
}

export const FRAME_STYLE = `
html, body { margin: 0; min-height: 100%; background: #0c0d0e; }
#if-mount { min-height: 100vh; }
[data-if-mode="select"] [data-if-id] { cursor: default !important; }
[data-if-hover] { outline: 1px dashed rgba(255,107,26,0.8) !important; outline-offset: -1px; }
[data-if-selected] { outline: 2px solid #ff6b1a !important; outline-offset: -2px; }
[data-if-show-example] [data-if-example] { outline: 1px dashed rgba(242,177,52,0.9); outline-offset: 1px; position: relative; }
[data-if-show-example] [data-if-example]::after { content: "example data"; position: absolute; top: -9px; right: 0; font: 9px/1 'IBM Plex Mono', monospace; letter-spacing: .04em; text-transform: uppercase; background: #f2b134; color: #140a03; padding: 1px 3px; pointer-events: none; z-index: 9999; }
`;

export function frameDoc(tailwindUrl: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${FRAME_STYLE}</style><style id="if-foundry-css"></style>
<script src="${tailwindUrl}"></script></head><body><div id="if-mount"></div></body></html>`;
}
