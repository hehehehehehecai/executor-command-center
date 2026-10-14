"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import {
  projectStatuses,
  type ProjectCalibrationView,
  type ProjectStatus,
} from "@/domain/project-calibration/project-calibration";
import { hasUnconfirmedProjectBackground, projectCalibrationReadSchema } from "@/domain/project-calibration/project-calibration-read";
import { parseProjectContextPatch, type ProjectContext, type ProjectContextPatch } from "@/domain/project-calibration/project-context";
import { workspaceHref } from "@/shared/workspace-navigation";
import {
  projectCalibrationSavedEvent,
  selectedRepositoriesChangedEvent,
} from "./onboarding-events";

const repositorySchema = z.object({
  id: z.string().uuid(),
  repositoryId: z.number().int().positive(),
  fullName: z.string().min(1),
  visibility: z.enum(["public", "private", "internal"]),
  defaultBranch: z.string().min(1),
}).strict();
const viewSchema = z.object({
  repository: repositorySchema,
  calibration: projectCalibrationReadSchema.nullable(),
}).strict();
const listSchema = z.object({ projects: z.array(viewSchema) }).strict();

type LoadState =
  | { readonly kind: "loading" }
  | { readonly kind: "failed" }
  | { readonly kind: "loaded"; readonly projects: readonly ProjectCalibrationView[] };
type SaveState = "idle" | "saving" | "success" | "validation" | "conflict" | "failed";

const statusLabels: Record<ProjectStatus, string> = {
  in_planning: "规划中",
  in_development: "开发中",
  polishing: "打磨中",
  dormant: "暂缓",
  completed: "已完成",
  archived: "已归档",
};

export function ProjectCalibrationPanel() {
  const mounted = useRef(false);
  const loadGeneration = useRef(0);
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [selectedId, setSelectedId] = useState("");
  const [coreGoal, setCoreGoal] = useState("");
  const [currentStageGoal, setCurrentStageGoal] = useState("");
  const [status, setStatus] = useState<ProjectStatus | "">("");
  const [currentBlocker, setCurrentBlocker] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const editedFields = useRef(new Set<keyof ProjectContext>());
  const saving = useRef(false);

  const loadProjects = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setLoadState({ kind: "loading" });
    try {
      const response = await fetch("/api/projects", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("load_failed");
      const parsed = listSchema.safeParse(await response.json());
      if (!parsed.success) throw parsed.error;
      if (!mounted.current || loadGeneration.current !== generation) return;
      setLoadState({ kind: "loaded", projects: parsed.data.projects });
      const first = parsed.data.projects[0];
      setSelectedId(first?.repository.id ?? "");
      setCoreGoal(first?.calibration?.coreGoal ?? "");
      setCurrentStageGoal(first?.calibration?.currentStageGoal ?? "");
      setStatus(first?.calibration?.status ?? "");
      setCurrentBlocker(first?.calibration?.currentBlocker ?? "");
      editedFields.current.clear();
      setSaveState("idle");
    } catch {
      if (mounted.current && loadGeneration.current === generation) {
        setLoadState({ kind: "failed" });
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    queueMicrotask(() => void loadProjects());
    const refresh = () => void loadProjects();
    window.addEventListener(selectedRepositoriesChangedEvent, refresh);
    return () => {
      mounted.current = false;
      loadGeneration.current += 1;
      window.removeEventListener(selectedRepositoriesChangedEvent, refresh);
    };
  }, [loadProjects]);

  const selectedProject = useMemo(
    () =>
      loadState.kind === "loaded"
        ? loadState.projects.find((entry) => entry.repository.id === selectedId)
        : undefined,
    [loadState, selectedId],
  );

  const chooseProject = (id: string) => {
    if (loadState.kind !== "loaded" || saveState === "saving") return;
    const next = loadState.projects.find((entry) => entry.repository.id === id);
    if (!next) return;
    setSelectedId(id);
    setCoreGoal(next.calibration?.coreGoal ?? "");
    setCurrentStageGoal(next.calibration?.currentStageGoal ?? "");
    setStatus(next.calibration?.status ?? "");
    setCurrentBlocker(next.calibration?.currentBlocker ?? "");
    editedFields.current.clear();
    setSaveState("idle");
  };

  const save = async () => {
    const project = selectedProject?.calibration;
    if (saving.current || !project) return;
    let command: ProjectContextPatch;
    try {
      const values: ProjectContext = { coreGoal: coreGoal.trim() || null, currentStageGoal: currentStageGoal.trim() || null, status: status || null, currentBlocker: currentBlocker.trim() || null };
      const patch = Object.fromEntries([...editedFields.current].filter(field => values[field] !== project[field]).map(field => [field, values[field]]));
      if (Object.keys(patch).length === 0) return;
      command = parseProjectContextPatch(patch);
    } catch {
      setSaveState("validation");
      return;
    }
    const generation = loadGeneration.current;
    saving.current = true;
    setSaveState("saving");
    try {
      const response = await fetch(`/api/projects/${project.id}/context`, {
        method: "PATCH",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(command),
      });
      if (response.status === 409) {
        setSaveState("conflict");
        return;
      }
      if (response.status === 400) {
        setSaveState("validation");
        return;
      }
      if (!response.ok) throw new Error("save_failed");
      await response.arrayBuffer();
      const readback = await fetch("/api/projects", { cache: "no-store", credentials: "same-origin" });
      if (!readback.ok) throw new Error("readback_failed");
      const parsed = listSchema.safeParse(await readback.json());
      if (!parsed.success) throw parsed.error;
      const saved = parsed.data.projects.find(entry => entry.repository.id === selectedId && entry.calibration?.id === project.id)?.calibration;
      if (!saved || Object.entries(command).some(([field, value]) => saved[field as keyof ProjectContext] !== value)) throw new Error("readback_mismatch");
      if (!mounted.current || generation !== loadGeneration.current) return;
      setLoadState({ kind: "loaded", projects: parsed.data.projects });
      setCoreGoal(saved.coreGoal ?? "");
      setCurrentStageGoal(saved.currentStageGoal ?? "");
      setStatus(saved.status ?? "");
      setCurrentBlocker(saved.currentBlocker ?? "");
      editedFields.current.clear();
      setSaveState("success");
      window.dispatchEvent(new Event(projectCalibrationSavedEvent));
    } catch {
      if (mounted.current && generation === loadGeneration.current) setSaveState("failed");
    } finally {
      saving.current = false;
    }
  };

  return (
    <section className="calibration-shell" aria-label="项目背景工作区">
      <p className="section-kicker">项目背景</p>
      <h2 id="project-calibration-heading">补充项目背景</h2>
      {loadState.kind === "loading" ? <p>项目背景正在加载</p> : null}
      {loadState.kind === "failed" ? <p role="alert">项目背景读取失败。</p> : null}
      {loadState.kind === "loaded" && loadState.projects.length === 0 ? (
        <p>请先选择一个 GitHub 仓库。</p>
      ) : null}
      {selectedProject ? (
        <>
          <section aria-label="仓库事实" className="calibration-section">
            <h3>仓库事实</h3>
            <label>
              已选择仓库
              <select
                value={selectedId}
                disabled={saveState === "saving"}
                onChange={(event) => chooseProject(event.target.value)}
              >
                {loadState.kind === "loaded"
                  ? loadState.projects.map((entry) => (
                      <option key={entry.repository.id} value={entry.repository.id}>
                        {entry.repository.fullName}
                      </option>
                    ))
                  : null}
              </select>
            </label>
            <dl>
              <div><dt>可见性</dt><dd>{selectedProject.repository.visibility}</dd></div>
              <div><dt>默认分支</dt><dd>{selectedProject.repository.defaultBranch}</dd></div>
            </dl>
          </section>
          <section aria-label="项目背景" className="calibration-section">
            <h3>用户陈述</h3>
            <p>背景资料可稍后补充；仓库事实不会自动成为你的目标或项目状态。</p>
            {selectedProject.calibration ? (
              <p data-testid="project-stable-id">
                Project ID: {selectedProject.calibration.id}
              </p>
            ) : null}
            {selectedProject.calibration && hasUnconfirmedProjectBackground(selectedProject.calibration) ? <p>已添加 · 背景未确认</p> : null}
            <label>
              核心目标
              <textarea
                maxLength={2000}
                disabled={saveState === "saving"}
                value={coreGoal}
                onChange={(event) => { editedFields.current.add("coreGoal"); setSaveState("idle"); setCoreGoal(event.target.value); }}
              />
            </label>
            <details key={selectedId}>
              <summary>按需补充阶段目标、状态与阻碍</summary>
            <label>
              当前阶段目标
              <textarea
                maxLength={2000}
                disabled={saveState === "saving"}
                value={currentStageGoal}
                onChange={(event) => { editedFields.current.add("currentStageGoal"); setSaveState("idle"); setCurrentStageGoal(event.target.value); }}
              />
            </label>
            <label>
              正式状态
              <select
                value={status}
                disabled={saveState === "saving"}
                onChange={(event) => {
                  const next = event.target.value;
                  if (next === "" || projectStatuses.some(value => value === next)) { editedFields.current.add("status"); setSaveState("idle"); setStatus(next as ProjectStatus | ""); }
                }}
              >
                <option value="">未确认</option>
                {projectStatuses.map((value) => (
                  <option key={value} value={value}>{statusLabels[value]}</option>
                ))}
              </select>
            </label>
            <label>
              当前阻碍（可选）
              <textarea
                maxLength={2000}
                disabled={saveState === "saving"}
                value={currentBlocker}
                onChange={(event) => { editedFields.current.add("currentBlocker"); setSaveState("idle"); setCurrentBlocker(event.target.value); }}
              />
            </label>
            </details>
            <button
              type="button"
              disabled={saveState === "saving" || !selectedProject.calibration}
              aria-busy={saveState === "saving"}
              onClick={() => void save()}
            >
              {saveState === "saving" ? "保存中" : "保存项目背景"}
            </button>
            {selectedProject.calibration ? <Link prefetch={false} href={workspaceHref("project-galaxy", { projectId: selectedProject.calibration.id, mode: "connected" })}>稍后补充并进入项目</Link> : <p>请先完成仓库接入，再补充项目背景。</p>}
            {saveState === "success" ? <p role="status">项目背景已保存</p> : null}
            {saveState === "validation" ? <p role="alert">请检查字段格式和长度。</p> : null}
            {saveState === "conflict" ? <p role="alert">项目背景发生并发冲突，请刷新后重试。</p> : null}
            {saveState === "failed" ? <p role="alert">项目背景保存或回读失败。</p> : null}
          </section>
        </>
      ) : null}
    </section>
  );
}
