import { z } from "zod";
import { toEnvironmentValidationError } from "./environment-error";

export const publicEnvironmentVariableNames = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

export const optionalEnvironmentString = (schema: z.ZodString) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    schema.trim().min(1).optional(),
  );

const supabaseUrl = z.string().url().superRefine((value, context) => {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(value);
  } catch {
    return;
  }

  const isLocalHost =
    parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1";
  const isAllowedProtocol =
    parsedUrl.protocol === "https:" ||
    (parsedUrl.protocol === "http:" && isLocalHost);

  if (!isAllowedProtocol) {
    context.addIssue({
      code: "custom",
      message: "invalid_supabase_url_protocol",
    });
  }
});

export const publicEnvironmentShape = {
  NEXT_PUBLIC_SUPABASE_URL: optionalEnvironmentString(supabaseUrl),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalEnvironmentString(z.string()),
};

type PublicEnvironmentGroup = {
  readonly NEXT_PUBLIC_SUPABASE_URL?: string;
  readonly NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
};

export function addPublicEnvironmentGroupIssues(
  environment: PublicEnvironmentGroup,
  context: z.RefinementCtx,
) {
  const hasUrl = environment.NEXT_PUBLIC_SUPABASE_URL !== undefined;
  const hasAnonKey = environment.NEXT_PUBLIC_SUPABASE_ANON_KEY !== undefined;

  if (hasUrl === hasAnonKey) {
    return;
  }

  const missingVariable = hasUrl
    ? "NEXT_PUBLIC_SUPABASE_ANON_KEY"
    : "NEXT_PUBLIC_SUPABASE_URL";

  context.addIssue({
    code: "custom",
    path: [missingVariable],
    message: "incomplete_supabase_public_group",
  });
}

export const publicEnvironmentSchema = z
  .object(publicEnvironmentShape)
  .superRefine(addPublicEnvironmentGroupIssues);

export type PublicEnvironment = z.infer<typeof publicEnvironmentSchema>;

export function parsePublicEnvironment(
  source: Readonly<Record<string, string | undefined>>,
): PublicEnvironment {
  const result = publicEnvironmentSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: source.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: source.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!result.success) {
    throw toEnvironmentValidationError(result.error);
  }

  return result.data;
}
