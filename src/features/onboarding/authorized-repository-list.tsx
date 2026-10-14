"use client";
import Link from "next/link";
import { workspaceHref } from "@/shared/workspace-navigation";
import { FirstSyncStatusPanel, readProjectSyncStatus, requestFirstSync } from "@/features/project-galaxy";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";

import type {
  AuthorizedGitHubRepository,
  AuthorizedRepositoryList,
} from "@/domain/github-repository/authorized-github-repository";
import { hasUnconfirmedProjectBackground, projectCalibrationReadSchema } from "@/domain/project-calibration/project-calibration-read";
import type { SelectedGitHubRepository } from "@/domain/selected-repository/selected-github-repository";
import {
  projectCalibrationSavedEvent,
  selectedRepositoriesChangedEvent,
} from "./onboarding-events";

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
type ProjectSummaryState =
  | { readonly kind: "loading" }
  | { readonly kind: "failed" }
  | { readonly kind: "loaded"; readonly projectCount: number; readonly repositoryIds: readonly number[]; readonly unconfirmedRepositoryIds: readonly number[]; readonly projects: z.infer<typeof projectSummaryListSchema>["projects"] };
type HandoffState = { readonly phase: "working" | "ready" | "failed"; readonly projectId: string | null; readonly message: string | null };

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

const creationResponseSchema = z.object({
  project: z.object({
    contractVersion: z.literal("project-context.v1"),
    id: z.string().uuid(),
    selectedRepositoryId: z.string().uuid(),
    context: projectCalibrationReadSchema.pick({ coreGoal: true, currentStageGoal: true, status: true, currentBlocker: true }),
    completeness: z.object({ complete: z.boolean(), missingFields: z.array(z.string()) }).strict(),
    syncPreparation: z.object({ state: z.enum(["ready", "blocked"]), requested: z.literal(false) }).strict(),
  }).strict(),
}).strict();

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

const projectSummaryListSchema = z
  .object({
    projects: z.array(
      z
        .object({
          repository: z
            .object({
              id: z.string().uuid(),
              repositoryId: z.number().int().positive(),
              fullName: z.string().min(1),
              visibility: z.enum(["public", "private", "internal"]),
              defaultBranch: z.string().min(1),
            })
            .strict(),
          calibration: projectCalibrationReadSchema.nullable(),
        })
        .strict(),
    ),
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

type RepositoryListProps = {
  readonly installationStatus: InstallationStatus;
  readonly autoLoad?: boolean;
  readonly userId?: string | null;
  readonly onboarding?: boolean;
  readonly primaryActions?: boolean;
};

export function AuthorizedRepositoryList(input: RepositoryListProps) {
  return <RepositoryList key={`${input.userId ?? "unknown"}:${input.installationStatus}`} {...input} />;
}

function RepositoryList(input: RepositoryListProps) {
  const primary = input.onboarding && input.primaryActions !== false;
  const mounted = useRef(false);
  const busyRepositoryIds = useRef(new Set<number>());
  const [handoffs, setHandoffs] = useState<ReadonlyMap<number, HandoffState>>(new Map());
  const selectedGeneration = useRef(0);
  const authorizedGeneration = useRef(0);
  const projectSummaryGeneration = useRef(0);
  const [selectedLoadState, setSelectedLoadState] =
    useState<SelectedLoadState>({ kind: "loading" });
  const [authorizedLoadState, setAuthorizedLoadState] =
    useState<AuthorizedLoadState>({ kind: "idle" });
  const [projectSummaryState, setProjectSummaryState] =
    useState<ProjectSummaryState>({ kind: "loading" });
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

  const loadProjectSummary = useCallback(async () => {
    const generation = ++projectSummaryGeneration.current;
    setProjectSummaryState({ kind: "loading" });

    try {
      const response = await fetch("/api/projects", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("project_summary_load_failed");
      const parsed = projectSummaryListSchema.safeParse(await response.json());
      if (!parsed.success) throw parsed.error;
      if (
        mounted.current &&
        projectSummaryGeneration.current === generation
      ) {
        setProjectSummaryState({
          kind: "loaded",
          projectCount: parsed.data.projects.filter(
            (project) => project.calibration !== null,
          ).length,
          repositoryIds: parsed.data.projects.filter(project => project.calibration !== null).map(project => project.repository.repositoryId),
          unconfirmedRepositoryIds: parsed.data.projects.filter(project => project.calibration !== null && hasUnconfirmedProjectBackground(project.calibration)).map(project => project.repository.repositoryId),
          projects: parsed.data.projects,
        });
      }
    } catch {
      if (
        mounted.current &&
        projectSummaryGeneration.current === generation
      ) {
        setProjectSummaryState({ kind: "failed" });
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const endSession = () => { mounted.current = false; selectedGeneration.current += 1; authorizedGeneration.current += 1; projectSummaryGeneration.current += 1; setHandoffs(new Map()); };
    window.addEventListener("executor:session-ended", endSession);
    queueMicrotask(() => {
      void loadSelectedRepositories();
      void loadProjectSummary();
    });
    const refreshProjectSummary = () => void loadProjectSummary();
    window.addEventListener(
      selectedRepositoriesChangedEvent,
      refreshProjectSummary,
    );
    window.addEventListener(
      projectCalibrationSavedEvent,
      refreshProjectSummary,
    );
    return () => {
      mounted.current = false;
      window.removeEventListener("executor:session-ended", endSession);
      selectedGeneration.current += 1;
      authorizedGeneration.current += 1;
      projectSummaryGeneration.current += 1;
      window.removeEventListener(
        selectedRepositoriesChangedEvent,
        refreshProjectSummary,
      );
      window.removeEventListener(
        projectCalibrationSavedEvent,
        refreshProjectSummary,
      );
    };
  }, [loadProjectSummary, loadSelectedRepositories]);

  const loadAuthorizedRepositories = useCallback(async () => {
    if (input.installationStatus !== "active" || busyRepositoryIds.current.size) return;
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
  }, [input.installationStatus]);

  useEffect(() => {
    if (input.autoLoad) queueMicrotask(() => { if (mounted.current) void loadAuthorizedRepositories(); });
  }, [input.autoLoad, loadAuthorizedRepositories]);

  const repositoryIsBusy = (repositoryId: number) =>
    handoffs.get(repositoryId)?.phase === "working" ||
    selectionMutationStateByRepositoryId.get(repositoryId) ===
      "saving" ||
    deselectionMutationStateByRepositoryId.get(repositoryId) ===
      "removing";

  async function continueRepository(repositoryId: number, intent: "connect" | "view", alreadyBusy = false) {
    if (!mounted.current || input.installationStatus !== "active" || (!alreadyBusy && busyRepositoryIds.current.has(repositoryId))) return;
    busyRepositoryIds.current.add(repositoryId);
    let projectId: string | null = null;
    const update = (phase: HandoffState["phase"], message: string | null = null) => {
      if (mounted.current) setHandoffs(current => new Map(current).set(repositoryId, { phase, projectId, message }));
    };
    const readMapping = async () => {
      const response = await fetch("/api/projects", { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error("mapping_unavailable");
      const result = projectSummaryListSchema.parse(await response.json());
      const mapping = result.projects.find(item => item.repository.repositoryId === repositoryId);
      if (!mapping || (mapping.calibration && mapping.calibration.selectedRepositoryId !== mapping.repository.id)) throw new Error("mapping_unavailable");
      if (mapping.calibration?.status === "archived") throw new Error("project_archived");
      return mapping;
    };
    update("working");
    try {
      const mapping = await readMapping();
      if (!mounted.current) return;
      projectId = mapping.calibration?.id ?? null;
      if (!projectId) {
        if (intent === "view") throw new Error("mapping_unavailable");
        try {
          const response = await fetch("/api/projects/from-repository", { method: "POST", cache: "no-store", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ selectedRepositoryId: mapping.repository.id }) });
          if (!response.ok) throw new Error("creation_unavailable");
          const created = creationResponseSchema.parse(await response.json()).project;
          if (created.selectedRepositoryId !== mapping.repository.id || created.context.status === "archived") throw new Error("creation_mismatch");
          projectId = created.id;
        } catch {
          if (!mounted.current) return;
          // A committed creation can outlive a lost HTTP response. Re-read before retrying a write.
          const recovered = await readMapping();
          if (recovered.repository.id !== mapping.repository.id || !recovered.calibration) throw new Error("creation_unavailable");
          projectId = recovered.calibration.id;
        }
      }
      if (!mounted.current) return;
      update("working");
      const current = await readProjectSyncStatus(projectId);
      if (!mounted.current) return;
      if (intent === "connect" && current.retryRequestId && ["not_started", "dispatch_pending", "partial", "failed", "cancelled"].includes(current.state)) {
        try { await requestFirstSync(projectId, current.retryRequestId); }
        catch { /* Read the stored run below before deciding whether the result is unknown. */ }
        if (!mounted.current) return;
        const confirmed = await readProjectSyncStatus(projectId);
        if (confirmed.state === "not_started") throw new Error("start_unavailable");
      }
      if (!mounted.current) return;
      update("ready");
      window.dispatchEvent(new Event(selectedRepositoriesChangedEvent));
    } catch {
      update("failed", intent === "view" ? "同步状态暂未确认，请重新查看。已有项目资料不会因此修改。" : projectId ? "项目已建立，同步状态暂未确认。请刷新状态或重试同步。" : "项目接入未完成，已选择的仓库仍然保留。请继续接入重试。");
    } finally {
      busyRepositoryIds.current.delete(repositoryId);
    }
  }

  const selectRepository = async (repositoryId: number) => {
    if (input.installationStatus !== "active" || busyRepositoryIds.current.has(repositoryId) || repositoryIsBusy(repositoryId)) return;
    busyRepositoryIds.current.add(repositoryId);
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
      if (parsed.data.selectedRepository.repositoryId !== repositoryId) throw new Error("selection_repository_mismatch");
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
      window.dispatchEvent(new Event(selectedRepositoriesChangedEvent));
      await continueRepository(repositoryId, "connect", true);
    } catch {
      if (!mounted.current) return;
      setSelectionMutationStateByRepositoryId((current) => {
        const next = new Map(current);
        next.set(repositoryId, "failed");
        return next;
      });
      setMutationError("selection");
    } finally {
      busyRepositoryIds.current.delete(repositoryId);
    }
  };

  const deselectRepository = async (repositoryId: number) => {
    if (busyRepositoryIds.current.has(repositoryId) || repositoryIsBusy(repositoryId)) return;
    busyRepositoryIds.current.add(repositoryId);
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
      window.dispatchEvent(new Event(selectedRepositoriesChangedEvent));
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
    } finally {
      busyRepositoryIds.current.delete(repositoryId);
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
  const calibrationStatus =
    projectSummaryState.kind === "loaded"
      ? projectSummaryState.projectCount > 0
        ? "saved"
        : "pending"
      : "unknown";
  const projectCount =
    projectSummaryState.kind === "loaded"
      ? String(projectSummaryState.projectCount)
      : "unknown";
  const selectedLabel = (repositoryId: number) => projectSummaryState.kind !== "loaded"
    ? "已选择，项目状态待确认"
    : projectSummaryState.unconfirmedRepositoryIds.includes(repositoryId) ? "已添加 · 背景未确认"
    : projectSummaryState.repositoryIds.includes(repositoryId) ? "已添加" : "已选择，待建项";

  return (
    <div className="repository-list">
      <details open={input.onboarding ? undefined : true}><summary>仓库诊断</summary><dl className="auth-state-list repository-state-list">
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
          <dd>{calibrationStatus}</dd>
        </div>
        <div>
          <dt>projects</dt>
          <dd>{projectCount}</dd>
        </div>
        <div>
          <dt>repository_content</dt>
          <dd>none</dd>
        </div>
      </dl></details>
      {input.onboarding && projectSummaryState.kind === "failed" ? <div role="alert"><p>项目状态读取失败，无法确认是否已建项。已有资料会保留。</p><button type="button" onClick={() => void loadProjectSummary()}>重新读取项目状态</button></div> : null}

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
              const handoff = handoffs.get(repository.repositoryId);
              const savedProjectId = projectSummaryState.kind === "loaded" ? projectSummaryState.projects.find(item => item.repository.repositoryId === repository.repositoryId && item.calibration?.status !== "archived")?.calibration?.id ?? null : null;
              const connectedProjectId = handoff?.projectId ?? savedProjectId;
              const removing =
                deselectionMutationStateByRepositoryId.get(
                  repository.repositoryId,
                ) === "removing";
              return (
                <li key={repository.repositoryId}>
                  <strong>{repository.fullName}</strong>
                  <span>{selectedLabel(repository.repositoryId)}</span>
                  <span>{visibilityLabel(repository.visibility)}</span>
                  {connectedProjectId ? <Link data-onboarding-primary={primary && selectedRepositories[0]?.repositoryId === repository.repositoryId ? "true" : undefined} prefetch={false} href={workspaceHref("project-galaxy", { projectId: connectedProjectId, mode: "connected" })}>进入项目</Link> : null}
                  {handoff?.phase === "working" ? <p role="status">正在确认项目与同步状态，项目资料会保留</p> : null}
                  {handoff?.message ? <p role="alert">{handoff.message}</p> : null}
                  {handoff?.projectId && handoff.phase !== "working" ? <FirstSyncStatusPanel projectId={handoff.projectId} /> : (
                    <button data-onboarding-primary={primary && !savedProjectId && selectedRepositories[0]?.repositoryId === repository.repositoryId ? "true" : undefined} type="button" disabled={input.installationStatus !== "active" || repositoryIsBusy(repository.repositoryId)} onClick={() => void continueRepository(repository.repositoryId, savedProjectId ? "view" : "connect")}>{savedProjectId ? `查看同步状态 ${repository.fullName}` : `继续接入 ${repository.fullName}`}</button>
                  )}
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
            data-onboarding-primary={primary && selectedRepositories.length === 0 ? "true" : undefined}
            disabled={[...selectionMutationStateByRepositoryId.values()].includes("saving") || [...deselectionMutationStateByRepositoryId.values()].includes("removing")}
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
                    <span>{selectedLabel(repository.id)}</span>
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
                        : `${selectionMutationStateByRepositoryId.get(repository.id) === "failed" ? "重试选择" : "选择"} ${repository.fullName}`}
                    </button>
                  )}
                  {selectionMutationStateByRepositoryId.get(repository.id) === "failed" ? <span role="alert">{repository.fullName} 添加失败，可单独重试。</span> : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
