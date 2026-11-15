// Lossless data for the nine approved stepper companions. The packed constant at the end is generated from the
// reference JSON; production never imports docs or a file-system API. Companion tests compare every decoded field.
//
// Wire format: [version, strings, shapes, nodes, root]. A negative integer references strings[-1-value], a
// nonnegative integer references an earlier node, [number] is a literal number (['-0'] preserves signed zero),
// and booleans/null are literal. Node [0,...values] is an array; [shape+1,...values] is an object whose keys come
// from shapes[shape]. Whole strings, property shapes, regions, payloads and other identical subtrees are interned.
const TABLE_LIMIT = 8192;
const VALUE_LIMIT = 100000;
const TEXT_LIMIT = 1024 * 1024;
const DEPTH_LIMIT = 128;
const invalid = message => { throw new TypeError(`Invalid stepper composition data: ${message}`); };

export const canonicalIds = Object.freeze(['algorithm-over-collection', 'protocol-between-parties', 'cycle-of-phases']);
const subjects = Object.freeze({ 'merge-sort': canonicalIds[0], 'tcp-handshake': canonicalIds[1], mitosis: canonicalIds[2] });
const depths = Object.freeze(['brief', 'balanced', 'detailed']);
const depthAliases = Object.freeze({ overview: 'brief', standard: 'balanced', deep: 'detailed' });

function referencePacketItem(packet, subject, depth) {
  const canonical = Object.hasOwn(subjects, subject) ? subjects[subject] : subject;
  const normalizedDepth = Object.hasOwn(depthAliases, depth) ? depthAliases[depth] : depth;
  const subjectIndex = canonicalIds.indexOf(canonical), depthIndex = depths.indexOf(normalizedDepth);
  if (subjectIndex < 0 || depthIndex < 0) throw new RangeError(`Unsupported stepper composition: ${subject}/${depth}`);
  const root = packet[3][packet[4]][1 + subjectIndex * depths.length + depthIndex];
  return decodeComposition([1, packet[1], packet[2], packet[3], root]);
}

/** Return a new JSON tree with the approved companion's metadata and all semantic fields preserved exactly. */
export function referenceComposition(subject, depth = 'balanced') {
  return referencePacketItem(APPROVED_PACKET, subject, depth);
}

/** Host-only fixture copy from each approved HTML Scene model; the concept supplies both story and card description. */
export function referenceCardWords(subject, depth = 'balanced') {
  return referencePacketItem(APPROVED_CARD_WORDS_PACKET, subject, depth);
}

/** Deterministic, JSON-safe structural interning. Only JSON data is admitted; values are never coerced. */
export function packComposition(composition) {
  const strings = [], shapes = [], nodes = [];
  const stringIds = new Map(), shapeIds = new Map(), nodeIds = new Map(), ancestors = new Set();
  let values = 0, text = 0, slots = 0;
  const internString = value => {
    if (!stringIds.has(value)) {
      if (strings.length >= TABLE_LIMIT) invalid('too many strings');
      stringIds.set(value, strings.length); strings.push(value);
    }
    return -1 - stringIds.get(value);
  };
  const encode = (value, depth) => {
    if (++values > VALUE_LIMIT || depth > DEPTH_LIMIT) invalid('input exceeds the value or depth limit');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      if ((text += value.length) > TEXT_LIMIT) invalid('input exceeds the text limit');
      return internString(value);
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) invalid('non-finite number');
      return [Object.is(value, -0) ? '-0' : value];
    }
    if (typeof value !== 'object' || ancestors.has(value)) invalid('non-JSON or cyclic value');
    ancestors.add(value);
    let node;
    if (Array.isArray(value)) {
      if (value.length > TABLE_LIMIT) invalid('array exceeds the table limit');
      node = [0];
      for (let i = 0; i < value.length; i++) {
        if (!Object.hasOwn(value, i)) invalid('sparse array');
        node.push(encode(value[i], depth + 1));
      }
    } else {
      if (Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length) invalid('non-JSON object');
      const keys = Object.keys(value).sort();
      if (keys.length > TABLE_LIMIT) invalid('object exceeds the table limit');
      for (const key of keys) {
        if ((text += key.length) > TEXT_LIMIT) invalid('input exceeds the text limit');
        if (!Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')) invalid('accessor property');
      }
      const key = JSON.stringify(keys);
      if (!shapeIds.has(key)) {
        if (shapes.length >= TABLE_LIMIT || (slots += keys.length) > VALUE_LIMIT) invalid('too many shapes or table entries');
        shapeIds.set(key, shapes.length); shapes.push(keys.map(internString));
      }
      node = [shapeIds.get(key) + 1, ...keys.map(key => encode(value[key], depth + 1))];
    }
    ancestors.delete(value);
    const key = JSON.stringify(node);
    if (!nodeIds.has(key)) {
      if (nodes.length >= TABLE_LIMIT || (slots += node.length) > VALUE_LIMIT) invalid('too many nodes or table entries');
      nodeIds.set(key, nodes.length); nodes.push(node);
    }
    return nodeIds.get(key);
  };
  const root = encode(composition, 0);
  return [1, strings, shapes, nodes, root];
}

/** Source-safe decoder for trusted packComposition output. No closures, imports, execution or shared output objects. */
export function decodeComposition(packet) {
  const [, strings, shapes, nodes, root] = packet;
  const read = value => {
    if (value === null || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value[0] === '-0' ? -0 : value[0];
    if (value < 0) return strings[-1 - value];
    const [shape, ...items] = nodes[value];
    return shape === 0 ? items.map(read) : Object.fromEntries(shapes[shape - 1].map((key, i) => [strings[-1 - key], read(items[i])]));
  };
  return read(root);
}

// This is trusted decoder code, kept separate from packet data. The generated program inserts the function as
// normal source; neither packet values nor this module are evaluated as executable strings by the host.
export const compositionDecoderSource = decodeComposition.toString().replace(/\r\n/g, '\n');
export const compositionSourceData = composition => JSON.stringify(packComposition(composition));

/** Validate untrusted packets, including their fully expanded size, before decoding allocates an output tree. */
export function unpackComposition(packet) {
  if (!Array.isArray(packet) || packet.length !== 5 || packet[0] !== 1) invalid('unsupported packet');
  const [, strings, shapes, nodes, root] = packet;
  for (const table of [strings, shapes, nodes]) {
    if (!Array.isArray(table) || table.length > TABLE_LIMIT) invalid('invalid or oversized table');
  }
  let tableText = 0, slots = 0;
  for (const value of strings) {
    if (typeof value !== 'string' || (tableText += value.length) > TEXT_LIMIT) invalid('invalid or oversized string table');
  }
  const stringRef = value => Number.isInteger(value) && value < 0 && -1 - value < strings.length;
  for (const shape of shapes) {
    if (!Array.isArray(shape) || (slots += shape.length) > VALUE_LIMIT) invalid('invalid or oversized shape');
    const keys = new Set();
    for (const key of shape) {
      if (!stringRef(key) || keys.has(strings[-1 - key])) invalid('invalid or duplicate object key');
      keys.add(strings[-1 - key]);
    }
  }
  const counts = [], lengths = [], nesting = [];
  const measure = (value, before) => {
    if (value === null || typeof value === 'boolean') return [1, 0, 0];
    if (Array.isArray(value)) {
      if (value.length !== 1 || !(typeof value[0] === 'number' && Number.isFinite(value[0]) || value[0] === '-0')) invalid('invalid numeric literal');
      return [1, 0, 0];
    }
    if (!Number.isInteger(value)) invalid('untyped value');
    if (value < 0) {
      if (!stringRef(value)) invalid('unknown string reference');
      return [1, strings[-1 - value].length, 0];
    }
    if (value >= before) invalid('unknown, cyclic or forward node reference');
    return [counts[value], lengths[value], nesting[value]];
  };
  const bounded = (count, length, depth) => {
    if (count > VALUE_LIMIT || length > TEXT_LIMIT || depth > DEPTH_LIMIT) invalid('expanded output exceeds limits');
  };
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!Array.isArray(node) || !node.length || (slots += node.length) > VALUE_LIMIT) invalid('invalid or oversized node');
    const shape = node[0];
    if (!Number.isInteger(shape) || shape < 0 || shape > shapes.length || shape > 0 && node.length !== shapes[shape - 1].length + 1) invalid('invalid node shape');
    let count = 1, length = shape === 0 ? 0 : shapes[shape - 1].reduce((sum, key) => sum + strings[-1 - key].length, 0), depth = 1;
    for (let j = 1; j < node.length; j++) {
      const [childCount, childLength, childDepth] = measure(node[j], i);
      count += childCount; length += childLength; depth = Math.max(depth, childDepth + 1);
      bounded(count, length, depth);
    }
    bounded(count, length, depth);
    counts.push(count); lengths.push(length); nesting.push(depth);
  }
  bounded(...measure(root, nodes.length));
  return decodeComposition(packet);
}

// The same bounded wire format also carries independent frame fixtures; semantic validation belongs to each caller.
export const packValue = packComposition;
export const unpackValue = unpackComposition;

// Generated from overview/standard/deep-stepper-{merge-sort,tcp-handshake,mitosis}.composition.json.
// Subject-major, then brief/balanced/detailed; metadata is preserved, with no runtime-only projection.
const APPROVED_PACKET = [1,["aha","canonical","controls","data","depth","family","id","layout","parts","schemaVersion","status","story","observation","stateId","The merge creates order by taking the smaller head from two already ordered runs; splitting alone does not sort.","halves","algorithm-over-collection","default","items","kind","presentation","step","variant.states","index","slider","reset","variants","calculations","label","links","regions","states","final","left","right","total","comparisons","decisions","result","chosen","4, 1, 3, 2","from","to","input","singles","mergeLeft","mergeRight","output","values","Input","Left half","Right half","Singles","Merge left","Merge right","Sorted output","active","calloutRegion","readouts","sentence","short","why","split","Split in half","Left half is a smaller sorting problem; Right half follows the same steps.","Split","Splitting preserves the values; it does not order them.","Reach singles","Singles need no sorting: each little run is already ordered.","A run with only one value cannot be out of order.","Merge small runs","Merge left puts its small run in order; Merge right repeats the same operation.","Merge","Choose the smaller front value next.","finish","Finish merging","Sorted output takes the smaller front repeatedly, then any remaining tail.","Finish","Once a run is empty, the other tail is already in order.","brief","stepper-states","overview-stepper-merge-sort","preset","width","bind","inputs.step","rail","step-rail","state.active","variant.links","variant.regions","picture","fixed-picture","target","text","state.calloutRegion","state.sentence","callout","active-callout","reference-proposal","Input splits into Left half and Right half, then Singles. Merge left and Merge right put those small runs in order; Sorted output joins them by taking the smaller front value.","options","option","select","Starting array","Mixed","Already sorted","Read input","value","Comparisons so far","placed","Placed in final output","0 / 4","Input holds the values that need ordering.","Each value must survive the split and merge unchanged.","Left half and Right half hold smaller sorting problems.","Merge the left","Merge left takes the smaller front value until its run is ordered.","Left merge","The smallest remaining head must come next in the merged run.","Merge the right","Merge right does the same on the other half.","Right merge","Both resulting runs must be ordered before the final merge.","4 / 4","1, 2, 3, 4","balanced","standard-stepper-merge-sort","previous.active","ghost","previous-state-ghost","state.readouts","value-readout","Input becomes Left half, Right half, then Singles. Merge left and Merge right create ordered runs for Sorted output. Compare a mixed and an already sorted input: splitting alone does not sort.","compare","comparison","Compare fronts","1 / 4","Merge left and Merge right offer their fronts. Take the smaller.","Compare","The smallest waiting value must be at one of the fronts.","done","All in order","Sorted output contains every Input value once, in ascending order.","Done","Each merge preserved the values while putting its runs in order.","detailed","deep-stepper-merge-sort","reason","state.why","completedBefore","trace","progress","completed-trace","Input splits into Left half and Right half, then Singles. Merge left and Merge right rebuild ordered runs for Sorted output. The front values decide what comes next; the count records that work.","Only receiving the final ACK lets Server know its SYN-ACK reached Client.","confirmed","protocol-between-parties","assumptions","lostReply","loss","payloadBytes","retryOrder","timeModel","None","Server retransmits before any client retry","Event order only; no timers","client","syn","server","synack","ack","connected","initialSeq","party","Client","Server","order","guide","Message order","flags","newSequenceSpace","outcome","seq","sequenceLength","SYN","message","delivered","ACK","SYN-ACK","Connection","ackReceived","ackSent","endpoints","replyReceived","segment","sent","nextSeq","state","SYN-SENT","LISTEN","syn-sent","Request sent","SYN asks the Server to start a connection.","SYN uses one sequence number.","ESTABLISHED","SYN-RECEIVED","reply-received","Reply received","Client receives SYN-ACK; Server still awaits confirmation.","Receive","Client now knows the Server start.","Both connected","ACK proves the reply arrived; Server can finish connecting.","Confirmed","A sent reply alone is no proof of delivery.","overview-stepper-tcp-handshake","Client asks to connect. Server replies, but sending that reply cannot tell Server it was heard. The final ACK supplies the missing confirmation.","Lose SYN-ACK","No","Yes","retry","Retry","unused","Segment SEQ","100","Segment ACK","—","ready","Ready endpoints","0 of 2","reply-sent","Reply sent","500","101","SYN-ACK answers Client and announces Server’s start.","The Server SYN also uses one number.","1 of 2","ack-sent","Confirmation sent","501","ACK confirms the reply, but has not reached Server yet.","ACK sent","Pure ACK uses no sequence number.","2 of 2","Server receives ACK and can now mark the connection ready.","First SYN-ACK only","lost","reply-lost","Reply lost","SYN-ACK is lost; Client has no reply to confirm.","Lost","Only this first reply is lost.","reply-retry","Reply retried","Retry sends the same SYN-ACK toward Client again.","A retry reuses the original sequence space.","standard-stepper-tcp-handshake","Client learns Server’s starting sequence number from SYN-ACK. Only the final ACK tells Server its reply arrived. SEQ marks a position; ACK names the next expected position.","CLOSED","before","Before contact","clientNext","Client next SEQ","serverNext","Server next SEQ","Client starts closed; Server listens for a connection.","Listen","Neither SYN has used sequence space.","waiting","Client still waits","Client stays in SYN-SENT because the reply never arrived.","Wait","Without the reply, no final ACK is sent.","deep-stepper-tcp-handshake","Separated sisters count as chromosomes; the whole view still contains the same DNA molecules.","anaphase","cycle-of-phases","context","prophase","metaphase","telophase","Next cycle after division, growth + DNA copying","payload","mitosis-cell","Prophase","cellBodies","chromosomes","condensed","cytokinesis","dnaReplication","nuclei","phase","separated","spindle","chromosomeIds","nucleusIds","A","B","parent","original","chromatids","pole","source","A.a","A.b","B.a","B.b","not-started","completed-in-S-phase-before-mitosis","animal-cell-mitosis","envelope","breaking","attachments","centrosomes","centrosome.left","centrosome.right","assembling","Metaphase","chromatidId","aligned","Anaphase","starting","separating","Telophase","nucleus.left","nucleus.right","constricting","reformed","disassembled","focus","Copies condense","Prophase: Chromosomes condense with their sister copies still joined.","Condense","Condensation packages long DNA molecules for separation.","Copies line up","Metaphase: Chromosomes line up; sisters face opposite spindle poles.","Align","Opposite attachments prepare one sister for each pole.","Sisters separate","Anaphase: Sisters separate into chromosomes, without making new DNA.","Separate","Separated sisters count as chromosomes, without new DNA.","Nuclei re-form","Telophase: Nuclei re-form around matching chromosome sets at the poles.","Re-form","Nuclear envelopes rebuild around the separated sets.","overview-stepper-mitosis","DNA was copied before mitosis. Follow the same sister copies as they condense, line up, separate and enter new nuclei.","Focus","Chromosomes","Spindle","prometaphase","Prometaphase","attaching","Cytokinesis","daughter.left","daughter.right","complete","cell-structure","structure","within","Spindle and centrosomes","Whole view: chr.","2","dna","DNA molecules","4","per-pole","At each pole","Copies attach","Prometaphase: Sister chromatids gain spindle attachments but remain joined.","Attach","Attachment lets the spindle move each sister independently.","Cytoplasm divides","Cytokinesis: Chromosomes stay in new nuclei as the cytoplasm separates.","Divide","Animal-cell pinching overlaps late mitosis.","Spindle assembles","Prophase: The spindle assembles as centrosomes move apart.","Spindle attaches","Prometaphase: Spindle fibers reach sister chromatids through the open nucleus.","Opposite poles","Metaphase: Spindle fibers attach sister copies to opposite poles.","Fibers shorten","Anaphase: Spindle fibers shorten to move chromosomes apart.","Spindle dissolves","Telophase: The spindle disassembles as new nuclei re-form.","Spindle has gone","Cytokinesis: The spindle is gone as the furrow finishes dividing the cell.","standard-stepper-mitosis","DNA copying happens in S phase before mitosis. Follow chromosome sets through nuclear division and animal-cell cytokinesis.","daughters","Before mitosis","intact","not-assembled","Daughter cells","Already copied","per-nucleus","Per new nucleus","cells","Cell bodies","1","Before mitosis: Chromosomes already contain sister DNA copies made in S phase.","Prepared","S phase copied DNA; this context is not a mitosis phase.","Matching daughters","Daughter cells: Each nucleus contains a matching chromosome set.","Daughters","Growth and another S phase precede the next division.","Spindle not ready","Before mitosis: The spindle is not assembled; centrosomes await mitosis.","Spindle absent","Daughter cells: The spindle is absent; a centrosome remains near each nucleus.","deep-stepper-mitosis"],[[-1,-2,-3,-4,-5,-6,-7,-8,-9,-10,-11,-12],[-13,-14],[-18,-7,-19,-20,-21],[-7,-20],[-27],[-28,-29,-30,-31,-32],[-33,-34,-35,-36],[-37,-38,-39],[-40,-34,-39,-35],[-42,-43],[-7,-29,-49],[-57,-58,-7,-29,-59,-60,-61,-62],[-83,-84],[-85,-7,-20],[-57,-19],[-57,-30,-31],[-94,-95],[-18,-7,-20,-29,-102],[-7,-29,-109],[-31],[-49],[-57,-58,-136,-7,-29,-59,-60,-61,-62],[-149,-94,-95],[-85,-7,-20,-21],[-151,-19],[-159,-30,-160,-31,-32],[-161,-162,-163,-164],[-7,-174,-20,-29],[-7,-20,-29],[-172,-181,-42,-7,-20,-29,-182,-183,-184,-185,-43],[-192,-193,-57,-58,-194,-7,-29,-59,-195,-196,-197,-60,-61,-62],[-168,-170],[-198,-199],[-30,-31,-32],[-279,-42,-43],[-279,-42,-29,-43],[-7,-20,-29,-284],[-287,-288,-289,-279,-290,-291,-20,-292,-293,-294,-295],[-296,-7,-297],[-302,-7,-303],[-7,-304],[-296,-312,-7,-303],[-314,-315,-11],[-7,-303],[-320,-303],[-57,-58,-331,-7,-29,-59,-60,-61,-62],[-361,-362]],[[2,-15,-16],[3,[0],-22,-23,-24,-25],[4,-26,-26],[0,1,2],[0,[1]],[9,[1],[1],4,[2]],[0,[1],[2]],[9,[2],[4],6,[2]],[0,[1],[2],[3]],[9,[3],[4],8,[3]],[0,5,7,9],[0,[1],[2],[3],[4]],[8,[3],10,11],[9,[1],[4],4,[1]],[0,13],[0,[1],[4]],[8,[1],14,15],[0,[2]],[9,[2],[3],17,[2]],[0,18],[0,[2],[3]],[8,[1],19,20],[7,12,16,21,[5]],[10,-44,-34],[10,-44,-35],[10,-34,-45],[10,-35,-45],[10,-45,-46],[10,-45,-47],[10,-46,-48],[10,-47,-48],[0,23,24,25,26,27,28,29,30],[0,[4],[1],[3],[2]],[11,-44,-50,32],[0,[4],[1]],[11,-34,-51,34],[0,[3],[2]],[11,-35,-52,36],[11,-45,-53,32],[11,-46,-54,15],[11,-47,-55,20],[11,-48,-56,11],[0,33,35,37,38,39,40,41],[0,-34],[0],[12,43,-34,-63,-64,44,-65,-66,-67],[0,-45],[12,46,-45,-45,-68,44,-69,-53,-70],[0,-46],[12,48,-46,-16,-71,44,-72,-73,-74],[0,-48],[12,50,-48,-75,-76,44,-77,-78,-79],[0,45,47,49,51],[6,22,-41,31,42,52],[0,53],[5,54],[13,-17,[640]],[15,-86,-23],[14,57,-87,-88],[16,-89,-90,-91],[14,59,-92,-93],[17,-96,-97],[14,61,-98,-99],[0,58,60,62],[1,0,-17,3,55,-80,-81,-82,56,63,[1],-100,-101],[2,-15,-75],[0,-106,-107],[18,[0],-103,-104,-105,66],[0,1,67,2],[0,-44],[19,-37,-110,[0]],[19,-111,-112,-113],[0,70,71],[12,69,-44,-44,-108,72,-114,-50,-115],[0,-34,-35],[12,74,-34,-63,-64,72,-116,-66,-67],[12,46,-45,-45,-68,72,-69,-53,-70],[19,-37,-110,[1]],[0,77,71],[12,48,-46,-46,-117,78,-118,-119,-120],[0,-47],[19,-37,-110,[2]],[0,81,71],[12,80,-47,-47,-121,82,-122,-123,-124],[19,-37,-110,[5]],[19,-111,-112,-125],[0,84,85],[12,50,-48,-75,-76,86,-77,-78,-79],[0,73,75,76,79,83,87],[6,22,-41,31,42,88],[9,[1],[1],4,[3]],[9,[2],[2],6,[3]],[0,90,91],[8,[2],92,11],[0,5],[8,[1],94,6],[0,[3]],[9,[3],[3],96,[4]],[0,97],[0,[3],[4]],[8,[1],98,99],[7,93,95,100,[4]],[11,-44,-50,11],[11,-34,-51,6],[11,-35,-52,99],[11,-45,-53,11],[11,-46,-54,6],[11,-47,-55,99],[0,102,103,104,105,106,107,41],[19,-37,-110,[4]],[0,109,85],[12,50,-48,-75,-76,110,-77,-78,-79],[0,73,75,76,79,83,111],[6,101,-126,31,108,112],[0,89,113],[5,114],[20,-129],[14,116,-130,-131],[21,-132],[14,118,-49,-133],[0,58,60,62,117,119],[1,65,-17,68,115,-127,-81,-128,56,120,[1],-100,-134],[2,-15,-135],[0,-46,-47],[19,-37,-110,[3]],[19,-111,-112,-138],[0,124,125],[22,123,-46,5,-135,-137,126,-139,-140,-141],[12,50,-48,-142,-143,86,-144,-145,-146],[0,73,75,76,79,83,127,87,128],[6,22,-41,31,42,129],[22,123,-46,90,-135,-137,126,-139,-140,-141],[12,50,-48,-142,-143,110,-144,-145,-146],[0,73,75,76,79,83,131,111,132],[6,101,-126,31,108,133],[0,130,134],[5,135],[23,-150,-96,-97],[14,137,-98,-99],[25,-86,-23],[24,139,-152,-153,-154],[0,58,60,138,117,119,140],[1,122,-17,68,136,-147,-81,-148,56,141,[1],-100,-155],[2,-156,-157],[27,-165,[0],-166,-167],[10,-168,-169],[10,-169,-170],[10,-170,-171],[10,-171,-168],[10,-168,-172],[10,-172,-170],[10,-170,-173],[0,145,146,147,148,149,150,151],[28,-168,[100],-175,-176],[28,-170,[500],-175,-177],[29,-178,-179,-180],[0,-186],[30,null,156,-168,-169,-187,-186,[1],-188,[100],[1],-170],[0,-186,-189],[30,[101],158,-170,-171,-187,-190,[1],-188,[500],[1],-168],[0,-189],[30,[501],160,-168,-172,-187,-189,[0],-188,[101],[0],-170],[29,-173,-183,-191],[0,153,154,155,157,159,161,162],[0,-169],[33,[101],-200],[33,[500],-201],[32,165,166],[31,false,false,164,-169,167,-202,-203,44,false,-169,164,-204,-186,-205],[0,-171],[33,[101],-206],[33,[501],-207],[32,170,171],[0,-169,-171],[31,false,false,169,-171,172,-208,-209,44,true,-171,173,-210,-211,-212],[0,-172],[33,[501],-206],[32,170,176],[0,-169,-171,-172],[31,true,true,175,-172,177,-157,-213,44,true,-172,178,-214,-215,-216],[0,168,174,179],[26,144,152,false,163,180],[0,181],[5,182],[13,-158,[640]],[1,143,-158,3,183,-80,-81,-217,184,63,[1],-100,-218],[0,-220,-221],[18,[0],-103,-104,-219,186],[0,1,187,2],[10,-170,-222],[10,-222,-168],[0,145,146,147,148,189,190,149,150,151],[30,[101],158,-170,-222,-187,-223,[0],-224,[500],[1],-168],[0,153,154,155,157,159,192,161,162],[19,-184,-225,-226],[19,-172,-227,-228],[19,-229,-230,-231],[0,194,195,196],[31,false,false,164,-169,167,-202,-203,197,false,-169,164,-204,-186,-205],[32,165,171],[19,-184,-225,-234],[19,-172,-227,-235],[0,200,201,196],[31,false,false,169,-171,199,-232,-233,202,false,-171,173,-236,-190,-237],[0,-168],[19,-229,-230,-238],[0,200,201,205],[31,false,false,204,-168,172,-208,-209,206,true,-171,173,-210,-211,-212],[19,-184,-225,-235],[19,-172,-227,-241],[0,208,209,205],[31,false,true,175,-172,172,-239,-240,210,true,-172,178,-242,-243,-244],[0,-170,-173],[19,-229,-230,-245],[0,208,209,213],[31,true,true,212,-170,177,-157,-213,214,true,-172,178,-246,-215,-216],[0,198,203,207,211,215],[26,144,191,false,193,216],[27,-247,[0],-166,-167],[30,[101],158,-170,-171,-187,-190,[1],-248,[500],[1],-168],[30,[101],158,-170,-222,-187,-223,[0],-188,[500],[1],-168],[0,153,154,155,157,219,220,161,162],[31,false,false,169,-171,199,-249,-250,202,false,-171,173,-251,-252,-253],[0,-222],[0,-169,-171,-222],[31,false,false,223,-222,199,-254,-255,202,false,-222,224,-256,-223,-257],[31,false,false,204,-168,172,-208,-209,206,true,-222,224,-210,-211,-212],[0,-169,-171,-222,-172],[31,false,true,175,-172,172,-239,-240,210,true,-172,227,-242,-243,-244],[31,true,true,212,-170,177,-157,-213,214,true,-172,227,-246,-215,-216],[0,198,222,225,226,228,229],[26,218,191,true,221,230],[0,217,231],[5,232],[1,143,-158,188,233,-127,-81,-258,184,120,[1],-100,-259],[0,-168,-170],[33,[100],-260],[32,236,166],[19,-184,-225,-228],[19,-263,-264,-226],[19,-265,-266,-234],[0,238,195,239,240],[31,false,false,235,-168,237,-261,-262,241,false,null,44,-267,-268,-269],[19,-263,-264,-235],[0,194,195,243,240],[31,false,false,164,-169,167,-202,-203,244,false,-169,164,-204,-186,-205],[19,-265,-266,-241],[0,200,201,243,246],[31,false,false,169,-171,199,-232,-233,247,false,-171,173,-236,-190,-237],[31,false,false,204,-168,172,-208,-209,247,true,-171,173,-210,-211,-212],[0,208,209,243,246],[31,false,true,175,-172,172,-239,-240,250,true,-172,178,-242,-243,-244],[31,true,true,212,-170,177,-157,-213,250,true,-172,178,-246,-215,-216],[0,242,245,248,249,251,252],[26,144,191,false,193,253],[31,false,false,169,-171,199,-249,-250,247,false,-171,173,-251,-252,-253],[0,238,195,243,246],[31,false,false,204,-168,199,-270,-271,256,false,null,173,-272,-273,-274],[31,false,false,223,-222,199,-254,-255,247,false,-222,224,-256,-223,-257],[31,false,false,204,-168,172,-208,-209,247,true,-222,224,-210,-211,-212],[31,false,true,175,-172,172,-239,-240,250,true,-172,227,-242,-243,-244],[31,true,true,212,-170,177,-157,-213,250,true,-172,227,-246,-215,-216],[0,242,245,255,257,258,259,260,261],[26,218,191,true,221,262],[0,254,263],[5,264],[1,143,-158,188,265,-147,-81,-275,184,141,[1],-100,-259],[2,-276,-277],[35,false,-280,-281],[35,false,-281,-277],[35,false,-277,-282],[36,true,-282,-283,-280],[0,268,269,270,271],[0,-298,-299],[0,-301],[39,273,-300,274],[0,275],[41,-305,-298],[41,-306,-298],[0,277,278],[40,279,-298,null],[41,-307,-299],[41,-308,-299],[0,281,282],[40,283,-299,null],[0,280,284],[42,273,-313,-301,null],[0,286],[44,-316,-34],[44,-317,-35],[0,288,289],[43,44,290,-318],[38,276,285,true,false,-309,-310,-311,287,-280,false,291],[37,-280,-285,-286,292],[39,273,-300,44],[0,294],[45,-305,-34],[45,-306,-35],[45,-307,-34],[45,-308,-35],[0,296,297,298,299],[43,300,290,-321],[38,295,285,true,false,-309,-310,-311,44,-281,false,301],[37,-281,-285,-319,302],[0,-305,-306,-307,-308],[39,304,-300,44],[0,305],[0,277],[40,307,-305,-34],[0,278],[40,309,-306,-35],[0,281],[40,311,-307,-34],[0,282],[40,313,-308,-35],[0,308,310,312,314],[43,300,290,-324],[38,306,315,true,false,-323,-310,-311,44,-277,true,316],[37,-277,-285,-322,317],[0,-326,-327],[39,304,-300,319],[0,320],[0,-305,-307],[42,322,-329,-326,-34],[0,-306,-308],[42,324,-329,-327,-35],[0,323,325],[43,44,290,-330],[38,321,315,false,false,-328,-310,-311,326,-282,true,327],[37,-282,-285,-325,328],[0,293,303,318,329],[0,-280],[46,331,-280,null,-280,-332,44,-333,-334,-335],[0,-281],[46,333,-281,null,-281,-336,44,-337,-338,-339],[0,-277],[46,335,-277,null,-277,-340,44,-341,-342,-343],[0,-282],[46,337,-282,null,-282,-344,44,-345,-346,-347],[0,332,334,336,338],[34,272,330,339],[0,340],[5,341],[13,-278,[640]],[1,267,-278,3,342,-80,-81,-348,343,63,[1],-100,-349],[0,-351,-352],[18,[0],-103,-104,-350,345],[0,1,346,2],[35,false,-280,-353],[35,false,-353,-281],[35,false,-282,-290],[36,true,-290,-283,-280],[0,348,349,269,270,350,351],[43,300,290,-355],[38,295,285,true,false,-309,-310,-311,44,-353,false,353],[37,-353,-285,-354,354],[0,-326],[39,322,-357,356],[0,-327],[39,324,-358,358],[0,357,359],[38,360,315,false,false,-359,-310,-311,326,-290,true,327],[37,-290,-285,-356,361],[0,-280,-353,-281,-277,-282,-290],[47,-288,363],[37,-288,-360,-351,364],[47,-295,363],[37,-295,-360,-363,366],[0,293,355,303,318,329,362,365,367],[0,-280,-288],[19,-288,-364,-365],[19,-366,-367,-368],[19,-369,-370,-228],[0,370,371,372],[46,369,-280,-288,-280,-332,373,-333,-334,-335],[0,-353,-288],[46,375,-353,-288,-353,-371,373,-372,-373,-374],[0,-281,-288],[46,377,-281,-288,-281,-336,373,-337,-338,-339],[0,-277,-288],[19,-288,-364,-368],[19,-369,-370,-365],[0,380,371,381],[46,379,-277,-288,-277,-340,382,-341,-342,-343],[0,-282,-288],[46,384,-282,-288,-282,-344,382,-345,-346,-347],[0,-290,-288],[46,386,-290,-288,-290,-375,382,-376,-377,-378],[0,374,376,378,383,385,387],[34,352,368,388],[0,-280,-295],[46,390,-280,-295,-280,-379,373,-380,-334,-335],[0,-353,-295],[46,392,-353,-295,-353,-381,373,-382,-373,-374],[0,-281,-295],[46,394,-281,-295,-281,-383,373,-384,-338,-339],[0,-277,-295],[46,396,-277,-295,-277,-385,382,-386,-342,-343],[0,-282,-295],[46,398,-282,-295,-282,-387,382,-388,-346,-347],[0,-290,-295],[46,400,-290,-295,-290,-389,382,-390,-377,-378],[0,391,393,395,397,399,401],[34,352,368,402],[0,389,403],[5,404],[1,267,-278,347,405,-127,-81,-391,343,120,[1],-100,-392],[35,false,-261,-280],[35,false,-290,-393],[36,true,-393,-283,-261],[0,407,348,349,269,270,350,408,409],[42,273,-395,-301,null],[0,411],[43,44,290,-396],[38,276,285,false,true,-309,-310,-311,412,-261,false,413],[37,-261,-285,-394,414],[38,360,315,false,true,-359,-310,-311,326,-393,true,327],[37,-393,-285,-397,416],[0,-261,-280,-353,-281,-277,-282,-290,-393],[47,-288,418],[37,-288,-360,-351,419],[47,-295,418],[37,-295,-360,-363,421],[0,415,293,355,303,318,329,362,417,420,422],[0,-261,-288],[19,-399,-400,-228],[19,-401,-402,-403],[0,370,371,425,426],[46,424,-261,-288,-261,-398,427,-404,-405,-406],[46,369,-280,-288,-280,-332,427,-333,-334,-335],[46,375,-353,-288,-353,-371,427,-372,-373,-374],[46,377,-281,-288,-281,-336,427,-337,-338,-339],[0,380,371,425,426],[46,379,-277,-288,-277,-340,432,-341,-342,-343],[19,-399,-400,-365],[0,380,371,434,426],[46,384,-282,-288,-282,-344,435,-345,-346,-347],[19,-401,-402,-365],[0,380,371,434,437],[46,386,-290,-288,-290,-375,438,-376,-377,-378],[0,-393,-288],[46,440,-393,-288,-393,-407,438,-408,-409,-410],[0,428,429,430,431,433,436,439,441],[34,410,423,442],[0,-261,-295],[46,444,-261,-295,-261,-411,427,-412,-405,-406],[46,390,-280,-295,-280,-379,427,-380,-334,-335],[46,392,-353,-295,-353,-381,427,-382,-373,-374],[46,394,-281,-295,-281,-383,427,-384,-338,-339],[46,396,-277,-295,-277,-385,432,-386,-342,-343],[46,398,-282,-295,-282,-387,435,-388,-346,-347],[46,400,-290,-295,-290,-389,438,-390,-377,-378],[0,-393,-295],[46,452,-393,-295,-393,-413,438,-414,-409,-410],[0,445,446,447,448,449,450,451,453],[34,410,423,454],[0,443,455],[5,456],[1,267,-278,347,457,-147,-81,-415,343,141,[1],-100,-392],[0,64,121,142,185,234,266,344,406,458]],459];

// Generated only from the nine HTML scene-model JSON objects; host fixture words never enter the guest composition packet.
const APPROVED_CARD_WORDS_PACKET = [1,["cardDescription","heading","instructions","story","title","Input splits into Left half and Right half, then Singles. Merge left and Merge right put those small runs in order; Sorted output joins them by taking the smaller front value.","Split and merge","Use Next or the step slider. Pause at Merge small runs to see where ordering begins.","Split first. Merge in order.","Input becomes Left half, Right half, then Singles. Merge left and Merge right create ordered runs for Sorted output. Compare a mixed and an already sorted input: splitting alone does not sort.","Advance one step at a time. Change Starting array and compare the merges at the same step.","Small sorted runs make a sorted whole.","Input splits into Left half and Right half, then Singles. Merge left and Merge right rebuild ordered runs for Sorted output. The front values decide what comes next; the count records that work.","The next value is at the front.","Client asks to connect. Server replies, but sending that reply cannot tell Server it was heard. The final ACK supplies the missing confirmation.","TCP connection setup","Move through the three messages with Next or the step slider. Read down the diagram for message order, not elapsed time. Blue marks the current part.","The reply needs a reply","Client learns Server’s starting sequence number from SYN-ACK. Only the final ACK tells Server its reply arrived. SEQ marks a position; ACK names the next expected position.","Step through the messages, then set Lose SYN-ACK to Yes. Compare the retry: downward is message order, not a timer.","What the last ACK proves","One reply, two views of readiness","DNA was copied before mitosis. Follow the same sister copies as they condense, line up, separate and enter new nuclei.","Follow the copies","Use Next or drag Step to follow the highlighted phase. The loop returns only after cell division, growth and DNA copying.","Mitosis separates copies","DNA copying happens in S phase before mitosis. Follow chromosome sets through nuclear division and animal-cell cytokinesis.","Use Next or drag Step. Switch Focus to follow chromosomes or the spindle; the faint outline marks the previous step."],[[-1,-2,-3,-4,-5]],[[1,-6,-7,-8,-6,-9],[1,-10,-7,-11,-10,-12],[1,-13,-7,-11,-13,-14],[1,-15,-16,-17,-15,-18],[1,-19,-16,-20,-19,-21],[1,-19,-16,-20,-19,-22],[1,-23,-24,-25,-23,-26],[1,-27,-24,-28,-27,-26],[0,0,1,2,3,4,5,6,7,7]],8];
