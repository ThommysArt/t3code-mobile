#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROFILE="${EAS_PROFILE:-preview-android}"
PLATFORM="${EAS_PLATFORM:-android}"
COMMIT_MESSAGE="${1:-}"

run_checks() {
  echo "Running tests..."
  pnpm test

  echo "Running typecheck..."
  pnpm typecheck
}

commit_and_push() {
  if [[ -z "$COMMIT_MESSAGE" ]]; then
    if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
      echo "Working tree has uncommitted changes. Pass a commit message:"
      echo "  pnpm deploy:android \"Your commit message\""
      exit 1
    fi
    echo "Working tree clean; skipping commit."
    return
  fi

  if git diff --quiet && git diff --cached --quiet && [[ -z "$(git ls-files --others --exclude-standard)" ]]; then
    echo "Nothing to commit; continuing with push and build."
  else
    git add -A
    git commit -m "$COMMIT_MESSAGE"
  fi

  echo "Pushing to origin..."
  git push origin HEAD
}

start_build() {
  echo "Starting EAS ${PLATFORM} build (profile: ${PROFILE}, no-wait)..."
  pnpm exec eas build \
    --profile "$PROFILE" \
    --platform "$PLATFORM" \
    --non-interactive \
    --no-wait
}

run_checks
commit_and_push
start_build

echo "Deploy submitted. Track the build in the EAS dashboard or with: pnpm exec eas build:list"