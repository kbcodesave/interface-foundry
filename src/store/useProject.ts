import { useCallback, useEffect, useRef, useState } from "react";
import { uid } from "../model/defaults";
import { pickData } from "../model/ops";
import type { Project, ProjectData } from "../model/types";
import { saveProject } from "./db";

const MAX_HISTORY = 150;
const MAX_VERSIONS = 60;

export type SaveState = "saved" | "saving" | "unsaved" | "error";

export interface ProjectStore {
  project: Project;
  /** Apply an edit to the interface content. coalesceKey merges rapid edits of the same field into one undo step. */
  commit: (next: ProjectData, coalesceKey?: string) => void;
  /** Update project metadata (name, notes, tags...) without an undo step. */
  updateMeta: (patch: Partial<Project>) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  snapshot: (label: string) => void;
  restore: (versionId: string) => void;
  saveState: SaveState;
}

export function useProject(initial: Project): ProjectStore {
  const [project, setProject] = useState(initial);
  const past = useRef<ProjectData[]>([]);
  const future = useRef<ProjectData[]>([]);
  const lastKey = useRef<{ key: string; at: number } | null>(null);
  const [, force] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const first = useRef(true);

  // Autosave (debounced) to IndexedDB.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaveState("unsaved");
    const t = setTimeout(() => {
      setSaveState("saving");
      saveProject(project)
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("error"));
    }, 500);
    return () => clearTimeout(t);
  }, [project]);

  // Flush on unmount (e.g. going back to the library inside the debounce window).
  const latest = useRef(project);
  latest.current = project;
  useEffect(() => () => void saveProject(latest.current), []);

  const commit = useCallback((next: ProjectData, coalesceKey?: string) => {
    setProject((cur) => {
      const now = Date.now();
      const merge = coalesceKey && lastKey.current?.key === coalesceKey && now - lastKey.current.at < 1000;
      if (!merge) {
        past.current.push(pickData(cur));
        if (past.current.length > MAX_HISTORY) past.current.shift();
      }
      lastKey.current = coalesceKey ? { key: coalesceKey, at: now } : null;
      future.current = [];
      return { ...cur, ...next, updatedAt: now };
    });
    force((x) => x + 1);
  }, []);

  const updateMeta = useCallback((patch: Partial<Project>) => {
    setProject((cur) => ({ ...cur, ...patch, updatedAt: Date.now() }));
  }, []);

  const undo = useCallback(() => {
    setProject((cur) => {
      const prev = past.current.pop();
      if (!prev) return cur;
      future.current.push(pickData(cur));
      lastKey.current = null;
      return { ...cur, ...prev, updatedAt: Date.now() };
    });
    force((x) => x + 1);
  }, []);

  const redo = useCallback(() => {
    setProject((cur) => {
      const next = future.current.pop();
      if (!next) return cur;
      past.current.push(pickData(cur));
      lastKey.current = null;
      return { ...cur, ...next, updatedAt: Date.now() };
    });
    force((x) => x + 1);
  }, []);

  const snapshot = useCallback((label: string) => {
    setProject((cur) => ({
      ...cur,
      versions: [{ id: uid("v"), label, createdAt: Date.now(), snapshot: structuredClone(pickData(cur)) }, ...cur.versions].slice(0, MAX_VERSIONS),
    }));
  }, []);

  const restore = useCallback((versionId: string) => {
    setProject((cur) => {
      const v = cur.versions.find((x) => x.id === versionId);
      if (!v) return cur;
      past.current.push(pickData(cur));
      future.current = [];
      return { ...cur, ...structuredClone(v.snapshot), updatedAt: Date.now() };
    });
    force((x) => x + 1);
  }, []);

  return {
    project,
    commit,
    updateMeta,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    snapshot,
    restore,
    saveState,
  };
}
