# T3 Code Mobile

Focused Expo client for connecting to a self-hosted T3 Code server over a local network or
Tailscale. The app syncs projects and threads, renders thread history, sends follow-up prompts, and
runs the existing Git commit/push/pull-request workflow from a phone.

This repository is intentionally smaller than the full upstream mobile client in
`~/Works/scraps/t3code/apps/mobile`, but it uses the same contracts and WebSocket RPC protocol.

## Current workflow

1. T3 Code exposes a pairing link or a server address plus pairing code.
2. Mobile fetches the environment descriptor and exchanges the one-time pairing credential for a
   bearer session.
3. Only the redacted server address and bearer session are retained. The pairing credential is
   removed after exchange.
4. Mobile starts two synchronization paths:
   - WebSocket RPC for live shell/thread events and Git operations.
   - Authenticated HTTP snapshot fetch as fast hydration and a degraded-mode fallback.
5. Shell snapshots populate the project/thread list. Full HTTP read models are also persisted as
   thread details, so opening a thread works even when WebSocket setup fails.
6. Prompts use WebSocket RPC when live. If it is unavailable, they use the authenticated HTTP
   dispatch endpoint and poll snapshots while the task runs.

## Data states

The UI reports the source it is actually using:

- `Live`: WebSocket shell and thread streams are active.
- `HTTP sync`: current server data is available over authenticated HTTP; prompts still work.
- `Cached`: local SQLite data is shown while the server is unavailable.
- `Offline`: no usable live, HTTP, or cached data is available.

The Environments screen includes a redacted runtime activity log for pairing, transport, sync,
thread, and Git events.

## Architecture

```text
src/app                         Expo Router routes
src/features/home               Project-grouped thread catalog
src/features/thread             Thread feed and prompt composer
src/features/git                Status, commit, push, pull, and PR actions
src/runtime/EnvironmentProvider Connection lifecycle and sync source of truth
src/runtime/useThread           Thread subscription/cache/optimistic prompts
src/runtime/db                  SQLite shell and thread caches
src/runtime/statusLog.ts        Structured, redacted diagnostics
packages/contracts              Shared server schemas and RPC contracts
packages/client-runtime         WebSocket RPC, reducers, Git helpers, HTTP client
packages/shared                 Shared remote/pairing utilities
```

Important upstream references:

```text
~/Works/scraps/t3code/apps/mobile/src/state/use-remote-environment-registry.ts
~/Works/scraps/t3code/apps/mobile/src/state/use-thread-detail.ts
~/Works/scraps/t3code/apps/mobile/src/features/home/HomeScreen.tsx
~/Works/scraps/t3code/apps/mobile/src/features/threads/
~/Works/scraps/t3code/packages/client-runtime/
```

When the T3 Code server protocol changes, compare and synchronize `packages/contracts`,
`packages/client-runtime`, and the required `packages/shared` exports before changing app-level
workarounds.

## Run

The repository expects Node `24.13.1` in the Node 24 release line and pnpm `10.24.0`.

```sh
pnpm install
pnpm android
```

This installs the Android development build, including the cleartext tailnet networking policy.
After the first install, start Metro with:

```sh
pnpm dev
```

Use `pnpm ios` instead for an iOS development build. The development environment check may raise
Linux inotify limits. Run this once if Metro reports `ENOSPC`:

```sh
pnpm fix:inotify
```

## Pairing

Open **Environments** and use either:

- A complete pairing URL copied from T3 Code.
- A Tailscale/LAN address such as `100.114.223.34:3773` plus its pairing code.
- The QR scanner.

Bare addresses in Tailscale `100.64.0.0/10`, private LAN ranges, `.local`, and `.ts.net` default to
plain HTTP/WS. Public hosts default to HTTPS/WSS.

The server and phone must be able to reach each other. For Tailscale, confirm both devices are on
the same tailnet and that the server is listening on the advertised interface and port.

Plain HTTP/WS tailnet servers should be tested with this project's native development build, not
Expo Go. The Android cleartext-network permission and iOS local-network settings in
`app.config.ts` are applied during native prebuild and are not controlled by this app inside Expo
Go.

If a saved connection stops authenticating, open **Environments**, tap **Re-pair**, enter a fresh
pairing code, and pair again. The connection log now checks server reachability and session
validity before attempting WebSocket bootstrap.

Each saved environment also exposes an editable **Connection URL** with a **Save connection**
button. Saving verifies that the new URL belongs to the same environment before replacing it.

Connection diagnostics report checking the server, validating the saved session, opening the
WebSocket, receiving the shell snapshot, publishing the thread catalog, and updating the Home
catalog as separate steps. A successful WebSocket connection does not start the expensive HTTP
full-history fallback.

## Release and deploy

Version numbers live in `package.json` and flow into `app.config.ts`. Releases use annotated
semver tags (`v0.0.6`) and publish GitHub releases titled `T3 Code Mobile vX.Y.Z`.

```sh
# Commit, push, and start a preview Android EAS build
pnpm deploy:android "Describe the change"

# Patch bump, tag, GitHub release, push, and EAS build
pnpm release:android "Describe the release"
```

The deploy script runs tests and typecheck first, commits your changes, creates the release tag
after the feature commit, pushes `main` and the tag, publishes the GitHub release with generated
notes, then submits a non-blocking EAS `preview-android` build.

GitHub Actions also runs CI on every push/PR and, when a `v*.*.*` tag is pushed, validates the
tag and publishes the GitHub release. Add an `EXPO_TOKEN` repository secret to let the tag workflow
submit EAS builds from CI as well.

See [`CHANGELOG.md`](CHANGELOG.md) for release history.

## Validation

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm dlx expo-doctor@1.18.2
```

Production Android bundle smoke test:

```sh
pnpm dlx node@24.13.1 node_modules/expo/bin/cli export \
  --platform android \
  --output-dir /tmp/t3code-mobile-export \
  --clear
```

## Storage and security

- Bearer sessions and the last redacted server input use `expo-secure-store`.
- Shell snapshots and full thread details use `expo-sqlite`.
- Pairing codes are cleared after a successful exchange.
- Runtime diagnostics redact tokens, tickets, bearer headers, and credential fields.
- Cleartext HTTP/WS is enabled for local and tailnet servers. Pair only with servers you trust.

Removing an environment clears its saved session and cached shell/thread data.

## Feature boundaries

Implemented:

- Multiple saved environments.
- QR, full-link, and host/code pairing.
- Live and HTTP fallback project/thread synchronization.
- Cached offline thread browsing.
- Prompt dispatch with optimistic messages.
- Git status, selective commit, push, pull, and pull-request actions.
- Light/dark mobile UI and in-app connection diagnostics.

Not yet at upstream parity:

- Creating projects or threads from mobile.
- Attachments, approval/user-input cards, model/runtime selectors, and stop controls.
- Native terminal and full review/diff surfaces.
- Git operations while only HTTP fallback is available; Git currently requires live WebSocket RPC.

See [`docs/AUDIT.md`](docs/AUDIT.md) for the June 11, 2026 audit record and follow-up priorities.
