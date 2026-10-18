import { syntaxTree } from "@codemirror/language";
import { completeFromList, snippetCompletion } from "@codemirror/autocomplete";
import {
  CODE_COMPLETION_LIMIT,
  COMPLETION_LANGUAGES,
} from "./code-box-language.js";

const words = {
  python:
    "and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield",
  javascript:
    "async await break case catch class const continue debugger default delete do else export extends false finally for function if import in instanceof let new null return static super switch this throw true try typeof undefined var void while yield",
  typescript:
    "abstract any as async await boolean break case catch class const continue declare default else enum export extends false finally for from function if implements import in infer interface is keyof let namespace never new null number private protected public readonly return static string super switch this throw true try type typeof undefined unknown var void while yield",
  json: "true false null",
  html: "",
  css: "",
  sql: "SELECT FROM WHERE JOIN LEFT RIGHT INNER OUTER ON GROUP BY ORDER HAVING LIMIT INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE AS AND OR NOT NULL DISTINCT ASC DESC",
};
const snippets = {
  python: [
    snippetCompletion("for ${item} in ${items}:\n    ${pass}", {
      label: "for loop",
      type: "keyword",
    }),
    snippetCompletion("def ${name}(${args}):\n    ${pass}", {
      label: "def function",
      type: "keyword",
    }),
  ],
  javascript: [
    snippetCompletion("for (const ${item} of ${items}) {\n  ${}\n}", {
      label: "for of",
      type: "keyword",
    }),
    snippetCompletion("function ${name}(${args}) {\n  ${}\n}", {
      label: "function",
      type: "keyword",
    }),
  ],
  sql: [
    snippetCompletion("SELECT ${columns}\nFROM ${table}\nWHERE ${condition}", {
      label: "SELECT query",
      type: "keyword",
    }),
  ],
};
export function localCodeCompletion(language) {
  return (context) => {
    if (
      !COMPLETION_LANGUAGES.includes(language) ||
      context.state.doc.length > CODE_COMPLETION_LIMIT
    )
      return null;
    const token = context.matchBefore(/[\w$]+/);
    if (!context.explicit && (!token || token.from === token.to)) return null;
    for (
      let node = syntaxTree(context.state).resolveInner(context.pos, -1);
      node;
      node = node.parent
    )
      if (/comment|string|attributevalue|quoted/i.test(node.name)) return null;
    const source = context.state.doc.toString();
    const options = (words[language] || "")
      .split(" ")
      .filter(Boolean)
      .map((label) => ({ label, type: "keyword" }));
    const seen = new Set(options.map((option) => option.label));
    // Bound scanning and result size independently of renderer and typing updates.
    if (language !== "json")
      for (const match of source.matchAll(/\b[A-Za-z_$][\w$]{1,63}\b/g)) {
        const label = match[0];
        if (seen.has(label) || label === token?.text) continue;
        seen.add(label);
        options.push({ label, type: "variable" });
        if (options.length >= 300) break;
      }
    options.push(
      ...(snippets[language === "typescript" ? "javascript" : language] || []),
    );
    return options.length ? completeFromList(options)(context) : null;
  };
}
