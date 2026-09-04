import {
  parseProjectCalibrationInput,
  type ProjectCalibrationCommand,
  type ProjectCalibrationView,
} from "@/domain/project-calibration/project-calibration";

export interface ProjectCalibrationSessionReader {
  getVerifiedUserId(): Promise<string | null>;
}

export interface ProjectCalibrationReader {
  listOwn(): Promise<readonly ProjectCalibrationView[]>;
}

export interface ProjectCalibrationWriter {
  save(input: {
    readonly userId: string;
    readonly command: ProjectCalibrationCommand;
  }): Promise<ProjectCalibrationView>;
}

async function verifiedUserId(reader: ProjectCalibrationSessionReader) {
  const userId = await reader.getVerifiedUserId();
  if (!userId) throw new Error("project_calibration_unauthenticated");
  return userId;
}

export class ListProjectCalibrations {
  constructor(
    private readonly dependencies: {
      readonly sessionReader: ProjectCalibrationSessionReader;
      readonly reader: ProjectCalibrationReader;
    },
  ) {}

  async execute(): Promise<readonly ProjectCalibrationView[]> {
    await verifiedUserId(this.dependencies.sessionReader);
    return this.dependencies.reader.listOwn();
  }
}

export class SaveProjectCalibration {
  constructor(
    private readonly dependencies: {
      readonly sessionReader: ProjectCalibrationSessionReader;
      readonly writer: ProjectCalibrationWriter;
    },
  ) {}

  async execute(input: unknown): Promise<ProjectCalibrationView> {
    const userId = await verifiedUserId(this.dependencies.sessionReader);
    const command = parseProjectCalibrationInput(input);
    try {
      return await this.dependencies.writer.save({ userId, command });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "project_calibration_selected_repository_wrong_user"
      ) {
        throw new Error("project_calibration_selected_repository_not_found");
      }
      throw error;
    }
  }
}
