import { describe, expect, it } from "vitest";

import { redactSecurityLog } from "./safe-log-redaction";

describe("safe-log-redaction.v1", () => {
  it("redacts nested credentials, headers, provider payloads, SQL and stacks", () => {
    const syntheticSecret = ["fixture", "only", "secret"].join("-");
    const input: Record<string, unknown> = {
      contract_version: "beta-security-boundary.v1",
      request_id: "request-security-001",
      failure_code: "provider_unavailable",
      authorization: `Bearer ${syntheticSecret}`,
      nested: {
        cookie: `session=${syntheticSecret}`,
        provider_body: { prompt: syntheticSecret },
        sql: `select '${syntheticSecret}'`,
        stack: `Error: ${syntheticSecret}`,
      },
      headers: new Headers({ authorization: `Bearer ${syntheticSecret}` }),
      error: new Error(syntheticSecret),
    };
    input.circular = input;

    const output = redactSecurityLog(input);
    const serialized = JSON.stringify(output);

    expect(output).toMatchObject({
      contract_version: "beta-security-boundary.v1",
      request_id: "request-security-001",
      failure_code: "provider_unavailable",
      authorization: "[REDACTED]",
    });
    expect(serialized).not.toContain(syntheticSecret);
    expect(serialized).not.toMatch(/select\s|Bearer\s|Error:/i);
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).toContain("[CIRCULAR]");
  });
});
