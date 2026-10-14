import { parseProjectCreation, parseProjectContextId, parseProjectContextPatch, type ProjectContextPatch, type ProjectContextView } from "@/domain/project-calibration/project-context";
import type { ProjectCalibrationSessionReader } from "./project-calibration-use-cases";
export interface ProjectContextWriter {
  create(input: { userId: string; selectedRepositoryId: string }): Promise<ProjectContextView>;
  patch(input: { userId: string; projectId: string; changes: ProjectContextPatch }): Promise<ProjectContextView>;
}
export class ProjectContextUseCases {
  constructor(private readonly dependencies: { sessionReader: ProjectCalibrationSessionReader; writer: ProjectContextWriter }) {}
  private async userId() {
    const id = await this.dependencies.sessionReader.getVerifiedUserId();
    if (!id) throw new Error("project_context_unauthenticated");
    return parseProjectContextId(id);
  }
  async create(input: unknown) {
    const userId = await this.userId();
    return this.dependencies.writer.create({ userId, ...parseProjectCreation(input) });
  }
  async patch(projectId: unknown, input: unknown) {
    const userId = await this.userId();
    return this.dependencies.writer.patch({ userId, projectId: parseProjectContextId(projectId), changes: parseProjectContextPatch(input) });
  }
}
