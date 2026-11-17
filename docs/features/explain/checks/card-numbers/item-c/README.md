# Item C: stale production-profile comments

Before: explanation-models.js and explanation-fast-chain.js said production uses fireworks-low.
After: both say production uses google-low (Gemini flash-lite first, Fireworks gpt-oss-120b as the fallback; wrangler.rabbit-hole-prod.jsonc EXPLANATION_MODEL_PROFILE). Comments only, no code change.
