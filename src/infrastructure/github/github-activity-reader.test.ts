// @vitest-environment node

import { beforeAll, describe, expect, it, vi } from "vitest";

type ReadRequest = {
  repository: { owner: string; name: string };
  installationToken: string;
  since: string;
  pagination: { maxPages: number; maxObjects: number };
  signal?: AbortSignal;
  ref?: string;
  targetSha?: string;
};

type Reader = {
  listCommits(input: ReadRequest): Promise<Record<string, unknown>[]>;
  listIssues(input: ReadRequest): Promise<Record<string, unknown>[]>;
  listPullRequests(input: ReadRequest): Promise<Record<string, unknown>[]>;
  listReleases(input: ReadRequest): Promise<Record<string, unknown>[]>;
  listWorkflowRuns(input: ReadRequest): Promise<Record<string, unknown>[]>;
  listChecks(input: ReadRequest): Promise<Record<string, unknown>[]>;
};

type ReaderModule = {
  githubActivityReaderContract: string;
  githubActivityReaderErrorsContract: string;
  githubActivityReadModelContracts: Record<string, string>;
  GitHubRestActivityReader: new (options: {
    restApiVersion: string;
    fetcher?: typeof fetch;
    timeoutMilliseconds?: number;
  }) => Reader;
};

let activity: Partial<ReaderModule> = {};

beforeAll(async () => {
  const modulePath = "./github-activity-reader";
  activity = await import(modulePath).catch(() => ({}));
});

const repositoryFullName = "synthetic-owner/synthetic-repository";
const since = "2026-05-01T00:00:00.000Z";
const baseRequest: ReadRequest = {
  repository: {
    owner: "synthetic-owner",
    name: "synthetic-repository",
  },
  installationToken: "synthetic-installation-token",
  since,
  pagination: {
    maxPages: 5,
    maxObjects: 500,
  },
};

function createReader(fetcher: typeof fetch, timeoutMilliseconds = 100): Reader {
  const ReaderConstructor = activity.GitHubRestActivityReader;
  expect(ReaderConstructor).toBeTypeOf("function");
  return new ReaderConstructor!({
    restApiVersion: "2026-03-10",
    fetcher,
    timeoutMilliseconds,
  });
}

function response(payload: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

function fetchSequence(...responses: Response[]) {
  const fetcher = vi.fn<typeof fetch>();
  for (const item of responses) {
    fetcher.mockResolvedValueOnce(item);
  }
  return fetcher;
}

function commit(shaCharacter: string, message = "Synthetic commit") {
  const sha = shaCharacter.repeat(40);
  return {
    sha,
    commit: {
      message,
      author: { date: "2026-05-02T01:00:00Z" },
      committer: { date: "2026-05-02T02:00:00Z" },
    },
    author: { login: "synthetic-author" },
    files: [{ patch: "FORBIDDEN_DIFF" }],
    raw_private_field: "FORBIDDEN_RAW_RESPONSE",
  };
}

function issue(id: number, number = id) {
  return {
    id,
    number,
    title: `Synthetic issue ${number}`,
    state: "open",
    user: { login: "synthetic-author" },
    updated_at: "2026-05-03T03:00:00Z",
    closed_at: null,
    body: "FORBIDDEN_RAW_BODY",
  };
}

function pullRequest(id: number, number = id) {
  return {
    id,
    number,
    title: `Synthetic pull request ${number}`,
    state: "closed",
    draft: false,
    updated_at: "2026-05-04T04:00:00Z",
    head: { sha: "b".repeat(40) },
    base: { ref: "main" },
    merged_at: "2026-05-04T05:00:00Z",
    user: { login: "synthetic-author" },
    diff_url: "https://forbidden.invalid/diff",
  };
}

function release(id: number, tag = `v${id}.0.0`) {
  return {
    id,
    tag_name: tag,
    name: `Synthetic release ${id}`,
    draft: false,
    prerelease: true,
    created_at: "2026-05-05T05:00:00Z",
    published_at: "2026-05-05T06:00:00Z",
    body: "FORBIDDEN_RELEASE_BODY",
  };
}

function workflowRun(id: number, attempt = 1) {
  return {
    id,
    workflow_id: 9001,
    run_number: id,
    status: "completed",
    conclusion: "success",
    event: "push",
    head_sha: "c".repeat(40),
    run_attempt: attempt,
    updated_at: "2026-05-06T06:00:00Z",
    logs_url: "https://forbidden.invalid/logs",
  };
}

function checkRun(id: number) {
  return {
    id,
    name: `Synthetic check ${id}`,
    status: "completed",
    conclusion: "success",
    head_sha: "d".repeat(40),
    started_at: "2026-05-07T07:00:00Z",
    completed_at: "2026-05-07T08:00:00Z",
    details_url: "https://forbidden.invalid/check",
    output: { text: "FORBIDDEN_CHECK_OUTPUT" },
  };
}

type ResourceCase = {
  method: keyof Reader;
  first: unknown;
  second: unknown;
  wrap(items: unknown[]): unknown;
  path: string;
  query: Record<string, string>;
  firstId: string;
  secondId: string;
  request?: ReadRequest;
};

const resources: ResourceCase[] = [
  {
    method: "listCommits",
    first: commit("1"),
    second: commit("2"),
    wrap: (items) => items,
    path: "/repos/synthetic-owner/synthetic-repository/commits",
    query: { per_page: "100", page: "1", since },
    firstId: "1".repeat(40),
    secondId: "2".repeat(40),
  },
  {
    method: "listIssues",
    first: issue(101),
    second: issue(102),
    wrap: (items) => items,
    path: "/repos/synthetic-owner/synthetic-repository/issues",
    query: {
      state: "all",
      sort: "updated",
      direction: "asc",
      per_page: "100",
      page: "1",
      since,
    },
    firstId: "101",
    secondId: "102",
  },
  {
    method: "listPullRequests",
    first: pullRequest(201),
    second: pullRequest(202),
    wrap: (items) => items,
    path: "/repos/synthetic-owner/synthetic-repository/pulls",
    query: {
      state: "all",
      sort: "updated",
      direction: "asc",
      per_page: "100",
      page: "1",
    },
    firstId: "201",
    secondId: "202",
  },
  {
    method: "listReleases",
    first: release(301),
    second: release(302),
    wrap: (items) => items,
    path: "/repos/synthetic-owner/synthetic-repository/releases",
    query: { per_page: "100", page: "1" },
    firstId: "301",
    secondId: "302",
  },
  {
    method: "listWorkflowRuns",
    first: workflowRun(401),
    second: workflowRun(402),
    wrap: (items) => ({ total_count: items.length, workflow_runs: items }),
    path: "/repos/synthetic-owner/synthetic-repository/actions/runs",
    query: { per_page: "100", page: "1", created: `>=${since}` },
    firstId: "401",
    secondId: "402",
  },
  {
    method: "listChecks",
    first: checkRun(501),
    second: checkRun(502),
    wrap: (items) => ({ total_count: items.length, check_runs: items }),
    path: "/repos/synthetic-owner/synthetic-repository/commits/fixture-head/check-runs",
    query: { filter: "all", per_page: "100", page: "1" },
    firstId: "501",
    secondId: "502",
    request: { ...baseRequest, ref: "fixture-head" },
  },
];

function linkFor(resource: ResourceCase, page: number, overrides: Record<string, string> = {}) {
  const url = new URL(`https://api.github.com${resource.path}`);
  for (const [key, value] of Object.entries({ ...resource.query, ...overrides })) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("page", String(page));
  return `<${url.toString()}>; rel="next"`;
}

function assertRequest(
  fetcher: ReturnType<typeof vi.fn<typeof fetch>>,
  callIndex: number,
  resource: ResourceCase,
  expectedPage: number,
) {
  const [rawUrl, init] = fetcher.mock.calls[callIndex] ?? [];
  const url = new URL(String(rawUrl));
  expect(url.origin).toBe("https://api.github.com");
  expect(url.pathname).toBe(resource.path);
  expect(Object.fromEntries(url.searchParams.entries())).toEqual({
    ...resource.query,
    page: String(expectedPage),
  });
  expect(init).toEqual(expect.objectContaining({
    method: "GET",
    redirect: "error",
    headers: {
      accept: "application/vnd.github+json",
      authorization: "Bearer synthetic-installation-token",
      "x-github-api-version": "2026-03-10",
    },
  }));
}

describe("github activity reader contracts", () => {
  it("binds every Phase 4 contract version", () => {
    expect(activity.githubActivityReaderContract).toBe("github-activity-reader.v1");
    expect(activity.githubActivityReaderErrorsContract).toBe(
      "github-activity-reader-errors.v1",
    );
    expect(activity.githubActivityReadModelContracts).toEqual({
      commit: "github-commit-read-model.v1",
      issue: "github-issue-read-model.v1",
      pullRequest: "github-pull-request-read-model.v1",
      release: "github-release-read-model.v1",
      workflowCheck: "github-workflow-check-read-model.v1",
    });
  });

  it("maps a Commit into the exact provider-neutral read model", async () => {
    const fetcher = fetchSequence(response([commit("a", "  Synthetic commit message  ")]));
    await expect(createReader(fetcher).listCommits(baseRequest)).resolves.toEqual([
      {
        repositoryFullName,
        githubObjectId: "a".repeat(40),
        objectType: "commit",
        sourceUpdatedAt: "2026-05-02T02:00:00.000Z",
        sourceVersion: "a".repeat(40),
        message: "Synthetic commit message",
        authoredAt: "2026-05-02T01:00:00.000Z",
        committedAt: "2026-05-02T02:00:00.000Z",
        authorLogin: "synthetic-author",
      },
    ]);
    assertRequest(fetcher, 0, resources[0]!, 1);
  });

  it("adds only an encoded canonical target SHA to a targeted commit request", async () => {
    const targetSha = "c".repeat(40);
    const fetcher = fetchSequence(response([commit("c", "Targeted commit")]));
    await expect(createReader(fetcher).listCommits({ ...baseRequest, targetSha })).resolves.toHaveLength(1);
    const [url] = vi.mocked(fetcher).mock.calls[0]!;
    expect(new URL(String(url)).searchParams.get("sha")).toBe(targetSha);
    expect(new URL(String(url)).searchParams.get("since")).toBe(baseRequest.since);
  });

  it("keeps the legacy commit request query unchanged without a target", async () => {
    const fetcher = fetchSequence(response([commit("a", "Default branch commit")]));
    await createReader(fetcher).listCommits(baseRequest);
    const [url] = vi.mocked(fetcher).mock.calls[0]!;
    expect(new URL(String(url)).searchParams.has("sha")).toBe(false);
  });

  it("maps an Issue and excludes pull requests returned by the Issues endpoint", async () => {
    const pullMarker = { ...issue(999), pull_request: { url: "https://synthetic.invalid" } };
    const fetcher = fetchSequence(response([issue(101), pullMarker]));
    await expect(createReader(fetcher).listIssues(baseRequest)).resolves.toEqual([
      {
        repositoryFullName,
        githubObjectId: "101",
        objectType: "issue",
        sourceUpdatedAt: "2026-05-03T03:00:00.000Z",
        sourceVersion: "2026-05-03T03:00:00.000Z",
        number: 101,
        title: "Synthetic issue 101",
        state: "open",
        authorLogin: "synthetic-author",
        closedAt: null,
      },
    ]);
  });

  it("maps a Pull Request with stable object identity and mutable head provenance", async () => {
    const fetcher = fetchSequence(response([pullRequest(201)]));
    await expect(createReader(fetcher).listPullRequests(baseRequest)).resolves.toEqual([
      {
        repositoryFullName,
        githubObjectId: "201",
        objectType: "pull_request",
        sourceUpdatedAt: "2026-05-04T04:00:00.000Z",
        sourceVersion: "b".repeat(40),
        number: 201,
        title: "Synthetic pull request 201",
        state: "closed",
        isDraft: false,
        headSha: "b".repeat(40),
        baseRef: "main",
        mergedAt: "2026-05-04T05:00:00.000Z",
      },
    ]);
  });

  it("maps a Release with structured publication provenance", async () => {
    const fetcher = fetchSequence(response([release(301, "v301.0.0")]));
    await expect(createReader(fetcher).listReleases(baseRequest)).resolves.toEqual([
      {
        repositoryFullName,
        githubObjectId: "301",
        objectType: "release",
        sourceUpdatedAt: "2026-05-05T06:00:00.000Z",
        sourceVersion: "2026-05-05T06:00:00.000Z",
        tagName: "v301.0.0",
        name: "Synthetic release 301",
        isDraft: false,
        isPrerelease: true,
        publishedAt: "2026-05-05T06:00:00.000Z",
      },
    ]);
  });

  it("maps a Workflow Run with run-attempt provenance", async () => {
    const fetcher = fetchSequence(response({
      total_count: 1,
      workflow_runs: [workflowRun(401, 2)],
    }));
    await expect(createReader(fetcher).listWorkflowRuns(baseRequest)).resolves.toEqual([
      {
        repositoryFullName,
        githubObjectId: "401",
        objectType: "workflow_run",
        sourceUpdatedAt: "2026-05-06T06:00:00.000Z",
        sourceVersion: `${"c".repeat(40)}:2:2026-05-06T06:00:00.000Z`,
        workflowId: "9001",
        runNumber: 401,
        status: "completed",
        conclusion: "success",
        eventName: "push",
        headSha: "c".repeat(40),
        runAttempt: 2,
      },
    ]);
  });

  it("maps a Check using the requested ref endpoint without exposing output", async () => {
    const fetcher = fetchSequence(response({
      total_count: 1,
      check_runs: [checkRun(501)],
    }));
    await expect(createReader(fetcher).listChecks({
      ...baseRequest,
      ref: "fixture-head",
    })).resolves.toEqual([
      {
        repositoryFullName,
        githubObjectId: "501",
        objectType: "check",
        sourceUpdatedAt: "2026-05-07T08:00:00.000Z",
        sourceVersion: `${"d".repeat(40)}:completed:success:2026-05-07T08:00:00.000Z`,
        name: "Synthetic check 501",
        status: "completed",
        conclusion: "success",
        headSha: "d".repeat(40),
        startedAt: "2026-05-07T07:00:00.000Z",
        completedAt: "2026-05-07T08:00:00.000Z",
      },
    ]);
    assertRequest(fetcher, 0, resources[5]!, 1);
  });
});

describe("runtime schema, nullable and enum policy", () => {
  it("keeps documented nullable values and uses Release created_at when unpublished", async () => {
    const unpublished = {
      ...release(302),
      name: null,
      published_at: null,
    };
    const fetcher = fetchSequence(response([unpublished]));
    await expect(createReader(fetcher).listReleases(baseRequest)).resolves.toEqual([
      expect.objectContaining({
        sourceUpdatedAt: "2026-05-05T05:00:00.000Z",
        sourceVersion: "2026-05-05T05:00:00.000Z",
        name: null,
        publishedAt: null,
      }),
    ]);
  });

  it("keeps Release sourceVersion within the Phase 1 snapshot limit", async () => {
    const maximumTag = "v".repeat(255);
    const fetcher = fetchSequence(response([release(303, maximumTag)]));
    const [mapped] = await createReader(fetcher).listReleases(baseRequest);
    expect(mapped?.sourceVersion).toBe("2026-05-05T06:00:00.000Z");
    expect(mapped?.sourceVersion).toHaveLength(24);
    expect(mapped?.tagName).toBe(maximumTag);
  });

  it("keeps nullable Commit author fields", async () => {
    const anonymous = {
      ...commit("e"),
      author: null,
      commit: {
        ...commit("e").commit,
        author: null,
      },
    };
    const fetcher = fetchSequence(response([anonymous]));
    await expect(createReader(fetcher).listCommits(baseRequest)).resolves.toEqual([
      expect.objectContaining({ authoredAt: null, authorLogin: null }),
    ]);
  });

  it("maps new non-empty provider enum values to explicit unknown", async () => {
    const futureWorkflow = {
      ...workflowRun(403),
      status: "future_status",
      conclusion: "future_conclusion",
    };
    const fetcher = fetchSequence(response({
      total_count: 1,
      workflow_runs: [futureWorkflow],
    }));
    await expect(createReader(fetcher).listWorkflowRuns(baseRequest)).resolves.toEqual([
      expect.objectContaining({ status: "unknown", conclusion: "unknown" }),
    ]);
  });

  it.each([
    ["unsafe integer", { ...issue(Number.MAX_SAFE_INTEGER + 1), id: Number.MAX_SAFE_INTEGER + 1 }],
    ["blank title", { ...issue(103), title: "   " }],
    ["invalid timestamp", { ...issue(104), updated_at: "not-a-date" }],
    ["invalid number", { ...issue(105), number: 0 }],
    ["oversized string", { ...issue(106), title: "x".repeat(10_001) }],
  ])("rejects Issue schema mismatch: %s", async (_name, payload) => {
    const fetcher = fetchSequence(response([payload]));
    await expect(createReader(fetcher).listIssues(baseRequest)).rejects.toThrow(
      "github_activity_invalid_response",
    );
  });

  it("strips all provider-only fields from every read model", async () => {
    for (const resource of resources) {
      const fetcher = fetchSequence(response(resource.wrap([resource.first])));
      const result = await createReader(fetcher)[resource.method](
        resource.request ?? baseRequest,
      );
      expect(JSON.stringify(result)).not.toMatch(
        /FORBIDDEN|raw_|body|diff_url|logs_url|details_url|output|token|authorization/i,
      );
    }
  });
});

describe("Link-header pagination", () => {
  it.each(resources)("reads $method across a validated next Link", async (resource) => {
    const fetcher = fetchSequence(
      response(resource.wrap([resource.first]), {
        headers: { link: linkFor(resource, 2) },
      }),
      response(resource.wrap([resource.second])),
    );
    const result = await createReader(fetcher)[resource.method](
      resource.request ?? baseRequest,
    );
    expect(result.map((item) => item.githubObjectId)).toEqual([
      resource.firstId,
      resource.secondId,
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    assertRequest(fetcher, 0, resource, 1);
    assertRequest(fetcher, 1, resource, 2);
  });

  it.each(resources)("returns an empty first page for $method", async (resource) => {
    const fetcher = fetchSequence(response(resource.wrap([])));
    await expect(createReader(fetcher)[resource.method](
      resource.request ?? baseRequest,
    )).resolves.toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("accepts a Link-directed final empty page without guessing total pages", async () => {
    const resource = resources[0]!;
    const fetcher = fetchSequence(
      response(resource.wrap([resource.first]), {
        headers: { link: linkFor(resource, 2) },
      }),
      response(resource.wrap([])),
    );
    await expect(createReader(fetcher).listCommits(baseRequest)).resolves.toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("treats a valid final-page Link without rel=next as complete", async () => {
    const resource = resources[0]!;
    const previous = linkFor(resource, 1).replace('rel="next"', 'rel="prev"');
    const fetcher = fetchSequence(
      response([commit("1")], { headers: { link: linkFor(resource, 2) } }),
      response([commit("2")], { headers: { link: previous } }),
    );
    await expect(createReader(fetcher).listCommits(baseRequest)).resolves.toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["malformed", "not-a-link"],
    ["cross host", '<https://evil.invalid/repos/synthetic-owner/synthetic-repository/commits?per_page=100&page=2&since=2026-05-01T00%3A00%3A00.000Z>; rel="next"'],
    ["cross path", '<https://api.github.com/repos/synthetic-owner/other/commits?per_page=100&page=2&since=2026-05-01T00%3A00%3A00.000Z>; rel="next"'],
    ["page skip", linkFor(resources[0]!, 3)],
    ["changed query", linkFor(resources[0]!, 2, { since: "2026-06-01T00:00:00.000Z" })],
    ["wrong page size", linkFor(resources[0]!, 2, { per_page: "50" })],
  ])("rejects an invalid next Link: %s", async (_name, link) => {
    const fetcher = fetchSequence(response([commit("1")], { headers: { link } }));
    await expect(createReader(fetcher).listCommits(baseRequest)).rejects.toThrow(
      "github_activity_pagination_invalid",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects a pagination loop", async () => {
    const resource = resources[0]!;
    const pageTwo = linkFor(resource, 2);
    const fetcher = fetchSequence(
      response([commit("1")], { headers: { link: pageTwo } }),
      response([commit("2")], { headers: { link: pageTwo } }),
    );
    await expect(createReader(fetcher).listCommits(baseRequest)).rejects.toThrow(
      "github_activity_pagination_invalid",
    );
  });

  it("rejects duplicate stable IDs across pages", async () => {
    const resource = resources[0]!;
    const fetcher = fetchSequence(
      response([commit("1")], { headers: { link: linkFor(resource, 2) } }),
      response([commit("1")]),
    );
    await expect(createReader(fetcher).listCommits(baseRequest)).rejects.toThrow(
      "github_activity_pagination_invalid",
    );
  });

  it("enforces the caller page limit before fetching another page", async () => {
    const resource = resources[0]!;
    const fetcher = fetchSequence(
      response([commit("1")], { headers: { link: linkFor(resource, 2) } }),
    );
    await expect(createReader(fetcher).listCommits({
      ...baseRequest,
      pagination: { maxPages: 1, maxObjects: 100 },
    })).rejects.toThrow("github_activity_pagination_invalid");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("enforces the caller object limit without returning partial data", async () => {
    const fetcher = fetchSequence(response([commit("1"), commit("2")]));
    await expect(createReader(fetcher).listCommits({
      ...baseRequest,
      pagination: { maxPages: 1, maxObjects: 1 },
    })).rejects.toThrow("github_activity_pagination_invalid");
  });

  it("rejects an oversized provider page", async () => {
    const oversized = Array.from({ length: 101 }, (_, index) =>
      commit((index % 10).toString()),
    );
    const fetcher = fetchSequence(response(oversized));
    await expect(createReader(fetcher).listCommits(baseRequest)).rejects.toThrow(
      "github_activity_invalid_response",
    );
  });
});

describe("HTTP failures, aborts and safety", () => {
  it.each([
    [401, {}, "github_activity_authorization_revoked"],
    [403, {}, "github_activity_authorization_revoked"],
    [403, { "x-ratelimit-remaining": "0" }, "github_activity_rate_limited"],
    [403, { "retry-after": "60" }, "github_activity_rate_limited"],
    [429, {}, "github_activity_rate_limited"],
    [404, {}, "github_activity_not_found"],
    [500, {}, "github_activity_unavailable"],
    [503, {}, "github_activity_unavailable"],
    [206, {}, "github_activity_invalid_response"],
  ])("maps HTTP %i to %s safely", async (status, headers, code) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("SYNTHETIC_PROVIDER_BODY_AND_TOKEN_DO_NOT_LEAK", {
        status,
        headers,
      }),
    );
    let caught: unknown;
    try {
      await createReader(fetcher).listCommits(baseRequest);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe(code);
    expect((caught as Error).message).not.toMatch(/PROVIDER_BODY|TOKEN/i);
    expect((caught as Error).cause).toBeUndefined();
  });

  it("rejects invalid JSON", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("{not-json", { status: 200 }),
    );
    await expect(createReader(fetcher).listCommits(baseRequest)).rejects.toThrow(
      "github_activity_invalid_response",
    );
  });

  it("normalizes transport failures without leaking the raw cause", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(
      new Error("SYNTHETIC_NETWORK_SECRET_DO_NOT_LEAK"),
    );
    let caught: unknown;
    try {
      await createReader(fetcher).listCommits(baseRequest);
    } catch (error) {
      caught = error;
    }
    expect((caught as Error).message).toBe("github_activity_unavailable");
    expect((caught as Error).cause).toBeUndefined();
  });

  it("maps an internal timeout separately", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("synthetic timeout", "AbortError"));
        }, { once: true });
      }),
    );
    await expect(createReader(fetcher, 5).listCommits(baseRequest)).rejects.toThrow(
      "github_activity_timeout",
    );
  });

  it("preserves caller abort as an explicit non-timeout error", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => {
      if (init?.signal?.aborted) {
        return Promise.reject(new DOMException("caller stopped", "AbortError"));
      }
      return Promise.resolve(response([]));
    });
    await expect(createReader(fetcher).listCommits({
      ...baseRequest,
      signal: controller.signal,
    })).rejects.toThrow("github_activity_aborted");
  });

  it("returns no partial result when a later page fails", async () => {
    const resource = resources[0]!;
    const fetcher = fetchSequence(
      response([commit("1")], { headers: { link: linkFor(resource, 2) } }),
      new Response("SYNTHETIC_PRIVATE_BODY", { status: 503 }),
    );
    await expect(createReader(fetcher).listCommits(baseRequest)).rejects.toThrow(
      "github_activity_unavailable",
    );
  });

  it.each([
    ["blank token", { installationToken: "   " }],
    ["owner with slash", { repository: { owner: "bad/owner", name: "repo" } }],
    ["invalid since", { since: "2026-05-01" }],
    ["zero pages", { pagination: { maxPages: 0, maxObjects: 100 } }],
    ["excess pages", { pagination: { maxPages: 101, maxObjects: 100 } }],
    ["excess objects", { pagination: { maxPages: 1, maxObjects: 10_001 } }],
  ])("rejects unsafe request input before fetch: %s", async (_name, override) => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(createReader(fetcher).listCommits({
      ...baseRequest,
      ...override,
    } as ReadRequest)).rejects.toThrow("github_activity_invalid_response");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects an empty Check ref before fetch", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(createReader(fetcher).listChecks({
      ...baseRequest,
      ref: "   ",
    })).rejects.toThrow("github_activity_invalid_response");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses only the injected fetcher and never global fetch", async () => {
    const originalFetch = globalThis.fetch;
    const network = vi.fn(() => {
      throw new Error("real_network_forbidden");
    });
    globalThis.fetch = network as typeof fetch;
    try {
      const fetcher = fetchSequence(response([commit("1")]));
      await createReader(fetcher).listCommits(baseRequest);
      expect(network).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
