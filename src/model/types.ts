// The interface document model.
//
// Every screen is a tree of UINodes. The visual editor, the AI Design Director
// and the code generator all read and write this one model, so the preview and
// the exported code can never drift apart: code is always generated from it.

export type NodeType =
  | "box"
  | "text"
  | "button"
  | "link"
  | "input"
  | "textarea"
  | "select"
  | "checkbox"
  | "toggle"
  | "image"
  | "icon"
  | "badge"
  | "progress"
  | "divider"
  | "table"
  | "chart";

export const NODE_TYPES: NodeType[] = [
  "box", "text", "button", "link", "input", "textarea", "select", "checkbox",
  "toggle", "image", "icon", "badge", "progress", "divider", "table", "chart",
];

/** Style keys the editor and generator understand. Values are CSS values or token refs like "$color.primary". */
export interface StyleSet {
  display?: string; // flex | grid | block | none | inline-flex | inline-block
  direction?: string; // row | column
  wrap?: string; // wrap | nowrap
  align?: string; // start | center | end | stretch | baseline
  justify?: string; // start | center | end | between | around | evenly
  gap?: string;
  gridCols?: string; // number of columns, e.g. "3", or a template like "240px 1fr"
  colSpan?: string;
  padding?: string;
  paddingX?: string;
  paddingY?: string;
  margin?: string;
  width?: string;
  height?: string;
  minHeight?: string;
  maxWidth?: string;
  flex?: string; // e.g. "1"
  position?: string; // relative | absolute | fixed | sticky
  inset?: string;
  zIndex?: string;
  overflow?: string;
  bg?: string;
  bgImage?: string;
  color?: string;
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  lineHeight?: string;
  letterSpacing?: string;
  textAlign?: string;
  textTransform?: string;
  borderWidth?: string;
  borderColor?: string;
  borderSide?: string; // all | top | right | bottom | left
  radius?: string;
  shadow?: string;
  opacity?: string;
  cursor?: string;
  backdropBlur?: string;
}

export const STYLE_KEYS: (keyof StyleSet)[] = [
  "display", "direction", "wrap", "align", "justify", "gap", "gridCols", "colSpan",
  "padding", "paddingX", "paddingY", "margin", "width", "height", "minHeight", "maxWidth",
  "flex", "position", "inset", "zIndex", "overflow", "bg", "bgImage", "color", "fontFamily",
  "fontSize", "fontWeight", "lineHeight", "letterSpacing", "textAlign", "textTransform",
  "borderWidth", "borderColor", "borderSide", "radius", "shadow", "opacity", "cursor", "backdropBlur",
];

export interface NodeProps {
  placeholder?: string;
  label?: string; // accessible label for form controls / icon buttons
  name?: string; // form field name
  inputType?: string; // text | email | password | number | date | search
  options?: string[];
  src?: string;
  alt?: string;
  href?: string;
  icon?: string;
  columns?: string[];
  rows?: string[][];
  chartType?: "bar" | "line";
  labels?: string[];
  values?: number[];
  value?: number; // progress
  max?: number;
  checked?: boolean;
  role?: string; // e.g. "dialog"
}

export interface NodeEvents {
  /** Callback prop name fired on click, e.g. "onCreateProject". */
  onClick?: string;
  /** Callback prop name fired with the new value, e.g. "onSearchChange". */
  onChange?: string;
  /** Callback prop name fired with form values (box tag="form" only). */
  onSubmit?: string;
  /** Route passed to onNavigate(route) on click. */
  navigate?: string;
  /** Id of a node whose visibility this element toggles (modals, dropdowns, drawers). */
  toggle?: string;
}

export type Animation = "none" | "fade-in" | "slide-up" | "scale-in" | "pulse";

export interface UINode {
  id: string;
  type: NodeType;
  /** Layer name shown in the hierarchy. */
  name: string;
  /** Semantic HTML tag for box/text nodes (div, section, header, nav, aside, main, footer, form, h1..h6, p, span, label). */
  tag?: string;
  text?: string;
  props?: NodeProps;
  style: StyleSet;
  /** Overrides at the md (>=768px) and lg (>=1024px) breakpoints. */
  md?: StyleSet;
  lg?: StyleSet;
  hover?: StyleSet;
  focus?: StyleSet;
  events?: NodeEvents;
  /** Prop name that supplies this node's text/data in exported code, e.g. "revenueTotal". The node's own content becomes labelled example data. */
  bind?: string;
  /** When set, the node's subtree is exported as its own component file with this PascalCase name. */
  component?: string;
  /** Hidden until toggled by another node's events.toggle. */
  hidden?: boolean;
  animation?: Animation;
  children: string[];
}

export type ColorMode = "light" | "dark";

export interface Tokens {
  color: Record<ColorMode, Record<string, string>>;
  defaultMode: ColorMode;
  font: Record<string, string>;
  fontSize: Record<string, string>;
  fontWeight: Record<string, string>;
  space: Record<string, string>;
  radius: Record<string, string>;
  shadow: Record<string, string>;
  texture: Record<string, string>;
  motion: Record<string, string>;
  size: Record<string, string>;
  breakpoint: Record<string, string>;
  iconography: { style: string; strokeWidth: string };
  animationPrinciples: string;
}

export interface Screen {
  id: string;
  name: string; // PascalCase-ish display name
  route: string;
  rootId: string;
}

export type Framework = "react" | "nextjs";
export type Language = "ts" | "js";
export type Styling = "tailwind" | "css-modules" | "plain-css";

export interface CompatSettings {
  framework: Framework;
  language: Language;
  styling: Styling;
  tailwindVersion: "3" | "4";
  componentLibrary: string; // "none" or name
  iconLibrary: string; // "inline-svg" | "lucide-react"
  animationLibrary: string; // "css" | "framer-motion"
  conventions: string; // free text, e.g. "components in src/ui, named exports"
}

export interface Version {
  id: string;
  label: string;
  createdAt: number;
  snapshot: ProjectData;
}

/** The editable content of a project (what undo/redo and versions capture). */
export interface ProjectData {
  tokens: Tokens;
  nodes: Record<string, UINode>;
  screens: Screen[];
}

export type ValidationLevel = "untested" | "partial" | "passed" | "failed";

export interface Project extends ProjectData {
  id: string;
  name: string;
  description: string;
  folder: string;
  tags: string[];
  notes: string;
  favorite: boolean;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
  compat: CompatSettings;
  versions: Version[];
  /** Fingerprint of ProjectData at the last validation, so edits invalidate the status. */
  validation?: { fingerprint: string; level: ValidationLevel; at: number; readyForExport: boolean };
  /** Variations generated from the same requirements. */
  variations: Variation[];
  /** Image references uploaded for this project (data URLs). */
  references: Reference[];
}

export interface Variation {
  id: string;
  label: string;
  mode: string;
  createdAt: number;
  data: ProjectData;
  favorite?: boolean;
}

export interface Reference {
  id: string;
  name: string;
  dataUrl: string;
  mediaType: string;
  note?: string;
}

/** A reusable component saved to the cross-project library. */
export interface SavedComponent {
  id: string;
  name: string;
  tags: string[];
  createdAt: number;
  rootId: string;
  nodes: Record<string, UINode>;
}

/** A saved visual identity (design system) that can be applied to any project. */
export interface SavedDesignSystem {
  id: string;
  name: string;
  createdAt: number;
  tokens: Tokens;
  source?: string; // "foundry" | "imported" | "moodlab"
}
