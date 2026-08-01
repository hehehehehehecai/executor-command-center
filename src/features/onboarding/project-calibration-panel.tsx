"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import {
  parseProjectCalibrationInput,
  projectStatuses,
  type ProjectCalibrationView,
  type ProjectStatus,
} from "@/domain/project-calibration/project-calibration";

const repositorySchema = z.object({
  id: z.string().uuid(),
  repositoryId: z.number().int().positive(),
  fullName: z.string().min(1),
  visibility: z.enum(["public", "private", "internal"]),
  defaultBranch: z.string().min(1),
}).strict();
const calibrationSchema = z.object({
  id: z.string().uuid(),
  selectedRepositoryId: z.string().uuid(),
  coreGoal: z.string(),
  currentStageGoal: z.string(),
  status: z.enum(projectStatuses),
  currentBlocker: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
}).strict();
const viewSchema = z.object({
  repository: repositorySchema,
  calibration: calibrationSchema.nullable(),
}).strict();
const listSchema = z.object({ projects: z.array(viewSchema) }).strict();
const saveSchema = z.object({ project: viewSchema }).strict();

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
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [selectedId, setSelectedId] = useState("");
  const [coreGoal, setCoreGoal] = useState("");
  const [currentStageGoal, setCurrentStageGoal] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("in_planning");
  const [currentBlocker, setCurrentBlocker] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const loadProjects = useCallback(async () => {
    try {
      const response = await fetch("/api/projects", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("load_failed");
      const parsed = listSchema.safeParse(await response.json());
      if (!parsed.success) throw parsed.error;
      if (!mounted.current) return;
      setLoadState({ kind: "loaded", projects: parsed.data.projects });
      const first = parsed.data.projects[0];
      setSelectedId(first?.repository.id ?? "");
      setCoreGoal(first?.calibration?.coreGoal ?? "");
      setCurrentStageGoal(first?.calibration?.currentStageGoal ?? "");
      setStatus(first?.calibration?.status ?? "in_planning");
      setCurrentBlocker(first?.calibration?.currentBlocker ?? "");
      setSaveState("idle");
    } catch {
      if (mounted.current) setLoadState({ kind: "failed" });
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    queueMicrotask(() => void loadProjects());
    const refresh = () => void loadProjects();
    window.addEventListener("selected-repositories-changed", refresh);
    return () => {
      mounted.current = false;
      window.removeEventListener("selected-repositories-changed", refresh);
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
    setStatus(next.calibration?.status ?? "in_planning");
    setCurrentBlocker(next.calibration?.currentBlocker ?? "");
    setSaveState("idle");
  };

  const save = async () => {
    if (saveState === "saving") return;
    let command;
    try {
      command = parseProjectCalibrationInput({
        selectedRepositoryId: selectedId,
        coreGoal,
        currentStageGoal,
        status,
        currentBlocker: currentBlocker === "" ? null : currentBlocker,
      });
    } catch {
      setSaveState("validation");
      return;
    }
    setSaveState("saving");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
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
      const parsed = saveSchema.safeParse(await response.json());
      if (!parsed.success) throw parsed.error;
      if (!mounted.current) return;
      setLoadState((current) => ({
        kind: "loaded",
        projects:
          current.kind === "loaded"
            ? current.projects.map((entry) =>
                entry.repository.id === parsed.data.project.repository.id
                  ? parsed.data.project
                  : entry,
              )
            : [parsed.data.project],
      }));
      setCoreGoal(parsed.data.project.calibration?.coreGoal ?? "");
      setCurrentStageGoal(parsed.data.project.calibration?.currentStageGoal ?? "");
      setStatus(parsed.data.project.calibration?.status ?? "in_planning");
      setCurrentBlocker(parsed.data.project.calibration?.currentBlocker ?? "");
      setSaveState("success");
    } catch {
      if (mounted.current) setSaveState("failed");
    }
  };

  return (
    <section className="calibration-shell" aria-label="项目校准工作区">
      <p className="section-kicker">Project Calibration</p>
      <h2 id="project-calibration-heading">项目校准</h2>
      {loadState.kind === "loading" ? <p>项目校准正在加载</p> : null}
      {loadState.kind === "failed" ? <p role="alert">项目校准读取失败。</p> : null}
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
          <section aria-label="项目校准" className="calibration-section">
            <h3>用户陈述</h3>
            <label>
              核心目标
              <textarea
                required
                maxLength={2000}
                value={coreGoal}
                onChange={(event) => setCoreGoal(event.target.value)}
              />
            </label>
            <label>
              当前阶段目标
              <textarea
                required
                maxLength={2000}
                value={currentStageGoal}
                onChange={(event) => setCurrentStageGoal(event.target.value)}
              />
            </label>
            <label>
              正式状态
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as ProjectStatus)}
              >
                {projectStatuses.map((value) => (
                  <option key={value} value={value}>{statusLabels[value]}</option>
                ))}
              </select>
            </label>
            <label>
              当前阻碍（可选）
              <textarea
                maxLength={2000}
                value={currentBlocker}
                onChange={(event) => setCurrentBlocker(event.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={saveState === "saving"}
              aria-busy={saveState === "saving"}
              onClick={() => void save()}
            >
              {saveState === "saving" ? "保存中" : "保存项目校准"}
            </button>
            {saveState === "success" ? <p role="status">项目校准已保存</p> : null}
            {saveState === "validation" ? <p role="alert">请检查字段格式和长度。</p> : null}
            {saveState === "conflict" ? <p role="alert">项目校准发生并发冲突，请刷新后重试。</p> : null}
            {saveState === "failed" ? <p role="alert">项目校准保存失败。</p> : null}
          </section>
        </>
      ) : null}
    </section>
  );
}
