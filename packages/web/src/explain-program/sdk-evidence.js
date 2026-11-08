import { estimateTextBox } from '../scene-layout.js';
import { textStyle } from '../scene-style.js';
import { CONTRACT_LIMITS } from './contract.js';

const bodySize = textStyle('body').fontSize;
const characterWidth = estimateTextBox({ text: '0', x: 0, y: 0, fontSize: bodySize }).xMax;

// sdk.evidence(id, { x, y, w, h, text, spans: [{ id, start, end, citation? }], selected? })
// Spans use half-open UTF-16 offsets into the original text and cannot overlap. The caller passes
// its existing choice/query value as selected (omitted/null for none). Citations are plain labels;
// when omitted, the readout shows the offsets. Returns ordinary frame text and lines.
export const EVIDENCE_SOURCE = String.raw`
(function () {
  var prefixPattern = /^[A-Za-z0-9_.-]{1,24}$/;
  var spanPattern = /^[A-Za-z0-9_.-]{1,16}$/;
  var newline = /[\r\n\u2028\u2029]/;
  var invalidText = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\uD800-\uDFFF]/u;
  var url = /\b[A-Za-z][A-Za-z0-9+.-]*:\/\/|\b(?:www\.|https?:|javascript:|data:|mailto:)\S/i;
  var font = ${bodySize}, char = ${characterWidth};
  var pad = 8, row = 24, gap = 8, baseline = 16;
  var textLimit = ${CONTRACT_LIMITS.text};
  // "{{a}}" is the shortest scene template marker. Leave room for one text run per
  // literal marker plus a trailing run, even on a line filled with them.
  var lineLimit = Math.min(textLimit, (${CONTRACT_LIMITS.runs} - 1) * 5);

  function nextPoint(text, at) {
    return at + (text.codePointAt(at) > 0xffff ? 2 : 1);
  }

  // The guest cannot measure a browser font. Use the shared label estimate as a floor
  // and leave extra space for wide glyphs and tabs before wrapping or placing the next run.
  function advance(point) {
    if (point === '\t') return char * 8;
    if (/^[A-Zmw@%&#]/.test(point) || point.charCodeAt(0) > 0x7f) return Math.max(char * point.length, font);
    return char;
  }

  function widthOf(text) {
    var width = 0;
    for (var point of text) width += advance(point);
    return width;
  }

  // Retain every source offset, including spaces at wraps. Explicit newlines instead
  // get their own row so a span may cross both automatic wraps and hard line breaks.
  function wrap(text, start, end, width) {
    var lines = [], at = start, breakAt = start, used = 0;
    while (at < end) {
      var next = nextPoint(text, at), point = text.slice(at, next);
      if (newline.test(point)) {
        lines.push({ start: start, end: at });
        if (point === '\r' && next < end && text[next] === '\n') next++;
        at = start = breakAt = next;
        used = 0;
      } else if (used + advance(point) > width || next - start > lineLimit) {
        if (at === start) throw new RangeError('evidence text needs more horizontal space');
        var stop = breakAt > start ? breakAt : at;
        lines.push({ start: start, end: stop });
        at = start = breakAt = stop;
        used = 0;
      } else {
        used += advance(point);
        at = next;
        if (/\s/.test(point)) breakAt = at;
      }
    }
    lines.push({ start: start, end: end });
    return lines;
  }

  function boundary(text, at) {
    var code = text.charCodeAt(at);
    return !(code >= 0xdc00 && code <= 0xdfff) && !(text[at - 1] === '\r' && text[at] === '\n');
  }

  function caption(id, x, y, text) {
    // Existing text runs preserve whitespace. Split literal template markers across
    // runs so the shared scene's {{derived.value}} expansion leaves source text alone.
    var runs = [], from = 0;
    for (var match of text.matchAll(/\{\{[\w.]+\}\}/g)) {
      var cut = match.index + 1;
      runs.push({ kind: 'text', text: text.slice(from, cut) });
      from = cut;
    }
    runs.push({ kind: 'text', text: text.slice(from) });
    return sdk.text(id, x, y, undefined, { runs: runs });
  }

  sdk.evidence = function (id, config) {
    if (typeof id !== 'string' || !prefixPattern.test(id)) throw new RangeError('invalid evidence id');
    if (!config || typeof config !== 'object') throw new RangeError('missing evidence viewport');
    var x = config.x, y = config.y, w = config.w, h = config.h;
    if (![x, y, w, h].every(Number.isFinite) || x < 0 || y < 0 || w < 120 || h <= 0 ||
        w > ${CONTRACT_LIMITS.size} || h > ${CONTRACT_LIMITS.size} ||
        x + w > ${CONTRACT_LIMITS.coordinate} || y + h > ${CONTRACT_LIMITS.coordinate}) {
      throw new RangeError('invalid evidence viewport');
    }
    var text = config.text, spans = config.spans, selected = config.selected, inner = w - 2 * pad;
    if (typeof text !== 'string' || text.length > 3 * textLimit || !text.trim() || invalidText.test(text)) {
      throw new RangeError('invalid evidence text');
    }
    if (!Array.isArray(spans) || spans.length < 1 || spans.length > ${CONTRACT_LIMITS.options}) {
      throw new RangeError('evidence needs one to eight spans');
    }

    var lines = wrap(text, 0, text.length, inner);
    var ids = new Set(), selection, detailRows = 0;
    var ranges = Array.from(spans, function (span) {
      if (!span || typeof span.id !== 'string' || !spanPattern.test(span.id)) throw new RangeError('invalid evidence span id');
      if (Object.keys(span).some(function (key) { return ['id', 'start', 'end', 'citation'].indexOf(key) === -1; })) {
        throw new RangeError('unknown evidence span field');
      }
      if (ids.has(span.id)) throw new RangeError('duplicate evidence span id');
      ids.add(span.id);
      var start = span.start, end = span.end;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > text.length ||
          end <= start || end - start > textLimit || !boundary(text, start) || !boundary(text, end) ||
          !/[^\r\n\u2028\u2029]/.test(text.slice(start, end))) throw new RangeError('invalid evidence span offsets');
      var citation = span.citation;
      if (citation === undefined) citation = 'UTF-16 offsets [' + start + ', ' + end + ')';
      if (typeof citation !== 'string' || !citation.trim() || citation.length > 48 ||
          invalidText.test(citation) || newline.test(citation) || url.test(citation)) throw new RangeError('invalid evidence citation');
      var citationLines = wrap(citation, 0, citation.length, inner);
      var excerptLines = wrap(text, start, end, inner);
      detailRows = Math.max(detailRows, citationLines.length + excerptLines.length);
      if (span.id === selected) selection = { citation: citation, citationLines: citationLines, excerptLines: excerptLines };
      return { id: span.id, start: start, end: end };
    }).sort(function (a, b) { return a.start - b.start; });
    for (var i = 1; i < ranges.length; i++) {
      if (ranges[i].start < ranges[i - 1].end) throw new RangeError('evidence spans overlap');
    }
    if (selected != null && !selection) throw new RangeError('invalid evidence selection');
    if (2 * pad + gap + (lines.length + detailRows) * row > h) {
      throw new RangeError('evidence source and selection need more vertical space');
    }

    var objects = [];
    function appendLine(line, lineY) {
      var at = line.start, left = x + pad;
      function append(end, range) {
        if (end <= at) return;
        var value = text.slice(at, end), spanWidth = widthOf(value), key = at + '-' + end;
        if (range) {
          var active = selected === range.id;
          objects.push(sdk.line(id + ':span:' + range.id + ':' + key, left + 1, lineY + 5, left + spanWidth - 1, lineY + 5,
            { role: active ? 'learner' : 'neutral', opacity: active ? 1 : 0.4 }));
        }
        objects.push(caption(id + ':text:' + key, left, lineY, value));
        at = end;
        left += spanWidth;
      }
      for (var range of ranges) {
        if (range.end <= at || range.start >= line.end) continue;
        append(range.start);
        append(Math.min(range.end, line.end), range);
      }
      append(line.end);
    }

    for (var i = 0; i < lines.length; i++) appendLine(lines[i], y + pad + baseline + i * row);
    if (objects.length + detailRows > ${CONTRACT_LIMITS.objects}) {
      throw new RangeError('evidence needs too many frame objects');
    }
    if (selection) {
      var detailY = y + pad + baseline + lines.length * row + gap;
      function appendDetail(lines, value, kind) {
        for (var i = 0; i < lines.length; i++, detailY += row) {
          var line = lines[i];
          if (line.start !== line.end) objects.push(caption(id + ':' + kind + ':' + i, x + pad, detailY, value.slice(line.start, line.end)));
        }
      }
      appendDetail(selection.citationLines, selection.citation, 'citation');
      appendDetail(selection.excerptLines, text, 'excerpt');
    }
    return objects;
  };
})();
`;
