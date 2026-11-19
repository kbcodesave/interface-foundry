import type { CompatSettings, Project, ProjectData, Tokens, UINode } from "./types";

let counter = 0;
export function uid(prefix = "n"): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}${counter.toString(36)}`;
}

export const DEFAULT_TOKENS: Tokens = {
  color: {
    dark: {
      bg: "#0c0d0e",
      surface: "#16181a",
      "surface-raised": "#1e2124",
      border: "#2c3034",
      text: "#e9e6e1",
      "text-muted": "#9a9893",
      primary: "#ff6b1a",
      "primary-text": "#140a03",
      secondary: "#3a4046",
      accent: "#f2b134",
      success: "#4cc38a",
      warning: "#f2b134",
      danger: "#ef5b4c",
    },
    light: {
      bg: "#f4f2ee",
      surface: "#ffffff",
      "surface-raised": "#faf9f7",
      border: "#d9d5ce",
      text: "#17181a",
      "text-muted": "#5f5d58",
      primary: "#c9480b",
      "primary-text": "#ffffff",
      secondary: "#e4e0d9",
      accent: "#a86a00",
      success: "#1e7d4f",
      warning: "#9a6400",
      danger: "#c2321f",
    },
  },
  defaultMode: "dark",
  font: {
    display: "'IBM Plex Sans', system-ui, sans-serif",
    body: "'IBM Plex Sans', system-ui, sans-serif",
    mono: "'IBM Plex Mono', ui-monospace, monospace",
  },
  fontSize: { xs: "11px", sm: "13px", md: "15px", lg: "18px", xl: "22px", "2xl": "28px", "3xl": "36px" },
  fontWeight: { regular: "400", medium: "500", semibold: "600", bold: "700" },
  space: { "1": "4px", "2": "8px", "3": "12px", "4": "16px", "5": "20px", "6": "24px", "8": "32px", "10": "40px", "12": "48px" },
  radius: { none: "0px", sm: "2px", md: "4px", lg: "8px", full: "999px" },
  shadow: {
    none: "none",
    sm: "0 1px 0 rgba(0,0,0,0.35)",
    md: "0 4px 16px rgba(0,0,0,0.35)",
    lg: "0 16px 48px rgba(0,0,0,0.5)",
  },
  texture: {
    none: "none",
    grid: "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
    noise: "repeating-linear-gradient(45deg, rgba(255,255,255,0.012) 0 2px, transparent 2px 4px)",
  },
  motion: { fast: "120ms", base: "200ms", slow: "360ms", easing: "cubic-bezier(0.2, 0, 0, 1)" },
  size: { "control-h": "36px", "sidebar-w": "240px", "topbar-h": "56px" },
  breakpoint: { md: "768px", lg: "1024px" },
  iconography: { style: "outline", strokeWidth: "1.75" },
  animationPrinciples: "Short, deliberate transitions. Motion confirms an action; it never decorates.",
};

export const DEFAULT_COMPAT: CompatSettings = {
  framework: "react",
  language: "ts",
  styling: "tailwind",
  tailwindVersion: "4",
  componentLibrary: "none",
  iconLibrary: "inline-svg",
  animationLibrary: "css",
  conventions: "",
};

function n(partial: Partial<UINode> & { id: string; type: UINode["type"] }): UINode {
  return { name: partial.type, style: {}, children: [], ...partial };
}

/** A small hand-built starter so the editor is useful before any AI call. */
export function starterData(): ProjectData {
  const nodes: Record<string, UINode> = {};
  const add = (node: UINode) => {
    nodes[node.id] = node;
    return node.id;
  };
  const kpi = (id: string, label: string, value: string, bind: string) => {
    add(n({ id: `${id}_l`, type: "text", tag: "p", name: "Label", text: label, style: { fontSize: "$fontSize.xs", color: "$color.text-muted", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "$font.mono" } }));
    add(n({ id: `${id}_v`, type: "text", tag: "p", name: "Value", text: value, bind, style: { fontSize: "$fontSize.2xl", fontWeight: "$fontWeight.semibold", color: "$color.text" } }));
    return add(n({ id, type: "box", name: `KPI ${label}`, style: { display: "flex", direction: "column", gap: "$space.2", padding: "$space.5", bg: "$color.surface", borderWidth: "1px", borderColor: "$color.border", radius: "$radius.md" }, children: [`${id}_l`, `${id}_v`] }));
  };

  add(n({ id: "logo", type: "text", tag: "p", name: "Logo", text: "IRONLINE", style: { fontFamily: "$font.mono", fontWeight: "$fontWeight.bold", letterSpacing: "0.14em", color: "$color.primary", fontSize: "$fontSize.sm" } }));
  const navItems = [
    ["nav_dash", "Dashboard", "layout-grid", "/"],
    ["nav_proj", "Projects", "folder", "/projects"],
    ["nav_team", "Crew", "users", "/crew"],
    ["nav_fin", "Financials", "chart", "/financials"],
  ];
  for (const [id, label, icon, route] of navItems) {
    add(n({ id: `${id}_i`, type: "icon", name: "Icon", props: { icon }, style: { width: "16px", height: "16px" } }));
    add(n({ id: `${id}_t`, type: "text", tag: "span", name: "Label", text: label, style: {} }));
    add(n({ id, type: "link", name: `Nav ${label}`, events: { navigate: route }, props: { href: route }, style: { display: "flex", align: "center", gap: "$space.3", paddingX: "$space.3", paddingY: "$space.2", radius: "$radius.sm", color: id === "nav_dash" ? "$color.text" : "$color.text-muted", bg: id === "nav_dash" ? "$color.surface-raised" : "transparent", fontSize: "$fontSize.sm" }, hover: { bg: "$color.surface-raised", color: "$color.text" }, children: [`${id}_i`, `${id}_t`] }));
  }
  add(n({ id: "nav", type: "box", tag: "nav", name: "Nav list", style: { display: "flex", direction: "column", gap: "$space.1" }, children: navItems.map((x) => x[0]) }));
  add(n({ id: "sidebar", type: "box", tag: "aside", name: "Sidebar", component: "Sidebar", style: { display: "none", direction: "column", gap: "$space.8", width: "$size.sidebar-w", padding: "$space.5", bg: "$color.surface", borderWidth: "1px", borderSide: "right", borderColor: "$color.border" }, md: { display: "flex" }, children: ["logo", "nav"] }));

  add(n({ id: "title", type: "text", tag: "h1", name: "Title", text: "Site operations", style: { fontSize: "$fontSize.xl", fontWeight: "$fontWeight.semibold", color: "$color.text" } }));
  add(n({ id: "new_btn_t", type: "text", tag: "span", name: "Label", text: "New project", style: {} }));
  add(n({ id: "new_btn", type: "button", name: "New project button", events: { toggle: "modal" }, style: { display: "inline-flex", align: "center", gap: "$space.2", height: "$size.control-h", paddingX: "$space.4", bg: "$color.primary", color: "$color.primary-text", radius: "$radius.sm", fontWeight: "$fontWeight.semibold", fontSize: "$fontSize.sm" }, hover: { opacity: "0.9" }, children: ["new_btn_t"] }));
  add(n({ id: "header", type: "box", tag: "header", name: "Header", style: { display: "flex", align: "center", justify: "between", gap: "$space.4" }, children: ["title", "new_btn"] }));

  const k1 = kpi("kpi1", "Active projects", "18", "activeProjects");
  const k2 = kpi("kpi2", "Committed cost", "$4.82M", "committedCost");
  const k3 = kpi("kpi3", "Crew on site", "126", "crewOnSite");
  add(n({ id: "kpis", type: "box", tag: "section", name: "KPI row", style: { display: "grid", gridCols: "1", gap: "$space.4" }, md: { gridCols: "3" }, children: [k1, k2, k3] }));

  add(n({ id: "table", type: "table", name: "Projects table", bind: "projects", props: { columns: ["Project", "Phase", "Budget", "Status"], rows: [["Harbor Point Tower", "Framing", "$1.9M", "On track"], ["Route 9 Depot", "Sitework", "$640K", "At risk"], ["Mill St. Lofts", "Finishes", "$2.2M", "On track"]] }, style: { width: "100%", fontSize: "$fontSize.sm", color: "$color.text" } }));
  add(n({ id: "table_card", type: "box", tag: "section", name: "Table card", style: { bg: "$color.surface", borderWidth: "1px", borderColor: "$color.border", radius: "$radius.md", overflow: "auto" }, children: ["table"] }));

  add(n({ id: "main", type: "box", tag: "main", name: "Main", style: { display: "flex", direction: "column", gap: "$space.6", padding: "$space.5", flex: "1" }, md: { padding: "$space.8" }, children: ["header", "kpis", "table_card"] }));

  // Modal
  add(n({ id: "modal_title", type: "text", tag: "h2", name: "Modal title", text: "New project", style: { fontSize: "$fontSize.lg", fontWeight: "$fontWeight.semibold", color: "$color.text" } }));
  add(n({ id: "modal_input", type: "input", name: "Project name input", props: { label: "Project name", name: "projectName", placeholder: "e.g. Harbor Point Tower", inputType: "text" }, events: { onChange: "onProjectNameChange" }, style: { height: "$size.control-h", paddingX: "$space.3", bg: "$color.bg", color: "$color.text", borderWidth: "1px", borderColor: "$color.border", radius: "$radius.sm", fontSize: "$fontSize.sm", width: "100%" }, focus: { borderColor: "$color.primary" } }));
  add(n({ id: "modal_cancel_t", type: "text", tag: "span", name: "Label", text: "Cancel", style: {} }));
  add(n({ id: "modal_cancel", type: "button", name: "Cancel button", events: { toggle: "modal" }, style: { height: "$size.control-h", paddingX: "$space.4", color: "$color.text", borderWidth: "1px", borderColor: "$color.border", radius: "$radius.sm", fontSize: "$fontSize.sm" }, children: ["modal_cancel_t"] }));
  add(n({ id: "modal_ok_t", type: "text", tag: "span", name: "Label", text: "Create", style: {} }));
  add(n({ id: "modal_ok", type: "button", name: "Create button", events: { onClick: "onCreateProject" }, style: { height: "$size.control-h", paddingX: "$space.4", bg: "$color.primary", color: "$color.primary-text", radius: "$radius.sm", fontWeight: "$fontWeight.semibold", fontSize: "$fontSize.sm" }, children: ["modal_ok_t"] }));
  add(n({ id: "modal_actions", type: "box", name: "Actions", style: { display: "flex", justify: "end", gap: "$space.2" }, children: ["modal_cancel", "modal_ok"] }));
  add(n({ id: "modal_panel", type: "box", name: "Modal panel", animation: "scale-in", style: { display: "flex", direction: "column", gap: "$space.4", width: "100%", maxWidth: "420px", padding: "$space.6", bg: "$color.surface", borderWidth: "1px", borderColor: "$color.border", radius: "$radius.md", shadow: "$shadow.lg" }, children: ["modal_title", "modal_input", "modal_actions"] }));
  add(n({ id: "modal", type: "box", name: "New project modal", hidden: true, props: { role: "dialog", label: "New project" }, animation: "fade-in", style: { display: "flex", align: "center", justify: "center", position: "fixed", inset: "0", zIndex: "50", padding: "$space.4", bg: "rgba(0,0,0,0.6)" }, children: ["modal_panel"] }));

  add(n({ id: "root", type: "box", name: "Dashboard", style: { display: "flex", minHeight: "100vh", bg: "$color.bg", bgImage: "$texture.grid", color: "$color.text", fontFamily: "$font.body" }, children: ["sidebar", "main", "modal"] }));

  return {
    tokens: structuredClone(DEFAULT_TOKENS),
    nodes,
    screens: [{ id: "s_dash", name: "Dashboard", route: "/", rootId: "root" }],
  };
}

export function newProject(name = "Untitled interface", data: ProjectData = starterData()): Project {
  const now = Date.now();
  return {
    id: uid("p"),
    name,
    description: "",
    folder: "",
    tags: [],
    notes: "",
    favorite: false,
    archived: false,
    createdAt: now,
    updatedAt: now,
    compat: { ...DEFAULT_COMPAT },
    versions: [],
    variations: [],
    references: [],
    ...data,
  };
}
