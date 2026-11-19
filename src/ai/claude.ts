import Anthropic from "@anthropic-ai/sdk";
import type { ProjectData, Reference } from "../model/types";
import { parentOf } from "../model/ops";
import type { AppSettings } from "../store/db";
import { APPLY_EDITS_TOOL, EMIT_INTERFACE_TOOL, REPORT_REFERENCES_TOOL, directorSystem, generationSystem, referenceSystem } from "./prompts";

// Claude API access. The key is the user's own and is stored only in this browser
// (IndexedDB). Requests go directly from the browser to api.anthropic.com.

export class AIError extends Error {}

const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-2", "claude-fable-5-1", "claude-opus-5"]);

type Tool = typeof EMIT_INTERFACE_TOOL | typeof APPLY_EDITS_TOOL | typeof REPORT_REFERENCES_TOOL;
type ContentBlock = Anthropic.Beta.Messages.BetaContentBlockParam;

export interface CallOptions {
  settings: AppSettings;
  onProgress?: (chars: number) => void;
  signal?: AbortSignal;
}

function client(settings: AppSettings) {
  if (!settings.apiKey) throw new AIError("Add your Anthropic API key in Settings to use AI features.");
  return new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
}

function imageBlocks(refs: Reference[]): ContentBlock[] {
  const out: ContentBlock[] = [];
  refs.forEach((r, i) => {
    const m = /^data:(image\/(png|jpeg|gif|webp));base64,(.+)$/.exec(r.dataUrl);
    if (!m) return;
    out.push({ type: "text", text: `Reference ${i + 1}: ${r.name}${r.note ? ` (note: ${r.note})` : ""}` });
    out.push({ type: "image", source: { type: "base64", media_type: m[1] as "image/png" | "image/jpeg" | "image/gif" | "image/webp", data: m[3] } });
  });
  return out;
}

async function callTool(opts: CallOptions, system: string, content: ContentBlock[], tool: Tool): Promise<Record<string, unknown>> {
  const c = client(opts.settings);
  const model = opts.settings.model;
  const params: Anthropic.Beta.Messages.MessageCreateParamsStreaming = {
    model,
    max_tokens: 64000,
    system,
    messages: [{ role: "user", content }],
    tools: [tool as unknown as Anthropic.Beta.Messages.BetaTool],
    tool_choice: { type: "auto" },
    output_config: { effort: opts.settings.effort },
    stream: true,
  };
  if (FALLBACK_MODELS.has(model)) {
    params.betas = ["server-side-fallback-2026-07-01"];
    params.fallbacks = "default";
  }
  let chars = 0;
  const stream = c.beta.messages.stream(params, { signal: opts.signal });
  stream.on("streamEvent", (ev) => {
    if (ev.type === "content_block_delta" && ev.delta.type === "input_json_delta") {
      chars += ev.delta.partial_json.length;
      opts.onProgress?.(chars);
    }
  });
  let msg: Anthropic.Beta.Messages.BetaMessage;
  try {
    msg = await stream.finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new AIError("The API key was rejected. Check it in Settings.");
    if (e instanceof Anthropic.RateLimitError) throw new AIError("Rate limited by the Claude API. Wait a moment and try again.");
    if (e instanceof Anthropic.APIUserAbortError) throw new AIError("Cancelled.");
    if (e instanceof Anthropic.APIError) throw new AIError(`Claude API error: ${e.message}`);
    if (e instanceof SyntaxError) throw new AIError("The response was cut off or malformed. Try again, or ask for fewer screens.");
    throw e;
  }
  if (msg.stop_reason === "refusal") throw new AIError(`Claude declined this request${msg.stop_details?.explanation ? `: ${msg.stop_details.explanation}` : "."}`);
  if (msg.stop_reason === "max_tokens") throw new AIError("The response hit the output limit before finishing. Try a smaller request (fewer screens).");
  const use = msg.content.find((b) => b.type === "tool_use" && b.name === tool.name);
  if (!use || use.type !== "tool_use") {
    const text = msg.content.filter((b) => b.type === "text").map((b) => (b.type === "text" ? b.text : "")).join("\n");
    throw new AIError(text ? `Claude replied without producing a result: ${text.slice(0, 400)}` : "Claude did not return a result.");
  }
  if (!use.input || typeof use.input !== "object") throw new AIError("The result was malformed. Try again.");
  return use.input as Record<string, unknown>;
}

export interface GenerateRequest {
  prompt: string;
  mode?: { label: string; brief: string };
  kind?: string;
  references?: Reference[];
  referenceInstruction?: string;
  avoidPreferences?: boolean;
  preferences?: string;
}

export async function generateInterface(req: GenerateRequest, opts: CallOptions) {
  const lines = [`Design request:\n${req.prompt.trim()}`];
  if (req.kind && req.kind !== "auto") lines.push(`Output type: ${req.kind}.`);
  if (req.mode) lines.push(`Creative direction: ${req.mode.label}. ${req.mode.brief}`);
  if (req.preferences) lines.push(req.avoidPreferences ? `Deliberately AVOID these established preferences of the user and explore something different:\n${req.preferences}` : `The user's established preferences (use as a starting point unless the request says otherwise):\n${req.preferences}`);
  if (req.references?.length) lines.push(`Visual references are attached. ${req.referenceInstruction?.trim() || "Use them as inspiration for an original interface."} Take inspiration, never reproduce.`);
  const content: ContentBlock[] = [...imageBlocks(req.references ?? []), { type: "text", text: lines.join("\n\n") }];
  return callTool(opts, generationSystem(), content, EMIT_INTERFACE_TOOL);
}

/** Compact model for the Director: flat nodes per screen with parent refs, empty fields removed. */
export function compactModel(data: ProjectData): unknown {
  const strip = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "" && !(typeof v === "object" && v && !Array.isArray(v) && Object.keys(v).length === 0)));
  return {
    tokens: data.tokens,
    screens: data.screens.map((s) => {
      const ids: string[] = [];
      const walk = (id: string) => {
        if (!data.nodes[id]) return;
        ids.push(id);
        data.nodes[id].children.forEach(walk);
      };
      walk(s.rootId);
      return {
        name: s.name,
        route: s.route,
        nodes: ids.map((id) => {
          const { children: _c, ...n } = data.nodes[id];
          return strip({ ...n, parent: parentOf(data.nodes, id) ?? null });
        }),
      };
    }),
  };
}

export async function directEdit(command: string, data: ProjectData, scope: { selectedId?: string; selectedName?: string; lock: boolean }, refs: Reference[], opts: CallOptions) {
  const scopeText = scope.selectedId
    ? `Selected node: "${scope.selectedName}" (id ${scope.selectedId}). Scope: ${scope.lock ? "selection (only edit this node and its descendants; no token edits)" : "global (the selection is context, but you may edit elsewhere if the request requires it)"}.`
    : "Nothing is selected. Scope: global.";
  const content: ContentBlock[] = [
    ...imageBlocks(refs),
    { type: "text", text: `Current interface model (JSON):\n${JSON.stringify(compactModel(data))}` },
    { type: "text", text: `${scopeText}\n\nRequest: ${command.trim()}` },
  ];
  return callTool(opts, directorSystem(), content, APPLY_EDITS_TOOL);
}

export async function analyzeReferences(refs: Reference[], instruction: string, opts: CallOptions) {
  if (!refs.length) throw new AIError("Add at least one reference image first.");
  const content: ContentBlock[] = [...imageBlocks(refs), { type: "text", text: instruction.trim() || "Analyse these references." }];
  return callTool(opts, referenceSystem(), content, REPORT_REFERENCES_TOOL);
}

export async function combineVariations(instruction: string, variations: { label: string; data: ProjectData }[], opts: CallOptions) {
  const content: ContentBlock[] = [
    ...variations.map((v) => ({ type: "text" as const, text: `${v.label}:\n${JSON.stringify(compactModel(v.data))}` })),
    { type: "text", text: `Combine the variations above into ONE interface following this instruction exactly, carrying over the named parts faithfully (same structure and styling) and harmonising tokens where they conflict:\n${instruction.trim()}` },
  ];
  return callTool(opts, generationSystem(), content, EMIT_INTERFACE_TOOL);
}
