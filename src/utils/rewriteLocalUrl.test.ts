import { describe, expect, it } from "vitest";

import { extractRemoteHost, rewriteLocalDevUrl } from "./rewriteLocalUrl";

describe("rewriteLocalDevUrl", () => {
  it("rewrites localhost to the connected remote host", () => {
    expect(rewriteLocalDevUrl("http://localhost:3000", "100.88.1.2")).toBe("http://100.88.1.2:3000/");
  });

  it("extracts host from connection url", () => {
    expect(extractRemoteHost("http://100.88.1.2:4310/")).toBe("100.88.1.2");
  });
});