import React, { Fragment, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ArrowRight, BookOpen, ChevronDown, Copy, Menu, Search, X } from 'lucide-react';
import ResizableSidePanel from '../ResizableSidePanel.jsx';
import { CodeBlock, SlidePanel, Toasts, toast } from '../ui.jsx';
import { colorLine } from '../code.jsx';
import { DOCS, docsPath, currentDoc } from './docs-content.js';
import './docs.css';

const entries = Object.entries(DOCS);
const groups = [...new Set(entries.map(([, doc]) => doc.group))];
const fill = value => value.replaceAll('__ORIGIN__', location.origin);
function DocsLink({ slug, children, ...props }) {
  return <a href={docsPath(slug)} {...props}>{children}</a>;
}
function Index({ slug }) {
  return <nav aria-label="Documentation chapters" className="docs-chapters">{groups.map(group => <div key={group} className="docs-chapter-group"><h2>{group}</h2>{entries.filter(([, doc]) => doc.group === group).map(([key, doc]) => <DocsLink key={key} slug={key} aria-current={slug === key ? 'page' : undefined}><span className="docs-nav-dot" />{doc.nav}</DocsLink>)}</div>)}<a className="docs-index-help" href="mailto:hello@tryrabbithole.dev">Need a hand? <span>Email us ↗</span></a></nav>;
}
function Contents({ sections, active, choose }) {
  return <nav aria-label="On this page" className="docs-contents"><h2>On this page</h2>{sections.map(s => <a key={s.id} href={`#${s.id}`} aria-current={active === s.id ? 'location' : undefined} onClick={() => choose(s.id)}>{s.title}</a>)}</nav>;
}
function Block({ block }) {
  if (block.type === 'text') return <p>{block.value}</p>;
  if (block.type === 'code') {
    const lines = fill(block.value).split('\n');
    return <div className="docs-code"><div className="docs-code-label">{block.label}</div><CodeBlock>{lines.map((line, i) => <Fragment key={i}>{colorLine(line)}{i < lines.length - 1 ? '\n' : ''}</Fragment>)}</CodeBlock></div>;
  }
  if (block.type === 'note') return <aside className="docs-note"><strong>{block.title}</strong><p>{block.value}</p></aside>;
  if (block.type === 'list') return <ul className="docs-list">{block.items.map(item => <li key={item}>{item}</li>)}</ul>;
  if (block.type === 'table') return <div className="docs-table-scroll" tabIndex={0} role="region" aria-label="Reference table"><table><thead><tr>{block.headers.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead><tbody>{block.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>;
  if (block.type === 'links') return <div className="docs-link-list">{block.items.map(([slug, title, description]) => <DocsLink key={slug} slug={slug}><div><strong>{title}</strong><span>{description}</span></div><ArrowRight size={19} aria-hidden="true" /></DocsLink>)}</div>;
  return null;
}
function SearchDialog({ open, close }) {
  const dialog = useRef(null), input = useRef(null);
  const [query, setQuery] = useState('');
  const results = entries.filter(([, doc]) => JSON.stringify(doc).toLowerCase().includes(query.toLowerCase().trim()));
  useEffect(() => {
    if (open) { setQuery(''); dialog.current.showModal(); input.current.focus(); }
    else if (dialog.current.open) dialog.current.close();
  }, [open]);
  return <dialog ref={dialog} className="docs-search-dialog" aria-labelledby="docs-search-title" onCancel={close} onClick={event => { if (event.target === dialog.current) close(); }}>
    <div className="docs-search-top"><h2 id="docs-search-title">Search the docs</h2><button aria-label="Close search" onClick={close}><X size={19} /></button></div>
    <label className="docs-search-input"><Search size={20} aria-hidden="true" /><input ref={input} value={query} onChange={e => setQuery(e.target.value)} placeholder="Try “workspace”, “API”, or “AWS”…" aria-label="Search documentation" onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); dialog.current.querySelector('.docs-search-results a')?.focus(); } }} /></label>
    <p className="docs-search-count" role="status">{results.length ? `${results.length} ${results.length === 1 ? 'page' : 'pages'}` : 'No matching pages. Try another word.'}</p>
    <div className="docs-search-results">{results.map(([slug, doc]) => <DocsLink key={slug} slug={slug} onClick={close}><span>{doc.group}</span><strong>{doc.nav}</strong><p>{doc.description}</p></DocsLink>)}</div>
  </dialog>;
}
function DocsApp() {
  const [slug, setSlug] = useState(() => currentDoc(location.pathname) || 'introduction');
  const [searchOpen, setSearchOpen] = useState(false), [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState(DOCS[slug].sections[0].id);
  const main = useRef(null), browse = useRef(null);
  const doc = DOCS[slug], index = entries.findIndex(([key]) => key === slug);
  useEffect(() => {
    const onNavigate = event => {
      const link = event.target.closest('a[href]');
      if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target) return;
      const url = new URL(link.href);
      const next = currentDoc(url.pathname);
      if (!next || url.origin !== location.origin || !url.pathname.startsWith('/docs') || url.hash) return;
      event.preventDefault(); history.pushState({}, '', url.pathname); setSlug(next); setMenuOpen(false); setSearchOpen(false);
      window.scrollTo({ top: 0, behavior: 'instant' });
      requestAnimationFrame(() => main.current.querySelector('h1')?.focus({ preventScroll: true }));
    };
    const onPop = () => { const next = currentDoc(location.pathname); if (next) setSlug(next); };
    const onKey = event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(open => !open); } };
    document.addEventListener('click', onNavigate); window.addEventListener('popstate', onPop); window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', onNavigate); window.removeEventListener('popstate', onPop); window.removeEventListener('keydown', onKey); };
  }, []);
  useEffect(() => {
    document.title = `${doc.nav} | Rabbit Hole Docs`;
    setActive(doc.sections[0].id);
    const update = () => {
      const sections = [...main.current.querySelectorAll('section[id]')];
      const passed = sections.filter(s => s.getBoundingClientRect().top <= 195);
      setActive((passed.at(-1) || sections[0]).id);
    };
    window.addEventListener('scroll', update, { passive: true });
    const frame = requestAnimationFrame(() => {
      if (location.hash) main.current.querySelector(`[id="${CSS.escape(decodeURIComponent(location.hash.slice(1)))}"]`)?.scrollIntoView();
      update();
    });
    return () => { window.removeEventListener('scroll', update); cancelAnimationFrame(frame); };
  }, [doc]);
  useEffect(() => {
    if (!menuOpen) return;
    const regions = [document.getElementById('bar'), document.getElementById('docs-toolbar'), document.querySelector('.docs-layout'), document.querySelector('footer')];
    regions.forEach(el => { if (el) el.inert = true; });
    const panel = document.querySelector('[role="dialog"][aria-label="Documentation"]');
    const focusables = () => [...panel.querySelectorAll('a[href],button,[tabindex="0"]')];
    focusables()[0]?.focus();
    const trap = e => {
      if (e.key !== 'Tab') return;
      const items = focusables(), at = items.indexOf(document.activeElement);
      if (e.shiftKey && at <= 0) { e.preventDefault(); items.at(-1)?.focus(); }
      else if (!e.shiftKey && at === items.length - 1) { e.preventDefault(); items[0]?.focus(); }
    };
    panel.addEventListener('keydown', trap);
    return () => { regions.forEach(el => { if (el) el.inert = false; }); panel.removeEventListener('keydown', trap); browse.current?.focus({ preventScroll: true }); };
  }, [menuOpen]);
  const copyPage = async () => {
    const parts = [`# ${doc.title}`, doc.description];
    for (const section of doc.sections) {
      parts.push(`## ${section.title}`);
      for (const block of section.blocks) {
        if (block.value) parts.push(block.value);
        else if (block.items) parts.push(block.items.map(item => Array.isArray(item) ? item.slice(1).join(': ') : item).join('\n'));
        else if (block.rows) parts.push([block.headers, ...block.rows].map(row => row.join(' | ')).join('\n'));
      }
    }
    const body = parts.join('\n\n');
    try { await navigator.clipboard.writeText(fill(body)); toast('Page copied'); }
    catch { toast('Copy unavailable. Select the text to copy it.', { tone: 'error' }); }
  };
  return <>
    <div className="docs-toolbar" id="docs-toolbar"><a className="docs-guide-label" href="/docs"><BookOpen size={17} aria-hidden="true" />Documentation</a><button ref={browse} className="docs-browse" onClick={() => setMenuOpen(true)}><Menu size={17} />Browse docs</button><button className="docs-search-trigger" onClick={() => setSearchOpen(true)}><Search size={17} aria-hidden="true" /><span>Search the docs…</span><kbd>Ctrl K</kbd></button><a className="docs-workspace-link" href="/apps">Open workspace ↗</a></div>
    <div className="docs-layout">
      <ResizableSidePanel className="docs-index-panel" defaultWidth={228} minWidth={200} maxWidth={310} resizeEdge="right" resizeLabel="Resize documentation navigation"><Index slug={slug} /></ResizableSidePanel>
      <main className="docs-article" id="docs-main" ref={main} tabIndex={-1}><header className="docs-article-header"><div className="docs-breadcrumb"><span>{doc.group}</span><span aria-hidden="true">/</span><span>{doc.nav}</span><button onClick={copyPage} aria-label="Copy this page"><Copy size={14} /><span>Copy page</span></button></div><p className="docs-eyebrow">RABBIT HOLE / DEVELOPER DOCS</p><h1 tabIndex={-1}>{doc.title}</h1><p className="docs-description">{doc.description}</p></header>
      <details className="docs-mobile-contents"><summary>On this page <ChevronDown size={15} /></summary><Contents sections={doc.sections} active={active} choose={setActive} /></details>
      {doc.sections.map(s => <section key={s.id} id={s.id} className="docs-section"><h2><a href={`#${s.id}`}>{s.title}<span aria-hidden="true">#</span></a></h2>{s.blocks.map((block, i) => <Block key={i} block={block} />)}</section>)}
      <nav className="docs-pagination" aria-label="Adjacent documentation pages">{index > 0 ? <DocsLink slug={entries[index - 1][0]}><ArrowLeft size={18} /><span><small>Previous</small>{entries[index - 1][1].nav}</span></DocsLink> : <span />}{index < entries.length - 1 && <DocsLink slug={entries[index + 1][0]}><span><small>Next</small>{entries[index + 1][1].nav}</span><ArrowRight size={18} /></DocsLink>}</nav>
      <p className="docs-feedback">Something unclear? <a href="mailto:hello@tryrabbithole.dev?subject=Documentation%20feedback">Tell us what’s missing ↗</a></p></main>
      <ResizableSidePanel className="docs-toc-panel" defaultWidth={210} minWidth={180} maxWidth={270} resizeLabel="Resize page contents"><Contents sections={doc.sections} active={active} choose={setActive} /><a className="docs-rail-link" href="/manifesto">Why we’re building this <ArrowRight size={16} /></a><span className="rh-mark docs-rail-mark" aria-hidden="true" /></ResizableSidePanel>
    </div>
    {menuOpen && <SlidePanel title="Documentation" width={380} z={50} onClose={() => setMenuOpen(false)}><Index slug={slug} /></SlidePanel>}
    <SearchDialog open={searchOpen} close={() => setSearchOpen(false)} /><Toasts />
  </>;
}
createRoot(document.getElementById('docs-root')).render(<DocsApp />);
