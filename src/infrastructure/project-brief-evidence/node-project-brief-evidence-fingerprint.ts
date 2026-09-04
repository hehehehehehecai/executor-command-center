import "server-only";

import { createHash } from "node:crypto";
import type { ProjectBriefEvidenceFingerprint } from "@/application/project-brief-evidence/project-brief-evidence-ports";

export class NodeProjectBriefEvidenceFingerprint
implements ProjectBriefEvidenceFingerprint {
  async sha256Utf8(canonicalPayload: string): Promise<string> {
    return createHash("sha256").update(canonicalPayload, "utf8").digest("hex");
  }
}
