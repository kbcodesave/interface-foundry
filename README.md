# Interface Foundry

AI-powered UI design, generation and export studio. Design and finalise an application's interface on its own, then export a clean React + TypeScript + Tailwind package that plugs into an existing project through props and callbacks, without touching its logic.

```sh
npm install
npm run dev        # http://localhost:5173
npm run check      # type check, unit tests, and the export host check
```

AI features need an Anthropic API key, entered in Settings. It is stored only in your browser (IndexedDB) and requests go straight from the browser to `api.anthropic.com`. The default model is Claude Opus 5.5, and you can change it in Settings.

## How it works

The core idea is that **the AI never writes code**. Every screen is a tree of nodes (`src/model/types.ts`) that uses design-token references such as `$color.primary` and `$space.4`. Three things read and write that one model:

- the **visual editor** (layers, inspector, token editor, component library),
- the **AI** (generation and the Design Director return structured nodes or edit operations, which are sanitised in `src/model/sanitize.ts` and `src/model/applyOps.ts`),
- the **code generator** (`src/codegen/generate.ts`), which deterministically writes React + TypeScript + Tailwind.

The live preview runs **the generated code itself**. It is transpiled in the browser with sucrase and rendered in an iframe with the Tailwind runtime, with `data-if-*` attributes added only for click-to-select. So what you see in the editor is literally what gets exported, and every visual edit updates the code.

## What's in this first version

| Area | Status |
| --- | --- |
| AI interface generation (prompt, output type, creative direction) | Working |
| Visual references: upload, analysis, generate from references | Working (analysis and inspiration; no pixel copying) |
| Visual editor: select in preview, layer tree with drag-and-drop, inspector with numeric and token controls, responsive (≥768 / ≥1024), hover and focus states, animations, duplicate and delete, undo/redo, autosave, version history | Working |
| Component library: 26 templates across navigation, data, forms and visual elements, plus saving your own components across projects | Working |
| Design systems: global token editor (light and dark colors, type, spacing, radii, shadows, textures, motion, sizes), save and apply identities, import tokens.json or W3C-style tokens | Working. MOODLAB import is waiting on a sample of its theme format |
| AI Design Director with scoped edits (locked to the selection) | Working |
| Variation engine: up to 4 creative modes in parallel, saved per project, side-by-side compare, AI combine | Working |
| Interactive preview: desktop, tablet, mobile and fluid widths, select and interact modes, navigation between screens, modals, menus, forms, light and dark, example-data labels | Working |
| Export: copy component, copy page, component package, full UI package (.zip), integration instructions, AI integration prompt, design system | Working for React and Next.js, TypeScript and JavaScript, Tailwind v3 and v4 |
| Validation: syntax, imports, undefined components, prop conflicts, accessible names, WCAG contrast, token consistency, global CSS, animations, assets, performance, render at 3 widths, overflow, keyboard, simulated clicks | Working. Type check and your app's build are reported as **not run** |
| Project library: folders, tags, search, favorites, duplicate, archive, delete | Working (local to the browser) |

### Honest limits

- Storage is local to the browser (IndexedDB). There are no accounts or cloud sync yet.
- CSS Modules and plain HTML/CSS output, component-library mapping (shadcn, MUI…), lucide-react and Framer Motion output are selectable but produce a warning, and the export stays Tailwind with inline SVG and CSS keyframes.
- The in-browser validator does not run `tsc`. The `npm run test:export` script does: it exports sample projects into a throwaway Vite host app and runs strict TypeScript and a production build there (also in CI).
- Canvas drag-and-drop works in the layer tree. On the canvas you select and edit with the inspector.
- Creative intelligence (learning preferences from your history, section 13 of the spec) is not built yet.

## Proposed phasing

1. **Phase 1 (this version):** model, generator, editor, tokens, AI generation and Director, references, variations, export package, validation, local library.
2. **Phase 2, accounts and persistence:** sign-in, cloud storage and sync, sharing, shared component and design-system libraries across devices. This needs a small backend (for example Supabase or a Node API), and it's where the API key could move server-side.
3. **Phase 3, compatibility breadth:** CSS Modules and plain CSS output, shadcn/ui and Radix mapping, lucide-react icons, Framer Motion, importing a host project's Tailwind config or tokens, convention-aware file layout.
4. **Phase 4, editing depth:** direct manipulation on the canvas (drag to move, resize handles), multi-select, component variants and states, more chart types, data-grid features.
5. **Phase 5, creative intelligence:** a taste profile built from favorites, kept and rejected variations, and edits; suggestions and "outside my usual style" generation; MOODLAB theme import.
6. **Phase 6, deeper validation:** in-browser TypeScript checking, axe-core accessibility audit, visual regression between versions.

## Project layout

```
src/model/       interface model, defaults, tree ops, AI sanitiser, Director ops
src/codegen/     style→Tailwind mapping, code generator, tokens CSS, icons
src/preview/     in-browser module runtime and preview iframe
src/validate/    validation checks (static + render/interaction tests)
src/export/      ZIP package, manifest, README, AI integration prompt
src/ai/          Claude API client and prompts
src/library/     built-in component templates
src/store/       IndexedDB persistence, undo/redo project store
src/ui/          editor UI
scripts/         export host check (tsc + build of exported code)
tests/           unit tests (vitest)
```
