import "server-only";

import { z } from "zod";

import {
  githubActivityReaderContract,
  type GitHubActivityReader,
  type GitHubActivityReadRequest,
  type GitHubCheckReadRequest,
} from "@/application/github-activity/github-activity-reader";
import {
  githubActivityReadModelContracts,
  type GitHubActivityConclusion,
  type GitHubCheckReadModel,
  type GitHubCheckStatus,
  type GitHubCommitReadModel,
  type GitHubIssueReadModel,
  type GitHubPullRequestReadModel,
  type GitHubReleaseReadModel,
  type GitHubWorkflowRunReadModel,
  type GitHubWorkflowStatus,
} from "@/domain/github-activity/github-activity-read-models";

export { githubActivityReaderContract, githubActivityReadModelContracts };

export const githubActivityReaderErrorsContract =
  "github-activity-reader-errors.v1" as const;

const pageSize = 100;
const maximumPages = 100;
const maximumObjects = 10_000;

const safeErrors = new Set([
  "github_activity_authorization_revoked",
  "github_activity_rate_limited",
  "github_activity_not_found",
  "github_activity_timeout",
  "github_activity_aborted",
  "github_activity_invalid_response",
  "github_activity_pagination_invalid",
  "github_activity_unavailable",
]);

const positiveSafeInteger = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);
const nonnegativeSafeInteger = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
const cleanString = (maximum: number) =>
  z.string().trim().min(1).max(maximum);
const nullableCleanString = (maximum: number) => cleanString(maximum).nullable();
const shaSchema = z
  .string()
  .regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i)
  .transform((value) => value.toLowerCase());
const timestampSchema = z.iso.datetime({ offset: true }).transform(
  (value) => new Date(value).toISOString(),
);
const nullableTimestampSchema = timestampSchema.nullable();

const commitSchema = z.object({
  sha: shaSchema,
  commit: z.object({
    message: cleanString(100_000),
    author: z.object({ date: timestampSchema }).nullable(),
    committer: z.object({ date: timestampSchema }),
  }),
  author: z.object({ login: cleanString(255) }).nullable(),
});

const issueSchema = z.object({
  id: positiveSafeInteger,
  number: positiveSafeInteger,
  title: cleanString(10_000),
  state: cleanString(100),
  user: z.object({ login: cleanString(255) }).nullable(),
  updated_at: timestampSchema,
  closed_at: nullableTimestampSchema,
  pull_request: z.object({ url: cleanString(2_048) }).optional(),
});

const pullRequestSchema = z.object({
  id: positiveSafeInteger,
  number: positiveSafeInteger,
  title: cleanString(10_000),
  state: cleanString(100),
  draft: z.boolean(),
  updated_at: timestampSchema,
  head: z.object({ sha: shaSchema }),
  base: z.object({ ref: cleanString(255) }),
  merged_at: nullableTimestampSchema,
});

const releaseSchema = z.object({
  id: positiveSafeInteger,
  tag_name: cleanString(255),
  name: nullableCleanString(10_000),
  draft: z.boolean(),
  prerelease: z.boolean(),
  created_at: timestampSchema,
  published_at: nullableTimestampSchema,
});

const workflowRunSchema = z.object({
  id: positiveSafeInteger,
  workflow_id: positiveSafeInteger,
  run_number: positiveSafeInteger,
  status: cleanString(100),
  conclusion: nullableCleanString(100),
  event: cleanString(255),
  head_sha: shaSchema,
  run_attempt: positiveSafeInteger,
  updated_at: timestampSchema,
});

const checkRunSchema = z.object({
  id: positiveSafeInteger,
  name: cleanString(255),
  status: cleanString(100),
  conclusion: nullableCleanString(100),
  head_sha: shaSchema,
  started_at: timestampSchema,
  completed_at: nullableTimestampSchema,
});

const workflowPageSchema = z.object({
  total_count: nonnegativeSafeInteger,
  workflow_runs: z.array(workflowRunSchema),
});

const checkPageSchema = z.object({
  total_count: nonnegativeSafeInteger,
  check_runs: z.array(checkRunSchema),
});

const knownIssueStates = new Set(["open", "closed"]);
const knownWorkflowStatuses = new Set([
  "queued",
  "in_progress",
  "completed",
  "waiting",
  "requested",
  "pending",
]);
const knownCheckStatuses = new Set(["queued", "in_progress", "completed"]);
const knownConclusions = new Set([
  "success",
  "failure",
  "neutral",
  "cancelled",
  "skipped",
  "timed_out",
  "action_required",
  "stale",
  "startup_failure",
]);

type ReaderOptions = {
  readonly restApiVersion: string;
  readonly fetcher?: typeof fetch;
  readonly timeoutMilliseconds?: number;
};

type ValidatedRequest = GitHubActivityReadRequest & {
  readonly repositoryFullName: string;
};

type PageResource<Provider, Output> = {
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly parsePage: (payload: unknown) => Provider[] | null;
  readonly map: (item: Provider, repositoryFullName: string) => Output | null;
};

function stableError(code: string): Error {
  return new Error(code);
}

function canonicalTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function isAbortSignal(value: unknown): value is AbortSignal {
  return typeof value === "object"
    && value !== null
    && "aborted" in value
    && typeof (value as AbortSignal).addEventListener === "function"
    && typeof (value as AbortSignal).removeEventListener === "function";
}

function validateRequest(input: GitHubActivityReadRequest): ValidatedRequest {
  const owner = input?.repository?.owner;
  const name = input?.repository?.name;
  const token = input?.installationToken;
  const pagination = input?.pagination;

  if (
    typeof owner !== "string"
    || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner)
    || typeof name !== "string"
    || !/^[A-Za-z0-9._-]{1,100}$/.test(name)
    || typeof token !== "string"
    || token.length === 0
    || token.length > 4_096
    || token !== token.trim()
    || typeof input.since !== "string"
    || !canonicalTimestamp(input.since)
    || !pagination
    || !Number.isSafeInteger(pagination.maxPages)
    || pagination.maxPages < 1
    || pagination.maxPages > maximumPages
    || !Number.isSafeInteger(pagination.maxObjects)
    || pagination.maxObjects < 1
    || pagination.maxObjects > maximumObjects
    || (input.signal !== undefined && !isAbortSignal(input.signal))
  ) {
    throw stableError("github_activity_invalid_response");
  }

  return {
    ...input,
    repository: { owner, name },
    installationToken: token,
    repositoryFullName: `${owner}/${name}`,
  };
}

function validateCheckRequest(input: GitHubCheckReadRequest): ValidatedRequest & {
  readonly ref: string;
} {
  const request = validateRequest(input);
  if (
    typeof input.ref !== "string"
    || input.ref.length === 0
    || input.ref.length > 255
    || input.ref !== input.ref.trim()
    || !/^[A-Za-z0-9._/-]+$/.test(input.ref)
  ) {
    throw stableError("github_activity_invalid_response");
  }
  return { ...request, ref: input.ref };
}

function enumValue<T extends string>(value: string, known: Set<string>): T | "unknown" {
  return known.has(value) ? value as T : "unknown";
}

function conclusion(value: string | null): GitHubActivityConclusion {
  if (value === null) return null;
  return enumValue<Exclude<GitHubActivityConclusion, "unknown" | null>>(
    value,
    knownConclusions,
  );
}

function parseLinkHeader(value: string): Array<{ url: string; relations: string[] }> {
  if (value.trim().length === 0) {
    throw stableError("github_activity_pagination_invalid");
  }

  return value.split(",").map((segment) => {
    const match = segment.trim().match(/^<([^<>]+)>(.*)$/);
    if (!match) throw stableError("github_activity_pagination_invalid");
    const parameterText = match[2] ?? "";
    const relationMatch = parameterText.match(/(?:^|;)\s*rel\s*=\s*"([^"]+)"(?:\s*;|\s*$)/i);
    if (!relationMatch) throw stableError("github_activity_pagination_invalid");
    return {
      url: match[1]!,
      relations: relationMatch[1]!.split(/\s+/).filter(Boolean),
    };
  });
}

function validateNextUrl(input: {
  readonly linkHeader: string;
  readonly currentPage: number;
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly visited: ReadonlySet<string>;
}): URL | null {
  const nextLinks = parseLinkHeader(input.linkHeader).filter((link) =>
    link.relations.includes("next")
  );
  if (nextLinks.length === 0) return null;
  if (nextLinks.length > 1) {
    throw stableError("github_activity_pagination_invalid");
  }

  let next: URL;
  try {
    next = new URL(nextLinks[0]!.url);
  } catch {
    throw stableError("github_activity_pagination_invalid");
  }

  const keys = [...next.searchParams.keys()];
  const uniqueKeys = new Set(keys);
  const expectedKeys = new Set([...Object.keys(input.query), "page"]);
  const nextPage = Number(next.searchParams.get("page"));

  if (
    next.protocol !== "https:"
    || next.hostname !== "api.github.com"
    || next.port !== ""
    || next.username !== ""
    || next.password !== ""
    || next.hash !== ""
    || next.pathname !== input.path
    || keys.length !== uniqueKeys.size
    || uniqueKeys.size !== expectedKeys.size
    || [...expectedKeys].some((key) => !uniqueKeys.has(key))
    || !Number.isSafeInteger(nextPage)
    || nextPage !== input.currentPage + 1
    || input.visited.has(next.toString())
    || Object.entries(input.query).some(
      ([key, value]) => next.searchParams.get(key) !== value,
    )
  ) {
    throw stableError("github_activity_pagination_invalid");
  }

  return next;
}

function initialUrl(path: string, query: Readonly<Record<string, string>>): URL {
  const url = new URL(`https://api.github.com${path}`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("page", "1");
  return url;
}

export class GitHubRestActivityReader implements GitHubActivityReader {
  private readonly fetcher: typeof fetch;
  private readonly timeoutMilliseconds: number;

  constructor(private readonly options: ReaderOptions) {
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMilliseconds = options.timeoutMilliseconds ?? 5_000;
  }

  private async readResponse(
    url: URL,
    request: ValidatedRequest,
  ): Promise<{ payload: unknown; linkHeader: string | null }> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.options.restApiVersion)) {
      throw stableError("github_activity_invalid_response");
    }

    const controller = new AbortController();
    let callerAborted = request.signal?.aborted === true;
    let timedOut = false;
    const abortFromCaller = () => {
      callerAborted = true;
      controller.abort();
    };
    request.signal?.addEventListener("abort", abortFromCaller, { once: true });
    if (callerAborted) controller.abort();
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMilliseconds);

    try {
      const response = await this.fetcher(url.toString(), {
        method: "GET",
        redirect: "error",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${request.installationToken}`,
          "x-github-api-version": this.options.restApiVersion,
        },
        signal: controller.signal,
      });

      if (response.status !== 200) {
        if (response.status >= 200 && response.status < 300) {
          throw stableError("github_activity_invalid_response");
        }
        if (response.status === 401) {
          throw stableError("github_activity_authorization_revoked");
        }
        if (
          response.status === 429
          || (response.status === 403 && (
            response.headers.get("x-ratelimit-remaining") === "0"
            || response.headers.has("retry-after")
          ))
        ) {
          throw stableError("github_activity_rate_limited");
        }
        if (response.status === 403) {
          throw stableError("github_activity_authorization_revoked");
        }
        if (response.status === 404) {
          throw stableError("github_activity_not_found");
        }
        throw stableError("github_activity_unavailable");
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch (error) {
        if (
          controller.signal.aborted
          || (error instanceof DOMException && error.name === "AbortError")
        ) {
          throw error;
        }
        throw stableError("github_activity_invalid_response");
      }

      return { payload, linkHeader: response.headers.get("link") };
    } catch (error) {
      if (callerAborted || request.signal?.aborted) {
        throw stableError("github_activity_aborted");
      }
      if (timedOut || (
        controller.signal.aborted
        && error instanceof DOMException
        && error.name === "AbortError"
      )) {
        throw stableError("github_activity_timeout");
      }
      if (error instanceof Error && safeErrors.has(error.message)) {
        throw error;
      }
      throw stableError("github_activity_unavailable");
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  private async readAll<Provider, Output extends {
    readonly githubObjectId: string;
    readonly sourceUpdatedAt: string;
  }>(
    request: ValidatedRequest,
    resource: PageResource<Provider, Output>,
  ): Promise<Output[]> {
    let page = 1;
    let url = initialUrl(resource.path, resource.query);
    const visited = new Set<string>();
    const objectIds = new Set<string>();
    const output: Output[] = [];

    while (true) {
      if (page > request.pagination.maxPages || visited.has(url.toString())) {
        throw stableError("github_activity_pagination_invalid");
      }
      visited.add(url.toString());

      const response = await this.readResponse(url, request);
      const providerItems = resource.parsePage(response.payload);
      if (!providerItems || providerItems.length > pageSize) {
        throw stableError("github_activity_invalid_response");
      }

      const mappedItems = providerItems
        .map((item) => resource.map(item, request.repositoryFullName))
        .filter((item): item is Output => item !== null)
        .filter((item) => item.sourceUpdatedAt >= request.since);

      if (output.length + mappedItems.length > request.pagination.maxObjects) {
        throw stableError("github_activity_pagination_invalid");
      }

      for (const item of mappedItems) {
        if (objectIds.has(item.githubObjectId)) {
          throw stableError("github_activity_pagination_invalid");
        }
        objectIds.add(item.githubObjectId);
        output.push(item);
      }

      if (response.linkHeader === null) break;
      const nextUrl = validateNextUrl({
        linkHeader: response.linkHeader,
        currentPage: page,
        path: resource.path,
        query: resource.query,
        visited,
      });
      if (nextUrl === null) break;
      if (page >= request.pagination.maxPages) {
        throw stableError("github_activity_pagination_invalid");
      }
      url = nextUrl;
      page += 1;
    }

    return output;
  }

  async listCommits(
    input: GitHubActivityReadRequest,
  ): Promise<GitHubCommitReadModel[]> {
    const request = validateRequest(input);
    return this.readAll(request, {
      path: `/repos/${encodeURIComponent(request.repository.owner)}/${encodeURIComponent(request.repository.name)}/commits`,
      query: { per_page: String(pageSize), since: request.since },
      parsePage: (payload) => {
        const parsed = z.array(commitSchema).safeParse(payload);
        return parsed.success ? parsed.data : null;
      },
      map: (item, repositoryFullName) => ({
        repositoryFullName,
        githubObjectId: item.sha,
        objectType: "commit",
        sourceUpdatedAt: item.commit.committer.date,
        sourceVersion: item.sha,
        message: item.commit.message,
        authoredAt: item.commit.author?.date ?? null,
        committedAt: item.commit.committer.date,
        authorLogin: item.author?.login ?? null,
      }),
    });
  }

  async listIssues(
    input: GitHubActivityReadRequest,
  ): Promise<GitHubIssueReadModel[]> {
    const request = validateRequest(input);
    return this.readAll(request, {
      path: `/repos/${encodeURIComponent(request.repository.owner)}/${encodeURIComponent(request.repository.name)}/issues`,
      query: {
        state: "all",
        sort: "updated",
        direction: "asc",
        per_page: String(pageSize),
        since: request.since,
      },
      parsePage: (payload) => {
        const parsed = z.array(issueSchema).safeParse(payload);
        return parsed.success ? parsed.data : null;
      },
      map: (item, repositoryFullName) => item.pull_request ? null : ({
        repositoryFullName,
        githubObjectId: String(item.id),
        objectType: "issue",
        sourceUpdatedAt: item.updated_at,
        sourceVersion: item.updated_at,
        number: item.number,
        title: item.title,
        state: enumValue<"open" | "closed">(item.state, knownIssueStates),
        authorLogin: item.user?.login ?? null,
        closedAt: item.closed_at,
      }),
    });
  }

  async listPullRequests(
    input: GitHubActivityReadRequest,
  ): Promise<GitHubPullRequestReadModel[]> {
    const request = validateRequest(input);
    return this.readAll(request, {
      path: `/repos/${encodeURIComponent(request.repository.owner)}/${encodeURIComponent(request.repository.name)}/pulls`,
      query: {
        state: "all",
        sort: "updated",
        direction: "asc",
        per_page: String(pageSize),
      },
      parsePage: (payload) => {
        const parsed = z.array(pullRequestSchema).safeParse(payload);
        return parsed.success ? parsed.data : null;
      },
      map: (item, repositoryFullName) => ({
        repositoryFullName,
        githubObjectId: String(item.id),
        objectType: "pull_request",
        sourceUpdatedAt: item.updated_at,
        sourceVersion: item.head.sha,
        number: item.number,
        title: item.title,
        state: enumValue<"open" | "closed">(item.state, knownIssueStates),
        isDraft: item.draft,
        headSha: item.head.sha,
        baseRef: item.base.ref,
        mergedAt: item.merged_at,
      }),
    });
  }

  async listReleases(
    input: GitHubActivityReadRequest,
  ): Promise<GitHubReleaseReadModel[]> {
    const request = validateRequest(input);
    return this.readAll(request, {
      path: `/repos/${encodeURIComponent(request.repository.owner)}/${encodeURIComponent(request.repository.name)}/releases`,
      query: { per_page: String(pageSize) },
      parsePage: (payload) => {
        const parsed = z.array(releaseSchema).safeParse(payload);
        return parsed.success ? parsed.data : null;
      },
      map: (item, repositoryFullName) => {
        const sourceUpdatedAt = item.published_at ?? item.created_at;
        return {
          repositoryFullName,
          githubObjectId: String(item.id),
          objectType: "release",
          sourceUpdatedAt,
          sourceVersion: sourceUpdatedAt,
          tagName: item.tag_name,
          name: item.name,
          isDraft: item.draft,
          isPrerelease: item.prerelease,
          publishedAt: item.published_at,
        };
      },
    });
  }

  async listWorkflowRuns(
    input: GitHubActivityReadRequest,
  ): Promise<GitHubWorkflowRunReadModel[]> {
    const request = validateRequest(input);
    return this.readAll(request, {
      path: `/repos/${encodeURIComponent(request.repository.owner)}/${encodeURIComponent(request.repository.name)}/actions/runs`,
      query: {
        per_page: String(pageSize),
        created: `>=${request.since}`,
      },
      parsePage: (payload) => {
        const parsed = workflowPageSchema.safeParse(payload);
        return parsed.success ? parsed.data.workflow_runs : null;
      },
      map: (item, repositoryFullName) => ({
        repositoryFullName,
        githubObjectId: String(item.id),
        objectType: "workflow_run",
        sourceUpdatedAt: item.updated_at,
        sourceVersion: `${item.head_sha}:${item.run_attempt}:${item.updated_at}`,
        workflowId: String(item.workflow_id),
        runNumber: item.run_number,
        status: enumValue<Exclude<GitHubWorkflowStatus, "unknown">>(
          item.status,
          knownWorkflowStatuses,
        ),
        conclusion: conclusion(item.conclusion),
        eventName: item.event,
        headSha: item.head_sha,
        runAttempt: item.run_attempt,
      }),
    });
  }

  async listChecks(
    input: GitHubCheckReadRequest,
  ): Promise<GitHubCheckReadModel[]> {
    const request = validateCheckRequest(input);
    return this.readAll(request, {
      path: `/repos/${encodeURIComponent(request.repository.owner)}/${encodeURIComponent(request.repository.name)}/commits/${encodeURIComponent(request.ref)}/check-runs`,
      query: { filter: "all", per_page: String(pageSize) },
      parsePage: (payload) => {
        const parsed = checkPageSchema.safeParse(payload);
        return parsed.success ? parsed.data.check_runs : null;
      },
      map: (item, repositoryFullName) => {
        const sourceUpdatedAt = item.completed_at ?? item.started_at;
        const mappedConclusion = conclusion(item.conclusion);
        return {
          repositoryFullName,
          githubObjectId: String(item.id),
          objectType: "check",
          sourceUpdatedAt,
          sourceVersion: `${item.head_sha}:${item.status}:${item.conclusion ?? "null"}:${sourceUpdatedAt}`,
          name: item.name,
          status: enumValue<Exclude<GitHubCheckStatus, "unknown">>(
            item.status,
            knownCheckStatuses,
          ),
          conclusion: mappedConclusion,
          headSha: item.head_sha,
          startedAt: item.started_at,
          completedAt: item.completed_at,
        };
      },
    });
  }
}
