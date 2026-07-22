#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROFILE="${EAS_PROFILE:-preview-android}"
PLATFORM="${EAS_PLATFORM:-android}"
RELEASE_TAG="${RELEASE_TAG:-}"
COMMIT_MESSAGE=""
LOCAL_BUILD=0
SKIP_CHECKS=0
SKIP_PUSH=0
BUILD_ONLY=0

usage() {
  cat <<'EOF'
Usage:
  pnpm deploy:android "Commit message"
  pnpm deploy:android --local "Commit message"
  pnpm deploy:android --release "Commit message"
  pnpm deploy:android --release 0.0.6 --local "Commit message"
  pnpm deploy:android --build-only
  pnpm deploy:android --build-only --local

Options:
  --release [VERSION]  Bump package.json version (patch if omitted), tag vX.Y.Z,
                       push, publish a GitHub release, and start a build.
  --local              Run the EAS build on this machine instead of EAS cloud
                       (uses credentials.json / local Android SDK + JDK).
  --build-only         Skip commit/tag/push; only run checks and start a build.
  --skip-checks        Skip tests and typecheck.
  --skip-push          Commit/tag locally but do not push or create a GitHub release.
  -h, --help           Show this help.

Environment:
  EAS_PROFILE          Build profile (default: preview-android)
  EAS_PLATFORM         Platform (default: android)
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
    --local)
      LOCAL_BUILD=1
      shift
      ;;
    --build-only)
      BUILD_ONLY=1
      shift
      ;;
    --skip-checks)
      SKIP_CHECKS=1
      shift
      ;;
    --skip-push)
      SKIP_PUSH=1
      shift
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
  NEXT_VERSION="$next_version" node <<'NODE'
const fs = require("node:fs");
const nextVersion = process.env.NEXT_VERSION;
if (!nextVersion) {
  throw new Error("NEXT_VERSION is required");
}
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

commit_changes() {
  if [[ -z "$COMMIT_MESSAGE" ]]; then
    if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
      echo "Working tree has uncommitted changes. Pass a commit message:"
      echo "  pnpm deploy:android \"Your commit message\""
      echo "  pnpm deploy:android --local \"Your commit message\""
      echo "  pnpm deploy:android --release \"Your commit message\""
      exit 1
    fi
    echo "Working tree clean; skipping feature commit."
    return
  fi

  if git diff --quiet && git diff --cached --quiet && [[ -z "$(git ls-files --others --exclude-standard)" ]]; then
    echo "Nothing to commit; continuing with release and build."
    return
  fi

  git add -A
  git commit -m "$COMMIT_MESSAGE"
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

create_github_release() {
  local version tag title
  version="$(read_package_version)"
  tag="v${version}"
  title="T3 Code Mobile ${tag}"

  if ! command -v gh >/dev/null 2>&1; then
    echo "gh CLI not found; skipping GitHub release creation."
    return
  fi

  if gh release view "$tag" >/dev/null 2>&1; then
    echo "GitHub release ${tag} already exists."
    return
  fi

  gh release create "$tag" \
    --title "$title" \
    --generate-notes \
    --latest
  echo "Published GitHub release ${tag}"
}

run_checks() {
  if [[ "$SKIP_CHECKS" -eq 1 ]]; then
    echo "Skipping checks (--skip-checks)."
    return
  fi

  echo "Running tests..."
  pnpm test

  echo "Running typecheck..."
  pnpm typecheck
}

commit_and_push() {
  if [[ "$BUILD_ONLY" -eq 1 ]]; then
    echo "Build-only mode; skipping commit/tag/push."
    return
  fi

  commit_changes

  if [[ -n "$RELEASE_TAG" ]]; then
    prepare_release
  fi

  if [[ "$SKIP_PUSH" -eq 1 ]]; then
    echo "Skipping push (--skip-push)."
    return
  fi

  echo "Pushing to origin..."
  git push origin HEAD
  if [[ -n "$RELEASE_TAG" ]]; then
    git push origin "v$(read_package_version)"
    create_github_release
  fi
}

start_build() {
  local version
  local -a build_args
  version="$(read_package_version)"
  build_args=(
    build
    --profile "$PROFILE"
    --platform "$PLATFORM"
    --non-interactive
  )

  if [[ "$LOCAL_BUILD" -eq 1 ]]; then
    build_args+=(--local)
    echo "Starting local EAS ${PLATFORM} build (profile: ${PROFILE}, version: v${version})..."
    echo "Requires a local Android SDK + JDK. Output APK/AAB will be written under the project."
  else
    # Cloud builds return immediately; local builds always block until finished.
    build_args+=(--no-wait)
    echo "Starting EAS cloud ${PLATFORM} build (profile: ${PROFILE}, version: v${version}, no-wait)..."
  fi

  pnpm dlx eas-cli "${build_args[@]}"
}

run_checks
commit_and_push
start_build

if [[ "$LOCAL_BUILD" -eq 1 ]]; then
  echo "Local build finished."
else
  echo "Deploy submitted. Track the build in the EAS dashboard or with: pnpm dlx eas-cli build:list"
fi
