"""Every hard limit of a rehearsal job, in one module. The caps are enforced by the controller, outside the sandbox they cap."""
from dataclasses import dataclass, field

JOB_WALL_SEC = 35 * 60          # whole job; also the sandbox's own `timeout` (Modal's default is 5 min and would kill the train step; set it on every create)
SANDBOX_IDLE_TIMEOUT_SEC = 10 * 60  # second backstop: a running exec keeps the sandbox active, a controller that died between steps does not
STEP_TIMEOUT_CAP_SEC = 25 * 60  # a route step's timeoutSec is clamped to this
SANDBOX_CPU = 2
SANDBOX_MEMORY_MIB = 4096
ARTIFACT_MAX_BYTES = 50 * 1024 * 1024  # produced files copied beside record.json; over this they are listed, not copied
MAX_FIX_CYCLES = 6
MAX_FIX_CYCLES_PER_STEP = 3
MAX_MODEL_CALLS = 12
MODEL_SPEND_CAP_USD = 3.0
MAX_QUEUE = 4                   # one job in flight per controller, this many waiting
REPAIR_EXEC_TIMEOUT_SEC = 300   # the repair agent's exec tool
REPAIR_READ_MAX_LINES = 200     # the repair agent's read_file tool
MODEL_CONTEXT_TAIL_LINES = 60   # logs on disk are never truncated; only what goes into the model's context
TRAP_STDERR_TAIL_LINES = 20
MAX_WARNINGS_PER_STEP = 10
MAX_ARTIFACT_LOG_BYTES = 5 * 1024 * 1024  # ponytail: one attempt's log is capped here so a runaway process cannot fill the artifact; raise when a real repository needs it


def step_timeout(route_sec: int) -> int:
    return max(1, min(int(route_sec), STEP_TIMEOUT_CAP_SEC))


@dataclass
class Budget:
    """Counts what one job has used. Each check returns False once the next unit would pass its cap; the caller then stops the loop and records the partial."""
    fix_cycles: int = 0
    model_calls: int = 0
    model_spend_usd: float = 0.0
    per_step_fixes: dict = field(default_factory=dict)

    def can_fix(self, step: str) -> bool:
        return self.fix_cycles < MAX_FIX_CYCLES and self.per_step_fixes.get(step, 0) < MAX_FIX_CYCLES_PER_STEP

    def start_fix(self, step: str) -> None:
        if not self.can_fix(step):
            raise RuntimeError('fix budget exhausted for ' + step)
        self.fix_cycles += 1
        self.per_step_fixes[step] = self.per_step_fixes.get(step, 0) + 1

    def can_call_model(self) -> bool:
        return self.model_calls < MAX_MODEL_CALLS and self.model_spend_usd < MODEL_SPEND_CAP_USD

    def charge_model(self, usd: float) -> None:
        self.model_calls += 1
        self.model_spend_usd += usd
