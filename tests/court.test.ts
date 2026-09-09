import { describe, expect, it } from "vitest";
import { canonicalizeContract } from "@/lib/court";

describe("court domain", () => {
  it("canonicalizes equivalent contract objects deterministically", () => {
    const first = canonicalizeContract({ seller: "0x2", buyer: "0x1", obligations: [{ id: "OB-2" }, { id: "OB-1" }] });
    const second = canonicalizeContract({ obligations: [{ id: "OB-2" }, { id: "OB-1" }], buyer: "0x1", seller: "0x2" });
    expect(first).toBe(second);
  });

  it("sorts nested object keys without changing arrays", () => {
    const canonical = canonicalizeContract({ z: { b: 2, a: 1 }, a: [2, 1] });
    expect(canonical).toBe('{"a":[2,1],"z":{"a":1,"b":2}}');
  });
});
