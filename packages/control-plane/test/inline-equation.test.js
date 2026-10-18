import test from "node:test";
import assert from "node:assert/strict";
import {
  checkEquation,
  INLINE_EQUATION_SYSTEM,
  INLINE_EQUATION_TOOL,
} from "../src/inline-equation.js";
test("toolbar and inline equation results share safe bounded renderer validation", () => {
  assert.equal(checkEquation({ latex: "x^2+y^2=r^2" }).result.kind, "equation");
  assert.equal(
    checkEquation({ clarify: { question: "Which variable?" } }).result.kind,
    "clarify",
  );
  assert.ok(
    checkEquation({
      latex: String.raw`\includegraphics{https://example.com/a.png}`,
    }).error,
  );
  assert.ok(checkEquation({ latex: "x".repeat(4001) }).error);
});
test("prompt preserves context scope, explicit intent and verification limits", () => {
  assert.match(INLINE_EQUATION_SYSTEM, /explicit user instruction outranks/);
  assert.match(INLINE_EQUATION_SYSTEM, /not permission to replace/);
  assert.match(
    INLINE_EQUATION_SYSTEM,
    /Do not claim rendering proves mathematics/,
  );
  assert.equal(INLINE_EQUATION_TOOL.input_schema.additionalProperties, false);
});
