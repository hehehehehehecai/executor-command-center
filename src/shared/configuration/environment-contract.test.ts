import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

const approvedNames = [
  "APP_ORIGIN",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_WEBHOOK_SECRET",
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
  "DEEPSEEK_API_KEY",
] as const;

const serverOnlyNames = approvedNames.filter(
  (name) => !name.startsWith("NEXT_PUBLIC_"),
);

const validPublicSupabase = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "fictional-anon-key",
};

const validAppOrigin = { APP_ORIGIN: "https://executor.example.test" };

const validGitHub = {
  GITHUB_APP_ID: "123456",
  GITHUB_APP_PRIVATE_KEY:
    "-----BEGIN PRIVATE KEY-----\nfictional-phase-6-key\n-----END PRIVATE KEY-----",
  GITHUB_WEBHOOK_SECRET: "fictional-webhook-secret",
};

const contractModulePath = "./environment-contract";
const publicParserModulePath = "./public-environment";
const serverParserModulePath = "./server-environment";

const loadContract = () => import(/* @vite-ignore */ contractModulePath);
const loadPublicParser = () =>
  import(/* @vite-ignore */ publicParserModulePath);
const loadServerParser = () =>
  import(/* @vite-ignore */ serverParserModulePath);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("environment-validation.v1", () => {
  test("accepts Preview Mode when every integration variable is missing", async () => {
    const { environmentContractId, parseEnvironment } = await loadContract();

    expect(environmentContractId).toBe("environment-validation.v1");
    expect(parseEnvironment({})).toEqual({});
  });

  test("normalizes empty and whitespace-only values to undefined", async () => {
    const { parseEnvironment } = await loadContract();
    const result = parseEnvironment(
      Object.fromEntries(
        approvedNames.map((name, index) => [name, index % 2 ? "   " : ""]),
      ),
    );

    for (const name of approvedNames) {
      expect(result[name]).toBeUndefined();
    }
  });

  test("accepts a complete public Supabase pair", async () => {
    const { parseEnvironment } = await loadContract();

    expect(parseEnvironment(validPublicSupabase)).toMatchObject(
      validPublicSupabase,
    );
  });

  test("accepts a trusted HTTPS application origin and local HTTP origin", async () => {
    const { parseEnvironment } = await loadContract();

    expect(parseEnvironment(validAppOrigin)).toMatchObject(validAppOrigin);
    expect(parseEnvironment({ APP_ORIGIN: "http://127.0.0.1:3000" }))
      .toMatchObject({ APP_ORIGIN: "http://127.0.0.1:3000" });
  });

  test("rejects an untrusted application origin shape", async () => {
    const { parseEnvironment } = await loadContract();

    expect(() => parseEnvironment({ APP_ORIGIN: "http://evil.example" }))
      .toThrow(/APP_ORIGIN/);
    expect(() => parseEnvironment({ APP_ORIGIN: "https://example.test/path" }))
      .toThrow(/APP_ORIGIN/);
  });

  test("rejects an incomplete public Supabase pair", async () => {
    const { parseEnvironment } = await loadContract();

    expect(() =>
      parseEnvironment({ NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321" }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });

  test("rejects a service role without the public Supabase pair", async () => {
    const { parseEnvironment } = await loadContract();

    expect(() =>
      parseEnvironment({ SUPABASE_SERVICE_ROLE_KEY: "fictional-service-role" }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  test("accepts an HTTP localhost Supabase URL", async () => {
    const { parseEnvironment } = await loadContract();

    expect(
      parseEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "fictional-anon-key",
      }).NEXT_PUBLIC_SUPABASE_URL,
    ).toBe("http://localhost:54321");
  });

  test("accepts an HTTP 127.0.0.1 Supabase URL", async () => {
    const { parseEnvironment } = await loadContract();

    expect(
      parseEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "fictional-anon-key",
      }).NEXT_PUBLIC_SUPABASE_URL,
    ).toBe("http://127.0.0.1:54321");
  });

  test("rejects an HTTP non-local Supabase URL", async () => {
    const { parseEnvironment } = await loadContract();

    expect(() =>
      parseEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: "http://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "fictional-anon-key",
      }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  test("rejects an invalid Supabase URL", async () => {
    const { parseEnvironment } = await loadContract();

    expect(() =>
      parseEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "fictional-anon-key",
      }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  test("accepts a complete GitHub App group", async () => {
    const { parseEnvironment } = await loadContract();

    expect(parseEnvironment(validGitHub)).toMatchObject(validGitHub);
  });

  test("rejects a partial GitHub App group", async () => {
    const { parseEnvironment } = await loadContract();

    expect(() => parseEnvironment({ GITHUB_APP_ID: "123456" })).toThrow(
      /GITHUB_APP_PRIVATE_KEY/,
    );
  });

  test("rejects a non-decimal GitHub App ID", async () => {
    const { parseEnvironment } = await loadContract();

    expect(() =>
      parseEnvironment({ ...validGitHub, GITHUB_APP_ID: "app-123" }),
    ).toThrow(/GITHUB_APP_ID/);
  });

  test("rejects a GitHub private key without PEM boundaries", async () => {
    const { parseEnvironment } = await loadContract();

    expect(() =>
      parseEnvironment({
        ...validGitHub,
        GITHUB_APP_PRIVATE_KEY: "fictional-key-without-pem-boundaries",
      }),
    ).toThrow(/GITHUB_APP_PRIVATE_KEY/);
  });

  test("accepts a complete Inngest pair", async () => {
    const { parseEnvironment } = await loadContract();
    const pair = {
      INNGEST_EVENT_KEY: "fictional-event-key",
      INNGEST_SIGNING_KEY: "fictional-signing-key",
    };

    expect(parseEnvironment(pair)).toMatchObject(pair);
  });

  test("rejects a partial Inngest pair", async () => {
    const { parseEnvironment } = await loadContract();

    expect(() =>
      parseEnvironment({ INNGEST_EVENT_KEY: "fictional-event-key" }),
    ).toThrow(/INNGEST_SIGNING_KEY/);
  });

  test("allows DeepSeek to be absent", async () => {
    const { parseEnvironment } = await loadContract();

    expect(parseEnvironment({}).DEEPSEEK_API_KEY).toBeUndefined();
  });

  test("allows DeepSeek to be present independently", async () => {
    const { parseEnvironment } = await loadContract();

    expect(
      parseEnvironment({ DEEPSEEK_API_KEY: "fictional-deepseek-key" })
        .DEEPSEEK_API_KEY,
    ).toBe("fictional-deepseek-key");
  });

  test("returns only public fields from the public parser", async () => {
    const { parsePublicEnvironment } = await loadPublicParser();
    const result = parsePublicEnvironment({
      ...validPublicSupabase,
      ...validGitHub,
      DEEPSEEK_API_KEY: "fictional-deepseek-key",
    });

    expect(result).toEqual(validPublicSupabase);
    for (const name of serverOnlyNames) {
      expect(result).not.toHaveProperty(name);
    }
  });

  test("returns approved fields from the server parser without unknown keys", async () => {
    const { parseServerEnvironment } = await loadServerParser();
    const result = parseServerEnvironment({
      ...validPublicSupabase,
      ...validGitHub,
      UNAPPROVED_VARIABLE: "ignored",
    });

    expect(result).toMatchObject({ ...validPublicSupabase, ...validGitHub });
    expect(result).not.toHaveProperty("UNAPPROVED_VARIABLE");
  });

  test("includes the invalid variable name in validation errors", async () => {
    const { parseEnvironment } = await loadContract();

    expect(() =>
      parseEnvironment({ GITHUB_APP_ID: "not-decimal" }),
    ).toThrow(/GITHUB_APP_ID/);
  });

  test("does not include raw Secret values in validation errors", async () => {
    const { parseEnvironment } = await loadContract();
    const rawSecret = "fictional-raw-secret-must-not-appear";

    expect(() =>
      parseEnvironment({
        ...validGitHub,
        GITHUB_APP_ID: rawSecret,
        GITHUB_WEBHOOK_SECRET: rawSecret,
      }),
    ).not.toThrow(rawSecret);
  });

  test("keeps the .env.example key set exact", async () => {
    const contents = readFileSync(
      path.resolve(process.cwd(), ".env.example"),
      "utf8",
    );
    const names = contents
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1])
      .filter((name): name is string => Boolean(name));

    expect(names).toEqual(approvedNames);
  });

  test("keeps every .env.example assignment empty", async () => {
    const contents = readFileSync(
      path.resolve(process.cwd(), ".env.example"),
      "utf8",
    );
    const assignments = contents
      .split(/\r?\n/)
      .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line));

    expect(assignments).toHaveLength(approvedNames.length);
    for (const assignment of assignments) {
      expect(assignment).toMatch(/^[A-Z][A-Z0-9_]*=$/);
    }
  });

  test("strips unapproved variables from the typed result", async () => {
    const { parseEnvironment } = await loadContract();
    const result = parseEnvironment({
      UNAPPROVED_VARIABLE: "ignored",
      ANOTHER_UNKNOWN_KEY: "ignored",
    });

    expect(result).toEqual({});
  });

  test("validates Preview Mode without credentials", async () => {
    const { parseServerEnvironment } = await loadServerParser();

    expect(parseServerEnvironment({})).toEqual({});
  });

  test("does not make network requests during validation", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { parseEnvironment } = await loadContract();

    parseEnvironment({ ...validPublicSupabase, ...validGitHub });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("keeps the pure Contract free from process.env access", async () => {
    const source = readFileSync(
      path.resolve(
        process.cwd(),
        "src/shared/configuration/environment-contract.ts",
      ),
      "utf8",
    );

    expect(source).not.toContain("process.env");
  });

  test("keeps server-only variable names out of the public parser module", async () => {
    const source = readFileSync(
      path.resolve(
        process.cwd(),
        "src/shared/configuration/public-environment.ts",
      ),
      "utf8",
    );

    for (const name of serverOnlyNames) {
      expect(source).not.toContain(name);
    }
  });
});
