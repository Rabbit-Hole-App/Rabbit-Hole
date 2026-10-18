// Lazy-load this component only while a Code text box is actively edited.
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Annotation,
  Compartment,
  EditorState,
  Prec,
  Transaction,
} from "@codemirror/state";
import {
  EditorView,
  keymap,
  drawSelection,
  highlightActiveLine,
  tooltips,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  undo,
  redo,
} from "@codemirror/commands";
import {
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
  defaultHighlightStyle,
} from "@codemirror/language";
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
  acceptCompletion,
  closeCompletion,
  currentCompletions,
  nextSnippetField,
  prevSnippetField,
} from "@codemirror/autocomplete";
import { CODE_LANGS } from "./code-lang.js";
import {
  resolveCodeLanguage,
  loadCodeLanguage,
  codeCompletionLevel,
  CODE_COMPLETION_LIMIT,
  COMPLETION_LANGUAGES,
} from "./code-box-language.js";
import { localCodeCompletion } from "./code-box-completion.js";
const externalDocument = Annotation.define();

export default forwardRef(function CodeBoxEditor(
  {
    value,
    language,
    filename,
    readOnly = false,
    onChange,
    onLanguageChange,
    onExit,
    onDiscard,
    onInlineAI,
    onApi,
    autoFocus = true,
    zoom = 1,
    cameraKey,
    base = {},
    getTooltipSpace,
  },
  ref,
) {
  const host = useRef(null),
    view = useRef(null),
    api = useRef(null),
    latest = useRef(null),
    listeners = useRef(new Set());
  const languageSlot = useRef(new Compartment()),
    accessSlot = useRef(new Compartment()),
    completionSlot = useRef(new Compartment());
  const done = useRef(false),
    dirty = useRef(false),
    conflict = useRef(false),
    composing = useRef(false);
  const baseline = useRef(String(value ?? ''));
  const [length, setLength] = useState(String(value || "").length),
    [notice, setNotice] = useState("");
  const lang = resolveCodeLanguage(language, filename);
  latest.current = {
    onChange,
    onLanguageChange,
    onExit,
    onDiscard,
    base,
    onInlineAI,
    onApi,
    readOnly,
    getTooltipSpace,
  };
  useImperativeHandle(
    ref,
    () => ({
      get root() {
        return api.current?.root;
      },
      getText: () => api.current?.getText(),
      getSelection: () => api.current?.getSelection(),
      focus: () => api.current?.focus(),
      refocus: () => api.current?.refocus(),
      commit: (reason) => api.current?.commit(reason),
      subscribe: (listener) => api.current?.subscribe(listener),
    }),
    [],
  );
  useEffect(() => {
    const selection = () => {
      const range = view.current.state.selection.main;
      return {
        from: range.from,
        to: range.to,
        text: view.current.state.sliceDoc(range.from, range.to),
        source: view.current.state.doc.toString(),
      };
    };
    const commit = (reason) => {
      if (done.current) return;
      done.current = true;
      closeCompletion(view.current);
      const accepted = latest.current.onExit?.({
        value: view.current.state.doc.toString(),
        reason,
        conflict: conflict.current,
        expectedText: baseline.current,
      });
      if (accepted === false) {
        done.current = false;
        conflict.current = true;
        setNotice('The source changed or is no longer editable. Copy your draft or discard it to keep the latest source.');
      }
    };
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: String(value ?? ""),
        extensions: [
          history(),
          drawSelection(),
          highlightActiveLine(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          languageSlot.current.of([]),
          accessSlot.current.of([
            EditorState.readOnly.of(readOnly),
            EditorView.editable.of(!readOnly),
          ]),
          completionSlot.current.of(autocompletion({ defaultKeymap: false })),
          tooltips({
            parent: document.body,
            position: "fixed",
            tooltipSpace: () =>
              latest.current.getTooltipSpace?.() || {
                left: 0,
                top: 0,
                right: document.documentElement.clientWidth,
                bottom: document.documentElement.clientHeight,
              },
          }),
          Prec.highest(
            keymap.of([
              {
                key: "Mod-k",
                run: (v) => {
                  if (composing.current || v.composing) return true;
                  if (!latest.current.onInlineAI) return false;
                  latest.current.onInlineAI(selection());
                  return true;
                },
              },
              {
                key: "Escape",
                run: (v) => {
                  if (composing.current || v.composing) return true;
                  if (closeCompletion(v)) return true;
                  commit("esc");
                  return true;
                },
              },
              {
                key: "Mod-Enter",
                run: (v) => {
                  if (composing.current || v.composing) return true;
                  commit("keyboard");
                  return true;
                },
              },
              { key: "Mod-z", run: undo, shift: redo },
              {
                key: "Tab",
                run: (v) =>
                  composing.current ||
                  v.composing ||
                  (currentCompletions(v.state).length
                    ? acceptCompletion(v) || true
                    : nextSnippetField(v) || indentWithTab.run(v)),
              },
              {
                key: "Shift-Tab",
                run: (v) =>
                  composing.current ||
                  v.composing ||
                  prevSnippetField(v) ||
                  indentWithTab.shift(v),
              },
            ]),
          ),
          keymap.of([
            ...closeBracketsKeymap,
            ...completionKeymap.filter(binding => binding.key !== 'Enter'),
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.domEventHandlers({
            blur: (event) => {
              if (event.relatedTarget?.closest?.('[data-keep-focus],.cm-tooltip')) return;
              queueMicrotask(() => {
                if (view.current && !host.current?.parentElement?.contains(document.activeElement) && !document.activeElement?.closest?.('[data-keep-focus],.cm-tooltip')) commit('blur');
              });
            },
            compositionstart: () => {
              composing.current = true;
            },
            compositionend: () => {
              composing.current = false;
            },
            keydown: (event) => {
              if (composing.current || event.isComposing) {
                event.stopPropagation();
                return (
                  event.key === "Tab" ||
                  ((event.ctrlKey || event.metaKey) &&
                    ["k", "Enter"].includes(event.key))
                );
              }
              if (
                (event.ctrlKey || event.metaKey) &&
                event.key.toLowerCase() === "k" &&
                !latest.current.onInlineAI
              )
                return false;
              event.stopPropagation();
              return false;
            },
            pointerdown: (event) => {
              event.stopPropagation();
            },
            wheel: (event) => {
              event.stopPropagation();
            },
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const text = update.state.doc.toString();
              setLength(text.length);
              if (
                !update.transactions.some((transaction) =>
                  transaction.annotation(externalDocument),
                )
              ) {
                dirty.current = true;
                latest.current.onChange?.(text);
              }
            }
            if (update.docChanged || update.selectionSet)
              for (const listener of listeners.current) listener();
          }),
          EditorView.contentAttributes.of({
            "aria-label": "Code text box",
            spellcheck: "false",
            "data-code-box-input": "",
          }),
          EditorView.theme({
            "&": {
              height: "100%",
              fontSize: "inherit",
              backgroundColor: "transparent",
              color: "inherit",
            },
            ".cm-scroller": { fontFamily: "monospace", overflow: "auto" },
            ".cm-content": { padding: "4px" },
            ".cm-focused": { outline: "none" },
            ".cm-tooltip": { fontSize: "14px", maxWidth: "340px" },
            ".cm-tooltip-autocomplete": { fontFamily: "monospace" },
          }),
        ],
      }),
    });
    view.current = editor;
    api.current = {
      root: editor.dom,
      getText: () => editor.state.doc.toString(),
      getSelection: selection,
      focus: () => editor.focus(),
      refocus: () => editor.focus(),
      commit,
      subscribe: (listener) => {
        listeners.current.add(listener);
        return () => listeners.current.delete(listener);
      },
      state: () => ({
        ...selection(),
        runs: [{ t: editor.state.doc.toString() }],
        code: true,
        pending: {},
        base: latest.current.base,
      }),
      strip: () => {},
      undo: () => undo(editor),
      redo: () => redo(editor),
    };
    latest.current.onApi?.(api.current);
    if (autoFocus) editor.focus();
    return () => {
      latest.current.onApi?.(null);
      editor.destroy();
      view.current = null;
      api.current = null;
      listeners.current.clear();
    };
  }, []); // one instance per active object; the parent keys this component by object ID
  useEffect(() => {
    let live = true;
    loadCodeLanguage(lang)
      .then((support) => {
        if (!live || !view.current) return;
        const localSource = localCodeCompletion(lang);
        const completion =
          COMPLETION_LANGUAGES.includes(lang) && length <= CODE_COMPLETION_LIMIT
            ? EditorState.languageData.of(() => [
                { autocomplete: localSource },
              ])
            : [];
        view.current.dispatch({
          effects: languageSlot.current.reconfigure([support, completion]),
        });
      })
      .catch(() => {
        if (live)
          setNotice(
            "Language support could not load; plain editing remains available.",
          );
      });
    return () => {
      live = false;
    };
  }, [lang, length > CODE_COMPLETION_LIMIT]);
  useEffect(() => {
    view.current?.dispatch({
      effects: accessSlot.current.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    });
  }, [readOnly]);
  useEffect(() => {
    view.current?.dispatch({
      effects: completionSlot.current.reconfigure(
        autocompletion({
          defaultKeymap: false,
          override:
            readOnly ||
            length > CODE_COMPLETION_LIMIT ||
            !COMPLETION_LANGUAGES.includes(lang)
              ? []
              : undefined,
        }),
      ),
    });
  }, [readOnly, lang, length > CODE_COMPLETION_LIMIT]);
  useEffect(() => {
    const editor = view.current;
    if (!editor || String(value ?? "") === editor.state.doc.toString()) return;
    if (dirty.current) {
      conflict.current = true;
      setNotice(
        "The source changed elsewhere. Finish editing to review the conflict.",
      );
      return;
    }
    baseline.current = String(value ?? '');
    editor.dispatch({
      changes: {
        from: 0,
        to: editor.state.doc.length,
        insert: String(value ?? ""),
      },
      annotations: [
        Transaction.addToHistory.of(false),
        externalDocument.of(true),
      ],
    });
  }, [value]);
  useEffect(() => {
    if (view.current) closeCompletion(view.current);
  }, [zoom, cameraKey]);
  useEffect(() => {
    const close = () => { if (view.current) closeCompletion(view.current); };
    const observer = new ResizeObserver(close);
    if (host.current) observer.observe(host.current);
    window.addEventListener('resize', close);
    return () => { observer.disconnect(); window.removeEventListener('resize', close); };
  }, []);
  return (
    <div
      data-code-box-editor
      className="flex h-full min-h-20 flex-col"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div data-keep-focus className="flex items-center gap-2 text-xs">
        <label>
          Language{" "}
          <select
            aria-label="Code language"
            disabled={readOnly}
            value={lang}
            onKeyDown={(event) => event.stopPropagation()}
            onChange={(event) =>
              latest.current.onLanguageChange?.(event.target.value)
            }
          >
            {CODE_LANGS.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <span title={codeCompletionLevel(lang, length)}>
          Ctrl+Space · Ctrl+Enter to finish
        </span>
      </div>
      <div ref={host} className="min-h-0 flex-1" />
      {conflict.current && <div className="flex gap-2 text-xs" data-keep-focus>
        <button type="button" onClick={() => navigator.clipboard.writeText(view.current?.state.doc.toString() || '').catch(() => setNotice('Select and copy your draft with the keyboard.'))}>Copy draft</button>
        <button type="button" onClick={() => latest.current.onDiscard?.()}>Discard draft</button>
      </div>}
      {(notice ||
        length > CODE_COMPLETION_LIMIT ||
        !COMPLETION_LANGUAGES.includes(lang)) && (
        <p role="status" className="text-xs text-ink-2">
          {notice || codeCompletionLevel(lang, length)}
        </p>
      )}
    </div>
  );
});
