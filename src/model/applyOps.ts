import { buildNodes, cleanProps, cleanStylePatch, mergeTokens } from "./sanitize";
import { isAncestor, moveNode, parentOf, removeNode } from "./ops";
import type { Animation, ProjectData, StyleSet, UINode } from "./types";

export interface OpsResult {
  data: ProjectData;
  applied: string[];
  rejected: string[];
  changedIds: string[];
}

type Loose = Record<string, unknown>;
const isObj = (v: unknown): v is Loose => !!v && typeof v === "object" && !Array.isArray(v);

function patchStyle(base: StyleSet | undefined, patch: unknown): StyleSet | undefined {
  const p = cleanStylePatch(patch);
  if (!p) return base;
  const out: Record<string, string> = { ...(base ?? {}) };
  for (const [k, v] of Object.entries(p)) {
    if (v === null) delete out[k];
    else out[k] = v;
  }
  return Object.keys(out).length ? (out as StyleSet) : undefined;
}

/**
 * Apply Design Director ops. With scopeRoot set, any op that touches a node outside
 * that subtree (or edits tokens) is rejected, so the AI can only change what was asked.
 */
export function applyOps(data: ProjectData, ops: unknown, scopeRoot?: string): OpsResult {
  let cur: ProjectData = { ...data, nodes: { ...data.nodes } };
  const applied: string[] = [];
  const rejected: string[] = [];
  const changed = new Set<string>();
  const inScope = (id: string) => !scopeRoot || isAncestor(cur.nodes, scopeRoot, id);
  if (!Array.isArray(ops)) return { data, applied, rejected: ["No edits were returned."], changedIds: [] };

  for (const raw of ops.slice(0, 400)) {
    if (!isObj(raw)) continue;
    const op = raw.op;
    const id = typeof raw.id === "string" ? raw.id : undefined;
    try {
      if (op === "update") {
        if (!id || !cur.nodes[id]) { rejected.push(`update: node ${id} not found`); continue; }
        if (!inScope(id)) { rejected.push(`update ${cur.nodes[id].name}: outside the selected scope`); continue; }
        const n = cur.nodes[id];
        const next: UINode = { ...n };
        for (const slot of ["style", "md", "lg", "hover", "focus"] as const) {
          if (slot in raw) {
            const s = patchStyle(n[slot], raw[slot]);
            if (slot === "style") next.style = s ?? {};
            else next[slot] = s;
          }
        }
        if (typeof raw.text === "string") next.text = raw.text.slice(0, 4000);
        if (typeof raw.name === "string") next.name = raw.name.slice(0, 80);
        if (typeof raw.tag === "string") next.tag = raw.tag.slice(0, 20);
        if (typeof raw.bind === "string" || raw.bind === null) next.bind = (raw.bind as string | null) || undefined;
        if (typeof raw.component === "string" || raw.component === null) next.component = (raw.component as string | null) || undefined;
        if (typeof raw.hidden === "boolean") next.hidden = raw.hidden || undefined;
        if (typeof raw.animation === "string") next.animation = raw.animation as Animation;
        if (isObj(raw.props)) next.props = { ...(n.props ?? {}), ...(cleanProps(raw.props) ?? {}) };
        if (isObj(raw.events)) {
          const ev: Record<string, string | undefined> = { ...(n.events ?? {}) };
          for (const k of ["onClick", "onChange", "onSubmit", "navigate", "toggle"]) {
            if (k in raw.events) ev[k] = typeof raw.events[k] === "string" && raw.events[k] ? (raw.events[k] as string) : undefined;
          }
          next.events = ev;
        }
        cur.nodes[id] = next;
        changed.add(id);
        applied.push(`Updated ${next.name}`);
      } else if (op === "insert") {
        const parent = typeof raw.parent === "string" ? raw.parent : undefined;
        if (!parent || !cur.nodes[parent]) { rejected.push(`insert: parent ${parent} not found`); continue; }
        if (!inScope(parent)) { rejected.push(`insert into ${cur.nodes[parent].name}: outside the selected scope`); continue; }
        const built = buildNodes(raw.nodes, new Map(), cur.nodes);
        const tops = built.roots.map((r) => (r.includes(">") ? r.split(">")[1] : r));
        const p = cur.nodes[parent];
        const children = [...p.children];
        const index = typeof raw.index === "number" ? Math.max(0, Math.min(raw.index, children.length)) : children.length;
        children.splice(index, 0, ...tops);
        cur.nodes = { ...cur.nodes, ...built.nodes, [parent]: { ...p, children } };
        Object.keys(built.nodes).forEach((k) => changed.add(k));
        applied.push(`Inserted ${tops.length} element${tops.length === 1 ? "" : "s"} into ${p.name}`);
      } else if (op === "remove") {
        if (!id || !cur.nodes[id]) { rejected.push(`remove: node ${id} not found`); continue; }
        if (!inScope(id) || id === scopeRoot) { rejected.push(`remove ${cur.nodes[id].name}: outside the selected scope`); continue; }
        const name = cur.nodes[id].name;
        const pid = parentOf(cur.nodes, id);
        cur = removeNode(cur, id);
        if (pid) changed.add(pid);
        applied.push(`Removed ${name}`);
      } else if (op === "move") {
        const parent = typeof raw.parent === "string" ? raw.parent : undefined;
        if (!id || !parent || !cur.nodes[id] || !cur.nodes[parent]) { rejected.push(`move: node not found`); continue; }
        if (!inScope(id) || !inScope(parent)) { rejected.push(`move ${cur.nodes[id].name}: outside the selected scope`); continue; }
        cur = moveNode(cur, id, parent, typeof raw.index === "number" ? raw.index : cur.nodes[parent].children.length);
        changed.add(id);
        applied.push(`Moved ${cur.nodes[id].name}`);
      } else if (op === "tokens") {
        if (scopeRoot) { rejected.push("token edit: not allowed while scope is locked to the selection"); continue; }
        cur = { ...cur, tokens: mergeTokens(cur.tokens, raw.tokens) };
        applied.push("Updated design tokens");
      } else {
        rejected.push(`unknown op ${String(op)}`);
      }
    } catch (e) {
      rejected.push(`${String(op)} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { data: cur, applied, rejected, changedIds: [...changed] };
}
