import { describe, expect, it } from "vitest";

import { safeHttpErrorResponse } from "./safe-http-error";

describe("safe-http-error.v1", () => {
  it("returns only an allow-listed reason code and never serializes the cause", async () => {
    const syntheticSecret = ["fixture", "provider", "payload"].join("-");
    const response = safeHttpErrorResponse({
      error: Object.assign(new Error(syntheticSecret), {
        code: "rate_limited",
        stack: `stack:${syntheticSecret}`,
      }),
      allowedCodes: ["rate_limited"],
      fallbackCode: "internal_error",
      statusByCode: { rate_limited: 429, internal_error: 503 },
      retryAfterSeconds: 17,
    });

    const serialized = await response.clone().text();
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("17");
    expect(await response.json()).toEqual({ error: { code: "rate_limited" } });
    expect(serialized).not.toContain(syntheticSecret);
  });
});
