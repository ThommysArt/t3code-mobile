#!/usr/bin/env bash
# Lyra-style local Android builds: expo prebuild + Gradle on disk (not eas --local /tmp).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VARIANT="preview"
CLEAN=0
INSTALL=0
SKIP_PREBUILD=0

usage() {
  cat <<'EOF'
Usage:
  bash scripts/build-android-local.sh [--dev|--preview] [--clean] [--install] [--skip-prebuild]

Options:
  --dev            assembleDebug (development client / debug signing)
  --preview        assembleRelease (default; uses credentials.json when present)
  --clean          Run expo prebuild --clean before building
  --install        adb install -r the resulting APK
  --skip-prebuild  Skip prebuild even if android/ is missing (fails if missing)
  -h, --help       Show this help

Environment:
  ANDROID_HOME / ANDROID_SDK_ROOT   Android SDK (defaults to ~/Android/Sdk if present)
  JAVA_HOME                         Optional JDK home
  ANDROID_ARCHS                     Comma-separated ABIs for Gradle
                                    (default: arm64-v8a; set e.g. armeabi-v7a,arm64-v8a,x86,x86_64 for all)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dev)
      VARIANT="dev"
      shift
      ;;
    --preview)
      VARIANT="preview"
      shift
      ;;
    --clean)
      CLEAN=1
      shift
      ;;
    --install)
      INSTALL=1
      shift
      ;;
    --skip-prebuild)
      SKIP_PREBUILD=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unexpected argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "${ANDROID_HOME:-}" && -z "${ANDROID_SDK_ROOT:-}" ]]; then
  if [[ -d "${HOME}/Android/Sdk" ]]; then
    export ANDROID_HOME="${HOME}/Android/Sdk"
    export ANDROID_SDK_ROOT="${HOME}/Android/Sdk"
  fi
fi

if [[ -z "${ANDROID_HOME:-}${ANDROID_SDK_ROOT:-}" ]]; then
  echo "ANDROID_HOME / ANDROID_SDK_ROOT is not set and ~/Android/Sdk was not found." >&2
  exit 1
fi

export ANDROID_HOME="${ANDROID_HOME:-$ANDROID_SDK_ROOT}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
export PATH="${PATH}:${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/cmdline-tools/latest/bin"

ensure_prebuild() {
  if [[ "$SKIP_PREBUILD" -eq 1 ]]; then
    if [[ ! -d android ]]; then
      echo "android/ is missing and --skip-prebuild was set." >&2
      exit 1
    fi
    return
  fi

  if [[ "$CLEAN" -eq 1 || ! -d android ]]; then
    # Expo prefers CI=1 over --non-interactive for non-TTY prebuild.
    export CI="${CI:-1}"
    if [[ "$CLEAN" -eq 1 ]]; then
      echo "Running expo prebuild --clean --platform android..."
      EXPO_NO_GIT_STATUS=1 pnpm exec expo prebuild --clean --platform android
    else
      echo "android/ missing; running expo prebuild --platform android..."
      EXPO_NO_GIT_STATUS=1 pnpm exec expo prebuild --platform android
    fi
  else
    echo "Using existing android/ (pass --clean to regenerate)."
  fi
}

ensure_prebuild

if [[ ! -x android/gradlew ]]; then
  echo "android/gradlew not found after prebuild." >&2
  exit 1
fi

case "$VARIANT" in
  dev)
    GRADLE_TASK="assembleDebug"
    APK_GLOB="android/app/build/outputs/apk/debug/*.apk"
    ;;
  preview)
    GRADLE_TASK="assembleRelease"
    APK_GLOB="android/app/build/outputs/apk/release/*.apk"
    ;;
  *)
    echo "Unknown variant: ${VARIANT}" >&2
    exit 1
    ;;
esac

# Default to arm64-only for faster local builds and lower disk use on constrained hosts.
# Override with ANDROID_ARCHS=armeabi-v7a,arm64-v8a,x86,x86_64 for a fat APK.
ARCHS="${ANDROID_ARCHS:-arm64-v8a}"

echo "Building Android ${VARIANT} via Gradle (${GRADLE_TASK}) in project tree..."
echo "Architectures: ${ARCHS}"
(
  cd android
  ./gradlew "${GRADLE_TASK}" "-PreactNativeArchitectures=${ARCHS}"
)

shopt -s nullglob
APKS=( ${APK_GLOB} )
shopt -u nullglob

if [[ ${#APKS[@]} -eq 0 ]]; then
  echo "Build finished but no APK matched ${APK_GLOB}" >&2
  exit 1
fi

APK_PATH="$(ls -1t "${APKS[@]}" | head -n 1)"
echo "APK: ${APK_PATH}"

if [[ "$INSTALL" -eq 1 ]]; then
  if ! command -v adb >/dev/null 2>&1; then
    echo "adb not found; cannot install." >&2
    exit 1
  fi
  echo "Installing ${APK_PATH}..."
  adb install -r "${APK_PATH}"
fi
