import {
  PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
} from "@t3tools/contracts";
import * as ImagePicker from "expo-image-picker";

import { buildSelectedImageAttachment, type SelectedImageAttachment } from "./messageAttachments";

function extensionForMimeType(mimeType: string): string {
  if (mimeType.toLowerCase() === "image/png") return "png";
  if (mimeType.toLowerCase() === "image/webp") return "webp";
  if (mimeType.toLowerCase() === "image/gif") return "gif";
  return "jpg";
}

function fileNameForAsset(asset: ImagePicker.ImagePickerAsset, index: number): string {
  const name = asset.fileName?.trim();
  if (name) return name;
  const mimeType = asset.mimeType?.trim() || "image/jpeg";
  return `image-${index + 1}.${extensionForMimeType(mimeType)}`;
}

export async function pickImageAttachments(input: {
  readonly existingCount: number;
}): Promise<
  | { readonly kind: "cancelled" }
  | { readonly kind: "denied"; readonly message: string }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "selected"; readonly attachments: readonly SelectedImageAttachment[] }
> {
  const remaining = PROVIDER_SEND_TURN_MAX_ATTACHMENTS - input.existingCount;
  if (remaining <= 0) {
    return {
      kind: "error",
      message: `Attach up to ${PROVIDER_SEND_TURN_MAX_ATTACHMENTS} images per message.`,
    };
  }

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return {
      kind: "denied",
      message: "Allow photo library access to attach images.",
    };
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    selectionLimit: remaining,
    base64: true,
    exif: false,
    quality: 0.92,
  });

  if (result.canceled) return { kind: "cancelled" };

  const attachments: SelectedImageAttachment[] = [];
  for (const [index, asset] of result.assets.entries()) {
    if (!asset.base64) {
      return {
        kind: "error",
        message: "Unable to read the selected image data.",
      };
    }
    const mimeType = asset.mimeType?.trim() || "image/jpeg";
    if (!mimeType.toLowerCase().startsWith("image/")) {
      return {
        kind: "error",
        message: "Only image attachments are supported.",
      };
    }

    const name = fileNameForAsset(asset, input.existingCount + index);
    const dataUrl = `data:${mimeType};base64,${asset.base64}`;
    const attachment = buildSelectedImageAttachment({
      key: `${Date.now().toString(36)}-${index}`,
      name,
      previewUri: asset.uri,
      sizeBytes: asset.fileSize,
      dataUrl,
    });
    if (attachment.kind === "error") return attachment;
    attachments.push(attachment.attachment);
  }

  return { kind: "selected", attachments };
}
