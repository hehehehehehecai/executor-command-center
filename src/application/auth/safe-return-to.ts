export const defaultAuthSuccessRedirect = "/onboarding";
export const defaultAuthErrorRedirect = "/auth/error";

function isUnsafePath(value: string) {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) return true;
  const normalized = new URL(value, "https://return-to.invalid");
  return normalized.origin !== "https://return-to.invalid" || normalized.pathname.startsWith("//");
}

export function safeReturnTo(value: string | null | undefined) {
  if (!value || isUnsafePath(value)) {
    return defaultAuthSuccessRedirect;
  }

  let decoded = value;

  try {
    for (let depth = 0; depth < 16; depth += 1) {
      const next = decodeURIComponent(decoded);

      if (isUnsafePath(next)) return defaultAuthSuccessRedirect;
      if (next === decoded) return value;
      decoded = next;
    }
  } catch {
    return defaultAuthSuccessRedirect;
  }

  // An input still changing after this bound has not been fully validated.
  return defaultAuthSuccessRedirect;
}
