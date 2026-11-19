import { uid } from "./defaults";
import type { ProjectData, Screen, StyleSet, Tokens, UINode } from "./types";

export type Nodes = Record<string, UINode>;

export function parentOf(nodes: Nodes, id: string): string | undefined {
  for (const node of Object.values(nodes)) if (node.children.includes(id)) return node.id;
  return undefined;
}

export function subtreeIds(nodes: Nodes, rootId: string): string[] {
  const out: string[] = [];
  const walk = (id: string) => {
    const node = nodes[id];
    if (!node) return;
    out.push(id);
    node.children.forEach(walk);
  };
  walk(rootId);
  return out;
}

export function screenOf(data: ProjectData, id: string): Screen | undefined {
  let cur: string | undefined = id;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const s = data.screens.find((x) => x.rootId === cur);
    if (s) return s;
    cur = parentOf(data.nodes, cur);
  }
  return undefined;
}

export function isAncestor(nodes: Nodes, ancestor: string, id: string): boolean {
  let cur: string | undefined = id;
  while (cur) {
    if (cur === ancestor) return true;
    cur = parentOf(nodes, cur);
  }
  return false;
}

/** Copy a subtree with fresh ids. Toggle targets inside the subtree are remapped. */
export function cloneSubtree(nodes: Nodes, rootId: string): { rootId: string; nodes: Nodes } {
  const ids = subtreeIds(nodes, rootId);
  const map = new Map(ids.map((id) => [id, uid()]));
  const out: Nodes = {};
  for (const id of ids) {
    const src = nodes[id];
    const copy: UINode = structuredClone(src);
    copy.id = map.get(id)!;
    copy.children = src.children.map((c) => map.get(c)!).filter(Boolean);
    if (copy.events?.toggle && map.has(copy.events.toggle)) copy.events.toggle = map.get(copy.events.toggle);
    out[copy.id] = copy;
  }
  return { rootId: map.get(rootId)!, nodes: out };
}

export function updateNode(data: ProjectData, id: string, patch: Partial<UINode>): ProjectData {
  const node = data.nodes[id];
  if (!node) return data;
  return { ...data, nodes: { ...data.nodes, [id]: { ...node, ...patch } } };
}

type StyleSlot = "style" | "md" | "lg" | "hover" | "focus";

export function setStyle(data: ProjectData, id: string, slot: StyleSlot, key: keyof StyleSet, value: string | undefined): ProjectData {
  const node = data.nodes[id];
  if (!node) return data;
  const current: StyleSet = { ...(node[slot] ?? {}) };
  if (value === undefined || value === "") delete current[key];
  else current[key] = value;
  return updateNode(data, id, { [slot]: current } as Partial<UINode>);
}

export function removeNode(data: ProjectData, id: string): ProjectData {
  if (data.screens.some((s) => s.rootId === id)) return data; // never delete a screen root this way
  const ids = new Set(subtreeIds(data.nodes, id));
  const nodes: Nodes = {};
  for (const [k, v] of Object.entries(data.nodes)) {
    if (ids.has(k)) continue;
    let node = v;
    if (v.children.some((c) => ids.has(c))) node = { ...v, children: v.children.filter((c) => !ids.has(c)) };
    if (node.events?.toggle && ids.has(node.events.toggle)) node = { ...node, events: { ...node.events, toggle: undefined } };
    nodes[k] = node;
  }
  return { ...data, nodes };
}

export function insertSubtree(data: ProjectData, parentId: string, index: number, sub: { rootId: string; nodes: Nodes }): ProjectData {
  const parent = data.nodes[parentId];
  if (!parent) return data;
  const children = [...parent.children];
  const at = Math.max(0, Math.min(index, children.length));
  children.splice(at, 0, sub.rootId);
  return { ...data, nodes: { ...data.nodes, ...sub.nodes, [parentId]: { ...parent, children } } };
}

export function moveNode(data: ProjectData, id: string, newParentId: string, index: number): ProjectData {
  if (isAncestor(data.nodes, id, newParentId)) return data; // can't move into own subtree
  const oldParentId = parentOf(data.nodes, id);
  if (!oldParentId || !data.nodes[newParentId]) return data;
  const nodes = { ...data.nodes };
  const oldParent = nodes[oldParentId];
  const oldIndex = oldParent.children.indexOf(id);
  nodes[oldParentId] = { ...oldParent, children: oldParent.children.filter((c) => c !== id) };
  const target = nodes[newParentId];
  const children = [...target.children];
  let at = index;
  if (oldParentId === newParentId && oldIndex < index) at -= 1;
  at = Math.max(0, Math.min(at, children.length));
  children.splice(at, 0, id);
  nodes[newParentId] = { ...target, children };
  return { ...data, nodes };
}

export function duplicateNode(data: ProjectData, id: string): { data: ProjectData; newId?: string } {
  const parentId = parentOf(data.nodes, id);
  if (!parentId) return { data };
  const sub = cloneSubtree(data.nodes, id);
  const idx = data.nodes[parentId].children.indexOf(id) + 1;
  const root = sub.nodes[sub.rootId];
  sub.nodes[sub.rootId] = { ...root, name: `${root.name} copy`, component: root.component ? `${root.component}Copy` : undefined };
  return { data: insertSubtree(data, parentId, idx, sub), newId: sub.rootId };
}

export function setTokens(data: ProjectData, tokens: Tokens): ProjectData {
  return { ...data, tokens };
}

/** Stable fingerprint of the editable content, used to invalidate validation results after edits. */
export function fingerprint(data: ProjectData): string {
  const s = JSON.stringify([data.tokens, data.screens, data.nodes]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36) + ":" + s.length.toString(36);
}

export function pickData<T extends ProjectData>(p: T): ProjectData {
  return { tokens: p.tokens, nodes: p.nodes, screens: p.screens };
}
