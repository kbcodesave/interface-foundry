import { describe, expect, it } from "vitest";
import { generate } from "../src/codegen/generate";
import { styleToClasses } from "../src/codegen/classes";
import { applyOps } from "../src/model/applyOps";
import { newProject, starterData } from "../src/model/defaults";
import { insertSubtree, moveNode, removeNode, subtreeIds } from "../src/model/ops";
import { interfaceFromAI } from "../src/model/sanitize";
import { TEMPLATES } from "../src/library/templates";
import { transpile } from "../src/preview/runtime";
import { buildZip } from "../src/export/package";
import JSZip from "jszip";

describe("style to Tailwind", () => {
  it("maps tokens to scoped CSS variables", () => {
    expect(styleToClasses({ bg: "$color.surface", padding: "$space.2 $space.4", fontSize: "$fontSize.sm" })).toEqual([
      "bg-[color:var(--if-color-surface)]",
      "p-[var(--if-space-2)_var(--if-space-4)]",
      "text-[length:var(--if-font-size-sm)]",
    ]);
    expect(styleToClasses({ display: "none" }, "md:")).toEqual(["md:hidden"]);
  });
});

describe("templates", () => {
  it("every library template generates valid code", () => {
    let data = starterData();
    for (const t of TEMPLATES) data = insertSubtree(data, "main", data.nodes.main.children.length, t.build());
    const res = generate(data);
    expect(res.problems).toEqual([]);
    expect(res.notices.join()).toContain("Sidebar2"); // template sidebar collides with the starter's
    for (const [f, code] of Object.entries(res.files)) if (/\.tsx?$/.test(f)) expect(transpile(f, code).error, f).toBeUndefined();
  });
});

describe("tree ops", () => {
  it("moves, removes and refuses cycles", () => {
    const d = starterData();
    const moved = moveNode(d, "kpis", "header", 0);
    expect(moved.nodes.header.children[0]).toBe("kpis");
    expect(moveNode(d, "main", "kpis", 0)).toBe(d); // into own subtree
    const removed = removeNode(d, "modal");
    expect(removed.nodes.modal).toBeUndefined();
    expect(removed.nodes.new_btn.events?.toggle).toBeUndefined();
  });
});

describe("AI output sanitising", () => {
  it("builds a project from a flat node list and drops junk", () => {
    const { data } = interfaceFromAI({
      name: "X",
      tokens: { color: { dark: { primary: "#f60" } }, font: { body: "Georgia, serif" } },
      screens: [{ name: "Home", route: "/", nodes: [
        { id: "r", parent: null, type: "box", name: "Root", style: { bg: "$color.bg", evil: "url(javascript:alert(1))" } },
        { id: "t", parent: "r", type: "text", name: "Title", text: "<script>alert(1)</script>" },
        { id: "b", parent: "r", type: "weird", name: "Unknown" },
        { id: "o", parent: "r", type: "button", name: "Open", events: { toggle: "m" } },
        { id: "m", parent: "r", type: "box", name: "Menu", hidden: true },
      ] }],
    });
    expect(data.screens).toHaveLength(1);
    const root = data.nodes[data.screens[0].rootId];
    expect(root.children).toHaveLength(4);
    expect((root.style as Record<string, string>).evil).toBeUndefined();
    expect(data.nodes.b.type).toBe("box");
    expect(data.tokens.color.dark.primary).toBe("#f60");
    expect(data.tokens.color.dark.surface).toBeDefined(); // defaults fill gaps
    const code = generate(data).files["src/screens/HomeScreen.tsx"];
    expect(code).toContain(JSON.stringify("<script>alert(1)</script>")); // text is a JS string literal, never markup
  });
});

describe("Design Director ops", () => {
  it("applies patches and enforces selection scope", () => {
    const d = starterData();
    const res = applyOps(d, [
      { op: "update", id: "title", style: { fontSize: "$fontSize.2xl", color: null } },
      { op: "update", id: "logo", style: { color: "red" } },
      { op: "tokens", tokens: { color: { dark: { primary: "#000" } } } },
    ], "header");
    expect(res.data.nodes.title.style.fontSize).toBe("$fontSize.2xl");
    expect(res.data.nodes.title.style.color).toBeUndefined();
    expect(res.data.nodes.logo.style.color).not.toBe("red");
    expect(res.rejected).toHaveLength(2);
    const ins = applyOps(d, [{ op: "insert", parent: "header", index: 0, nodes: [{ id: "x", parent: "header", type: "badge", name: "Beta", text: "BETA" }] }]);
    expect(ins.data.nodes.header.children).toHaveLength(3);
    expect(subtreeIds(ins.data.nodes, "root").length).toBe(subtreeIds(d.nodes, "root").length + 1);
  });
});

describe("export package", () => {
  it("contains code, docs and an honest untested status", async () => {
    const zip = await JSZip.loadAsync(await (await buildZip(newProject("Demo", starterData()), undefined, false)).arrayBuffer());
    const names = Object.keys(zip.files);
    for (const f of ["demo/manifest.json", "demo/README.md", "demo/AI_INTEGRATION_PROMPT.md", "demo/VALIDATION.md", "demo/src/index.ts", "demo/src/foundry.css", "demo/tokens/tokens.json", "demo/src/screens/DashboardScreen.tsx"]) expect(names).toContain(f);
    expect(await zip.file("demo/VALIDATION.md")!.async("string")).toContain("UNTESTED");
    const manifest = JSON.parse(await zip.file("demo/manifest.json")!.async("string"));
    expect(manifest.validation.readyForExport).toBe(false);
    expect(manifest.callbacks.map((c: { name: string }) => c.name)).toContain("onCreateProject");
    const css = await zip.file("demo/src/foundry.css")!.async("string");
    for (const m of css.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/@media[^{]+\{/g, "").matchAll(/([^{}]+)\{/g)) {
      for (const sel of m[1].split(",")) expect(sel.trim().startsWith(".if-root"), sel).toBe(true);
    }
  });
});
