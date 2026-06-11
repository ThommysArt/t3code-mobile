# Platform Audit

Audit date: June 11, 2026

Reference implementation:

- `~/Works/scraps/t3code/apps/mobile`
- `~/Works/scraps/t3code/apps/web/src/environments/runtime`
- `~/Works/scraps/t3code/packages/client-runtime`
- `~/Works/scraps/t3code/apps/server/src/ws.ts`

## Summary

The original standalone app compiled, but its fallback state could display thread shells while
thread detail rendering remained permanently pending. The app now has a truthful live/HTTP/cache
state model, persists full thread details, supports HTTP prompt dispatch, and removes failed
WebSocket sessions instead of exposing them as usable clients.

The core target workflow is implemented:

- Pair a phone with a T3 Code server.
- Sync and browse active threads.
- Open and render thread history.
- Send follow-up prompts.
- Inspect Git status and run commit/push/pull-request actions when live.

## Resolved findings

### Critical

- HTTP fallback converted the full read model to shell rows and discarded thread messages.
- Failed WebSocket sessions remained registered, so thread hooks subscribed to a dead client.
- HTTP fallback was labeled `ready`, making the UI and mutation paths overstate connectivity.
- Prompts had no fallback even though the server exposes authenticated HTTP dispatch.

### High

- Bare Tailscale CGNAT addresses were inconsistently treated as HTTPS during pairing.
- Pairing credentials were retained after bearer exchange.
- WebSocket ticket URLs could be written to status logs.
- Thread subscription failures had no useful in-app diagnostics.

### UI and usability

- Search competed with the header instead of remaining reachable near the bottom.
- Connection source and data freshness were unclear.
- Thread rows, status pills, composer, and settings navigation lacked a consistent visual system.
- Runtime messages were transient and unavailable for troubleshooting after a toast disappeared.
- Android QR scanning requested microphone permission unnecessarily.

## Validation coverage

- Unit tests cover Tailscale normalization, pairing URLs/deep links, credential redaction, bounded
  status history, and HTTP read-model shell conversion.
- TypeScript strict mode passes.
- ESLint passes.
- Prettier check passes for the maintained app surface.
- Expo Doctor passes all 17 checks.
- Android production export is used as the Metro/native bundle smoke test.

## Remaining gaps

These are feature-parity gaps, not blockers for the current thread-management workflow:

1. Thread/project creation should reuse upstream's new-task flow.
2. Approvals, user-input requests, attachments, and stop controls should reuse upstream thread
   activity/composer logic.
3. Native terminal and review/diff surfaces require upstream native modules and a development build.
4. Git operations require WebSocket RPC; the server does not expose equivalent Git HTTP endpoints.
5. End-to-end testing still needs a real paired server and physical iOS/Android device in CI or a
   release checklist.

## Maintenance rule

Do not independently redesign the T3 protocol in this repository. When server behavior changes,
pull the corresponding upstream contracts and client-runtime changes first, then adapt only the
small mobile state and UI layer.
