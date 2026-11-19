import { useState } from "react";
import type { AppSettings } from "../store/db";
import { Btn, Field, Modal, Select } from "./controls";

const MODELS = [
  { value: "claude-opus-5-5", label: "Claude Opus 5.5 (default)" },
  { value: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (faster, cheaper)" },
  { value: "claude-fable-5-2", label: "Claude Fable 5.2 (most capable, slowest)" },
  { value: "claude-haiku-5-5", label: "Claude Haiku 5.5 (quick drafts)" },
];

export function SettingsDialog({ settings, onSave, onClose }: { settings: AppSettings; onSave: (s: AppSettings) => void; onClose: () => void }) {
  const [s, setS] = useState(settings);
  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="space-y-3">
        <Field label="API key">
          <input
            type="password"
            aria-label="Anthropic API key"
            autoComplete="off"
            className="h-7 w-full rounded-[2px] border border-line bg-ink px-2 font-mono text-[12px] outline-none focus:border-accent"
            placeholder="sk-ant-…"
            value={s.apiKey ?? ""}
            onChange={(e) => setS({ ...s, apiKey: e.target.value.trim() || undefined })}
          />
        </Field>
        <Field label="Model"><Select ariaLabel="Model" value={s.model} options={MODELS} onChange={(v) => setS({ ...s, model: v })} /></Field>
        <Field label="Effort" hint="Higher effort designs more carefully but takes longer and costs more">
          <Select ariaLabel="Effort" value={s.effort} options={["low", "medium", "high", "xhigh", "max"]} onChange={(v) => setS({ ...s, effort: v })} />
        </Field>
        <p className="text-[11px] leading-relaxed text-faint">
          Your key is stored only in this browser (IndexedDB) and sent directly to api.anthropic.com. Usage is billed to your Anthropic account. A full generation is typically 20k to 60k output tokens. On Opus, Sonnet and Fable, requests a model declines are retried on a fallback model automatically.
        </p>
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={() => { onSave(s); onClose(); }}>Save</Btn>
        </div>
      </div>
    </Modal>
  );
}
