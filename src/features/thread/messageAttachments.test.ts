import { describe, expect, it } from "vitest";

import {
  attachmentHeaders,
  buildSelectedImageAttachment,
  messageImageUrl,
  optimisticChatAttachments,
} from "./messageAttachments";

describe("message attachments", () => {
  it("builds an encoded attachment URL", () => {
    expect(messageImageUrl("http://100.64.0.1:3773/base", "image one")).toBe(
      "http://100.64.0.1:3773/attachments/image%20one"
    );
  });

  it("adds bearer authentication when available", () => {
    expect(attachmentHeaders("secret")).toEqual({ Authorization: "Bearer secret" });
    expect(attachmentHeaders(null)).toBeUndefined();
  });

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

  it("builds selected image attachments from clipboard data URLs", () => {
    const result = buildSelectedImageAttachment({
      key: "clipboard-image",
      name: "paste.png",
      dataUrl: "data:image/png;base64,aGVsbG8=",
    });

    expect(result).toEqual({
      kind: "selected",
      attachment: {
        key: "clipboard-image",
        name: "paste.png",
        mimeType: "image/png",
        sizeBytes: 5,
        previewUri: "data:image/png;base64,aGVsbG8=",
        upload: {
          type: "image",
          name: "paste.png",
          mimeType: "image/png",
          sizeBytes: 5,
          dataUrl: "data:image/png;base64,aGVsbG8=",
        },
      },
    });
  });
});
