import Constants from "expo-constants";

export function getAppVersion(): string | null {
  return Constants.expoConfig?.version ?? Constants.nativeApplicationVersion ?? null;
}

export function getAppVersionLabel(): string {
  const version = getAppVersion();
  const build = Constants.nativeBuildVersion;
  if (version && build) {
    return `v${version} (${build})`;
  }
  if (version) {
    return `v${version}`;
  }
  return "unknown";
}