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
CATALOGUE_SPEND_CAP_USD = 0.5   # the catalogue's one model call (and its one re-ask): route-catalogue-spec 8
CATALOGUE_MAX_OUTPUT_TOKENS = 6000
CATALOGUE_INPUT_TOKENS = 60_000  # README texts first, then the top 200 candidates by source kind
CATALOGUE_MAX_CANDIDATES = 200
CATALOGUE_MAX_DOWNLOAD_GB = 0.5  # a route that downloads more than this is not practical in the sandbox (owner, 2026-11-15)
CATALOGUE_MAX_QUEUE = 4
MAX_ALLOW_DOMAIN_FIXES = 2     # allow_domain fixes per job (each re-creates the sandbox with one more domain)
MAX_QUEUE = 4
# Run card sessions (one sandbox per canvas, user and commit; schemas/session.json)
SESSION_HARD_TIMEOUT_SEC = 60 * 60
SESSION_IDLE_TIMEOUT_SEC = 10 * 60
MAX_SESSIONS = 2                # concurrent sessions per controller
REAPER_INTERVAL_SEC = 60
RUN_TAIL_LINES = 200
RUN_TAIL_MAX_BYTES = 32 * 1024
RUN_FILE_MAX_BYTES = 5 * 1024 * 1024          # produced files (RUN_CARD.md, Run card v1.1): fetched up to this size each,
RUN_FILES_MAX_BYTES = 25 * 1024 * 1024        # this many per run, and
SESSION_FILES_MAX_BYTES = 100 * 1024 * 1024   # this many held in memory per session (over a cap: listed with fetched false)
RUN_FILES_MAX_COUNT = 200                     # run-status.json producedFiles maxItems
PROBE_BODY_BYTES = 64 * 1024                  # an http_200 probe's body kept for the card (run-status.json probes)
METRIC_MAX_POINTS = 2000                      # per series
METRIC_MAX_SERIES = 8
RUN_STDOUT_KEEP_BYTES = 2 * 1024 * 1024       # stdout kept whole to classify it (json / table); a longer stdout is `text`
RUN_FLAG_MAX_PROPERTIES = 8                   # one job in flight per controller, this many waiting
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
    model_spend_cap_usd: float = MODEL_SPEND_CAP_USD

    def can_fix(self, step: str) -> bool:
        return self.fix_cycles < MAX_FIX_CYCLES and self.per_step_fixes.get(step, 0) < MAX_FIX_CYCLES_PER_STEP

    def start_fix(self, step: str) -> None:
        if not self.can_fix(step):
            raise RuntimeError('fix budget exhausted for ' + step)
        self.fix_cycles += 1
        self.per_step_fixes[step] = self.per_step_fixes.get(step, 0) + 1

    def can_call_model(self) -> bool:
        return self.model_calls < MAX_MODEL_CALLS and self.model_spend_usd < self.model_spend_cap_usd

    def charge_model(self, usd: float) -> None:
        self.model_calls += 1
        self.model_spend_usd += usd


# Sandbox network (spec v1.3 8a): TLS-only domain allowlist, no CIDR ranges. A repository that needs another host gets it through an allow_domain fix.
OUTBOUND_DOMAIN_ALLOWLIST = ['pypi.org', 'files.pythonhosted.org', 'download.pytorch.org', 'github.com', '*.github.com', 'codeload.github.com',
                             'raw.githubusercontent.com', 'objects.githubusercontent.com', '*.githubusercontent.com']
