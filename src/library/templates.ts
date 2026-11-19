import { uid } from "../model/defaults";
import type { NodeEvents, NodeProps, NodeType, StyleSet, UINode } from "../model/types";

// Built-in component library. Every template is plain model nodes using design
// tokens, so inserted components follow the project's design system and stay editable.

interface Spec {
  type: NodeType;
  name: string;
  tag?: string;
  text?: string;
  props?: NodeProps;
  style?: StyleSet;
  md?: StyleSet;
  hover?: StyleSet;
  focus?: StyleSet;
  events?: NodeEvents;
  bind?: string;
  component?: string;
  hidden?: boolean;
  animation?: UINode["animation"];
  key?: string; // local key for toggle wiring
  children?: Spec[];
}

export interface Template {
  id: string;
  name: string;
  category: "Navigation" | "Data & Management" | "Forms & Interactions" | "Visual Elements";
  build: () => { rootId: string; nodes: Record<string, UINode> };
}

function materialize(spec: Spec): { rootId: string; nodes: Record<string, UINode> } {
  const nodes: Record<string, UINode> = {};
  const keys = new Map<string, string>();
  const pending: [string, string][] = [];
  const walk = (s: Spec): string => {
    const id = uid();
    if (s.key) keys.set(s.key, id);
    const { children = [], key: _k, ...rest } = s;
    const node: UINode = { id, style: {}, ...rest, children: [] } as UINode;
    nodes[id] = node;
    if (s.events?.toggle) pending.push([id, s.events.toggle]);
    node.children = children.map(walk);
    return id;
  };
  const rootId = walk(spec);
  for (const [id, k] of pending) nodes[id].events = { ...nodes[id].events, toggle: keys.get(k) };
  return { rootId, nodes };
}

const card: StyleSet = { bg: "$color.surface", borderWidth: "1px", borderColor: "$color.border", radius: "$radius.md" };
const label: StyleSet = { fontSize: "$fontSize.xs", color: "$color.text-muted", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "$font.mono" };
const control: StyleSet = { height: "$size.control-h", paddingX: "$space.3", bg: "$color.bg", color: "$color.text", borderWidth: "1px", borderColor: "$color.border", radius: "$radius.sm", fontSize: "$fontSize.sm", width: "100%" };
const btnPrimary: StyleSet = { display: "inline-flex", align: "center", justify: "center", gap: "$space.2", height: "$size.control-h", paddingX: "$space.4", bg: "$color.primary", color: "$color.primary-text", radius: "$radius.sm", fontWeight: "$fontWeight.semibold", fontSize: "$fontSize.sm" };
const btnGhost: StyleSet = { display: "inline-flex", align: "center", justify: "center", gap: "$space.2", height: "$size.control-h", paddingX: "$space.4", color: "$color.text", borderWidth: "1px", borderColor: "$color.border", radius: "$radius.sm", fontSize: "$fontSize.sm" };
const t = (text: string, style: StyleSet = {}, tag = "p", extra: Partial<Spec> = {}): Spec => ({ type: "text", name: text.slice(0, 24), tag, text, style, ...extra });
const icon = (name: string, size = "16px"): Spec => ({ type: "icon", name: `Icon ${name}`, props: { icon: name }, style: { width: size, height: size } });
const col = (gap = "$space.3", style: StyleSet = {}): StyleSet => ({ display: "flex", direction: "column", gap, ...style });
const row = (gap = "$space.3", style: StyleSet = {}): StyleSet => ({ display: "flex", align: "center", gap, ...style });

const T: [string, Template["category"], () => Spec][] = [
  ["Top navigation", "Navigation", () => ({
    type: "box", tag: "header", name: "Top navigation", component: "TopNav", style: row("$space.6", { justify: "between", height: "$size.topbar-h", paddingX: "$space.5", bg: "$color.surface", borderWidth: "1px", borderSide: "bottom", borderColor: "$color.border" }),
    children: [
      t("PRODUCT", { fontFamily: "$font.mono", fontWeight: "$fontWeight.bold", letterSpacing: "0.14em", color: "$color.primary", fontSize: "$fontSize.sm" }),
      { type: "box", tag: "nav", name: "Links", style: { display: "none", align: "center", gap: "$space.5" }, md: { display: "flex" }, children: ["Overview", "Projects", "Reports"].map((l, i) => ({ type: "link", name: `Link ${l}`, text: l, events: { navigate: i === 0 ? "/" : `/${l.toLowerCase()}` }, style: { fontSize: "$fontSize.sm", color: i === 0 ? "$color.text" : "$color.text-muted" }, hover: { color: "$color.text" } })) },
      { type: "button", name: "Account button", props: { label: "Account" }, style: { display: "inline-flex", align: "center", justify: "center", width: "32px", height: "32px", radius: "$radius.full", bg: "$color.surface-raised", color: "$color.text" }, children: [icon("user")] },
    ],
  })],
  ["Sidebar", "Navigation", () => ({
    type: "box", tag: "aside", name: "Sidebar", component: "Sidebar", style: col("$space.6", { width: "$size.sidebar-w", padding: "$space.5", bg: "$color.surface", borderWidth: "1px", borderSide: "right", borderColor: "$color.border", minHeight: "100vh" }),
    children: [
      t("WORKSPACE", { ...label, color: "$color.primary" }),
      { type: "box", tag: "nav", name: "Nav", style: col("$space.1"), children: [["layout-grid", "Overview"], ["folder", "Projects"], ["users", "Team"], ["settings", "Settings"]].map(([ic, l], i) => ({ type: "link", name: `Nav ${l}`, events: { navigate: i ? `/${l.toLowerCase()}` : "/" }, style: row("$space.3", { paddingX: "$space.3", paddingY: "$space.2", radius: "$radius.sm", fontSize: "$fontSize.sm", color: i ? "$color.text-muted" : "$color.text", bg: i ? "transparent" : "$color.surface-raised" }), hover: { bg: "$color.surface-raised", color: "$color.text" }, children: [icon(ic), t(l, {}, "span")] })) },
    ],
  })],
  ["Breadcrumbs", "Navigation", () => ({
    type: "box", tag: "nav", name: "Breadcrumbs", props: { label: "Breadcrumb" }, style: row("$space.2", { fontSize: "$fontSize.sm", color: "$color.text-muted" }),
    children: [{ type: "link", name: "Crumb Home", text: "Home", events: { navigate: "/" }, style: { color: "$color.text-muted" }, hover: { color: "$color.text" } }, icon("chevron-right", "14px"), { type: "link", name: "Crumb Projects", text: "Projects", events: { navigate: "/projects" }, style: { color: "$color.text-muted" }, hover: { color: "$color.text" } }, icon("chevron-right", "14px"), t("Harbor Point Tower", { color: "$color.text" }, "span")],
  })],
  ["Dropdown menu", "Navigation", () => ({
    type: "box", name: "Dropdown", component: "DropdownMenu", style: { position: "relative", display: "inline-block" },
    children: [
      { type: "button", name: "Dropdown trigger", events: { toggle: "menu" }, style: btnGhost, children: [t("Actions", {}, "span"), icon("chevron-down", "14px")] },
      { type: "box", key: "menu", name: "Menu", hidden: true, animation: "fade-in", style: col("$space.1", { position: "absolute", zIndex: "20", width: "200px", padding: "$space.1", margin: "$space.1 0 0 0", ...card, shadow: "$shadow.md" }),
        children: ["Duplicate", "Archive", "Delete"].map((l) => ({ type: "button", name: `Menu ${l}`, text: l, events: { onClick: `on${l}` }, style: { width: "100%", textAlign: "left", paddingX: "$space.3", paddingY: "$space.2", radius: "$radius.sm", fontSize: "$fontSize.sm", color: l === "Delete" ? "$color.danger" : "$color.text" }, hover: { bg: "$color.surface-raised" } })) },
    ],
  })],
  ["Tabs", "Navigation", () => ({
    type: "box", name: "Tabs", style: row("$space.1", { borderWidth: "1px", borderSide: "bottom", borderColor: "$color.border" }),
    children: ["Overview", "Schedule", "Budget", "Documents"].map((l, i) => ({ type: "button", name: `Tab ${l}`, text: l, events: { onClick: `onSelect${l}Tab` }, style: { paddingX: "$space.4", paddingY: "$space.3", fontSize: "$fontSize.sm", color: i ? "$color.text-muted" : "$color.text", borderWidth: i ? "0px" : "2px", borderSide: "bottom", borderColor: "$color.primary" }, hover: { color: "$color.text" } })),
  })],
  ["Command menu", "Navigation", () => ({
    type: "box", name: "Command menu", component: "CommandMenu", style: {},
    children: [
      { type: "button", name: "Open command menu", events: { toggle: "cmd" }, style: { ...btnGhost, color: "$color.text-muted" }, children: [icon("search", "14px"), t("Search or jump to…", {}, "span"), t("⌘K", { fontFamily: "$font.mono", fontSize: "$fontSize.xs" }, "span")] },
      { type: "box", key: "cmd", name: "Command overlay", hidden: true, props: { role: "dialog", label: "Command menu" }, animation: "fade-in", style: { display: "flex", justify: "center", position: "fixed", inset: "0", zIndex: "50", padding: "$space.12 $space.4", bg: "rgba(0,0,0,0.55)" },
        children: [{ type: "box", name: "Command panel", animation: "scale-in", style: col("$space.2", { width: "100%", maxWidth: "560px", height: "fit-content", padding: "$space.3", ...card, shadow: "$shadow.lg" }), children: [
          { type: "input", name: "Command input", props: { label: "Search commands", placeholder: "Type a command…", inputType: "search" }, events: { onChange: "onCommandQueryChange" }, style: control, focus: { borderColor: "$color.primary" } },
          ...["New project", "Invite crew member", "Open financial report"].map((l) => ({ type: "button" as const, name: `Command ${l}`, text: l, events: { onClick: `onCommand${l.replace(/\s+/g, "")}` }, style: { width: "100%", textAlign: "left" as const, paddingX: "$space.3", paddingY: "$space.2", radius: "$radius.sm", fontSize: "$fontSize.sm", color: "$color.text" }, hover: { bg: "$color.surface-raised" } })),
        ] }] },
    ],
  })],
  ["Data table", "Data & Management", () => ({
    type: "box", tag: "section", name: "Table card", component: "DataTable", style: { ...card, overflow: "auto" },
    children: [{ type: "table", name: "Table", bind: "rows", props: { columns: ["Name", "Owner", "Due", "Status"], rows: [["Foundation pour", "R. Alvarez", "Mar 12", "Scheduled"], ["Steel delivery", "K. Osei", "Mar 15", "Delayed"], ["Inspection", "M. Chen", "Mar 18", "Confirmed"]] }, style: { width: "100%", fontSize: "$fontSize.sm", color: "$color.text" } }],
  })],
  ["KPI card", "Data & Management", () => ({
    type: "box", name: "KPI card", component: "KpiCard", style: col("$space.2", { padding: "$space.5", ...card }),
    children: [t("Revenue (MTD)", label), t("$1.24M", { fontSize: "$fontSize.2xl", fontWeight: "$fontWeight.semibold", color: "$color.text" }, "p", { bind: "value" }), { type: "box", name: "Delta", style: row("$space.1", { color: "$color.success", fontSize: "$fontSize.xs" }), children: [icon("trending-up", "14px"), t("+8.2% vs last month", {}, "span", { bind: "delta" })] }],
  })],
  ["Progress", "Data & Management", () => ({
    type: "box", name: "Progress block", style: col("$space.2"),
    children: [{ type: "box", name: "Progress header", style: row("$space.2", { justify: "between", fontSize: "$fontSize.sm" }), children: [t("Phase completion", { color: "$color.text" }, "span"), t("64%", { color: "$color.text-muted", fontFamily: "$font.mono" }, "span")] }, { type: "progress", name: "Progress bar", props: { value: 64, max: 100, label: "Phase completion" }, bind: "completion", style: { height: "6px", width: "100%", radius: "$radius.full", bg: "$color.secondary", overflow: "hidden" } }],
  })],
  ["Timeline", "Data & Management", () => ({
    type: "box", tag: "ol", name: "Timeline", style: col("$space.4", { padding: "0 0 0 $space.4", borderWidth: "1px", borderSide: "left", borderColor: "$color.border" }),
    children: [["Permit approved", "Feb 02"], ["Site mobilised", "Feb 14"], ["Foundations complete", "Mar 03"]].map(([a, b]) => ({ type: "box", tag: "li", name: `Event ${a}`, style: col("$space.1"), children: [t(b, { ...label }), t(a, { fontSize: "$fontSize.sm", color: "$color.text" })] })),
  })],
  ["Activity feed", "Data & Management", () => ({
    type: "box", tag: "section", name: "Activity feed", component: "ActivityFeed", style: col("$space.3", { padding: "$space.5", ...card }),
    children: [t("Activity", { fontSize: "$fontSize.md", fontWeight: "$fontWeight.semibold", color: "$color.text" }, "h3"), ...[["K. Osei", "uploaded 4 site photos", "12m"], ["M. Chen", "approved change order #112", "1h"], ["R. Alvarez", "flagged a safety issue", "3h"]].map(([w, a, tm]) => ({ type: "box" as const, name: `Item ${w}`, style: row("$space.3", { fontSize: "$fontSize.sm" }), children: [{ type: "box" as const, name: "Dot", style: { width: "8px", height: "8px", radius: "$radius.full", bg: "$color.primary" } }, t(`${w} ${a}`, { color: "$color.text", flex: "1" }, "p"), t(tm, { color: "$color.text-muted", fontFamily: "$font.mono", fontSize: "$fontSize.xs" }, "span")] }))],
  })],
  ["Kanban board", "Data & Management", () => ({
    type: "box", name: "Kanban board", component: "KanbanBoard", style: { display: "grid", gridCols: "1", gap: "$space.4" }, md: { gridCols: "3" },
    children: [["To do", ["Order rebar", "Site survey"]], ["In progress", ["Framing level 3"]], ["Done", ["Excavation", "Footings"]]].map(([h, items]) => ({ type: "box" as const, name: `Column ${h}`, style: col("$space.3", { padding: "$space.3", bg: "$color.surface", radius: "$radius.md", borderWidth: "1px", borderColor: "$color.border" }), children: [t(h as string, label), ...(items as string[]).map((i) => ({ type: "box" as const, name: `Card ${i}`, style: { padding: "$space.3", bg: "$color.surface-raised", radius: "$radius.sm", borderWidth: "1px", borderColor: "$color.border", fontSize: "$fontSize.sm", color: "$color.text" }, children: [t(i, {}, "p")] }))] })),
  })],
  ["Calendar", "Data & Management", () => ({
    type: "box", name: "Calendar", component: "MonthCalendar", style: col("$space.3", { padding: "$space.4", ...card }),
    children: [t("March", { fontWeight: "$fontWeight.semibold", color: "$color.text" }, "h3"), { type: "box", name: "Grid", style: { display: "grid", gridCols: "7", gap: "$space.1", fontSize: "$fontSize.xs", textAlign: "center" }, children: [..."MTWTFSS".split("").map((d, i) => t(d, { color: "$color.text-muted", fontFamily: "$font.mono" }, "span", { name: `Day ${i}` })), ...Array.from({ length: 31 }, (_, i) => t(String(i + 1), { paddingY: "$space.2", radius: "$radius.sm", color: i === 11 ? "$color.primary-text" : "$color.text", bg: i === 11 ? "$color.primary" : "transparent" }, "span", { name: `Date ${i + 1}` }))] }],
  })],
  ["Chart card", "Data & Management", () => ({
    type: "box", tag: "section", name: "Chart card", component: "ChartCard", style: col("$space.3", { padding: "$space.5", ...card }),
    children: [t("Monthly spend", { fontSize: "$fontSize.md", fontWeight: "$fontWeight.semibold", color: "$color.text" }, "h3"), { type: "chart", name: "Spend chart", bind: "spend", props: { chartType: "bar", labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"], values: [42, 55, 38, 71, 64, 80], label: "Monthly spend" }, style: { height: "200px", width: "100%" } }],
  })],
  ["Login form", "Forms & Interactions", () => ({
    type: "box", tag: "form", name: "Login form", component: "LoginForm", events: { onSubmit: "onSignIn" }, style: col("$space.4", { width: "100%", maxWidth: "380px", padding: "$space.6", ...card }),
    children: [t("Sign in", { fontSize: "$fontSize.xl", fontWeight: "$fontWeight.semibold", color: "$color.text" }, "h1"),
      { type: "box", name: "Email field", style: col("$space.1"), children: [t("Email", { fontSize: "$fontSize.sm", color: "$color.text-muted" }, "label"), { type: "input", name: "Email input", props: { label: "Email", name: "email", inputType: "email", placeholder: "you@company.com" }, style: control, focus: { borderColor: "$color.primary" } }] },
      { type: "box", name: "Password field", style: col("$space.1"), children: [t("Password", { fontSize: "$fontSize.sm", color: "$color.text-muted" }, "label"), { type: "input", name: "Password input", props: { label: "Password", name: "password", inputType: "password" }, style: control, focus: { borderColor: "$color.primary" } }] },
      { type: "checkbox", name: "Remember me", props: { label: "Keep me signed in", name: "remember" }, style: { fontSize: "$fontSize.sm", color: "$color.text-muted" } },
      { type: "button", tag: "submit", name: "Submit", text: "Sign in", style: { ...btnPrimary, width: "100%" }, hover: { opacity: "0.9" } }],
  })],
  ["Search bar", "Forms & Interactions", () => ({
    type: "box", name: "Search bar", style: row("$space.2", { ...control, paddingX: "$space.3" }), children: [icon("search", "14px"), { type: "input", name: "Search input", props: { label: "Search", placeholder: "Search projects", inputType: "search" }, events: { onChange: "onSearchChange" }, style: { flex: "1", bg: "transparent", color: "$color.text", fontSize: "$fontSize.sm", height: "100%" } }],
  })],
  ["Filters", "Forms & Interactions", () => ({
    type: "box", name: "Filters", style: row("$space.2", { wrap: "wrap" }),
    children: [
      { type: "select", name: "Status filter", props: { label: "Status", options: ["All statuses", "On track", "At risk", "Delayed"] }, events: { onChange: "onStatusFilterChange" }, style: { ...control, width: "180px" } },
      { type: "select", name: "Region filter", props: { label: "Region", options: ["All regions", "North", "South", "Coastal"] }, events: { onChange: "onRegionFilterChange" }, style: { ...control, width: "180px" } },
      { type: "input", name: "Date filter", props: { label: "From date", inputType: "date" }, events: { onChange: "onFromDateChange" }, style: { ...control, width: "170px" } },
    ],
  })],
  ["Toggle setting", "Forms & Interactions", () => ({
    type: "box", name: "Setting row", style: row("$space.4", { justify: "between", padding: "$space.4", ...card }),
    children: [{ type: "box", name: "Copy", style: col("$space.1"), children: [t("Daily digest", { color: "$color.text", fontSize: "$fontSize.sm", fontWeight: "$fontWeight.medium" }), t("Email a summary of site activity at 7am.", { color: "$color.text-muted", fontSize: "$fontSize.xs" })] }, { type: "toggle", name: "Digest toggle", props: { label: "Daily digest", checked: true }, events: { onChange: "onDigestChange" }, style: {} }],
  })],
  ["Upload area", "Forms & Interactions", () => ({
    type: "box", name: "Upload area", style: col("$space.2", { align: "center", justify: "center", padding: "$space.8", borderWidth: "1px", borderColor: "$color.border", radius: "$radius.md", bg: "$color.surface", textAlign: "center" }),
    children: [icon("upload", "24px"), t("Drop drawings or photos here", { color: "$color.text", fontSize: "$fontSize.sm" }), { type: "button", name: "Browse files", text: "Browse files", events: { onClick: "onBrowseFiles" }, style: btnGhost }],
  })],
  ["Confirmation dialog", "Forms & Interactions", () => ({
    type: "box", name: "Confirm action", component: "ConfirmDialog", style: {},
    children: [
      { type: "button", name: "Delete trigger", text: "Delete project", events: { toggle: "dlg" }, style: { ...btnGhost, color: "$color.danger" } },
      { type: "box", key: "dlg", name: "Confirm overlay", hidden: true, props: { role: "dialog", label: "Confirm deletion" }, animation: "fade-in", style: { display: "flex", align: "center", justify: "center", position: "fixed", inset: "0", zIndex: "50", padding: "$space.4", bg: "rgba(0,0,0,0.6)" },
        children: [{ type: "box", name: "Confirm panel", animation: "scale-in", style: col("$space.4", { width: "100%", maxWidth: "400px", padding: "$space.6", ...card, shadow: "$shadow.lg" }), children: [t("Delete this project?", { fontSize: "$fontSize.lg", fontWeight: "$fontWeight.semibold", color: "$color.text" }, "h2"), t("This removes the project for everyone. This cannot be undone.", { fontSize: "$fontSize.sm", color: "$color.text-muted" }), { type: "box", name: "Actions", style: row("$space.2", { justify: "end" }), children: [{ type: "button", name: "Cancel", text: "Cancel", events: { toggle: "dlg" }, style: btnGhost }, { type: "button", name: "Confirm delete", text: "Delete", events: { onClick: "onConfirmDelete" }, style: { ...btnPrimary, bg: "$color.danger" } }] }] }] },
    ],
  })],
  ["Notification", "Visual Elements", () => ({
    type: "box", name: "Notification", props: { role: "status" }, animation: "slide-up", style: row("$space.3", { padding: "$space.3 $space.4", ...card, borderColor: "$color.warning", shadow: "$shadow.md", fontSize: "$fontSize.sm", color: "$color.text" }),
    children: [{ type: "box", name: "Icon wrap", style: { color: "$color.warning" }, children: [icon("alert")] }, t("Concrete delivery delayed to 14:30.", { flex: "1" }), { type: "button", name: "Dismiss", props: { label: "Dismiss notification" }, events: { onClick: "onDismiss" }, style: { color: "$color.text-muted" }, children: [icon("x", "14px")] }],
  })],
  ["Accordion", "Visual Elements", () => ({
    type: "box", name: "Accordion item", style: { ...card },
    children: [{ type: "button", name: "Accordion header", events: { toggle: "panel" }, style: row("$space.2", { width: "100%", justify: "between", padding: "$space.4", fontSize: "$fontSize.sm", color: "$color.text", fontWeight: "$fontWeight.medium" }), children: [t("Safety requirements", {}, "span"), icon("chevron-down", "14px")] }, { type: "box", key: "panel", name: "Accordion panel", hidden: true, animation: "fade-in", style: { padding: "0 $space.4 $space.4", fontSize: "$fontSize.sm", color: "$color.text-muted" }, children: [t("Hard hats, high-visibility vests and steel-toe boots are required beyond the site gate.")] }],
  })],
  ["Tooltip", "Visual Elements", () => ({
    type: "box", name: "Tooltip", style: { position: "relative", display: "inline-block" },
    children: [{ type: "button", name: "Info trigger", props: { label: "More info" }, events: { toggle: "tip" }, style: { color: "$color.text-muted" }, children: [icon("info")] }, { type: "box", key: "tip", name: "Tooltip bubble", hidden: true, props: { role: "tooltip" }, animation: "fade-in", style: { position: "absolute", zIndex: "30", width: "220px", padding: "$space.2 $space.3", bg: "$color.surface-raised", color: "$color.text", fontSize: "$fontSize.xs", radius: "$radius.sm", borderWidth: "1px", borderColor: "$color.border", shadow: "$shadow.md" }, children: [t("Committed cost includes signed subcontracts and approved change orders.")] }],
  })],
  ["Hero section", "Visual Elements", () => ({
    type: "box", tag: "section", name: "Hero", style: col("$space.5", { padding: "$space.12 $space.5", bg: "$color.bg", bgImage: "$texture.grid" }), md: { padding: "$space.12 $space.10" },
    children: [t("FIELD OPERATIONS", { ...label, color: "$color.primary" }), t("Every site, one control room.", { fontSize: "$fontSize.3xl", fontWeight: "$fontWeight.bold", color: "$color.text", maxWidth: "640px", lineHeight: "1.1" }, "h1"), t("Track progress, cost and crews across projects without chasing spreadsheets.", { fontSize: "$fontSize.lg", color: "$color.text-muted", maxWidth: "560px" }), { type: "box", name: "CTAs", style: row("$space.3"), children: [{ type: "button", name: "Primary CTA", text: "Start a project", events: { onClick: "onStart" }, style: btnPrimary, hover: { opacity: "0.9" } }, { type: "button", name: "Secondary CTA", text: "See a demo", events: { onClick: "onDemo" }, style: btnGhost }] }],
  })],
  ["Card", "Visual Elements", () => ({
    type: "box", tag: "article", name: "Card", component: "ProjectCard", style: { ...card, overflow: "hidden" },
    children: [{ type: "image", name: "Card image", props: { alt: "Site photo" }, style: { width: "100%", height: "160px", display: "block" } }, { type: "box", name: "Card body", style: col("$space.2", { padding: "$space.4" }), children: [t("Harbor Point Tower", { fontWeight: "$fontWeight.semibold", color: "$color.text" }, "h3", { bind: "title" }), t("Level 14 of 22 · Framing", { fontSize: "$fontSize.sm", color: "$color.text-muted" }, "p", { bind: "subtitle" }), { type: "badge", name: "Status badge", text: "On track", bind: "status", style: { display: "inline-block", paddingX: "$space.2", paddingY: "2px", radius: "$radius.sm", fontSize: "$fontSize.xs", color: "$color.success", borderWidth: "1px", borderColor: "$color.success", width: "fit-content" } }] }],
  })],
  ["Gallery", "Visual Elements", () => ({
    type: "box", name: "Gallery", style: { display: "grid", gridCols: "2", gap: "$space.2" }, md: { gridCols: "4" },
    children: Array.from({ length: 8 }, (_, i) => ({ type: "image" as const, name: `Photo ${i + 1}`, props: { alt: `Site photo ${i + 1}` }, style: { width: "100%", height: "120px", radius: "$radius.sm", display: "block" } })),
  })],
];

export const TEMPLATES: Template[] = T.map(([name, category, spec]) => ({ id: name.toLowerCase().replace(/\s+/g, "-"), name, category, build: () => materialize(spec()) }));
