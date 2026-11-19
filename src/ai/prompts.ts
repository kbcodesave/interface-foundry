import { ICON_NAMES } from "../codegen/icons";

export const CREATIVE_MODES: { id: string; label: string; brief: string }[] = [
  { id: "minimal", label: "Minimal", brief: "Reduction to essentials. Generous whitespace, one typeface, hairline dividers, color used only for meaning." },
  { id: "industrial", label: "Industrial", brief: "Heavy-equipment and control-room cues: dense information, monospace labels, hazard-orange accents, hard edges, rivet-like detailing via borders." },
  { id: "editorial", label: "Editorial", brief: "Magazine sensibility: strong typographic hierarchy, serif display type, asymmetric columns, pull-quote scale contrasts." },
  { id: "experimental", label: "Experimental", brief: "Break conventions deliberately: unusual grids, oversized type, unexpected color pairings, while staying usable." },
  { id: "retro-digital", label: "Retro Digital", brief: "Early-2000s / late-90s software: bevelled panels, tight pixel-ish type, saturated blues and silvers, toolbar chrome." },
  { id: "frutiger-aero", label: "Frutiger Aero", brief: "Glossy optimism of the mid-2000s: sky gradients, translucent glass panels, soft highlights, aqua and grass greens." },
  { id: "skeuomorphic", label: "Skeuomorphic", brief: "Tactile materials: brushed metal, stitched leather, inset wells, real shadows and light direction." },
  { id: "technical", label: "Technical", brief: "Engineering instrument: blueprint grids, measured spacing, monospace data, labelled axes, precise 1px rules." },
  { id: "architectural", label: "Architectural", brief: "Plans and elevations: strict modular grid, large negative space, thin weights, stone and concrete neutrals." },
  { id: "luxury", label: "Luxury", brief: "Quiet confidence: restrained palette, refined serif or high-contrast sans, slow motion, tight letterspaced caps." },
  { id: "futuristic", label: "Futuristic", brief: "Forward-looking HUD: dark depth, luminous accents, thin geometric type, layered translucent panels." },
];

const SCHEMA_GUIDE = `
INTERFACE MODEL (what you emit)
An interface is a list of screens. Each screen is a FLAT list of nodes; each node names its parent by id (the screen's root node has parent null). Children render in list order.

Node fields:
- id: short unique id (e.g. "sidebar", "kpi_revenue"). Unique across ALL screens.
- parent: parent node id, or null for the screen root.
- type: one of box | text | button | link | input | textarea | select | checkbox | toggle | image | icon | badge | progress | divider | table | chart
- name: human layer name ("Sidebar", "Revenue card").
- tag: semantic HTML for box (div, section, header, nav, aside, main, footer, form, article, ul, li) or text (h1-h6, p, span, label, small, code).
- text: visible text for text/button/link/badge nodes. Buttons and links may instead contain child nodes (icon + text).
- props: placeholder, label (accessible name: REQUIRED for inputs/selects/textarea and icon-only buttons), name (form field name), inputType, options (select), src/alt (image), icon (one of: ${ICON_NAMES.join(", ")}), columns + rows (table, rows are arrays of strings), chartType ("bar"|"line") + labels + values (chart), value + max (progress), checked, role ("dialog" for modal overlays).
- style / md / lg / hover / focus: style objects. "md" and "lg" override at >=768px and >=1024px (mobile-first: style is the phone layout). Keys:
  display (flex|grid|block|none|inline-flex), direction (row|column), wrap, align (start|center|end|stretch|baseline), justify (start|center|end|between|around|evenly), gap, gridCols ("3" or a template like "240px 1fr"), colSpan, padding, paddingX, paddingY, margin, width, height, minHeight, maxWidth, flex ("1"), position, inset, zIndex, overflow, bg, bgImage, color, fontFamily, fontSize, fontWeight, lineHeight, letterSpacing, textAlign, textTransform, borderWidth, borderColor, borderSide (all|top|right|bottom|left), radius, shadow, opacity, cursor, backdropBlur.
  Values are CSS values OR design-token references written $group.name, e.g. "$color.surface", "$space.4", "$radius.md", "$font.mono", "$fontSize.lg", "$fontWeight.semibold", "$shadow.md", "$texture.grid", "$size.sidebar-w". Multiple refs may appear in one value ("$space.2 $space.4").
  ALWAYS use token references for colors, fonts, font sizes, weights, spacing, radii and shadows. Literal values are only for one-off geometry (widths like "320px", percentages, letterSpacing, opacity).
- events: onClick (callback prop name, e.g. "onApproveInvoice"), onChange (callback prop name), onSubmit (on a box with tag "form"), navigate (route of another screen, e.g. "/projects"), toggle (id of a node with hidden:true that this element opens/closes: modals, dropdowns, drawers, menus).
- bind: prop name that will feed this node real data in the host app (e.g. "projects" on a table, "revenueTotal" on a KPI value text). The node's own text/rows become clearly labelled example data.
- component: PascalCase name if this subtree should be exported as its own reusable component file (Sidebar, TopBar, KpiCard, ProjectsTable, NewProjectDialog). Use it for meaningful units, not every box.
- hidden: true for overlays/menus that start closed; they need a toggler in the same component or screen.
- animation: none | fade-in | slide-up | scale-in | pulse.

TOKENS (design system)
tokens.color.dark and tokens.color.light: semantic color maps with at least bg, surface, surface-raised, border, text, text-muted, primary, primary-text, secondary, accent, success, warning, danger (add more if useful). defaultMode: "dark" | "light".
tokens.font (display, body, mono: full CSS font stacks; only use fonts that are installed by default or are very widely available, and always end with a generic family), fontSize (xs..3xl or similar), fontWeight, space (1..12 style scale), radius, shadow, texture (CSS background-image values; "grid" is rendered with a 24px tile), motion (fast, base, slow, easing), size (component dimensions such as control-h, sidebar-w, topbar-h), iconography {style, strokeWidth}, animationPrinciples (one sentence).
`;

const DESIGN_RULES = `
DESIGN STANDARDS
- Design for the application's real users and workflow. Decide what the primary task on each screen is and give it visual priority. Information density should match the domain (operations tools are dense; consumer onboarding is airy).
- Never fall back to the generic "AI SaaS dashboard" look (purple gradients, rounded white cards everywhere, emoji icons, centered hero + 3 feature cards). Commit to a specific, coherent visual direction with a reason.
- Build a real layout: navigation, page header with the primary action, content regions, empty/secondary states where natural. Mobile first: the base style must work at 375px wide (no horizontal overflow; sidebars collapse with display none at base and display flex at md), then enhance at md/lg.
- Make interactions real: navigation links use events.navigate between the screens you create; primary actions call callback props; modals/drawers/menus use hidden + toggle and include a close control; forms use tag "form" + onSubmit with named, labelled inputs.
- Accessibility: every input/select/textarea has props.label; icon-only buttons have props.label; text has sufficient contrast against its background (WCAG AA: 4.5:1 for body text); use semantic tags (header, nav, main, aside, section, h1-h3).
- Use realistic, domain-appropriate example content (names, figures, statuses). Bind data-bearing nodes (tables, charts, KPI values, user names) with "bind" so the host app can supply real data.
- Keep presentation separate from logic: no fetching, no auth, no business rules; just props and callbacks.
- Respect third-party rights: when given references, extract characteristics (palette relationships, type character, spacing rhythm, materials, layout logic) and create an original interface. Do not reproduce logos, trademarks, brand names, proprietary illustrations or a recognisable copy of a specific product's composition.
`;

export function generationSystem(): string {
  return `You are the interface-generation engine of INTERFACE FOUNDRY, a professional tool that designs complete application user interfaces which are later exported as clean React + TypeScript + Tailwind code.
You do not write code. You design the interface as a structured model, and Foundry generates the code from it deterministically. Call the emit_interface tool exactly once with the complete result.
${SCHEMA_GUIDE}
${DESIGN_RULES}
Produce between 1 and 4 screens unless the request clearly asks for more. A typical screen has 40-160 nodes. Every screen root should set bg, color and fontFamily from tokens and minHeight "100vh".`;
}

export function directorSystem(): string {
  return `You are the AI Design Director inside INTERFACE FOUNDRY. You make targeted, controlled edits to an existing interface model by calling the apply_edits tool once.
${SCHEMA_GUIDE}
EDITING RULES
- Change ONLY what the request asks for. If asked about typography, touch only font-related tokens/styles. Do not rebuild layouts, rename nodes, or restyle unrelated components.
- Prefer the smallest edit that achieves the request: a token change that updates everything consistently beats editing 40 nodes; a style patch beats replacing a subtree.
- When a node is selected and scope is "selection", every node op must target that node or its descendants, and token edits are not allowed.
- Ops:
  {"op":"update","id":..., "style":{...}, "md":{...}, "lg":{...}, "hover":{...}, "focus":{...}, "text":..., "props":{...}, "events":{...}, "name":..., "tag":..., "bind":..., "component":..., "hidden":..., "animation":...}  (style-like objects are MERGED; set a key to null to remove it; props/events are merged too)
  {"op":"insert","parent":<existing id>,"index":<number>,"nodes":[flat node list; top-level nodes use parent = the given parent id]}
  {"op":"remove","id":...}
  {"op":"move","id":...,"parent":...,"index":...}
  {"op":"tokens","tokens":{partial token object, e.g. {"font":{"body":"..."}} or {"color":{"dark":{"primary":"#..."}}}}}
- In "summary", say in one or two sentences what you changed and what you deliberately left alone.
${DESIGN_RULES}`;
}

export function referenceSystem(): string {
  return `You analyse visual references for INTERFACE FOUNDRY. For each image, describe its visual characteristics so they can inspire an ORIGINAL application interface. Call the report_references tool once.
Cover: layout structure, color system (give hex estimates), typography character (classification, weight, case, spacing; suggest widely available font stacks with similar character), materials and textures, spacing rhythm, component shapes, navigation patterns, visual hierarchy, animation/motion cues implied, depth and lighting, and historical design influences.
Also flag anything that must not be copied (logos, trademarks, brand names, distinctive proprietary artwork). Then propose a design-token set that captures the combined atmosphere without reproducing any specific composition.`;
}

const nodeSchema = {
  type: "object",
  description: "A node in the flat node list.",
  properties: {
    id: { type: "string" },
    parent: { type: ["string", "null"] },
    type: { type: "string" },
    name: { type: "string" },
    tag: { type: "string" },
    text: { type: "string" },
    props: { type: "object" },
    style: { type: "object" },
    md: { type: "object" },
    lg: { type: "object" },
    hover: { type: "object" },
    focus: { type: "object" },
    events: { type: "object" },
    bind: { type: "string" },
    component: { type: "string" },
    hidden: { type: "boolean" },
    animation: { type: "string" },
  },
  required: ["id", "parent", "type", "name"],
};

export const EMIT_INTERFACE_TOOL = {
  name: "emit_interface",
  description: "Return the complete generated interface: design tokens and screens as flat node lists.",
  eager_input_streaming: true,
  input_schema: {
    type: "object" as const,
    properties: {
      name: { type: "string", description: "Short product/interface name." },
      summary: { type: "string", description: "Two or three sentences: the visual direction you chose and why it fits the users." },
      tokens: { type: "object", description: "Design tokens (see system prompt)." },
      screens: {
        type: "array",
        items: {
          type: "object",
          properties: { name: { type: "string" }, route: { type: "string" }, nodes: { type: "array", items: nodeSchema } },
          required: ["name", "route", "nodes"],
        },
      },
    },
    required: ["name", "summary", "tokens", "screens"],
  },
};

export const APPLY_EDITS_TOOL = {
  name: "apply_edits",
  description: "Apply targeted edits to the current interface model.",
  eager_input_streaming: true,
  input_schema: {
    type: "object" as const,
    properties: {
      summary: { type: "string" },
      ops: { type: "array", items: { type: "object", properties: { op: { type: "string" } }, required: ["op"] } },
    },
    required: ["summary", "ops"],
  },
};

export const REPORT_REFERENCES_TOOL = {
  name: "report_references",
  description: "Report the visual analysis of the reference images.",
  eager_input_streaming: true,
  input_schema: {
    type: "object" as const,
    properties: {
      references: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "number" },
            layout: { type: "string" },
            color: { type: "string" },
            typography: { type: "string" },
            materials: { type: "string" },
            spacing: { type: "string" },
            shapes: { type: "string" },
            navigation: { type: "string" },
            hierarchy: { type: "string" },
            motion: { type: "string" },
            depth: { type: "string" },
            influences: { type: "string" },
            doNotCopy: { type: "string" },
          },
          required: ["index"],
        },
      },
      synthesis: { type: "string", description: "How the references could combine into one original direction." },
      tokens: { type: "object", description: "Suggested design tokens (same structure as Foundry tokens)." },
    },
    required: ["references", "synthesis"],
  },
};
