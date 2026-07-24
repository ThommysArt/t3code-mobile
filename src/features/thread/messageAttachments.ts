import {
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
  type ChatAttachment,
  type UploadChatAttachment,
} from "@t3tools/contracts";

export interface SelectedImageAttachment {
  readonly key: string;
  readonly name: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly previewUri: string;
  readonly upload: UploadChatAttachment;
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType.toLowerCase() === "image/png") return "png";
  if (mimeType.toLowerCase() === "image/webp") return "webp";
  if (mimeType.toLowerCase() === "image/gif") return "gif";
  return "jpg";
}

function estimateBase64Bytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function parseImageDataUrl(dataUrl: string): {
  readonly base64: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
} | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;
  const [, mimeType, base64] = match;
  return { base64, mimeType, sizeBytes: estimateBase64Bytes(base64) };
}

export function buildSelectedImageAttachment(input: {
  readonly key: string;
  readonly name?: string | null;
  readonly dataUrl: string;
  readonly previewUri?: string;
  readonly sizeBytes?: number | null;
}):
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "selected"; readonly attachment: SelectedImageAttachment } {
  const parsed = parseImageDataUrl(input.dataUrl);
  if (!parsed) {
    return { kind: "error", message: "Image data is not in a supported format." };
  }

  const sizeBytes = input.sizeBytes ?? parsed.sizeBytes;
  if (sizeBytes > PROVIDER_SEND_TURN_MAX_IMAGE_BYTES) {
    return {
      kind: "error",
      message: `Each image must be ${Math.floor(
        PROVIDER_SEND_TURN_MAX_IMAGE_BYTES / 1024 / 1024
      )} MB or smaller.`,
    };
  }

  const name =
    input.name?.trim() || `pasted-image.${extensionForMimeType(parsed.mimeType)}`;
  return {
    kind: "selected",
    attachment: {
      key: input.key,
      name,
      mimeType: parsed.mimeType,
      sizeBytes,
      previewUri: input.previewUri ?? input.dataUrl,
      upload: {
        type: "image",
        name,
        mimeType: parsed.mimeType,
        sizeBytes,
        dataUrl: input.dataUrl,
      },
    },
  };
}

export function optimisticChatAttachments(
  attachments: readonly SelectedImageAttachment[]
): readonly ChatAttachment[] {
  return attachments.map((attachment) => ({
    type: "image",
    id: attachment.key,
    name: attachment.name,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
  }));
}
