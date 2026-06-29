interface TerminalLocationLike {
  readonly cwd: string;
  readonly worktreePath: string | null;
}

export function resolveTerminalOpenLocation(input: {
  readonly terminalLocation: TerminalLocationLike | null;
  readonly activeSessionLocation: TerminalLocationLike | null;
  readonly workspaceRoot: string;
  readonly worktreePath: string | null;
}): {
  readonly cwd: string;
  readonly worktreePath: string | null;
} {
  return {
    cwd:
      input.terminalLocation?.cwd ??
      input.activeSessionLocation?.cwd ??
      input.worktreePath ??
      input.workspaceRoot,
    worktreePath:
      input.terminalLocation?.worktreePath ??
      input.activeSessionLocation?.worktreePath ??
      input.worktreePath,
  };
}