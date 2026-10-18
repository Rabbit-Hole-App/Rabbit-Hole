# JavaScript actor qualification

Implemented as an unregistered helper for existing FILE_JOBS; no shared dispatch, cloud binding or paid activation changed.

- Combined runtime/coordinator/route/actor tests: 27 passed, 0 failed, 0 skipped; 3.118 seconds.
- Actual local Miniflare SQLite Durable Object + Dynamic Worker probe: 4 passed, 0 failed, 0 skipped; 689.422 ms; zero outbound calls.
- Actual probe covers durable create, automatic alarm -> real finite JavaScript execution -> persisted status, idempotent duplicate result, owner refusal, and cancellation. It tests private actor dispatch; real external session authentication is not established by this probe.
- Fixture checks additionally cover scheduling failure before acknowledgement, restarted started jobs becoming unknown without reexecution, continued queue processing, admission-off status/cancel, cancellation of active work through cached coordinator, immutable policy and preservation of unrelated storage.
- Cloud CPU termination, production permissions/billing and user-facing run-code UI remain unverified. No infinite loop was attempted.

Delegation: call inlineCodeActorFetch(state, env, req) for /inline-code/create|status|cancel and return its non-null response. In the existing alarm handler, await inlineCodeActorAlarm(state, env); return when true. False means the legacy alarm handler retains ownership. The persistent code:actor marker distinguishes this protocol; no deleteAll/reset is used.
