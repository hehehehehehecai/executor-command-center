import { z } from "zod";
import { toEnvironmentValidationError } from "./environment-error";
import {
  addPublicEnvironmentGroupIssues,
  optionalEnvironmentString,
  publicEnvironmentShape,
} from "./public-environment";

export { environmentContractId } from "./environment-error";

export const approvedEnvironmentVariableNames = [
  "APP_ORIGIN",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GITHUB_APP_ID",
  "GITHUB_APP_SLUG",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_REST_API_VERSION",
  "GITHUB_WEBHOOK_SECRET",
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
  "DEEPSEEK_API_KEY",
  "STAGING_VERIFICATION_ENABLED",
  "STAGING_VERIFICATION_PROJECT_ID",
  "STAGING_VERIFICATION_INSTALLATION_ID",
  "STAGING_VERIFICATION_REPOSITORY",
] as const;

export const serverEnvironmentVariableNames = [
  "APP_ORIGIN",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GITHUB_APP_ID",
  "GITHUB_APP_SLUG",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_REST_API_VERSION",
  "GITHUB_WEBHOOK_SECRET",
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
  "DEEPSEEK_API_KEY",
  "STAGING_VERIFICATION_ENABLED",
  "STAGING_VERIFICATION_PROJECT_ID",
  "STAGING_VERIFICATION_INSTALLATION_ID",
  "STAGING_VERIFICATION_REPOSITORY",
] as const;

type ApprovedEnvironmentVariable =
  (typeof approvedEnvironmentVariableNames)[number];

const privateKey = z.string().superRefine((value, context) => {
  const begin = value.match(
    /^-----BEGIN ((?:RSA |EC |OPENSSH )?PRIVATE KEY)-----/,
  );
  const end = value.match(
    /-----END ((?:RSA |EC |OPENSSH )?PRIVATE KEY)-----\s*$/,
  );

  if (!begin || !end || begin[1] !== end[1]) {
    context.addIssue({
      code: "custom",
      message: "invalid_private_key_pem_boundary",
    });
  }
});

const appOrigin = z.string().url().superRefine((value, context) => {
  const url = new URL(value);
  const isLocalHost =
    url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const allowedProtocol =
    url.protocol === "https:" || (url.protocol === "http:" && isLocalHost);
  const originOnly =
    url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password;

  if (!allowedProtocol || !originOnly) {
    context.addIssue({ code: "custom", message: "invalid_app_origin" });
  }
});

const environmentShape = {
  APP_ORIGIN: optionalEnvironmentString(appOrigin),
  ...publicEnvironmentShape,
  SUPABASE_SERVICE_ROLE_KEY: optionalEnvironmentString(z.string()),
  GITHUB_APP_ID: optionalEnvironmentString(z.string().regex(/^\d+$/)),
  GITHUB_APP_SLUG: optionalEnvironmentString(
    z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/),
  ),
  GITHUB_APP_PRIVATE_KEY: optionalEnvironmentString(privateKey),
  GITHUB_REST_API_VERSION: optionalEnvironmentString(
    z.string().regex(/^2026-03-10$/),
  ),
  GITHUB_WEBHOOK_SECRET: optionalEnvironmentString(z.string()),
  INNGEST_EVENT_KEY: optionalEnvironmentString(z.string()),
  INNGEST_SIGNING_KEY: optionalEnvironmentString(z.string()),
  DEEPSEEK_API_KEY: optionalEnvironmentString(z.string()),
  STAGING_VERIFICATION_ENABLED: optionalEnvironmentString(z.string().regex(/^1$/)),
  STAGING_VERIFICATION_PROJECT_ID: optionalEnvironmentString(z.string().uuid()),
  STAGING_VERIFICATION_INSTALLATION_ID: optionalEnvironmentString(
    z.string().regex(/^[1-9]\d*$/),
  ),
  STAGING_VERIFICATION_REPOSITORY: optionalEnvironmentString(
    z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  ),
};

function addMissingGroupIssues(
  environment: Partial<Record<ApprovedEnvironmentVariable, string>>,
  context: z.RefinementCtx,
  variableNames: readonly ApprovedEnvironmentVariable[],
  message: string,
) {
  const presentCount = variableNames.filter(
    (variableName) => environment[variableName] !== undefined,
  ).length;

  if (presentCount === 0 || presentCount === variableNames.length) {
    return;
  }

  for (const variableName of variableNames) {
    if (environment[variableName] === undefined) {
      context.addIssue({
        code: "custom",
        path: [variableName],
        message,
      });
    }
  }
}

export const environmentSchema = z
  .object(environmentShape)
  .superRefine((environment, context) => {
    addPublicEnvironmentGroupIssues(environment, context);

    const publicSupabaseVariables = [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ] as const;

    if (environment.SUPABASE_SERVICE_ROLE_KEY !== undefined) {
      for (const variableName of publicSupabaseVariables) {
        if (environment[variableName] === undefined) {
          context.addIssue({
            code: "custom",
            path: [variableName],
            message: "service_role_requires_supabase_public_group",
          });
        }
      }
    }

    addMissingGroupIssues(
      environment,
      context,
      [
        "GITHUB_APP_ID",
        "GITHUB_APP_SLUG",
        "GITHUB_APP_PRIVATE_KEY",
        "GITHUB_REST_API_VERSION",
      ],
      "incomplete_github_app_group",
    );
    addMissingGroupIssues(
      environment,
      context,
      ["INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"],
      "incomplete_inngest_group",
    );
    addMissingGroupIssues(
      environment,
      context,
      [
        "STAGING_VERIFICATION_ENABLED",
        "STAGING_VERIFICATION_PROJECT_ID",
        "STAGING_VERIFICATION_INSTALLATION_ID",
        "STAGING_VERIFICATION_REPOSITORY",
      ],
      "incomplete_staging_verification_group",
    );
  });

export type EnvironmentConfiguration = z.infer<typeof environmentSchema>;

export function parseEnvironment(
  source: Readonly<Record<string, string | undefined>>,
): EnvironmentConfiguration {
  const result = environmentSchema.safeParse(source);

  if (!result.success) {
    throw toEnvironmentValidationError(result.error);
  }

  return result.data;
}
