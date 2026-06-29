export type WorkspaceToolKind = "browser" | "terminal" | "files" | "diff";

export type WorkspaceTab =
  | { readonly id: string; readonly kind: "picker" }
  | { readonly id: string; readonly kind: "browser" }
  | { readonly id: string; readonly kind: "terminal"; readonly terminalId: string }
  | { readonly id: string; readonly kind: "files" }
  | { readonly id: string; readonly kind: "diff" };

export interface WorkspaceToolOption {
  readonly kind: WorkspaceToolKind;
  readonly title: string;
  readonly subtitle: string;
  readonly icon: "globe" | "terminal" | "folder" | "file";
}