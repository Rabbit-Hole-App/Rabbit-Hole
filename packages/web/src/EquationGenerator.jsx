import { useEffect, useRef, useState } from "react";
import { MathText } from "./MathText.jsx";
import { validateEquationResult } from "./inline-equation-result.js";

// Mounted inside the existing equation interface, never a separate composer.
// The parent supplies the shared authenticated inline transport and native Undo transaction.
export default function EquationGenerator({
  scopeKey,
  mode = "insert",
  readOnly = false,
  initialPrompt = "",
  onGenerate,
  onAccept,
  onCancel,
}) {
  const [prompt, setPrompt] = useState(initialPrompt),
    [preview, setPreview] = useState(null),
    [latex, setLatex] = useState("");
  const [busy, setBusy] = useState(false),
    [applying, setApplying] = useState(false),
    [accepted, setAccepted] = useState(false),
    [error, setError] = useState(""),
    [question, setQuestion] = useState("");
  const pending = useRef(null),
    sequence = useRef(0),
    scope = useRef(scopeKey),
    latest = useRef(null);
  latest.current = { onGenerate, onAccept, onCancel, readOnly };
  const cancel = () => {
    sequence.current++;
    pending.current?.abort();
    pending.current = null;
    setBusy(false);
  };
  useEffect(() => {
    scope.current = scopeKey;
    cancel();
    setPreview(null);
    setLatex("");
    setError("");
    setQuestion("");
    setAccepted(false);
    setApplying(false);
    setPrompt(initialPrompt);
    return () => {
      sequence.current++;
      pending.current?.abort();
    };
  }, [scopeKey]);
  useEffect(() => {
    if (readOnly) cancel();
  }, [readOnly]);
  const draft = preview
    ? validateEquationResult({
        latex,
        ...(preview.label ? { label: preview.label } : {}),
        ...(preview.assumptions ? { assumptions: preview.assumptions } : {}),
      })
    : null;
  async function generate(event) {
    event.preventDefault();
    if (
      !prompt.trim() ||
      prompt.length > 1000 ||
      pending.current ||
      latest.current.readOnly
    )
      return;
    const controller = new AbortController(),
      ticket = ++sequence.current,
      capturedScope = scope.current;
    pending.current = controller;
    setBusy(true);
    setError("");
    setQuestion("");
    setAccepted(false);
    try {
      const response = await latest.current.onGenerate({
        prompt: prompt.trim(),
        requestId: crypto.randomUUID(),
        signal: controller.signal,
      });
      if (
        ticket !== sequence.current ||
        scope.current !== capturedScope ||
        controller.signal.aborted ||
        latest.current.readOnly
      )
        return;
      const result = response?.result ?? response;
      const value =
        result?.kind === "clarify"
          ? { clarify: { question: result.question } }
          : result?.kind === "equation"
            ? {
                latex: result.latex,
                ...(result.label !== undefined ? { label: result.label } : {}),
                ...(result.assumptions !== undefined
                  ? { assumptions: result.assumptions }
                  : {}),
              }
            : result;
      const checked = validateEquationResult(value);
      if (!checked.ok) {
        setError(checked.error);
        return;
      }
      if (checked.result.kind === "clarify") {
        setQuestion(checked.result.question);
        return;
      }
      setPreview(checked.result);
      setLatex(checked.result.latex);
    } catch (problem) {
      if (ticket === sequence.current && !controller.signal.aborted)
        setError(
          problem?.message ||
            "Equation generation failed. Your description is preserved.",
        );
    } finally {
      if (ticket === sequence.current) {
        pending.current = null;
        setBusy(false);
      }
    }
  }
  async function accept() {
    if (!draft?.ok || busy || applying || accepted || readOnly) return;
    const capturedScope = scope.current;
    setApplying(true);
    setError("");
    try {
      const result = await latest.current.onAccept(draft.result);
      if (scope.current !== capturedScope) return;
      if (result?.ok === false) {
        setError(
          result.error || "The equation changed. Prepare a new preview.",
        );
        return;
      }
      setAccepted(true);
    } catch (problem) {
      if (scope.current === capturedScope)
        setError(problem?.message || "The equation could not be applied.");
    } finally {
      if (scope.current === capturedScope) setApplying(false);
    }
  }
  return (
    <section
      data-equation-generator
      data-keep-focus
      className="w-[360px] max-w-[calc(100vw-32px)] space-y-2 p-2 text-sm"
      aria-label="Generate equation"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          cancel();
          latest.current.onCancel?.();
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <form onSubmit={generate} className="space-y-2">
        <label className="block text-xs">
          Describe the equation
          <textarea
            aria-label="Equation description"
            value={prompt}
            maxLength={1000}
            disabled={readOnly}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe the equation you want…"
            className="mt-1 min-h-16 w-full resize-y rounded border border-line bg-surface p-2 text-ink"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={
              readOnly ||
              busy ||
              !prompt.trim() ||
              typeof onGenerate !== "function"
            }
            className="rounded border border-line px-2 py-1 disabled:opacity-50"
          >
            {busy ? "Generating…" : "Generate"}
          </button>
          {busy && (
            <button
              type="button"
              onClick={cancel}
              className="rounded border border-line px-2 py-1"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
      {question && (
        <p role="status" data-equation-clarification>
          {question} Update your description to clarify.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {preview && (
        <div data-equation-proposal className="space-y-2">
          {preview.label && (
            <p className="text-xs text-ink-2">{preview.label}</p>
          )}
          <div
            data-equation-rendered
            className="max-h-64 overflow-auto rounded border border-line bg-surface p-2"
            tabIndex={0}
            aria-label="Rendered equation preview"
          >
            {draft?.ok ? (
              <MathText expression={draft.result.latex} display />
            ) : (
              <p role="alert">{draft?.error}</p>
            )}
          </div>
          <label className="block text-xs">
            LaTeX
            <textarea
              aria-label="Generated LaTeX"
              spellCheck={false}
              value={latex}
              disabled={readOnly || accepted}
              onChange={(event) => {
                setLatex(event.target.value);
                setError("");
              }}
              className="mt-1 min-h-12 w-full resize-y rounded border border-line bg-surface p-2 font-mono"
            />
          </label>
          {!!preview.assumptions?.length && (
            <ul
              aria-label="Equation assumptions"
              className="list-disc pl-4 text-xs"
            >
              {preview.assumptions.map((assumption, index) => (
                <li key={index}>Assumption: {assumption}</li>
              ))}
            </ul>
          )}
          <p className="text-xs text-ink-2">
            Rendering checks LaTeX compatibility, not mathematical correctness.
          </p>
          <button
            type="button"
            disabled={
              readOnly ||
              busy ||
              applying ||
              accepted ||
              !draft?.ok ||
              typeof onAccept !== "function"
            }
            onClick={accept}
            className="rounded border border-line px-2 py-1 disabled:opacity-50"
          >
            {accepted ? "Applied" : mode === "replace" ? "Apply" : "Insert"}
          </button>
        </div>
      )}
    </section>
  );
}
