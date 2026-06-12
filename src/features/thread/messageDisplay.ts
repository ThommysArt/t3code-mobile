const COLLAPSED_PROMPT_LINES = 7;
const APPROXIMATE_CHARACTERS_PER_LINE = 42;

export const COLLAPSED_PROMPT_HEIGHT = COLLAPSED_PROMPT_LINES * 23;

export function shouldCollapsePrompt(text: string): boolean {
  const estimatedLines = text.split("\n").reduce((total, line) => {
    return total + Math.max(1, Math.ceil(line.length / APPROXIMATE_CHARACTERS_PER_LINE));
  }, 0);
  return estimatedLines > COLLAPSED_PROMPT_LINES;
}
