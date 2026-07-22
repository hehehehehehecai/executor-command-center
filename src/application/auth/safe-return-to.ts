export const defaultAuthSuccessRedirect = "/onboarding";
export const defaultAuthErrorRedirect = "/auth/error";

function isUnsafePath(value: string) {
  return (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  );
}

export function safeReturnTo(value: string | null | undefined) {
  if (!value || isUnsafePath(value)) {
    return defaultAuthSuccessRedirect;
  }

  let decoded = value;

  try {
    for (let depth = 0; depth < 2; depth += 1) {
      const next = decodeURIComponent(decoded);

      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    return defaultAuthSuccessRedirect;
  }

  return isUnsafePath(decoded) ? defaultAuthSuccessRedirect : value;
}
