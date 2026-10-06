// The Tutor action contract (docs/features/professor-next-steps.md §3.1, §3.2; owner 2026-10-06): what each accepted
// TutorAction is, in the product's own names. runTurn returns one contract per accepted action; the session's modality
// history and the decision trace both read these fields and never recompute them. Pure; it imports no course module.
import { REASON_CODES } from '../../control-plane/src/agents/learn-tutor.js';

// A card's modality is its block type; an Explain Back challenge is explain_back (describeBlock names it the same way).
export const blockModality = block => (!block ? null : block.type === 'challenge' && block.mode === 'explain_back' ? 'explain_back' : block.type ?? null);

// The block a Learn command's card is inserted as, where that differs from its palette name (learn-slash.js CARD_OF):
// the control plane's learn-primitives.js builders and runLearnCommand's own inserts (learn-slash.test.mjs checks each).
const INSERTED = { explainBack: 'explain_back', plot: 'graph', walkthrough: 'scene', videoGenerate: 'video', mathAnimation: 'video' };
const OF_TYPE = { respond_text: 'text', suggest_depth: 'depth', suggest_practice: 'practice', suggest_dive: 'rabbit_hole', open_dive: 'rabbit_hole', return_from_dive: 'rabbit_hole', suggest_avatar_clip: 'avatar' };

// domain.cardType(card): the block modality of a card it can show. materials: the turn's available_materials; a made card
// is its command's first card, the one runLearnCommand holds a place for (the server picks among the rest).
export function modalityOf(action, { domain = null, materials = [] } = {}) {
  if (action?.type === 'ask_question') return action.purpose === 'explain_back' ? 'explain_back' : 'question';
  if (action?.type === 'create_material') {
    const card = materials.find(material => material.command === action.command)?.cards?.[0];
    return card ? INSERTED[card] ?? card : null;
  }
  if (action?.type === 'show_authored_card' || action?.type === 'focus_part') return domain?.cardType?.(action.card) ?? null;
  return OF_TYPE[action?.type] ?? null;
}

// ponytail: rough generic seconds per modality, for pacing measurements only (text read at about 180 words a minute, a
// shown or made card 90); null when the time depends on the learner following a suggestion. Tune from real sessions.
const SECONDS = { question: 60, explain_back: 120, practice: 120, depth: 60, avatar: 30 };
const secondsOf = (action, modality) => {
  if (modality == null || modality === 'rabbit_hole') return null;
  if (modality === 'text') return Math.max(5, Math.round(String(action.text || '').split(/\s+/).filter(Boolean).length / 3));
  return action.max_duration_seconds ?? SECONDS[modality] ?? 90;
};
// What a card asks of the learner, by its block type alone, so a shown card and a made one of the same type expect the same:
// an Explain Back challenge an explanation; interaction where the learner acts on the card itself (LearningBlocks.jsx: a
// challenge or quiz answer, flashcards flipped, a code exercise or notebook run, a graph's sliders, a scene's steps or orbit,
// an authored animation's inputs and practice, a whiteboard drawn on, a 3D model turned); every other type is read or
// watched (explanation, table, snippet, flow, mermaid, image, video, paper, audio, knowledge) and expects nothing.
const INTERACTIVE = ['challenge', 'quiz', 'flashcards', 'code', 'notebook', 'graph', 'scene', 'animation', 'whiteboard', 'model3d'];
const cardVia = modality => (modality === 'explain_back' ? 'explain_back' : INTERACTIVE.includes(modality) ? 'interaction' : null);
const CARD_ACTIONS = ['show_authored_card', 'focus_part', 'suggest_practice'];

// ctx: { domain, materials, claims } - claims are the turn's claims (runTurn's bench.claims), which an action without a
// target of its own (a reply, a made card) teaches. command: the Learn command of a made card (a Motion and a generated
// video are both video blocks; animate and video tell them apart), null for every other action. Never throws: a domain
// without an optional member (cardType, ladderStep, targetClaims, claims, concepts) leaves that field null or [].
export function actionContract(action, { domain = null, materials = [], claims = [] } = {}) {
  const modality = modalityOf(action, { domain, materials });
  const card = action.type === 'suggest_depth' ? domain?.ladderStep?.(action.card, action.direction || 'deeper') ?? null : CARD_ACTIONS.includes(action.type) ? action.card : null;
  const target_claim_ids = action.claim && domain?.claims?.[action.claim] ? [action.claim]
    : card ? domain?.targetClaims?.({ block_id: card, card_id: card, part_id: action.part_id ?? null }) || []
    : action.type === 'respond_text' || action.type === 'create_material' ? claims.slice(0, 3) : [];
  const concepts = [...target_claim_ids.map(id => domain?.claims?.[id]?.concept), ...[action.concept, action.to_concept].filter(id => id && domain?.concepts?.[id])].filter(Boolean);
  const via = action.type === 'ask_question' ? (modality === 'explain_back' ? 'explain_back' : 'answer') : action.type === 'suggest_practice' ? 'practice'
    : ['show_authored_card', 'focus_part', 'create_material'].includes(action.type) ? cardVia(modality) : null;
  return {
    action_type: action.type, command: action.type === 'create_material' ? action.command ?? null : null, modality, target_concept_ids: [...new Set(concepts)], target_claim_ids,
    expected_evidence: via ? target_claim_ids.map(claim_id => ({ claim_id, via })) : [],
    estimated_learning_seconds: secondsOf(action, modality),
  };
}

// The turn's reason codes: the planner's, known codes only, once each, at most 3. The router fallback and the
// vary_modality-alone guard belong to the decision event (contract §3.2), never to the product.
export const reasonCodes = response => [...new Set((Array.isArray(response?.reason_codes) ? response.reason_codes : []).filter(code => REASON_CODES.includes(code)))].slice(0, 3);
