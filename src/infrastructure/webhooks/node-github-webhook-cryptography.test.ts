import { describe, expect, it } from "vitest";
import { NodeGitHubWebhookCryptography } from "./node-github-webhook-cryptography";

const encoder = new TextEncoder();
describe("github-webhook-signature.v1", () => {
  const cryptography = new NodeGitHubWebhookCryptography("key");
  const canonical = "sha256=f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8";
  const body = encoder.encode("The quick brown fox jumps over the lazy dog");
  it("verifies HMAC-SHA256 over exact raw bytes and returns only a digest", () => expect(cryptography.verify({ body, signature: canonical })).toEqual({ valid: true, bodySha256: "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592" }));
  it.each([
    ["missing", ""], ["wrong algorithm", `sha1=${"a".repeat(40)}`], ["bare hex", "a".repeat(64)], ["non hex", `sha256=${"g".repeat(64)}`], ["wrong length", `sha256=${"a".repeat(63)}`], ["uppercase", `sha256=${"A".repeat(64)}`], ["multiple", `${canonical},${canonical}`], ["wrong secret/body", `sha256=${"0".repeat(64)}`],
  ])("rejects %s signature safely", (_caseName, signature) => expect(cryptography.verify({ body, signature }).valid).toBe(false));
  it("detects whitespace, field-order and Unicode byte changes", () => {
    for (const changed of [encoder.encode("The quick brown fox jumps over the lazy dog "), encoder.encode('{"b":2,"a":1}'), encoder.encode("你好")]) expect(cryptography.verify({ body: changed, signature: canonical }).valid).toBe(false);
  });
});
