"""Anthropic list prices, USD per million tokens (input, output). The ONLY place prices live.
Source: the claude-api skill's model table ("cached: 2026-11-03"), read 2026-11-14 -- not re-checked against the live pricing page.
ponytail: no prompt-cache or thinking-surcharge handling (we do not use caching; thinking tokens arrive inside output_tokens). Re-read the live page before trusting the US$3 cap to the cent."""
PRICES = {
    'claude-sonnet-5-5': (2.00, 10.00),
    'claude-opus-5-5': (4.00, 20.00),
}
# ponytail: an unknown model is priced at the dearest known rate, so the cap errs on the safe side
_FALLBACK = max(PRICES.values())


def usd(model: str, input_tokens: int, output_tokens: int) -> float:
    pin, pout = PRICES.get(model, _FALLBACK)
    return (input_tokens * pin + output_tokens * pout) / 1_000_000
