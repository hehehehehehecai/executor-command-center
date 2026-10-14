"use client";
import Link from "next/link";
import { useState } from "react";
import type { WorkspaceProject } from "@/application/workspace/load-workspace-context";

export function OnboardingProjectEntry({ projects }: { readonly projects: readonly WorkspaceProject[] }) {
  const [selectedId, setSelectedId] = useState(projects.length === 1 ? projects[0].id : "");
  const selected = projects.length === 1 ? projects[0] : projects.find(project => project.id === selectedId);
  return <section aria-label="进入已有项目" className="onboarding-project-entry">
    <h2>{projects.length === 1 ? "继续进入项目" : "选择要进入的项目"}</h2>
    <p>项目背景可以稍后确认，现在即可进入工作区。</p>
    {projects.length === 1 ? <p>{projects[0].name}</p> : <label>
      选择要进入的项目
      <select value={selectedId} onChange={event => setSelectedId(event.target.value)}>
        <option value="">请选择项目</option>
        {projects.map((project, index) => <option key={project.id} value={project.id}>{project.name}{projects.filter(item => item.name === project.name).length > 1 ? `（第 ${index + 1} 个）` : ""}</option>)}
      </select>
    </label>}
    {selected ? <Link prefetch={false} data-onboarding-primary="true" href={`/project-galaxy?mode=connected&project=${selected.id}`}>进入项目</Link> : <button type="button" disabled data-onboarding-primary="true">进入项目</button>}
  </section>;
}
