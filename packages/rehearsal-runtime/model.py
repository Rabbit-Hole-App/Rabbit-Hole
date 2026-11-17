"""The model interface: one method, so a stub can stand in. ModelCaller enforces the per-job call/spend budget and records every call."""
from dataclasses import dataclass, field
from typing import Optional, Protocol

import limits
import pricing

DEFAULT_MODEL = 'claude-sonnet-5-5'  # discovery, repair, plan (Reviewer decision); REHEARSAL_MODEL (claude-opus-5-5) is the discovery escalation


class BudgetStop(Exception):
    """The next model call would pass the call or spend cap."""


class ModelRefused(Exception):
    pass


@dataclass
class ModelReply:
    content: list          # content blocks as plain dicts: {'type': 'text'|'tool_use'|'thinking', ...}; passed back unchanged on the next turn
    input_tokens: int
    output_tokens: int
    model: str
    stop_reason: Optional[str] = None

    @property
    def text(self) -> str:
        return ''.join(b.get('text', '') for b in self.content if b.get('type') == 'text')

    @property
    def tool_uses(self) -> list:
        return [b for b in self.content if b.get('type') == 'tool_use']


class Model(Protocol):
    def complete(self, model: str, system: str, messages: list, tools: Optional[list], max_tokens: int) -> ModelReply: ...


class AnthropicModel:
    """Thin wrapper over the anthropic SDK. The key is read by the SDK from ANTHROPIC_API_KEY; it is never passed around or logged here."""

    def __init__(self, client=None):
        if client is None:
            import anthropic
            client = anthropic.Anthropic()
        self.client = client

    def complete(self, model, system, messages, tools, max_tokens):
        kw = dict(model=model, max_tokens=max_tokens, system=system, messages=messages)
        if tools:
            # tool_choice stays auto: a forced tool_choice 400s on these models, and thinking is left at its default
            kw.update(tools=tools, tool_choice={'type': 'auto'})
        r = self.client.messages.create(**kw)
        if r.stop_reason == 'refusal':
            raise ModelRefused('the model declined the request')
        return ModelReply([b.model_dump(mode='json', exclude_none=True) for b in r.content], r.usage.input_tokens, r.usage.output_tokens, r.model, r.stop_reason)


@dataclass
class ModelCaller:
    impl: Model
    budget: limits.Budget
    calls: list = field(default_factory=list)  # record.modelCalls

    def ask(self, role: str, model: str, system: str, messages: list, tools: Optional[list] = None, max_tokens: int = 4000, reserve: int = 0) -> ModelReply:
        """`reserve` keeps that many calls free for later roles (the repair agent leaves one for the plan)."""
        if not self.budget.can_call_model() or self.budget.model_calls + reserve >= limits.MAX_MODEL_CALLS:
            raise BudgetStop(f'model budget used ({self.budget.model_calls} calls, US${self.budget.model_spend_usd:.2f})')
        r = self.impl.complete(model, system, messages, tools, max_tokens)
        cost = pricing.usd(r.model or model, r.input_tokens, r.output_tokens)
        self.budget.charge_model(cost)
        self.calls.append({'role': role, 'model': r.model or model, 'inputTokens': r.input_tokens, 'outputTokens': r.output_tokens, 'usd': round(cost, 6)})
        return r

    @property
    def spend(self) -> float:
        return round(sum(c['usd'] for c in self.calls), 6)
