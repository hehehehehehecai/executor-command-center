import "server-only";

import {
  createPrivateKey,
  sign as signBytes,
} from "node:crypto";

export const githubAppAuthenticationContract = {
  contractVersion: "github-app-authentication.v1",
  algorithm: "RS256",
  issuer: "configured GitHub App ID",
  issuedAtOffsetSeconds: -60,
  maximumExpirationSeconds: 600,
  authorizationScheme: "Bearer",
  accept: "application/vnd.github+json",
} as const;

type GitHubAppJwtSignerOptions = {
  readonly appId: string;
  readonly privateKeyProvider: () => string;
  readonly clock: { now(): Date };
};

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export class GitHubAppJwtSigner {
  constructor(private readonly options: GitHubAppJwtSignerOptions) {}

  sign() {
    const privateKey = this.options.privateKeyProvider();

    if (!/^[1-9]\d*$/.test(this.options.appId) || !privateKey.trim()) {
      throw new Error("github_app_configuration_missing");
    }

    const nowSeconds = Math.floor(this.options.clock.now().getTime() / 1_000);
    const header = encodeJson({
      alg: githubAppAuthenticationContract.algorithm,
      typ: "JWT",
    });
    const payload = encodeJson({
      iat:
        nowSeconds +
        githubAppAuthenticationContract.issuedAtOffsetSeconds,
      exp:
        nowSeconds +
        githubAppAuthenticationContract.maximumExpirationSeconds,
      iss: this.options.appId,
    });
    const signingInput = `${header}.${payload}`;

    try {
      const normalizedPrivateKey = privateKey.replace(/\\n/g, "\n");
      const keyObject = createPrivateKey(normalizedPrivateKey);

      if (keyObject.asymmetricKeyType !== "rsa") {
        throw new Error("invalid_key_type");
      }

      const signature = signBytes(
        "RSA-SHA256",
        Buffer.from(signingInput, "utf8"),
        keyObject,
      ).toString("base64url");

      return `${signingInput}.${signature}`;
    } catch {
      throw new Error("github_app_authentication_failed");
    }
  }
}
