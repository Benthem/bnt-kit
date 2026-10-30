import { describe, expect, it } from "vitest";
import { importsOf, impuritiesOf } from "../src/testing/purity";

describe("purity scanner", () => {
  it("finds every kind of import", () => {
    const source = `import a from "./a"; import type { B } from "./b"; export * from "./c"; export { d } from "./d";
      const e = await import("./e"); type F = import("./f").F; const g = require("./g");`;
    expect(importsOf(source)).toEqual(["./a", "./b", "./c", "./d", "./e", "./f", "./g"]);
    expect(importsOf(`const x = <div>{1}</div>; import y from "./y";`, true)).toEqual(["./y"]);
  });

  it("finds reads of the clock and randomness, not dates from values", () => {
    expect(impuritiesOf("Date.now(); new Date(); new Date('2026-01-01'); Math.random(); crypto.randomUUID(); performance.now();"))
      .toEqual(["Date.now()", "new Date()", "Math.random()", "crypto.randomUUID()", "performance.now()"]);
  });
});
