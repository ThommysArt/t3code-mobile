import type { EdgeInsets } from "react-native-safe-area-context";

export const BOTTOM_CHROME_HORIZONTAL_PADDING = 14;
export const BOTTOM_CHROME_TOP_PADDING = 6;
export const BOTTOM_CHROME_MIN_INSET = 8;

export function bottomChromePaddingBottom(insets: Pick<EdgeInsets, "bottom">): number {
  return Math.max(insets.bottom, BOTTOM_CHROME_MIN_INSET);
}

/** Default floating search bar height (pill only). */
export const FLOATING_SEARCH_BAR_HEIGHT = 46;

export function estimatedSearchChromeHeight(insets: Pick<EdgeInsets, "bottom">): number {
  return BOTTOM_CHROME_TOP_PADDING + FLOATING_SEARCH_BAR_HEIGHT + bottomChromePaddingBottom(insets);
}

export function estimatedComposerChromeHeight(insets: Pick<EdgeInsets, "bottom">): number {
  return BOTTOM_CHROME_TOP_PADDING + 128 + bottomChromePaddingBottom(insets);
}