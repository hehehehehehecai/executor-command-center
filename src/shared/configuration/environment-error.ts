import type { ZodError } from "zod";

export const environmentContractId = "environment-validation.v1" as const;

export class EnvironmentValidationError extends Error {
  readonly contractId = environmentContractId;

  constructor(details: readonly string[]) {
    super(`Environment validation failed: ${details.join("; ")}`);
    this.name = "EnvironmentValidationError";
  }
}

export function toEnvironmentValidationError(error: ZodError) {
  const details = [
    ...new Set(
      error.issues.map((issue) => {
        const variableName =
          typeof issue.path[0] === "string" ? issue.path[0] : "environment";

        return `${variableName}: ${issue.code}`;
      }),
    ),
  ];

  return new EnvironmentValidationError(details);
}
