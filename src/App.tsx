import { useEffect, useState } from "react";
import type { Project } from "./model/types";
import { DEFAULT_SETTINGS, loadProject, loadSettings, saveSettings, type AppSettings } from "./store/db";
import { Editor } from "./ui/Editor";
import { Home } from "./ui/Home";
import { SettingsDialog } from "./ui/Settings";

export function App() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [open, setOpen] = useState<Project | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    loadSettings().then(setSettings);
    const id = new URLSearchParams(location.hash.slice(1)).get("p");
    if (id) loadProject(id).then((p) => p && setOpen(p));
  }, []);

  const openProject = (p: Project | null) => {
    setOpen(p);
    history.replaceState(null, "", p ? `#p=${p.id}` : location.pathname);
  };

  return (
    <>
      {open ? (
        <Editor key={open.id} initial={open} settings={settings} onBack={() => openProject(null)} onOpenSettings={() => setShowSettings(true)} />
      ) : (
        <Home onOpen={openProject} onOpenSettings={() => setShowSettings(true)} hasKey={!!settings.apiKey} />
      )}
      {showSettings && (
        <SettingsDialog
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSave={(s) => {
            setSettings(s);
            saveSettings(s);
          }}
        />
      )}
    </>
  );
}
