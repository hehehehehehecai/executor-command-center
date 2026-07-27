"use client";

import { useEffect, useState } from "react";

import type {
  AuthorizedGitHubRepository,
  AuthorizedRepositoryList,
} from "@/domain/github-repository/authorized-github-repository";

type InstallationStatus = "active" | "suspended" | "revoked";

type LoadState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "error" }
  | {
      readonly kind: "loaded";
      readonly result: AuthorizedRepositoryList;
    };

function isRepository(value: unknown): value is AuthorizedGitHubRepository {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;

  return (
    Number.isSafeInteger(item.id) &&
    typeof item.name === "string" &&
    typeof item.fullName === "string" &&
    typeof item.ownerLogin === "string" &&
    typeof item.isPrivate === "boolean" &&
    typeof item.isFork === "boolean" &&
    typeof item.isArchived === "boolean" &&
    typeof item.isDisabled === "boolean" &&
    ["public", "private", "internal"].includes(String(item.visibility)) &&
    typeof item.defaultBranch === "string"
  );
}

function isRepositoryList(value: unknown): value is AuthorizedRepositoryList {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Record<string, unknown>;

  return (
    ["all", "selected"].includes(String(result.repositorySelection)) &&
    Number.isSafeInteger(result.totalCount) &&
    Number(result.totalCount) >= 0 &&
    Array.isArray(result.repositories) &&
    result.repositories.length === result.totalCount &&
    result.repositories.every(isRepository) &&
    typeof result.loadedAt === "string"
  );
}

function visibilityLabel(
  visibility: AuthorizedGitHubRepository["visibility"],
) {
  return (
    visibility.charAt(0).toUpperCase() + visibility.slice(1)
  );
}

export function AuthorizedRepositoryList(input: {
  readonly installationStatus: InstallationStatus;
}) {
  const [reloadSequence, setReloadSequence] = useState(0);
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const startLoad = () => {
    setState({ kind: "loading" });
    setReloadSequence((value) => value + 1);
  };

  useEffect(() => {
    if (
      input.installationStatus !== "active" ||
      reloadSequence === 0
    ) {
      return;
    }

    const controller = new AbortController();

    void fetch("/api/github/repositories", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("repository_load_failed");
        const payload: unknown = await response.json();
        if (!isRepositoryList(payload)) {
          throw new Error("repository_load_failed");
        }
        setState({ kind: "loaded", result: payload });
      })
      .catch((error: unknown) => {
        if (
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }
        setState({ kind: "error" });
      });

    return () => controller.abort();
  }, [input.installationStatus, reloadSequence]);

  if (input.installationStatus === "suspended") {
    return (
      <section aria-label="已授权仓库">
        <dl className="auth-state-list repository-state-list">
          <div>
            <dt>repository_access</dt>
            <dd>unavailable</dd>
          </div>
          <div>
            <dt>authorized_repository_count</dt>
            <dd>0</dd>
          </div>
        </dl>
        <p>Installation 已暂停，无法读取仓库。</p>
      </section>
    );
  }

  if (input.installationStatus === "revoked") {
    return (
      <section aria-label="已授权仓库">
        <dl className="auth-state-list repository-state-list">
          <div>
            <dt>repository_access</dt>
            <dd>unavailable</dd>
          </div>
          <div>
            <dt>authorized_repository_count</dt>
            <dd>0</dd>
          </div>
        </dl>
        <p>Installation 已撤销，无法读取仓库。</p>
      </section>
    );
  }

  const loaded = state.kind === "loaded";
  const count = loaded ? state.result.totalCount : 0;

  return (
    <section className="repository-list" aria-label="已授权仓库">
      <dl className="auth-state-list repository-state-list">
        <div>
          <dt>repository_access</dt>
          <dd>
            {loaded
              ? "loaded"
              : state.kind === "idle"
                ? "not_loaded"
                : state.kind}
          </dd>
        </div>
        <div>
          <dt>authorized_repository_count</dt>
          <dd>{count}</dd>
        </div>
      </dl>

      {state.kind === "idle" ? (
        <button
          type="button"
          onClick={startLoad}
        >
          加载已授权仓库
        </button>
      ) : null}

      {state.kind === "loading" ? <p>仓库正在加载</p> : null}

      {state.kind === "error" ? (
        <>
          <p>仓库读取失败。</p>
          <button
            type="button"
            onClick={startLoad}
          >
            重新加载
          </button>
        </>
      ) : null}

      {loaded && state.result.repositories.length === 0 ? (
        <p>当前授权范围内没有仓库。</p>
      ) : null}

      {loaded && state.result.repositories.length > 0 ? (
        <ul className="repository-items">
          {state.result.repositories.map((repository) => (
            <li key={repository.id}>
              <strong>{repository.fullName}</strong>
              <span>{visibilityLabel(repository.visibility)}</span>
              {repository.isArchived ? <span>Archived</span> : null}
              {repository.isDisabled ? <span>Disabled</span> : null}
              <span>默认分支：{repository.defaultBranch}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
