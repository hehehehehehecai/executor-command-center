export type ExecutorTheme = "deep-space" | "legacy";

export function parseExecutorTheme(value: string | undefined): ExecutorTheme {
  if (value === undefined || value === "deep-space") {
    return "deep-space";
  }

  return "legacy";
}
