// Explain-back contract fixtures (EB-01). Synthetic only: no real learner text, audio or drawings. Every lane's tests may
// import these; valid ones must keep passing validateExplainBackAnswer, invalid ones must keep failing with the named code.
const h = c => c.repeat(64); // a well-formed sha256 hex

export const BOARD = 'board_fixture';
export const CARD = 'card_eb_1';

const voice = (over = {}) => ({ evidenceId: 'ev_voice_1', role: 'voice', media: 'audio', state: 'ready', assetId: 'aa_voice00000001', revision: 1, hash: h('a'), mime: 'audio/webm', bytes: 48211, durationMs: 31500, ...over });
const sketch = (over = {}) => ({ evidenceId: 'ev_sketch_1', role: 'sketch', media: 'image', state: 'ready', assetId: 'aa_sketch0000001', revision: 1, hash: h('b'), mime: 'image/png', bytes: 20480, ...over });
const notebook = (over = {}) => ({
  evidenceId: 'ev_nb_1', role: 'resource', media: 'notebook', state: 'ready', sourceKind: 'notebook', assetId: 'nb_pendulum', revision: 7, hash: h('c'),
  board: BOARD, label: 'Pendulum notebook', scope: { cells: ['cell_2', 'cell_3'] }, connection: { port: 'bottom' }, ...over,
});
const group = (over = {}) => ({
  evidenceId: 'ev_group_1', role: 'resource', media: 'group', state: 'ready', sourceKind: 'group', assetId: 'grp_forces', revision: 3,
  board: BOARD, label: 'Forces', connection: { port: 'top' },
  members: [
    { sourceKind: 'file', sourceId: 'fs_diagram', revision: 2, board: BOARD, hash: h('d'), media: 'pdf', scope: { pages: [2] }, state: 'ready' },
    { sourceKind: 'card', sourceId: 'card_note_9', revision: 1, board: BOARD, media: 'card', state: 'ready' },
    { sourceKind: 'card', sourceId: 'card_video_2', revision: 1, board: BOARD, media: 'video', state: 'unsupported' },
  ],
  ...over,
});
const answer = (over = {}) => ({ v: 1, kind: 'explain_back', text: '', voice: [], resources: [], assistance: [], ...over });

export const VALID = {
  textOnly: answer({ text: 'The string pulls the bob toward the centre, so its velocity keeps turning.' }),
  emptyTextVoice: answer({ voice: [voice()] }),
  sketchOnly: answer({ sketch: sketch() }),
  resourceGroup: answer({ text: 'My notebook shows the period barely changes with amplitude.', resources: [notebook(), group()], assistance: [{ kind: 'hint', id: 'hint_1' }] }),
  combined: answer({
    text: 'Force inward, velocity tangent.', voice: [voice()], sketch: sketch(),
    recording: { evidenceId: 'ev_rec_1', role: 'recording', media: 'video', state: 'ready', assetId: 'aa_record0000001', revision: 1, hash: h('e'), durationMs: 64000 },
    resources: [notebook()], assistance: [{ kind: 'chat', id: 'chat_7' }], baseline: { parentAttemptId: 'at_parent', parentAssessmentId: 'as_prev' },
  }),
  revisionNoParentReview: answer({ text: 'Second try.', baseline: { parentAttemptId: 'at_parent', parentAssessmentId: null } }),
};

// Stored answers from the single-line card before EB: plain text, and text with the old sketch record.
export const LEGACY = {
  text: { text: 'It swings because of gravity.' },
  textSketch: { text: 'See drawing', sketch: { marks: 4, words: ['bob', 'string'] } },
};

// name -> [answer, expected error substring]
export const INVALID = {
  wrongKind: [answer({ kind: 'text' }), 'kind'],
  textNotString: [answer({ text: null }), 'text'],
  voiceInResources: [answer({ resources: [voice()] }), 'role voice in resource'],
  voiceAsBoardFile: [answer({ voice: [voice({ assetId: 'fs_shared_audio' })] }), 'asset_not_private'],
  voiceAsImage: [answer({ voice: [voice({ media: 'image' })] }), 'media image is not voice'],
  readyWithoutHash: [answer({ sketch: sketch({ hash: undefined }) }), 'needs its hash'],
  duplicateEvidenceId: [answer({ voice: [voice(), voice()] }), 'duplicate or reserved'],
  reservedTextId: [answer({ sketch: sketch({ evidenceId: 'text' }) }), 'duplicate or reserved'],
  badHash: [answer({ sketch: sketch({ hash: 'abc' }) }), 'sha256'],
  membersOnNotebook: [answer({ resources: [notebook({ members: [] })] }), 'members only'],
  groupWithoutMembers: [answer({ resources: [group({ members: undefined })] }), 'members only'],
  nestedGroup: [answer({ resources: [group({ members: [{ sourceKind: 'group', sourceId: 'grp_x', revision: 1, media: 'group', state: 'ready' }] })] }), 'nested group'],
  duplicateResource: [answer({ resources: [notebook(), notebook({ evidenceId: 'ev_nb_2', connection: { port: 'top' } })] }), 'duplicate source and scope'],
  tooManyVoice: [answer({ voice: [1, 2, 3, 4].map(i => voice({ evidenceId: `ev_v${i}` })) }), 'voice: at most'],
  // cross-scope: these need ctx {board: BOARD, cardId: CARD}
  otherBoardResource: [answer({ resources: [notebook({ board: 'board_other' })] }), 'cross_scope_evidence'],
  otherBoardMember: [answer({ resources: [group({ members: [{ sourceKind: 'file', sourceId: 'fs_x', revision: 1, board: 'board_other', hash: h('f'), media: 'pdf', state: 'ready' }] })] }), 'cross_scope_evidence'],
  selfAsInput: [answer({ resources: [notebook({ sourceKind: 'card', media: 'card', assetId: CARD })] }), 'self_reference'],
  groupContainsSelf: [answer({ resources: [group({ members: [{ sourceKind: 'card', sourceId: CARD, revision: 1, board: BOARD, media: 'card', state: 'ready' }] })] }), 'self_reference'],
};

// Readiness: [answer, recorder state, expected reason]
export const READINESS = {
  empty: [answer(), {}, 'empty_answer'],
  whitespace: [answer({ text: '   ' }), {}, 'empty_answer'],
  recording: [VALID.textOnly, { recording: true }, 'recording_active'],
  paused: [VALID.emptyTextVoice, { paused: true }, 'recording_active'],
  uploading: [answer({ voice: [voice({ state: 'uploading', hash: undefined })] }), {}, 'upload_in_progress'],
  failedUpload: [answer({ text: 'kept', sketch: sketch({ state: 'failed' }) }), {}, 'evidence_unavailable'],
  unavailableMember: [answer({ resources: [group({ members: [{ sourceKind: 'card', sourceId: 'gone', revision: 1, media: 'card', state: 'unavailable' }] })] }), {}, 'evidence_unavailable'],
};

export const review = (over = {}) => ({
  v: 1, attemptId: 'at_1', assessmentId: 'as_1', status: 'completed', rubricVersion: 'r1',
  judgments: [
    { criterionId: 'c_force', criterionVersion: 1, judgment: 'demonstrated', fit: 'met', reasoning: 'supported', required: true, scored: true, citations: [{ evidenceId: 'ev_voice_1', locator: { startMs: 2000, endMs: 9000 } }] },
    { criterionId: 'c_velocity', criterionVersion: 1, judgment: 'partly_demonstrated', fit: 'partial', reasoning: 'partial', required: true, scored: true, citations: [{ evidenceId: 'ev_sketch_1', locator: { region: [10, 20, 80, 60] } }] },
  ],
  coverage: [{ evidenceId: 'ev_voice_1', status: 'read' }, { evidenceId: 'ev_sketch_1', status: 'read' }],
  feedback: {
    strengths: { text: 'You explain why the force points inward.', citations: [{ evidenceId: 'ev_voice_1', locator: { startMs: 2000, endMs: 9000 } }] },
    revisit: { text: 'Your velocity arrow also points inward.', citations: [{ evidenceId: 'ev_sketch_1', locator: { region: [10, 20, 80, 60] } }] },
    next: { text: 'How would you redraw the velocity arrow?', citations: [] },
  },
  // rateAttempt's output for these judgments: round(10 x 1.5 / 2) = 8, under the required cap of 9
  rating: {
    status: 'rated', score: 8, outOf: 10, capped: false, calculationVersion: 'eb-rating-v1', rubricVersion: 'r1',
    criteria: [{ criterionId: 'c_force', version: 1, weight: 1, required: true, credit: 1 }, { criterionId: 'c_velocity', version: 1, weight: 1, required: true, credit: 0.5 }],
  },
  provenance: { evaluatorVersion: 'fixture' },
  ...over,
});
// The answer `review()` reviews: voice + sketch, empty text.
export const REVIEWED_ANSWER = answer({ voice: [voice()], sketch: sketch() });
