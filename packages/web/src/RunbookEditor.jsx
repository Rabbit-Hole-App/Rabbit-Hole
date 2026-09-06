// b2
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { BlockNoteSchema, defaultBlockSpecs, filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from '@blocknote/core';
import { createReactBlockSpec, getDefaultReactSlashMenuItems, SuggestionMenuController, useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import '@blocknote/shadcn/style.css';
import '@excalidraw/excalidraw/index.css';
import { Loader2, PenTool } from 'lucide-react';
import { api, isDark, navigate } from './api.js';
import { FilePeek } from './ask.jsx';
import { RunPeek } from './run.jsx';
import { Button, ConfirmDialog, Mark, SlidePanel } from './ui.jsx';
import { chartBlock, insertChart } from './ChartBlock.jsx';

const Excalidraw = lazy(() => import('@excalidraw/excalidraw').then((m) => ({ default: m.Excalidraw })));

// The AWS role peek (#role= links): the arn, what the code was observed doing
// with it, and a live read of its policies when the role permits reading itself.
function RolePeek({ appName, onSrc, onClose }) {
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api(`/api/apps/${appName}/role`).then(setInfo).catch((e) => setErr(e.message));
  }, [appName]);
  return (
    <SlidePanel title="AWS role" onClose={onClose} z={40}>
      {err && <div className="p-4 text-sm text-ink-2">{err}</div>}
      {!err && !info && <div className="p-4 text-sm text-ink-2">loading…</div>}
      {info && (
        <div className="space-y-4 p-4 text-sm">
          <div className="rounded-md bg-hover px-3 py-2 font-mono text-xs break-all">{info.arn}</div>
          {info.actions?.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-semibold text-ink-2">What the code does with it</div>
              <ul className="space-y-1">
                {info.actions.map((a, i) => (
                  <li key={i} className="text-[13px]">
                    {a.action}
                    {a.resource ? <span className="font-mono text-xs text-ink-2"> {a.resource}</span> : null}
                    {a.at && /:\d+/.test(a.at) ? (
                      <button type="button" className="ml-1.5 cursor-pointer font-mono text-xs text-accent underline decoration-dotted underline-offset-2" onClick={() => onSrc(a.at)}>{a.at}</button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {info.policies ? (
            <div>
              <div className="mb-1.5 text-xs font-semibold text-ink-2">Policies on the role</div>
              {info.policies.attached?.length > 0 && (
                <div className="mb-2 text-[13px]">Attached: {info.policies.attached.join(', ')}</div>
              )}
              {(info.policies.inline || []).map((p) => (
                <div key={p.name} className="mb-2">
                  <div className="mb-1 font-mono text-xs">{p.name}</div>
                  <pre className="max-h-64 overflow-auto rounded-md bg-hover p-2 text-[11px] leading-relaxed">{JSON.stringify(p.document, null, 2)}</pre>
                </div>
              ))}
              {!info.policies.attached?.length && !info.policies.inline?.length && (
                <div className="text-[13px] text-ink-2">No policies readable on this role.</div>
              )}
            </div>
          ) : (
            <div className="text-[13px] text-ink-2">
              The role does not allow reading its own policies
              {info.policies_error ? <span className="block pt-1 font-mono text-xs">({info.policies_error})</span> : null}
              , so only the access observed in the code is shown above.
            </div>
          )}
        </div>
      )}
    </SlidePanel>
  );
}

// Process-flow diagram on generate: inputs -> app -> outputs, drawn straight
// from the deterministic data_flow (never model-invented). Inserted locked so
// it reads as a figure; the reader can Edit it like any /excalidraw block.
async function insertFlowDiagram(editor, appName, rb) {
  try {
    const df = rb?.data_flow;
    if (!df || (!df.inputs_from?.length && !df.outputs_to?.length)) return;
    const { convertToExcalidrawElements } = await import('@excalidraw/excalidraw');
    // first token only (field name, aws action, host): excalidraw ignores the
    // label fontSize, so long phrases clip - a concise node reads better anyway
    const clean = (s) => (String(s).replace(/`[^`]*`/g, '').match(/^[\w:./<>@-]+/) || ['?'])[0].replace(/[:,.]$/, '').slice(0, 24);
    const ins = (df.inputs_from || []).slice(0, 6);
    const outs = (df.outputs_to || []).slice(0, 6);
    const H = 56, GAP = 14, W = 280, MID = 190, SPAN = 130;
    const colH = (n) => (n ? n * H + (n - 1) * GAP : 0);
    const maxH = Math.max(colH(ins.length), colH(outs.length), H);
    const skel = [];
    ins.forEach((x, i) => skel.push({ id: `in${i}`, type: 'rectangle', x: 0, y: (maxH - colH(ins.length)) / 2 + i * (H + GAP), width: W, height: H, backgroundColor: '#e7f1fd', label: { text: clean(x.what), fontSize: 12 } }));
    skel.push({ id: 'app', type: 'rectangle', x: W + SPAN, y: maxH / 2 - H / 2, width: MID, height: H, backgroundColor: '#ffe8cc', label: { text: appName, fontSize: 15 } });
    outs.forEach((x, i) => skel.push({ id: `out${i}`, type: 'rectangle', x: W + SPAN + MID + SPAN, y: (maxH - colH(outs.length)) / 2 + i * (H + GAP), width: W, height: H, backgroundColor: '#e6f4ea', label: { text: clean(x.what), fontSize: 12 } }));
    ins.forEach((_, i) => skel.push({ type: 'arrow', x: W, y: maxH / 2, start: { id: `in${i}` }, end: { id: 'app' } }));
    outs.forEach((_, i) => skel.push({ type: 'arrow', x: W + SPAN + MID, y: maxH / 2, start: { id: 'app' }, end: { id: `out${i}` } }));
    const elements = convertToExcalidrawElements(skel);
    // sits under the data-flow section it illustrates
    const anchor = editor.document.find((b) => /Where data/i.test(b.content?.map?.((c) => c.text || '').join('') || ''));
    editor.insertBlocks(
      [{ type: 'excalidraw', props: { data: JSON.stringify({ elements }), locked: true } }],
      anchor || editor.document[0],
      anchor ? 'after' : 'before'
    );
  } catch { /* the diagram is a bonus - a failed insert never blocks the runbook */ }
}

// Follow the Settings → Appearance toggle live (applyTheme fires small:theme).
function useDark() {
  const [dark, setDark] = useState(isDark);
  useEffect(() => {
    const on = (e) => setDark(e.detail);
    window.addEventListener('small:theme', on);
    return () => window.removeEventListener('small:theme', on);
  }, []);
  return dark;
}

// Excalidraw canvas as a BlockNote block. The scene (elements only) lives in the
// block's props, so it rides the normal runbook JSON autosave - no extra storage.
function ExcalidrawEmbed({ block, editor }) {
  const editable = editor.isEditable;
  // Done hides the drawing tools (view mode) and rides the autosave; Edit brings them back
  const locked = !!block.props.locked;
  const dark = useDark();
  const timer = useRef();
  const last = useRef(block.props.data);
  const initial = useMemo(() => {
    try {
      return block.props.data ? { ...JSON.parse(block.props.data), scrollToContent: true } : null;
    } catch {
      return null;
    }
  }, []);

  const onChange = (elements) => {
    if (!editable) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const data = JSON.stringify({ elements: elements.filter((e) => !e.isDeleted) });
      if (data !== last.current) {
        last.current = data;
        editor.updateBlock(block, { props: { data } }); // fires the editor's autosave
      }
    }, 800);
  };

  return (
    <div
      className="relative my-1 h-[380px] w-full rounded-sm border border-line"
      contentEditable={false}
      // ProseMirror listens at the editor root; without these it hijacks canvas pointer/key gestures
      onKeyDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {editable && (
        <button
          type="button"
          onClick={() => editor.updateBlock(block, { props: { locked: !locked } })}
          className="absolute top-2 right-2 z-10 inline-flex h-6 cursor-pointer items-center rounded-lg border border-line-strong bg-white px-2 text-xs font-medium text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12)] hover:bg-hover"
        >
          {locked ? 'Edit' : 'Done'}
        </button>
      )}
      <Suspense fallback={<div className="p-3 text-xs text-ink-2">loading canvas…</div>}>
        <Excalidraw initialData={initial} onChange={onChange} viewModeEnabled={!editable || locked} theme={dark ? 'dark' : 'light'} />
      </Suspense>
    </div>
  );
}

// createReactBlockSpec returns a factory in 0.54 - call it to get the spec
const excalidrawBlock = createReactBlockSpec(
  { type: 'excalidraw', propSchema: { data: { default: '' }, locked: { default: false } }, content: 'none' },
  { render: (props) => <ExcalidrawEmbed block={props.block} editor={props.editor} /> },
)();

const schema = BlockNoteSchema.create({ blockSpecs: { ...defaultBlockSpecs, excalidraw: excalidrawBlock, chart: chartBlock } });

const insertExcalidraw = (editor) => ({
  title: 'Drawing',
  subtext: 'Excalidraw canvas',
  aliases: ['excalidraw', 'drawing', 'sketch', 'diagram'],
  group: 'Media',
  icon: <PenTool size={18} />,
  onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'excalidraw' }),
});

// Runbooks store BlockNote's own block JSON - saving markdown was lossy, so the
// saved page never matched what was edited. Legacy rows are markdown: sniff & convert.
function loadContent(editor, raw) {
  if (!raw) return;
  try {
    let blocks;
    try {
      blocks = JSON.parse(raw);
    } catch {
      blocks = editor.tryParseMarkdownToBlocks(raw);
    }
    if (Array.isArray(blocks) && blocks.length) editor.replaceBlocks(editor.document, blocks);
  } catch {
    /* unreadable content - leave the editor empty rather than crash the panel */
  }
}

// Notion behavior: no Save button - edits autosave (debounced), Ctrl+Z is
// BlockNote's own history. Read-only render for viewers without edit rights.
export default function Runbook({ app, canEdit, onSaved }) {
  const editor = useCreateBlockNote({ schema });
  const dark = useDark();
  const [status, setStatus] = useState('');
  const timer = useRef();
  const ready = useRef(false); // loading the initial content fires onChange too - don't autosave that

  useEffect(() => {
    loadContent(editor, app.runbook);
    ready.current = true;
  }, []);

  const save = async () => {
    timer.current = undefined;
    const text = JSON.stringify(editor.document);
    setStatus('saving…');
    try {
      // PUT: POST /api/runbook is the CLI's generate-from-bundle route (merged from main)
      await api('/api/runbook', { method: 'PUT', body: JSON.stringify({ app: app.name, runbook: text }) });
      onSaved(app.name, text);
      setStatus('saved');
    } catch (e) {
      setStatus(`✗ ${e.message}`);
    }
  };

  const onChange = () => {
    if (!ready.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(save, 800);
  };

  // Generate runbook: AI writes the page from the deployed source; jobs also
  // get a /chart block of recent runs appended. /excalidraw and /chart stay
  // available for hand edits afterwards - it is a normal editable page.
  const [genBusy, setGenBusy] = useState(false);
  const [confirmGen, setConfirmGen] = useState(false); // a non-empty page warns before it is replaced
  // #src=path:line-line links (written by the runbook agent) open the code peek
  const [srcPeek, setSrcPeek] = useState(null);
  const [runPeek, setRunPeek] = useState(null); // #run= links open the run panel
  // ref chips (file:line, run ids, s3 uris) are inline code - the accent colour
  // and pointer come from .runbook-refs in index.css, no DOM decoration needed

  const [rolePeek, setRolePeek] = useState(null); // #role= links open the AWS role panel
  const onSrcClick = (e) => {
    // refs are #src=/#run=/#role= links (chipify writes them; onClickCapture
    // intercepts before ProseMirror). Inline code chips from older pages still
    // work via the code branch below.
    const a = e.target.closest?.('a[href^="#src="], a[href^="#run="], a[href^="#role="]');
    if (a) {
      e.preventDefault();
      e.stopPropagation();
      const href = a.getAttribute('href');
      if (href.startsWith('#run=')) setRunPeek(decodeURIComponent(href.slice(5)));
      else if (href.startsWith('#role=')) setRolePeek(decodeURIComponent(href.slice(6)));
      else {
        const ref = decodeURIComponent(href.slice(5));
        const m = ref.match(/^(.+?):(\d+)(?:-(\d+))?$/);
        setSrcPeek(m ? { path: m[1], line: +m[2], lineEnd: m[3] ? +m[3] : null } : { path: ref, line: null, lineEnd: null });
      }
      return;
    }
    const c = e.target.closest?.('code');
    if (!c || c.closest('pre')) return; // inline code only, not log blocks
    const t = (c.textContent || '').trim();
    if (/^r-\w{6,}$/.test(t)) {
      e.preventDefault();
      setRunPeek(t);
      return;
    }
    const m = t.match(/^([\w./-]+\.[A-Za-z]\w*):(\d+)(?:-(\d+))?$/);
    if (m) {
      e.preventDefault();
      setSrcPeek({ path: m[1], line: +m[2], lineEnd: m[3] ? +m[3] : null });
    }
  };
  const generate = async () => {
    setGenBusy(true);
    setStatus('generating…');
    try {
      const d = await api(`/api/apps/${app.name}/generate-runbook`, { method: 'POST' });
      setStatus('writing page…');
      const blocks = await editor.tryParseMarkdownToBlocks(d.markdown);
      if (Array.isArray(blocks) && blocks.length) editor.replaceBlocks(editor.document, blocks);
      setStatus('drawing…');
      await insertFlowDiagram(editor, app.name, d.runbook); // deterministic, from data_flow
      setStatus('chart…');
      if (app.kind === 'job' && editor.document.length) {
        editor.insertBlocks([{ type: 'chart', props: { app: app.name } }], editor.document[editor.document.length - 1], 'after');
      }
      onChange();
      setStatus('');
    } catch (e) {
      setStatus(`✗ ${e.message}`);
    }
    setGenBusy(false);
  };
  useEffect(() => () => {
    // flush a pending save when the panel closes so the last keystrokes aren't lost
    if (timer.current) {
      clearTimeout(timer.current);
      save();
    }
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {canEdit && (
        <div className="flex shrink-0 items-center justify-end py-2">
          <Button variant="soft" size="sm" onClick={() => (editor.document.some((b) => b.content?.length || b.type !== 'paragraph') ? setConfirmGen(true) : generate())} disabled={genBusy} title="AI writes this page from the deployed code and small.toml">
            {genBusy ? <Loader2 size={13} className="animate-spin" /> : <Mark size={13} />} Generate runbook
          </Button>
        </div>
      )}
      {confirmGen && (
        <ConfirmDialog
          title="Replace this runbook?"
          body="Generate runbook erases the current page and writes a fresh one from the deployed code and real runs. This cannot be undone."
          confirmLabel="Replace"
          onConfirm={() => { setConfirmGen(false); generate(); }}
          onCancel={() => setConfirmGen(false)}
        />
      )}
      {srcPeek && <FilePeek appName={app.name} path={srcPeek.path} line={srcPeek.line} lineEnd={srcPeek.lineEnd} onClose={() => setSrcPeek(null)} />}
      {rolePeek && (
        <RolePeek
          appName={app.name}
          onSrc={(at) => {
            const m = at.match(/^(.+?):(\d+)(?:-(\d+))?$/);
            if (m) setSrcPeek({ path: m[1], line: +m[2], lineEnd: m[3] ? +m[3] : null });
          }}
          onClose={() => setRolePeek(null)}
        />
      )}
      {runPeek && (
        <RunPeek
          runId={runPeek}
          app={app}
          onClose={() => setRunPeek(null)}
          onRunAgain={(inputs) => {
            sessionStorage.setItem(`small.runPrefill.${app.name}`, JSON.stringify(inputs || {}));
            setRunPeek(null);
            navigate(`/apps/${app.name}`);
          }}
        />
      )}
      <div className="runbook-refs -mx-[34px] min-h-0 flex-1 overflow-y-auto" onClickCapture={onSrcClick}>{/* cancels bn-editor's 54px gutter down to the panel's 20px */}
        <BlockNoteView editor={editor} editable={canEdit} theme={dark ? 'dark' : 'light'} onChange={canEdit ? onChange : undefined} slashMenu={false} linkToolbar={false}>
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) =>
              filterSuggestionItems([...getDefaultReactSlashMenuItems(editor).filter((i) => i.group !== 'Media'), insertExcalidraw(editor), insertChart(editor, app.name)], query)}
          />
        </BlockNoteView>
      </div>
      {canEdit && <div className="h-4 text-right text-xs text-ink-2">{status}</div>}
    </div>
  );
}
