const CSI_SEQUENCE = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

function isClearScreenSequence(sequence: string): boolean {
  return /\u001b\[[0-9;]*[23]J/.test(sequence);
}

export function applyTerminalDisplayBuffer(buffer: string): string {
  if (buffer.length === 0) {
    return "";
  }

  let visible = "";
  let lastIndex = 0;
  const matches = buffer.matchAll(CSI_SEQUENCE);

  for (const match of matches) {
    const index = match.index ?? 0;
    visible += buffer.slice(lastIndex, index);
    if (isClearScreenSequence(match[0])) {
      visible = "";
    }
    lastIndex = index + match[0].length;
  }

  visible += buffer.slice(lastIndex);
  return visible.replace(CSI_SEQUENCE, "");
}