# Inline JavaScript runtime: local qualification

Leaf module only; no HTTP exposure, configured cloud loader, paid execution or UI completion.

- Focused Node checks: 6 passed / 0 failed / 0 skipped. Final run 3.092 seconds.
- Actual local Miniflare/workerd probe: 5 passed / 0 failed / 0 skipped in 266.975 ms, zero parent outbound calls.
- Probe exercises finite arithmetic/stdout, thrown errors, network denial, output bound and fresh globals. No infinite loop or memory exhaustion attempted.
- Requested CPU limit is 1000 ms, subrequests zero. The three-second host deadline stops waiting; timeout/cancellation do not claim isolate termination.
- Input is exact JavaScript async-function body with explicit return and JSON input. Python is unsupported, never translated. SHA-256 binds exact UTF-8 source and serialized input.
- Each load receives empty env, globalOutbound null, and a synthetic request without owner/session headers. Response capped at 32 KiB; source 32 KiB; input 16 KiB.
- No retries. A pre-aborted signal never invokes the loader. A late-resolving loader after cancellation cannot start the request.
- Runtime probe uses installed tools and disposes Miniflare. Deployed CPU/termination and platform billing remain unverified.
