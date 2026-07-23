// @vitest-environment node

import {
  createPublicKey,
  generateKeyPairSync,
  verify,
} from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseEnvironment } from "@/shared/configuration/environment-contract";
import {
  GitHubAppJwtSigner,
  githubAppAuthenticationContract,
} from "./github-app-jwt";

const syntheticKeyPair = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const syntheticEcKeyPair = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const fixedNow = new Date("2026-07-23T05:00:00.000Z");

function decodePart(value: string) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("github-app-authentication.v1", () => {
  it("accepts the runtime-generated synthetic RSA key in the server configuration group", () => {
    expect(
      parseEnvironment({
        GITHUB_APP_ID: "900001",
        GITHUB_APP_SLUG: "executor-fixture-app",
        GITHUB_APP_PRIVATE_KEY: syntheticKeyPair.privateKey,
        GITHUB_REST_API_VERSION: "2026-03-10",
      }),
    ).toMatchObject({
      GITHUB_APP_ID: "900001",
      GITHUB_APP_SLUG: "executor-fixture-app",
      GITHUB_REST_API_VERSION: "2026-03-10",
    });
  });

  it("signs an RS256 JWT with the frozen claims and injected clock", () => {
    const signer = new GitHubAppJwtSigner({
      appId: "900001",
      privateKeyProvider: () => syntheticKeyPair.privateKey,
      clock: { now: () => fixedNow },
    });

    const token = signer.sign();
    const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");

    expect(githubAppAuthenticationContract).toEqual({
      contractVersion: "github-app-authentication.v1",
      algorithm: "RS256",
      issuer: "configured GitHub App ID",
      issuedAtOffsetSeconds: -60,
      maximumExpirationSeconds: 600,
      authorizationScheme: "Bearer",
      accept: "application/vnd.github+json",
    });
    expect(decodePart(encodedHeader!)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decodePart(encodedPayload!)).toEqual({
      iat: Math.floor(fixedNow.getTime() / 1_000) - 60,
      exp: Math.floor(fixedNow.getTime() / 1_000) + 600,
      iss: "900001",
    });
    expect(
      verify(
        "RSA-SHA256",
        Buffer.from(`${encodedHeader}.${encodedPayload}`),
        createPublicKey(syntheticKeyPair.publicKey),
        Buffer.from(encodedSignature!, "base64url"),
      ),
    ).toBe(true);
  });

  it.each([
    { appId: "", privateKeyProvider: () => syntheticKeyPair.privateKey },
    { appId: "not-numeric", privateKeyProvider: () => syntheticKeyPair.privateKey },
    { appId: "900001", privateKeyProvider: () => "" },
  ])("fails safely when GitHub App signing configuration is missing", (input) => {
    const signer = new GitHubAppJwtSigner({
      ...input,
      clock: { now: () => fixedNow },
    });

    expect(() => signer.sign()).toThrow("github_app_configuration_missing");
  });

  it("does not emit the private key or generated App JWT to logs", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const signer = new GitHubAppJwtSigner({
      appId: "900001",
      privateKeyProvider: () => syntheticKeyPair.privateKey,
      clock: { now: () => fixedNow },
    });

    const token = signer.sign();

    expect(token.length).toBeGreaterThan(0);
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("rejects a non-RSA private key instead of emitting a JWT with a false RS256 header", () => {
    const signer = new GitHubAppJwtSigner({
      appId: "900001",
      privateKeyProvider: () => syntheticEcKeyPair.privateKey,
      clock: { now: () => fixedNow },
    });

    expect(() => signer.sign()).toThrow("github_app_authentication_failed");
  });
});
