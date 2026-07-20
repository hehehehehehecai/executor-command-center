import { describe, expect, test } from "vitest";
import { approvedEnvironmentVariableNames } from "./environment-contract";
import { parseServerEnvironment } from "./server-environment";

describe("environment-validation.v1 CI entry", () => {
  test("validates only the approved integration environment", () => {
    const source = Object.fromEntries(
      approvedEnvironmentVariableNames.map((variableName) => [
        variableName,
        process.env[variableName],
      ]),
    );

    expect(() => parseServerEnvironment(source)).not.toThrow();
  });
});
