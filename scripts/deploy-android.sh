#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROFILE="${EAS_PROFILE:-preview-android}"
PLATFORM="${EAS_PLATFORM:-android}"
RELEASE_TAG="${RELEASE_TAG:-}"
COMMIT_MESSAGE=""

usage() {
  cat <<'EOF'
Usage:
  pnpm deploy:android "Commit message"
  pnpm deploy:android --release "Commit message"
  pnpm deploy:android --release 0.0.6 "Commit message"

Options:
  --release [VERSION]  Bump package.json version (patch if omitted), commit, tag vX.Y.Z, and push tag.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --release)
      RELEASE_TAG="patch"
      shift
      if [[ $# -gt 0 && "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        RELEASE_TAG="$1"
        shift
      fi
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [[ -n "$COMMIT_MESSAGE" ]]; then
        echo "Unexpected argument: $1"
        usage
        exit 1
      fi
      COMMIT_MESSAGE="$1"
      shift
      ;;
  esac
done

read_package_version() {
  node -p "require('./package.json').version"
}

write_package_version() {
  local next_version="$1"
  node <<'NODE' "$next_version"
const fs = require("node:fs");
const nextVersion = process.argv[1];
const packagePath = "package.json";
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
packageJson.version = nextVersion;
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
NODE
}

bump_patch_version() {
  local current="$1"
  local major minor patch
  IFS='.' read -r major minor patch <<<"$current"
  echo "${major}.${minor}.$((patch + 1))"
}

resolve_release_version() {
  local current
  current="$(read_package_version)"
  if [[ "$RELEASE_TAG" == "patch" ]]; then
    bump_patch_version "$current"
    return
  fi
  if [[ "$RELEASE_TAG" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "$RELEASE_TAG"
    return
  fi
  echo "Invalid release version: ${RELEASE_TAG}" >&2
  exit 1
}

prepare_release() {
  local next_version tag
  next_version="$(resolve_release_version)"
  tag="v${next_version}"

  if git rev-parse -q --verify "refs/tags/${tag}" >/dev/null; then
    echo "Git tag ${tag} already exists."
    exit 1
  fi

  write_package_version "$next_version"
  git add package.json
  git commit -m "chore: release ${tag}"
  git tag -a "$tag" -m "Release ${tag}"
  echo "Prepared release ${tag}"
}

run_checks() {
  echo "Running tests..."
  pnpm test

  echo "Running typecheck..."
  pnpm typecheck
}

commit_and_push() {
  if [[ -n "$RELEASE_TAG" ]]; then
    prepare_release
  fi

  if [[ -z "$COMMIT_MESSAGE" ]]; then
    if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
      echo "Working tree has uncommitted changes. Pass a commit message:"
      echo "  pnpm deploy:android \"Your commit message\""
      echo "  pnpm deploy:android --release \"Your commit message\""
      exit 1
    fi
    echo "Working tree clean; skipping commit."
  else
    if git diff --quiet && git diff --cached --quiet && [[ -z "$(git ls-files --others --exclude-standard)" ]]; then
      echo "Nothing to commit; continuing with push and build."
    else
      git add -A
      git commit -m "$COMMIT_MESSAGE"
    fi
  fi

  echo "Pushing to origin..."
  git push origin HEAD
  if [[ -n "$RELEASE_TAG" ]]; then
    git push origin "v$(read_package_version)"
  fi
}

start_build() {
  local version
  version="$(read_package_version)"
  echo "Starting EAS ${PLATFORM} build (profile: ${PROFILE}, version: v${version}, no-wait)..."
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