import { describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { starterData } from "../src/model/defaults";
import { generate } from "../src/codegen/generate";
import { transpile } from "../src/preview/runtime";

describe("generator", () => {
  it("generates transpilable files for the starter project", () => {
    const res = generate(starterData());
    expect(res.problems).toEqual([]);
    for (const [f, code] of Object.entries(res.files)) {
      if (/\.tsx?$/.test(f)) expect(transpile(f, code).error, f).toBeUndefined();
    }
    const out = process.env.GEN_OUT;
    if (out) for (const [f, code] of Object.entries(res.files)) {
      mkdirSync(dirname(join(out, f)), { recursive: true });
      writeFileSync(join(out, f), code);
    }
  });
});
