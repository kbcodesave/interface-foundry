// Exports sample projects, drops each package into a throwaway Vite + React + Tailwind v4
// host app, then runs a strict TypeScript check and a production build of that host.
// This is the "does the export really integrate?" check, run in CI / locally.
//   npx tsx scripts/export-host-check.ts   (or: npm run test:export)
import { execSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, symlinkSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import JSZip from "jszip";
import { newProject, starterData } from "../src/model/defaults";
import { insertSubtree } from "../src/model/ops";
import { TEMPLATES } from "../src/library/templates";
import { buildZip, slug } from "../src/export/package";
import type { Project } from "../src/model/types";

const root = resolve(process.argv[2] ?? join(process.cwd(), ".export-check"));
const nm = resolve("node_modules");

function kitchenSink(): Project {
  let data = starterData();
  const main = "main";
  for (const t of TEMPLATES) data = insertSubtree(data, main, data.nodes[main].children.length, t.build());
  return newProject("Kitchen Sink", data);
}

async function check(p: Project, label: string) {
  const dir = join(root, label);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "src"), { recursive: true });
  const zip = await JSZip.loadAsync(await (await buildZip(p, undefined, false)).arrayBuffer());
  const folder = slug(p.name);
  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    const out = join(dir, "src", path);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, await file.async("string"));
  }
  if (!existsSync(join(dir, "node_modules"))) symlinkSync(nm, join(dir, "node_modules"));
  const isJs = p.compat.language === "js";
  const first = p.screens[0].name.replace(/[^a-zA-Z0-9]/g, "");
  const screenName = first.endsWith("Screen") ? first : `${first}Screen`;
  writeFileSync(join(dir, "index.html"), `<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.${isJs ? "jsx" : "tsx"}"></script></body></html>`);
  writeFileSync(join(dir, "src/app.css"), `@import "tailwindcss";\n@source "./${folder}";\n`);
  writeFileSync(join(dir, `src/main.${isJs ? "jsx" : "tsx"}`), `import { createRoot } from "react-dom/client";\nimport "./app.css";\nimport "./${folder}/src/foundry.css";\nimport { ${screenName} } from "./${folder}/src";\ncreateRoot(document.getElementById("root")${isJs ? "" : "!"}).render(<${screenName} onNavigate={(r${isJs ? "" : ": string"}) => console.log(r)} />);\n`);
  writeFileSync(join(dir, "vite.config.mjs"), `import react from "@vitejs/plugin-react";\nimport tailwindcss from "@tailwindcss/vite";\nexport default { plugins: [react(), tailwindcss()], logLevel: "warn" };\n`);
  writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", lib: ["ES2022", "DOM"], module: "ESNext", moduleResolution: "bundler", jsx: "react-jsx", strict: true, noUnusedLocals: true, noUnusedParameters: true, noEmit: true, skipLibCheck: true, types: ["vite/client"] }, include: ["src"] }));
  if (!isJs) execSync(`${join(nm, ".bin/tsc")} -p .`, { cwd: dir, stdio: "inherit" });
  execSync(`${join(nm, ".bin/vite")} build`, { cwd: dir, stdio: "inherit" });
  console.log(`✓ ${label}: ${isJs ? "" : "typecheck + "}host build passed`);
}

const starter = newProject("Starter", starterData());
const sink = kitchenSink();
await check(starter, "react-ts");
await check({ ...sink, compat: { ...sink.compat, framework: "nextjs" } }, "next-ts-kitchen-sink");
await check({ ...sink, compat: { ...sink.compat, language: "js" } }, "react-js-kitchen-sink");
