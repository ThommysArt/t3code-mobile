import { PROVIDER_SEND_TURN_MAX_ATTACHMENTS } from "@t3tools/contracts";
import * as Clipboard from "expo-clipboard";

import { buildSelectedImageAttachment, type SelectedImageAttachment } from "./messageAttachments";

function unsupportedClipboardImageMessage(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /unavailable|not available|not supported|expo go/i.test(message) ||
    message.includes("Clipboard.getImageAsync")
  ) {
    return "Image paste is not available in this Expo Go runtime. It should work in a preview build that includes expo-clipboard native support.";
  }
  return null;
}

export async function pasteImageAttachment(input: {
  readonly existingCount: number;
}): Promise<
  | { readonly kind: "denied"; readonly message: string }
  | { readonly kind: "empty"; readonly message: string }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "selected"; readonly attachment: SelectedImageAttachment }
> {
  if (input.existingCount >= PROVIDER_SEND_TURN_MAX_ATTACHMENTS) {
    return {
      kind: "error",
      message: `Attach up to ${PROVIDER_SEND_TURN_MAX_ATTACHMENTS} images per message.`,
    };
  }

  try {
    const hasImage = await Clipboard.hasImageAsync();
    if (!hasImage) {
      return { kind: "empty", message: "Clipboard does not contain an image." };
    }

    const image = await Clipboard.getImageAsync({ format: "jpeg", jpegQuality: 0.92 });
    if (!image) {
      return {
        kind: "denied",
        message: "Clipboard image access was denied or no image is available.",
      };
    }

    return buildSelectedImageAttachment({
      key: `${Date.now().toString(36)}-clipboard`,
      name: "pasted-image.jpg",
      dataUrl: image.data,
    });
  } catch (error) {
    return {
      kind: "error",
      message: unsupportedClipboardImageMessage(error) ?? "Unable to paste image from clipboard.",
    };
  }
}
