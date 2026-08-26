export const safeHttpErrorContract = "safe-http-error.v1" as const;

export function safeHttpErrorResponse(input: {
  readonly error: unknown;
  readonly allowedCodes: readonly string[];
  readonly fallbackCode: string;
  readonly statusByCode: Readonly<Record<string, number>>;
  readonly retryAfterSeconds?: number;
  readonly headers?: HeadersInit;
}): Response {
  const candidate = typeof input.error === "object" && input.error !== null && "code" in input.error
    && typeof input.error.code === "string"
    ? input.error.code
    : input.error instanceof Error ? input.error.message : "";
  const code = input.allowedCodes.includes(candidate) ? candidate : input.fallbackCode;
  const headers = new Headers(input.headers);
  headers.set("cache-control", "private, no-store, max-age=0");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("x-content-type-options", "nosniff");
  if (input.retryAfterSeconds !== undefined) {
    headers.set("retry-after", String(Math.max(1, Math.ceil(input.retryAfterSeconds))));
  }
  return Response.json(
    { error: { code } },
    { status: input.statusByCode[code] ?? 503, headers },
  );
}
