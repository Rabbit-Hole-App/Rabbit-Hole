// The browser half of the Jev side-by-side grader (docs/features/jev-grading.md).
// The learner only ever sees Opus: neither call throws, and nothing on the
// learner path waits for them.
export function createShadowGrader({ fetchImpl = (...args) => fetch(...args), headers = () => ({}) } = {}) {
  // `app` is the LearnPage app object; the body carries its name.
  async function shadowGrade({ app, board = null, block, answer }) {
    try {
      if (!app || app.hosting === 'aws' || !block?.attemptId || !Array.isArray(block.expects) || !block.expects.length) return null;
      const response = await fetchImpl('/api/learn/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({
          app: app.name,
          attempt_id: block.attemptId,
          board,
          block_id: block.id ?? null,
          mode: block.mode === 'explain_back' ? 'explain_back' : 'challenge',
          prompt: block.prompt,
          expects: block.expects,
          answer,
        }),
      });
      if (![200, 202, 409, 502].includes(response.status)) return null;
      const data = await response.json().catch(() => null);
      return Number.isInteger(data?.grade_id) ? data.grade_id : null;
    } catch {
      return null;
    }
  }

  // `app` is the app name. One-shot on the server; a 404 (already recorded,
  // another learner's row) is simply false.
  async function recordBaseline({ app, gradeId, verdict, ms }) {
    try {
      const whole = Math.round(ms);
      if (!Number.isInteger(gradeId) || !Number.isFinite(whole) || whole < 0 || whole > 600000) return false;
      const response = await fetchImpl(`/api/learn/grade/${gradeId}/baseline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ app, verdict: verdict ?? null, ms: whole }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  return { shadowGrade, recordBaseline };
}

// Same pattern ChallengeBody uses (LearningBlocks.jsx) to read the tutor's verdict.
export const parseVerdict = text => (String(text || '').match(/VERDICT:\s*(good|partial)/i)?.[1] || '').toLowerCase() || null;
