// Documentation-only TCP stepper references, using the approved card/primitive kit.
// Protocol source: https://www.rfc-editor.org/rfc/rfc9293.html, especially §3.4,
// §3.5 and Figure 6. The authored ISNs are 100 and 500. This is one possible
// server-retransmission order, not a model of TCP's timers or retry policy.
// The composition companions propose a target contract; the current production
// schema cannot yet admit these structured states, values and loss variants.
import { pathToFileURL } from 'node:url';
import { writeSubject } from './stepper-reference-kit.mjs';

export function buildScene(depth) {
  if (!['brief', 'balanced', 'detailed'].includes(depth)) throw new RangeError(`Unknown TCP depth: ${depth}`);
  const clientIsn = 100, serverIsn = 500;
  const synLength = 1, pureAckLength = 0;
  const clientNext = clientIsn + synLength, serverNext = serverIsn + synLength;

  const makeVariant = lostReply => {
    const regions = [
      { id: 'client', label: 'Client', kind: 'party', initialSeq: clientIsn },
      { id: 'server', label: 'Server', kind: 'party', initialSeq: serverIsn },
      { id: 'order', label: 'Message order', kind: 'guide' },
      { id: 'syn', label: 'SYN', kind: 'message', from: 'client', to: 'server', flags: ['SYN'], seq: clientIsn, ack: null, sequenceLength: synLength, newSequenceSpace: synLength, outcome: 'delivered' },
      { id: 'synack', label: 'SYN-ACK', kind: 'message', from: 'server', to: 'client', flags: ['SYN', 'ACK'], seq: serverIsn, ack: clientNext, sequenceLength: synLength, newSequenceSpace: synLength, outcome: lostReply ? 'lost' : 'delivered' },
      ...(depth === 'brief' ? [] : [{ id: 'retry', label: 'Retry', kind: 'message', from: 'server', to: 'client', flags: ['SYN', 'ACK'], seq: serverIsn, ack: clientNext, sequenceLength: synLength, newSequenceSpace: 0, outcome: lostReply ? 'delivered' : 'unused' }]),
      { id: 'ack', label: 'ACK', kind: 'message', from: 'client', to: 'server', flags: ['ACK'], seq: clientNext, ack: serverNext, sequenceLength: pureAckLength, newSequenceSpace: pureAckLength, outcome: 'delivered' },
      { id: 'connected', label: 'Connection', kind: 'outcome' },
    ];
    const byId = Object.fromEntries(regions.map(region => [region.id, region]));
    const state = (id, label, short, sentence, why, active, event) => {
      const sent = event.sent ?? [];
      const endpoints = {
        client: { state: event.clientState, nextSeq: clientIsn + (sent.includes('syn') ? synLength : 0) },
        server: { state: event.serverState, nextSeq: serverIsn + (sent.includes('synack') ? synLength : 0) },
      };
      const segment = event.segment ?? null, message = segment ? byId[segment] : null;
      const ready = Object.values(endpoints).filter(endpoint => endpoint.state === 'ESTABLISHED').length;
      const readouts = depth === 'brief' ? [] : [
        { id: 'seq', label: 'Segment SEQ', value: message ? String(message.seq) : '—' },
        { id: 'ack', label: 'Segment ACK', value: message?.ack === null || !message ? '—' : String(message.ack) },
        ...(depth === 'balanced' ? [{ id: 'ready', label: 'Ready endpoints', value: `${ready} of 2` }] : [
          { id: 'clientNext', label: 'Client next SEQ', value: String(endpoints.client.nextSeq) },
          { id: 'serverNext', label: 'Server next SEQ', value: String(endpoints.server.nextSeq) },
        ]),
      ];
      return {
        id, label, short, sentence, why, active, calloutRegion: active[0], readouts, endpoints, segment, sent,
        replyReceived: event.replyReceived ?? false,
        ackSent: sent.includes('ack'), ackReceived: event.ackReceived ?? false,
      };
    };
    const before = state('before', 'Before contact', 'Listen',
      'Client starts closed; Server listens for a connection.',
      'Neither SYN has used sequence space.', ['client', 'server'],
      { clientState: 'CLOSED', serverState: 'LISTEN' });
    const syn = state('syn-sent', 'Request sent', 'SYN',
      'SYN asks the Server to start a connection.',
      'SYN uses one sequence number.', ['syn'],
      { segment: 'syn', sent: ['syn'], clientState: 'SYN-SENT', serverState: 'LISTEN' });
    const reply = state(lostReply ? 'reply-lost' : 'reply-sent', lostReply ? 'Reply lost' : 'Reply sent', lostReply ? 'Lost' : 'SYN-ACK',
      lostReply ? 'SYN-ACK is lost; Client has no reply to confirm.' : 'SYN-ACK answers Client and announces Server’s start.',
      lostReply ? 'Only this first reply is lost.' : 'The Server SYN also uses one number.', ['synack'],
      { segment: 'synack', sent: ['syn', 'synack'], clientState: 'SYN-SENT', serverState: 'SYN-RECEIVED' });
    const waiting = state('waiting', 'Client still waits', 'Wait',
      'Client stays in SYN-SENT because the reply never arrived.',
      'Without the reply, no final ACK is sent.', ['client'],
      { sent: ['syn', 'synack'], clientState: 'SYN-SENT', serverState: 'SYN-RECEIVED' });
    const retry = depth === 'brief' ? null : state('reply-retry', 'Reply retried', 'Retry',
      'Retry sends the same SYN-ACK toward Client again.',
      'A retry reuses the original sequence space.', ['retry'],
      { segment: 'retry', sent: ['syn', 'synack', 'retry'], clientState: 'SYN-SENT', serverState: 'SYN-RECEIVED' });
    const sentBeforeAck = ['syn', 'synack', ...(lostReply ? ['retry'] : [])];
    const received = state('reply-received', 'Reply received', 'Receive',
      'Client receives SYN-ACK; Server still awaits confirmation.',
      'Client now knows the Server start.', depth === 'brief' ? ['synack'] : ['client'],
      { segment: lostReply ? 'retry' : 'synack', sent: sentBeforeAck, replyReceived: true, clientState: 'ESTABLISHED', serverState: 'SYN-RECEIVED' });
    const ack = state('ack-sent', 'Confirmation sent', 'ACK sent',
      'ACK confirms the reply, but has not reached Server yet.',
      'Pure ACK uses no sequence number.', ['ack'],
      { segment: 'ack', sent: [...sentBeforeAck, 'ack'], replyReceived: true, clientState: 'ESTABLISHED', serverState: 'SYN-RECEIVED' });
    const confirmed = state('confirmed', 'Both connected', 'Confirmed',
      depth === 'brief' ? 'ACK proves the reply arrived; Server can finish connecting.' : 'Server receives ACK and can now mark the connection ready.',
      'A sent reply alone is no proof of delivery.', depth === 'brief' ? ['ack'] : ['server', 'connected'],
      { segment: 'ack', sent: [...sentBeforeAck, 'ack'], replyReceived: true, ackReceived: true, clientState: 'ESTABLISHED', serverState: 'ESTABLISHED' });

    const states = depth === 'brief' ? [syn, received, confirmed] : [
      ...(depth === 'detailed' ? [before] : []), syn, reply,
      ...(lostReply ? [...(depth === 'detailed' ? [waiting] : []), retry] : []),
      received, ack, confirmed,
    ];
    return {
      lostReply,
      assumptions: { loss: lostReply ? 'First SYN-ACK only' : 'None', retryOrder: 'Server retransmits before any client retry', timeModel: 'Event order only; no timers', payloadBytes: 0 },
      regions,
      links: [
        { from: 'client', to: 'syn' }, { from: 'syn', to: 'server' },
        { from: 'server', to: 'synack' }, { from: 'synack', to: 'client' },
        ...(depth === 'brief' ? [] : [{ from: 'server', to: 'retry' }, { from: 'retry', to: 'client' }]),
        { from: 'client', to: 'ack' }, { from: 'ack', to: 'server' },
        { from: 'server', to: 'connected' },
      ], states,
    };
  };
  return {
    depth,
    prompt: 'how does the TCP handshake work?',
    title: depth === 'brief' ? 'The reply needs a reply' : depth === 'balanced' ? 'What the last ACK proves' : 'One reply, two views of readiness',
    concept: depth === 'brief'
      ? 'Client asks to connect. Server replies, but sending that reply cannot tell Server it was heard. The final ACK supplies the missing confirmation.'
      : 'Client learns Server’s starting sequence number from SYN-ACK. Only the final ACK tells Server its reply arrived. SEQ marks a position; ACK names the next expected position.',
    instructions: depth === 'brief'
      ? 'Move through the three messages with Next or the step slider. Read down the diagram for message order, not elapsed time. Blue marks the current part.'
      : 'Step through the messages, then set Lose SYN-ACK to Yes. Compare the retry: downward is message order, not a timer.',
    heading: 'TCP connection setup', canonical: 'protocol-between-parties',
    aha: { stateId: 'confirmed', observation: 'Only receiving the final ACK lets Server know its SYN-ACK reached Client.' },
    parameter: depth === 'brief' ? null : { label: 'Lose SYN-ACK', options: ['No', 'Yes'], default: 0 },
    variants: [makeVariant(false), ...(depth === 'brief' ? [] : [makeVariant(true)])],
  };
}

export function drawPicture(frame, variant, scene, previousActive = []) {
  const regions = new Map(variant.regions.map(region => [region.id, region]));
  const previous = scene.depth === 'brief' ? [] : previousActive;
  const active = id => frame.active.includes(id);
  let svg = '';
  const add = (id, content, bounds) => {
    if (!regions.has(id)) return;
    let outline = '';
    if (previous.includes(id)) {
      const [x, y, w, h] = bounds;
      outline = R.line(`${id}.previous`, [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]], false, false, true);
    }
    svg += R.region(id, frame, outline + content, previous);
  };
  const plainState = { CLOSED: 'Not started', LISTEN: 'Listening', 'SYN-SENT': 'Awaiting reply', 'SYN-RECEIVED': 'Awaiting ACK', ESTABLISHED: 'Connected' };
  for (const [id, x] of [['client', 24], ['server', 264]]) {
    if (!regions.has(id)) continue;
    const endpoint = frame.endpoints[id], center = x + 73;
    const stateLabel = scene.depth === 'detailed' ? endpoint.state : plainState[endpoint.state];
    add(id,
      R.box(`${id}.box`, x, 44, 146, 44, active(id), 'process') +
      R.text(`${id}.label`, center, 62, regions.get(id).label, { anchor: 'middle', weight: 600 }) +
      R.text(`${id}.state`, center, 80, stateLabel, { anchor: 'middle', size: 13, color: R.C.muted }) +
      R.line(`${id}.lane`, [[center, 91], [center, 239]], false, false, true),
      [x - 4, 40, 154, 52]);
  }
  if (regions.has('order')) add('order',
    R.text('order.label', 24, 103, 'Downward = message order', { size: 13, color: R.C.muted }), [20, 91, 214, 16]);

  for (const [id, y] of [['syn', 125], ['synack', 161], ['retry', 197], ['ack', 233]]) {
    const message = regions.get(id);
    if (!message) continue;
    const sent = frame.sent.includes(id), lost = sent && message.outcome === 'lost';
    const unused = message.outcome === 'unused';
    const from = message.from === 'client' ? 97 : 337, to = message.to === 'client' ? 97 : 337;
    const label = unused ? 'Retry · unused' : !sent ? `${message.label} · not sent`
      : lost ? 'SYN-ACK · lost' : id === 'retry' ? 'Retry · SYN-ACK' : message.label;
    let content = R.text(`${id}.label`, 217, y - 10, label, { anchor: 'middle', color: active(id) ? R.C.blue : R.C.ink });
    content += R.line(`${id}.path`, [[from, y], [lost ? 232 : to, y]], active(id), sent && !lost, !sent || unused);
    if (lost) {
      content += R.line('synack.missing', [[220, y], [to, y]], false, false, true);
      content += R.text('synack.lost', 226, y + 6, '×', { size: 19, color: R.C.warm });
    }
    add(id, content, [86, y - 21, 262, 29]);
  }
  if (regions.has('connected')) {
    const evidence = frame.ackReceived ? 'Final ACK received · both connected'
      : frame.ackSent ? 'Client ready · Server still awaits ACK'
      : frame.replyReceived ? 'Client has the reply · Server awaits ACK'
      : frame.endpoints.server.state === 'SYN-RECEIVED' ? 'Server still awaits confirmation'
      : 'Server has not yet heard Client';
    add('connected',
      R.box('connected.box', 24, 249, 386, 27, active('connected'), frame.ackReceived ? 'outcome' : 'plain') +
      R.text('connected.label', 217, 267, evidence, { anchor: 'middle', size: 13, color: frame.ackReceived ? R.C.green : R.C.muted }),
      [20, 245, 394, 35]);
  }
  const anchors = { client: [174, 66], server: [414, 66], syn: [348, 125], synack: [348, 161], retry: [348, 197], ack: [348, 233], connected: [414, 263] };
  const target = regions.has(frame.calloutRegion) && anchors[frame.calloutRegion]
    ? frame.calloutRegion : frame.active.find(id => regions.has(id) && anchors[id]);
  return { svg, anchor: target ? anchors[target] : [414, 263] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeSubject('tcp-handshake', buildScene, drawPicture);
}
