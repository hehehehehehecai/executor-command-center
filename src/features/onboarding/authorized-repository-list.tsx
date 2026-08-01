"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";

import type {
  AuthorizedGitHubRepository,
  AuthorizedRepositoryList,
} from "@/domain/github-repository/authorized-github-repository";
import type { SelectedGitHubRepository } from "@/domain/selected-repository/selected-github-repository";

type InstallationStatus =
  | "active"
  | "suspended"
  | "revoked"
  | "not_registered"
  | "configuration_failed";

type AuthorizedLoadState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "failed" }
  | {
      readonly kind: "loaded";
      readonly result: AuthorizedRepositoryList;
    };

type SelectedLoadState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "failed" }
  | {
      readonly kind: "loaded";
      readonly repositories: readonly SelectedGitHubRepository[];
    };

type SelectionMutationState = "saving" | "failed";
type DeselectionMutationState = "removing" | "failed";

const authorizedRepositorySchema = z
  .object({
    id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    name: z.string(),
    fullName: z.string(),
    ownerLogin: z.string(),
    isPrivate: z.boolean(),
    isFork: z.boolean(),
    isArchived: z.boolean(),
    isDisabled: z.boolean(),
    visibility: z.enum(["public", "private", "internal"]),
    defaultBranch: z.string(),
  })
  .strict();

const authorizedRepositoryListSchema = z
  .object({
    repositorySelection: z.enum(["all", "selected"]),
    totalCount: z.number().int().nonnegative(),
    repositories: z.array(authorizedRepositorySchema),
    loadedAt: z.string(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.repositories.length !== value.totalCount) {
      context.addIssue({
        code: "custom",
        message: "repository_count_mismatch",
      });
    }
  });

const selectedRepositorySchema = z
  .object({
    repositoryId: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER),
    ownerLogin: z.string().min(1),
    name: z.string().min(1),
    fullName: z.string().min(1),
    visibility: z.enum(["public", "private", "internal"]),
    isPrivate: z.boolean(),
    isFork: z.boolean(),
    isArchived: z.boolean(),
    isDisabled: z.boolean(),
    defaultBranch: z.string().min(1),
    selectedAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    calibrationStatus: z.literal("pending"),
  })
  .strict();

const selectedListResponseSchema = z
  .object({
    selectedRepositories: z.array(selectedRepositorySchema),
  })
  .strict()
  .superRefine((value, context) => {
    const repositoryIds = new Set<number>();
    for (const repository of value.selectedRepositories) {
      if (repositoryIds.has(repository.repositoryId)) {
        context.addIssue({
          code: "custom",
          message: "duplicate_repository_id",
        });
      }
      repositoryIds.add(repository.repositoryId);
    }
  });

const selectionResponseSchema = z
  .object({
    selectionState: z.literal("selected"),
    selectedRepository: selectedRepositorySchema,
  })
  .strict();

function visibilityLabel(
  visibility:
    | AuthorizedGitHubRepository["visibility"]
    | SelectedGitHubRepository["visibility"],
) {
  return (
    visibility.charAt(0).toUpperCase() + visibility.slice(1)
  );
}

function replaceSelectedRepository(
  current: readonly SelectedGitHubRepository[],
  next: SelectedGitHubRepository,
) {
  return [
    ...current.filter(
      (repository) => repository.repositoryId !== next.repositoryId,
    ),
    next,
  ];
}

async function fetchSelectedRepositories() {
  const response = await fetch(
    "/api/github/repository-selections",
    {
      cache: "no-store",
      credentials: "same-origin",
    },
  );
  if (!response.ok) throw new Error("selection_load_failed");
  const parsed = selectedListResponseSchema.safeParse(
    await response.json(),
  );
  if (!parsed.success) throw parsed.error;
  return parsed.data.selectedRepositories;
}

export function AuthorizedRepositoryList(input: {
  readonly installationStatus: InstallationStatus;
}) {
  const mounted = useRef(false);
  const selectedGeneration = useRef(0);
  const authorizedGeneration = useRef(0);
  const [selectedLoadState, setSelectedLoadState] =
    useState<SelectedLoadState>({ kind: "loading" });
  const [authorizedLoadState, setAuthorizedLoadState] =
    useState<AuthorizedLoadState>({ kind: "idle" });
  const [
    selectionMutationStateByRepositoryId,
    setSelectionMutationStateByRepositoryId,
  ] = useState<ReadonlyMap<number, SelectionMutationState>>(new Map());
  const [
    deselectionMutationStateByRepositoryId,
    setDeselectionMutationStateByRepositoryId,
  ] = useState<ReadonlyMap<number, DeselectionMutationState>>(new Map());
  const [mutationError, setMutationError] = useState<
    "selection" | "deselection" | "deselection_conflict" | null
  >(null);

  const loadSelectedRepositories = useCallback(async () => {
    const generation = ++selectedGeneration.current;
    setSelectedLoadState({ kind: "loading" });

    try {
      const repositories = await fetchSelectedRepositories();
      if (
        mounted.current &&
        selectedGeneration.current === generation
      ) {
        setSelectedLoadState({
          kind: "loaded",
          repositories,
        });
      }
    } catch {
      if (
        mounted.current &&
        selectedGeneration.current === generation
      ) {
        setSelectedLoadState({ kind: "failed" });
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const generation = ++selectedGeneration.current;
    void fetchSelectedRepositories().then(
      (repositories) => {
        if (
          mounted.current &&
          selectedGeneration.current === generation
        ) {
          setSelectedLoadState({ kind: "loaded", repositories });
        }
      },
      () => {
        if (
          mounted.current &&
          selectedGeneration.current === generation
        ) {
          setSelectedLoadState({ kind: "failed" });
        }
      },
    );
    return () => {
      mounted.current = false;
      selectedGeneration.current += 1;
      authorizedGeneration.current += 1;
    };
  }, []);

  const loadAuthorizedRepositories = async () => {
    if (input.installationStatus !== "active") return;
    const generation = ++authorizedGeneration.current;
    setAuthorizedLoadState({ kind: "loading" });

    try {
      const response = await fetch("/api/github/repositories", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("repository_load_failed");
      const parsed = authorizedRepositoryListSchema.safeParse(
        await response.json(),
      );
      if (!parsed.success) throw parsed.error;
      if (
        mounted.current &&
        authorizedGeneration.current === generation
      ) {
        setAuthorizedLoadState({
          kind: "loaded",
          result: parsed.data,
        });
      }
    } catch {
      if (
        mounted.current &&
        authorizedGeneration.current === generation
      ) {
        setAuthorizedLoadState({ kind: "failed" });
      }
    }
  };

  const repositoryIsBusy = (repositoryId: number) =>
    selectionMutationStateByRepositoryId.get(repositoryId) ===
      "saving" ||
    deselectionMutationStateByRepositoryId.get(repositoryId) ===
      "removing";

  const selectRepository = async (repositoryId: number) => {
    if (repositoryIsBusy(repositoryId)) return;
    selectedGeneration.current += 1;
    setMutationError(null);
    setSelectionMutationStateByRepositoryId((current) => {
      const next = new Map(current);
      next.set(repositoryId, "saving");
      return next;
    });

    try {
      const response = await fetch(
        "/api/github/repository-selections",
        {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ repositoryId }),
        },
      );
      if (response.status !== 200) {
        throw new Error("selection_failed");
      }
      const parsed = selectionResponseSchema.safeParse(
        await response.json(),
      );
      if (!parsed.success) throw parsed.error;
      if (!mounted.current) return;
      setSelectedLoadState((current) => ({
        kind: "loaded",
        repositories: replaceSelectedRepository(
          current.kind === "loaded" ? current.repositories : [],
          parsed.data.selectedRepository,
        ),
      }));
      setSelectionMutationStateByRepositoryId((current) => {
        const next = new Map(current);
        next.delete(repositoryId);
        return next;
      });
      window.dispatchEvent(new Event("selected-repositories-changed"));
    } catch {
      if (!mounted.current) return;
      setSelectionMutationStateByRepositoryId((current) => {
        const next = new Map(current);
        next.set(repositoryId, "failed");
        return next;
      });
      setMutationError("selection");
    }
  };

  const deselectRepository = async (repositoryId: number) => {
    if (repositoryIsBusy(repositoryId)) return;
    selectedGeneration.current += 1;
    setMutationError(null);
    setDeselectionMutationStateByRepositoryId((current) => {
      const next = new Map(current);
      next.set(repositoryId, "removing");
      return next;
    });

    try {
      const response = await fetch(
        `/api/github/repository-selections/${repositoryId}`,
        {
          method: "DELETE",
          cache: "no-store",
          credentials: "same-origin",
        },
      );
      if (response.status === 409) {
        throw new Error("deselection_conflict");
      }
      if (response.status !== 204 || (await response.text()) !== "") {
        throw new Error("deselection_failed");
      }
      if (!mounted.current) return;
      setSelectedLoadState((current) => ({
        kind: "loaded",
        repositories:
          current.kind === "loaded"
            ? current.repositories.filter(
                (repository) =>
                  repository.repositoryId !== repositoryId,
              )
            : [],
      }));
      setDeselectionMutationStateByRepositoryId((current) => {
        const next = new Map(current);
        next.delete(repositoryId);
        return next;
      });
      window.dispatchEvent(new Event("selected-repositories-changed"));
    } catch (error) {
      if (!mounted.current) return;
      setDeselectionMutationStateByRepositoryId((current) => {
        const next = new Map(current);
        next.set(repositoryId, "failed");
        return next;
      });
      setMutationError(
        error instanceof Error && error.message === "deselection_conflict"
          ? "deselection_conflict"
          : "deselection",
      );
    }
  };

  const selectedRepositories =
    selectedLoadState.kind === "loaded"
      ? selectedLoadState.repositories
      : [];
  const selectedIds = new Set(
    selectedRepositories.map((repository) => repository.repositoryId),
  );
  const authorizedIds = new Set(
    authorizedLoadState.kind === "loaded"
      ? authorizedLoadState.result.repositories.map(
          (repository) => repository.id,
        )
      : [],
  );
  const authorizedCount =
    authorizedLoadState.kind === "loaded"
      ? String(authorizedLoadState.result.totalCount)
      : authorizedLoadState.kind === "failed"
        ? "unknown"
        : "0";
  const selectedCount =
    selectedLoadState.kind === "loaded"
      ? String(selectedRepositories.length)
      : "unknown";
  const repositoryAccess =
    input.installationStatus !== "active"
      ? "unavailable"
      : authorizedLoadState.kind === "idle"
        ? "not_loaded"
        : authorizedLoadState.kind;

  return (
    <div className="repository-list">
      <dl className="auth-state-list repository-state-list">
        <div>
          <dt>repository_access</dt>
          <dd>{repositoryAccess}</dd>
        </div>
        <div>
          <dt>authorized_repository_count</dt>
          <dd>{authorizedCount}</dd>
        </div>
        <div>
          <dt>selected_repository_count</dt>
          <dd>{selectedCount}</dd>
        </div>
        <div>
          <dt>calibration_status</dt>
          <dd>pending</dd>
        </div>
        <div>
          <dt>projects</dt>
          <dd>none</dd>
        </div>
        <div>
          <dt>repository_content</dt>
          <dd>none</dd>
        </div>
      </dl>

      <section aria-label="已选择仓库">
        <h2>已选择仓库</h2>
        {selectedLoadState.kind === "loading" ? (
          <p>已选择仓库正在恢复</p>
        ) : null}
        {selectedLoadState.kind === "failed" ? (
          <div role="alert">
            <p>已选择仓库读取失败。</p>
            <button
              type="button"
              onClick={() => void loadSelectedRepositories()}
            >
              重新加载本地状态
            </button>
          </div>
        ) : null}
        {selectedLoadState.kind === "loaded" &&
        selectedRepositories.length === 0 ? (
          <p>尚未选择仓库。</p>
        ) : null}
        {selectedRepositories.length > 0 ? (
          <ul className="repository-items">
            {selectedRepositories.map((repository) => {
              const removing =
                deselectionMutationStateByRepositoryId.get(
                  repository.repositoryId,
                ) === "removing";
              return (
                <li key={repository.repositoryId}>
                  <strong>{repository.fullName}</strong>
                  <span>{visibilityLabel(repository.visibility)}</span>
                  <span>
                    {authorizedIds.has(repository.repositoryId)
                      ? "当前授权已确认"
                      : "当前授权状态未确认"}
                  </span>
                  <button
                    type="button"
                    disabled={repositoryIsBusy(repository.repositoryId)}
                    aria-busy={removing}
                    onClick={() =>
                      void deselectRepository(repository.repositoryId)
                    }
                  >
                    {removing
                      ? "取消中"
                      : `取消选择 ${repository.fullName}`}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      {mutationError === "selection" ? (
        <p role="alert">仓库选择失败，请稍后重试。</p>
      ) : null}
      {mutationError === "deselection" ? (
        <p role="alert">取消仓库选择失败，请稍后重试。</p>
      ) : null}
      {mutationError === "deselection_conflict" ? (
        <p role="alert">存在有效项目，无法取消选择。</p>
      ) : null}

      <section aria-label="已授权仓库">
        <h2>已授权仓库</h2>
        {input.installationStatus === "active" ? (
          <button
            type="button"
            onClick={() => void loadAuthorizedRepositories()}
          >
            {authorizedLoadState.kind === "idle"
              ? "加载已授权仓库"
              : "刷新授权仓库"}
          </button>
        ) : (
          <p>当前 Installation 状态不允许加载新授权仓库。</p>
        )}

        {authorizedLoadState.kind === "loading" ? (
          <p>仓库正在加载</p>
        ) : null}
        {authorizedLoadState.kind === "failed" ? (
          <p role="alert">仓库读取失败。</p>
        ) : null}
        {authorizedLoadState.kind === "loaded" &&
        authorizedLoadState.result.repositories.length === 0 ? (
          <p>当前授权范围内没有仓库。</p>
        ) : null}
        {authorizedLoadState.kind === "loaded" &&
        authorizedLoadState.result.repositories.length > 0 ? (
          <ul className="repository-items">
            {authorizedLoadState.result.repositories.map((repository) => {
              const selected = selectedIds.has(repository.id);
              const saving =
                selectionMutationStateByRepositoryId.get(repository.id) ===
                "saving";
              return (
                <li key={repository.id}>
                  <strong>{repository.fullName}</strong>
                  <span>{visibilityLabel(repository.visibility)}</span>
                  {repository.isFork ? <span>Fork</span> : null}
                  {repository.isArchived ? <span>Archived</span> : null}
                  {repository.isDisabled ? <span>Disabled</span> : null}
                  <span>默认分支：{repository.defaultBranch}</span>
                  {selected ? (
                    <span>已选择</span>
                  ) : selectedLoadState.kind !== "loaded" ? (
                    <span>选择状态不可用</span>
                  ) : (
                    <button
                      type="button"
                      disabled={repositoryIsBusy(repository.id)}
                      aria-busy={saving}
                      onClick={() => void selectRepository(repository.id)}
                    >
                      {saving
                        ? "保存中"
                        : `选择 ${repository.fullName}`}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
