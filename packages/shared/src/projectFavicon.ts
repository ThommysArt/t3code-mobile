export const PROJECT_FAVICON_FALLBACK_MARKER = "project-favicon-missing";

export function isProjectFaviconFallbackUrl(url: string | null | undefined): boolean {
  if (!url) return false;

  try {
    const pathname = new URL(url, "https://t3.invalid").pathname;
    return pathname.slice(pathname.lastIndexOf("/") + 1) === PROJECT_FAVICON_FALLBACK_MARKER;
  } catch {
    return false;
  }
}

export function resolveAssetUrl(httpBaseUrl: string, relativeUrl: string): string | null {
  try {
    return new URL(relativeUrl, httpBaseUrl).toString();
  } catch {
    return null;
  }
}
