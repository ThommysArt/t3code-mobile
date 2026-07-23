import { describe, expect, it } from "vitest";

import {
  attachmentCacheKey,
  collectAttachmentIdsFromMessages,
  sanitizeAttachmentPathSegment,
} from "./attachmentCacheHelpers";

describe("attachmentCache helpers", () => {
  it("builds a stable cache key per environment and attachment", () => {
    expect(attachmentCacheKey("env-1", "img-a")).toBe("attachment:env-1:img-a");
  });

  it("sanitizes path segments for on-disk filenames", () => {
    expect(sanitizeAttachmentPathSegment("env/../weird id!")).toBe("env_.._weird_id_");
  });

  it("collects attachment ids from thread messages", () => {
    const ids = collectAttachmentIdsFromMessages([
      { attachments: [{ id: "a" }, { id: "b" }] },
      { attachments: null },
      { attachments: [{ id: "a" }, { id: "c" }] },
      {},
    ]);

    expect(ids).toEqual(["a", "b", "a", "c"]);
  });
});
