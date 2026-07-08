# Changelog

All notable releases of T3 Code Mobile are tagged `vX.Y.Z` on GitHub and built with the
`preview-android` EAS profile.

## v0.0.6 — 2026-07-08

### Thread feed

- Rebuilt thread message rendering to match the desktop/web client.
- Settled turns collapse behind a **Worked for …** row; only the final assistant reply stays visible.
- Tool activity shows one-line summaries; full command/output opens per-row.
- Assistant messages render flat (no cards); user prompts stay in bubbles.

### Platform

- Upgraded to Expo SDK 57 and React Native 0.86.
- Added agent event push notifications (`expo-notifications`).
- Improved home thread ordering using initiated-at timestamps.
- Exported `@t3tools/shared/orchestrationTiming` for feed duration labels.

### Release tooling

- Added GitHub CI and tag-triggered Android release workflows.
- Fixed deploy script ordering so feature commits land before version tags.
- GitHub releases are created automatically with generated notes.

## v0.0.5 — 2026-06-29

- Semver releases synced from `package.json` into the app config.
- Android deploy script tags releases and triggers EAS preview builds.
- Settings shows the installed app version.