import { createStore, del, get, keys, set } from "idb-keyval";
import type { Project, SavedComponent, SavedDesignSystem } from "../model/types";

// Persistent local storage (IndexedDB in this browser). Projects survive closing the app.
// Accounts and cloud sync are a later phase; nothing here leaves the device.

const projects = createStore("interface-foundry", "projects");
const components = createStore("interface-foundry-components", "components");
const systems = createStore("interface-foundry-systems", "systems");
const settings = createStore("interface-foundry-settings", "settings");

export async function listProjects(): Promise<Project[]> {
  const ks = await keys(projects);
  const all = await Promise.all(ks.map((k) => get<Project>(k, projects)));
  return all.filter((p): p is Project => !!p).sort((a, b) => b.updatedAt - a.updatedAt);
}
export const loadProject = (id: string) => get<Project>(id, projects);
export const saveProject = (p: Project) => set(p.id, p, projects);
export const deleteProject = (id: string) => del(id, projects);

export async function listComponents(): Promise<SavedComponent[]> {
  const ks = await keys(components);
  const all = await Promise.all(ks.map((k) => get<SavedComponent>(k, components)));
  return all.filter((c): c is SavedComponent => !!c).sort((a, b) => b.createdAt - a.createdAt);
}
export const saveComponent = (c: SavedComponent) => set(c.id, c, components);
export const deleteComponent = (id: string) => del(id, components);

export async function listSystems(): Promise<SavedDesignSystem[]> {
  const ks = await keys(systems);
  const all = await Promise.all(ks.map((k) => get<SavedDesignSystem>(k, systems)));
  return all.filter((c): c is SavedDesignSystem => !!c).sort((a, b) => b.createdAt - a.createdAt);
}
export const saveSystem = (s: SavedDesignSystem) => set(s.id, s, systems);
export const deleteSystem = (id: string) => del(id, systems);

export interface AppSettings {
  apiKey?: string;
  model: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
}
export const DEFAULT_SETTINGS: AppSettings = { model: "claude-opus-5-5", effort: "medium" };

export async function loadSettings(): Promise<AppSettings> {
  return { ...DEFAULT_SETTINGS, ...((await get<AppSettings>("app", settings)) ?? {}) };
}
export const saveSettings = (s: AppSettings) => set("app", s, settings);
