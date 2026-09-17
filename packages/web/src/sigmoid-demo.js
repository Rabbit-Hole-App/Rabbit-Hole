import { sigmoidObjects } from './sigmoid-context.js';
import { writingFrames } from './canvas-writing.js';
import { isMuted, onMuted } from './learn-audio.js';
import { Box, PageRecordType, createShapeId, getIndices, toRichText } from 'tldraw';

export const sigmoidPages = [
  { id: 'introduction', label: 'What is logistic regression?', text: '**Page 1 · What is logistic regression?**\n\nEstimate the probability of a yes/no outcome. Use it for spam detection or customer churn. A separate threshold turns a probability into a class.' },
  { id: 'formula', label: 'The logistic regression formula', text: '**Page 2 · The logistic regression formula**\n\nFeatures and learned weights form a score, z. The sigmoid turns that score into P(y=1 | x).' },
  { id: 'sigmoid', label: 'The sigmoid function', text: '**Page 3 · The sigmoid function**\n\nThe sigmoid maps any real score to a value between 0 and 1. At zero, exp(0)=1, so σ(0)=0.5. The curve approaches 0 and 1 at the extremes. This is the probability function, not the training loss.' },
];

// Scripted visual prototype. Frames retain their position when paused; seeking
// rebuilds only lesson-owned shapes, leaving learner drawings intact.
export function playSigmoid(editor, explain, lesson, onChange, generated = null) {
  const definition = generated ? generated.pages.map((p, i) => ({ id: `page-${i + 1}`, label: p.title, text: p.narration })) : sigmoidPages;
  const lessonId = generated?.id || 'sigmoid-demo';
  const viewport = generated?.viewport || { w: 640, h: 740 };
  const courseSlot = generated?.id.split('-').slice(0, 2).join('-');
  lesson.lessonId = lessonId;
  const objects = generated ? {} : sigmoidObjects;
  const initialPage = editor.getCurrentPage();
  const pages = definition.map((page, i) => {
    const existing = editor.getPages().find(p => generated ? p.meta.learnCoursePage === `${courseSlot}:${i}` : p.meta.sigmoidLessonPage === i);
    const reuseInitial = !generated && i === 0 && !initialPage.meta.learnCoursePage;
    const id = existing?.id || (reuseInitial ? initialPage.id : PageRecordType.createId());
    const meta = generated ? { learnCoursePage: `${courseSlot}:${i}` } : { sigmoidLessonPage: i };
    if (!existing && !reuseInitial) editor.createPage({ id, name: page.label, meta });
    else editor.updatePage({ id, name: page.label, meta: { ...(existing || initialPage).meta, ...meta } });
    return id;
  });
  const clear = () => editor.deleteShapes(editor.getCurrentPageShapes().filter(s => generated ? s.meta.author === 'script' && s.meta.learnLesson?.startsWith(`${courseSlot}-`) : s.meta.sigmoidDemo).map(s => s.id));
  const offsets = pages.map(id => {
    editor.setCurrentPage(id); clear();
    const bounds = editor.getCurrentPageBounds();
    return bounds ? bounds.maxX + 80 : 0;
  });
  editor.setCurrentPage(pages[0]);
  editor.setCurrentTool('select');
  editor.selectNone();
  const fitPage = index => editor.zoomToBounds(new Box(offsets[index] + (viewport.x || 0), viewport.y || 0, viewport.w, viewport.h), { inset: 40 });
  fitPage(0);
  const frames = definition.map(() => []);
  let building = 0;
  const frame = (apply, delay = 0) => frames[building].push({ apply, delay });
  const create = (shape, objectId, status = 'drawing') => editor.createShape({ ...shape, x: shape.x + offsets[step],
    meta: { sigmoidDemo: !generated, learnLesson: lessonId, lessonId, runId: lesson.runId, author: 'script',
      ...objects[objectId], objectId, stageId: lesson.currentStage, renderStatus: status,
      ...(objectId === 'axes-x' || objectId === 'axes-y' ? { coordinateMapping: { origin: { x: offsets[step] + 315, y: 470 }, xUnitsToPage: 490 / 12, yUnitsToPage: -250 } } : {}) } });
  const complete = id => frame(() => {
    const shape = editor.getShape(id);
    if (shape) editor.updateShape({ id, type: shape.type, meta: { ...shape.meta, renderStatus: 'complete' } });
  });
  function write(text, x, y, size = 'm', color = 'black', objectId = 'title', width = null) {
    const id = createShapeId();
    frame(() => create({ id, type: 'text', x, y, props: { richText: toRichText(''), font: 'draw', size, color, ...(width ? { w: width, autoSize: false } : {}) } }, objectId));
    for (const f of writingFrames(text, value => { if (editor.getShape(id)) editor.updateShape({ id, type: 'text', props: { richText: toRichText(value) } }); })) frame(f.apply, f.delay);
    complete(id);
  }
  function stroke(coords, color = 'grey', duration = 600, objectId = 'curve') {
    const id = createShapeId(), indices = getIndices(coords.length);
    const points = count => Object.fromEntries(coords.slice(0, count).map(([x, y], i) => [indices[i], { id: indices[i], index: indices[i], x, y }]));
    frame(() => create({ id, type: 'line', x: 0, y: 0, props: { points: points(2), color, size: 's', dash: 'solid' } }, objectId));
    for (let n = 3; n <= coords.length; n++) {
      frame(() => { if (editor.getShape(id)) editor.updateShape({ id, type: 'line', props: { points: points(n) } }); }, duration / coords.length);
    }
    complete(id);
  }
  const segment = (x1, y1, x2, y2) => Array.from({ length: 25 }, (_, i) => [x1 + (x2 - x1) * i / 24, y1 + (y2 - y1) * i / 24]);
  const pageParts = definition.map(() => null);
  if (generated) {
    const wrap = text => text.split('\n').flatMap(line => line.match(/.{1,38}(?:\s|$)|\S{1,38}/g)?.map(s => s.trim()) || ['']).join('\n');
    generated.pages.forEach((page, i) => {
      building = i;
      // Prepared lesson scenes are data, not model-generated executable code.
      // Reuse the same playback frames, ownership cleanup and semantic context.
      if (page.scene) {
        const parts = (page.audioParts || []).map(part => ({ ...part, start: -1 }));
        for (const item of page.scene) {
          const waiting = parts.find(part => part.start < 0 && part.at === item.objectId);
          if (waiting) waiting.start = frames[i].length;
          const objectId = `page-${i + 1}-${item.objectId}`;
          objects[objectId] = { ...page.objects[item.objectId], relatedObjectIds: page.objects[item.objectId].relatedObjectIds.map(id => `page-${i + 1}-${id}`) };
          if (item.type === 'text') write(item.text, item.x, item.y, item.size || 's', item.color || 'black', objectId, item.w);
          else {
            const id = createShapeId();
            frame(() => create({ id, type: item.type, x: item.x, y: item.y, props: item.props }, objectId, 'complete'));
          }
          if (item.pause) frame(() => {}, item.pause);
        }
        if (parts.length && parts.every(part => part.start >= 0)) {
          // Stretch each scene segment to its narration clip plus a short breath,
          // so drawing and speech stay aligned part by part.
          parts.forEach((part, k) => {
            const end = k + 1 < parts.length ? parts[k + 1].start : frames[i].length;
            const slice = frames[i].slice(part.start, end);
            const total = slice.reduce((sum, f) => sum + f.delay, 0);
            if (total) for (const f of slice) f.delay *= (part.ms + 400) / total;
          });
          pageParts[i] = parts;
        } else {
          const duration = frames[i].reduce((sum, f) => sum + f.delay, 0);
          if (page.durationMs && duration) for (const f of frames[i]) f.delay *= page.durationMs / duration;
        }
        return;
      }
      const items = [{ kind: 'title', text: page.title }, ...page.blocks];
      items.forEach((block, j) => {
        const objectId = `page-${i + 1}-block-${j}`;
        objects[objectId] = { kind: block.kind, label: block.text.slice(0, 80), originalText: block.text,
          relatedObjectIds: items.map((_, n) => `page-${i + 1}-block-${n}`).filter(id => id !== objectId) };
        write(wrap(block.text), 40, j ? 150 + (j - 1) * 180 : 20, j ? 's' : 'm', block.kind === 'equation' ? 'blue' : block.kind === 'question' ? 'orange' : 'black', objectId);
      });
    });
  } else {
  write('What is logistic\nregression?', 40, 20, 'l', 'black', 'introduction');
  write('Estimate the probability\nof a yes/no outcome.', 65, 180, 'm', 'blue', 'introduction');
  write('Where to use it', 65, 320, 'm', 'black', 'uses');
  write('Spam or not spam\nCustomer stays or leaves', 65, 385, 'm', 'black', 'uses');
  write('Probability → threshold → class', 65, 550, 's', 'orange', 'uses');
  building = 1;
  write('The logistic regression\nformula', 40, 20, 'l', 'black', 'formula-title');
  write('z = b + w₁x₁ + w₂x₂', 65, 175, 'l', 'blue', 'score');
  write('x: features    w: learned weights\nb: bias', 65, 265, 's', 'black', 'score');
  write('P(y=1 | x) = σ(z)', 65, 375, 'l', 'orange', 'probability');
  write('σ(z) = 1 / (1 + e⁻ᶻ)', 65, 480, 'l', 'blue', 'probability');
  building = 2;
  write('The sigmoid function', 40, 20, 'l');
  write('σ(x) = 1 / (1 + e⁻ˣ)', 65, 92, 'xl', 'blue', 'equation');
  stroke(segment(70, 470, 560, 470), 'grey', 600, 'axes-x');
  stroke(segment(315, 490, 315, 215), 'grey', 600, 'axes-y');
  write('x', 575, 453, 's', 'black', 'axes-x');
  write('1', 282, 207, 's', 'black', 'axes-y');
  write('0', 292, 478, 's', 'black', 'axes-x');
  write('−6', 60, 480, 's', 'black', 'axes-x');
  write('6', 545, 480, 's', 'black', 'axes-x');
  stroke(Array.from({ length: 121 }, (_, i) => [70 + i * 490 / 120, 470 - 250 / (1 + Math.exp(-(-6 + i / 10)))]), 'blue', 2200);
  const midpointId = createShapeId();
  frame(() => create({ id: midpointId, type: 'geo', x: 309, y: 339, props: { geo: 'ellipse', w: 12, h: 12, color: 'orange', fill: 'solid', size: 's' } }, 'midpoint', 'complete'));
  write('σ(0) = 0.5', 345, 320, 'm', 'orange', 'midpoint');
  write('x → −∞: σ(x) → 0', 65, 545, 's', 'black', 'limit-left');
  write('x → +∞: σ(x) → 1', 65, 585, 's', 'black', 'limit-right');
  }

  let step = 0, position = 0, playing = false, timer, disposed = false;
  const positions = frames.map(() => 0);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // One narration clip per aligned scene part; segments were stretched to the
  // clip lengths above, so a small drift correction keeps speech on the drawing.
  let audioBlocked = false;
  const audios = pageParts.map(parts => (parts || []).map(part => {
    const audio = new Audio(part.src);
    audio.preload = 'auto';
    audio.muted = isMuted();
    return audio;
  }));
  const unlistenMuted = onMuted(value => audios.flat().forEach(audio => { audio.muted = value; }));
  const partAt = index => {
    const parts = pageParts[index];
    if (!parts) return -1;
    let k = parts.length - 1;
    while (k > 0 && parts[k].start >= Math.max(1, positions[index])) k--;
    return k;
  };
  // Scheduled time when each frame applies; frame delays are uneven, so audio
  // position must follow accumulated delay, never the frame count.
  const elapsed = frames.map(list => { let t = 0; return [...list.map(f => { const at = t; t += f.delay; return at; }), t]; });
  const partTime = (index, k) => {
    const parts = pageParts[index];
    return Math.min(parts[k].ms / 1000, (elapsed[index][positions[index]] - elapsed[index][parts[k].start]) / 1000);
  };
  // Each clip plays once, straight through, started at its segment boundary.
  // No mid-clip correction: nudging a playing clip is audible as stutter.
  let activeAudio = null;
  const syncAudio = () => {
    const k = partAt(step);
    const audio = k >= 0 ? audios[step][k] : null;
    if (audio !== activeAudio) {
      activeAudio?.pause();
      activeAudio = audio;
      if (audio) audio.currentTime = 0;
    }
    if (!audio) return;
    if (!playing) { audio.pause(); return; }
    if (audio.ended || !audio.paused) return;
    // A blocked autoplay pauses the lesson so speech and drawing restart together.
    audio.play().catch(error => { if (error?.name === 'NotAllowedError' && playing && !audioBlocked) { audioBlocked = true; pause(); } });
  };
  const state = () => ({ page: step, frame: position, playing, pages: definition, label: definition[step].label, pageComplete: position === frames[step].length, timeline: (step + position / frames[step].length) * 1000 });
  const notify = () => {
    positions[step] = position;
    lesson.animationProgress = position / frames[step].length;
    syncAudio();
    onChange(state());
  };
  const enter = index => {
    step = index;
    lesson.topic = generated?.title || 'Logistic regression and the sigmoid function';
    lesson.currentStage = definition[step].id;
    lesson.pageNumber = step + 1;
    lesson.pageTitle = definition[step].label;
    lesson.pageId = pages[step];
    lesson.recentExplanations = [definition[step].text];
    explain(definition[step].text);
  };
  const pause = () => { clearTimeout(timer); playing = false; notify(); };
  function tick() {
    if (disposed) return;
    if (editor.getCurrentPageId() !== pages[step]) { pause(); return; }
    while (playing) {
      if (position === frames[step].length) {
        if (step === frames.length - 1 || !editor.getPage(pages[step + 1])) { pause(); return; }
        seek(step + 1, 0);
        playing = true;
      }
      const current = frames[step][position++];
      current.apply();
      notify();
      if (!reduced) {
        timer = setTimeout(tick, current.delay);
        return;
      }
    }
  }
  const play = () => {
    if (disposed || playing || (step === frames.length - 1 && state().pageComplete) || editor.getCurrentPageId() !== pages[step]) return;
    audioBlocked = false;
    playing = true; notify(); tick();
  };
  const seek = (index, count = frames[index]?.length) => {
    if (disposed || index < 0 || index >= frames.length || !editor.getPage(pages[index])) return;
    clearTimeout(timer); playing = false;
    const changedPage = index !== step || editor.getCurrentPageId() !== pages[index];
    lesson.runId = crypto.randomUUID();
    enter(index);
    editor.setCurrentPage(pages[index]);
    editor.selectNone();
    editor.run(() => {
      clear();
      position = Math.max(0, Math.min(frames[index].length, count));
      for (const current of frames[index].slice(0, position)) current.apply();
    });
    if (changedPage) fitPage(index);
    notify();
    const k = partAt(index);
    if (k >= 0) { const audio = audios[index][k]; if (audio.duration) audio.currentTime = Math.min(audio.duration, partTime(index, k)); }
  };
  const scrub = value => {
    const point = Math.max(0, Math.min(frames.length, value / 1000));
    const index = Math.max(0, Math.min(frames.length - 1, Math.ceil(point) - 1));
    seek(index, Math.round((point - index) * frames[index].length));
  };
  const next = () => {
    if (!state().pageComplete) seek(step);
    else if (step < frames.length - 1) { seek(step + 1, 0); play(); }
  };
  // Keep tldraw's own page menu working alongside the lesson controls.
  const unlisten = editor.store.listen(() => {
    if (disposed || editor.getCurrentPageId() === pages[step]) return;
    const index = pages.indexOf(editor.getCurrentPageId());
    pause();
    if (index >= 0) seek(index, positions[index] || frames[index].length);
  });
  enter(0); notify();
  return { play, pause, seek, scrub, next, back: () => seek(step - 1), dispose: () => { disposed = true; clearTimeout(timer); unlisten(); unlistenMuted(); audios.flat().forEach(audio => audio.pause()); }, state };
}
