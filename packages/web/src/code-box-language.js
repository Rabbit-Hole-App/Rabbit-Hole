import { CODE_LANGS } from "./code-lang.js";
export const CODE_COMPLETION_LIMIT = 100000;
export const COMPLETION_LANGUAGES = Object.freeze([
  "python",
  "javascript",
  "typescript",
  "json",
  "html",
  "css",
  "sql",
]);
const extensions = {
  py: "python",
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  json: "json",
  html: "html",
  htm: "html",
  css: "css",
  sql: "sql",
  c: "c",
  h: "c",
  cpp: "cpp",
  java: "java",
  go: "go",
  rs: "rust",
  sh: "bash",
  md: "markdown",
};
export function resolveCodeLanguage(language, filename = "") {
  if (CODE_LANGS.some(([id]) => id === language)) return language;
  return (
    extensions[String(filename).split(".").at(-1)?.toLowerCase()] || "text"
  );
}
export function codeCompletionLevel(language, length) {
  if (length > CODE_COMPLETION_LIMIT)
    return "Autocomplete is paused for code over 100,000 characters; editing remains available.";
  if (language === "json") return "JSON syntax and true/false/null completion; no schema or library analysis.";
  if (language === "html" || language === "css") return "Local syntax, native tag/property completion and identifiers; no project or library analysis.";
  return COMPLETION_LANGUAGES.includes(language)
    ? "Local syntax, keywords, snippets and identifiers; no project or library type analysis."
    : "Plain editing; autocomplete is unavailable for this language.";
}
export async function loadCodeLanguage(language) {
  switch (language) {
    case "python":
      return (await import("@codemirror/lang-python")).python();
    case "javascript":
      return (await import("@codemirror/lang-javascript")).javascript({
        jsx: true,
      });
    case "typescript":
      return (await import("@codemirror/lang-javascript")).javascript({
        typescript: true,
        jsx: true,
      });
    case "json":
      return (await import("@codemirror/lang-json")).json();
    case "html":
      return (await import("@codemirror/lang-html")).html();
    case "css":
      return (await import("@codemirror/lang-css")).css();
    case "sql":
      return (await import("@codemirror/lang-sql")).sql();
    default:
      return [];
  }
}
