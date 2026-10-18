import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";
import { resolveCodeLanguage, loadCodeLanguage } from "./code-box-language.js";
import { localCodeCompletion } from "./code-box-completion.js";
test("explicit language survives; unknown and new boxes default plain text or known extension", () => {
  assert.equal(resolveCodeLanguage("python", "file.js"), "python");
  assert.equal(resolveCodeLanguage(undefined), "text");
  assert.equal(resolveCodeLanguage("unknown"), "text");
  assert.equal(resolveCodeLanguage(undefined, "a.ts"), "typescript");
  assert.equal(resolveCodeLanguage("text", "a.py"), "text");
});
test("keyword and local identifier suggestions replace the token range", async () => {
  const state = EditorState.create({
    doc: "customValue = 1\ncust",
    extensions: [await loadCodeLanguage("python")],
  });
  const result = localCodeCompletion("python")(
    new CompletionContext(state, state.doc.length, true),
  );
  assert.equal(result.from, state.doc.length - 4);
  assert.ok(result.options.some((item) => item.label === "customValue"));
  assert.ok(result.options.some((item) => item.label === "return"));
  assert.ok(result.options.some((item) => item.label === "def function"));
});
test("comments, strings, unsupported languages and large sources do not get forced suggestions", async () => {
  for (const doc of ["# retur", 'value = "retur']) {
    const state = EditorState.create({
      doc,
      extensions: [await loadCodeLanguage("python")],
    });
    assert.equal(
      localCodeCompletion("python")(
        new CompletionContext(state, doc.length, true),
      ),
      null,
    );
  }
  for (const [lang, doc] of [
    ["text", "ret"],
    ["rust", "ret"],
    ["python", "x".repeat(100001)],
  ]) {
    const state = EditorState.create({ doc });
    assert.equal(
      localCodeCompletion(lang)(new CompletionContext(state, doc.length, true)),
      null,
    );
  }
});
test("all supported language modules load locally", async () => {
  for (const lang of [
    "python",
    "javascript",
    "typescript",
    "json",
    "html",
    "css",
    "sql",
  ])
    assert.ok(await loadCodeLanguage(lang));
});
