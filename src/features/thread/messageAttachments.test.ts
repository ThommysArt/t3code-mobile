import { describe, expect, it } from "vitest";

import { attachmentHeaders, messageImageUrl } from "./messageAttachments";

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
});
