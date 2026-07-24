import { describe, expect, it } from "vitest";

import {
  buildSelectedImageAttachment,
  optimisticChatAttachments,
} from "./messageAttachments";

describe("message attachments", () => {
  it("maps selected upload images to optimistic chat attachment metadata", () => {
    expect(
      optimisticChatAttachments([
        {
          key: "local-image",
          name: "screen.png",
          mimeType: "image/png",
          sizeBytes: 123,
          previewUri: "file:///screen.png",
          upload: {
            type: "image",
            name: "screen.png",
            mimeType: "image/png",
            sizeBytes: 123,
            dataUrl: "data:image/png;base64,abc",
          },
        },
      ])
    ).toEqual([
      {
        type: "image",
        id: "local-image",
        name: "screen.png",
        mimeType: "image/png",
        sizeBytes: 123,
      },
    ]);
  });

  it("builds selected image attachments from image data URLs", () => {
    const result = buildSelectedImageAttachment({
      key: "data-url-image",
      name: "image.png",
      dataUrl: "data:image/png;base64,aGVsbG8=",
    });

    expect(result).toEqual({
      kind: "selected",
      attachment: {
        key: "data-url-image",
        name: "image.png",
        mimeType: "image/png",
        sizeBytes: 5,
        previewUri: "data:image/png;base64,aGVsbG8=",
        upload: {
          type: "image",
          name: "image.png",
          mimeType: "image/png",
          sizeBytes: 5,
          dataUrl: "data:image/png;base64,aGVsbG8=",
        },
      },
    });
  });
});
