import type { ProjectBriefRecord } from "@/domain/project-brief/project-brief";

export interface ProjectBriefReader {
  listForProject(projectId: string): Promise<readonly ProjectBriefRecord[]>;
}
