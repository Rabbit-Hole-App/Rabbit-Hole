// Where a Tutor turn's answer goes (owner 2026-10-09, beta item 2; docs/features/learn-chat-sheet.md "Where an answer goes"):
// read from the resolved plan, never chosen at Send. Pure, so it is tested without a browser.
//   material - the turn made or showed a card (create_material, or a card shown on the canvas). The card is the answer and
//              the planner's words beside it are not repeated. Only a question the Tutor
//              asks the learner stays, because the next turn answers it.
//   to - 'tray' for clarification, setup or an empty result; 'conversation' for selected-card discussion;
//        'card' for teaching or an untargeted answer; null when the material itself is the answer.
// target: the composer's context captured at Send. setup: a journey before its path is accepted makes no card (LP1).
const SHOWS = action => action?.type === 'create_material' || ((action?.type === 'show_authored_card' || action?.type === 'focus_part') && action.mode === 'navigate');
const TEACH = /^(please |can you |could you |would you )?(explain|teach me)\b/i;

// A clear teaching request (/teach, or words that open with explain or teach me) creates its card.
export const teaching = (turn, reading) => turn?.mode === 'teach' || reading?.inferred_intent === 'teach' || TEACH.test(String(turn?.raw_user_message || '').trim());

export function destinationOf(result, target = null, { setup = false } = {}) {
  const actions = result?.actions || [];
  const material = actions.some(SHOWS);
  const failed = ['failed', 'refused'].includes(result?.bench?.handoff?.outcome);
  const questions = actions.filter(action => action.type === 'ask_question').map(action => String(action.text || '').trim()).filter(Boolean);
  const text = material && !failed ? [...questions, result?.sourceAnswer].filter(Boolean).join('\n\n')
    : result?.text || (actions.some(action => action.type !== 'no_action') ? '' : 'Nothing to add here yet.');
  const card = !setup && (teaching(result?.turn, result?.reading) || !target?.card);
  const to = !text ? null
    : failed || result?.reading?.clarification_requested === true ? 'tray'
    : !material && !actions.some(action => action.type !== 'no_action') ? 'tray'
    : (!material || result?.sourceAnswer) && card ? 'card'
    : target?.card && !setup ? 'conversation'
    : 'tray';
  return { material, to, text };
}
