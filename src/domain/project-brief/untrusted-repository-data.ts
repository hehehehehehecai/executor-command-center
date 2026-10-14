export class ProjectBriefPromptContractError extends Error {
  readonly name = "ProjectBriefPromptContractError";

  constructor() {
    super("project_brief_prompt_contract_invalid");
  }
}

const forbiddenControlCharacters = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const repositoryInstructionPattern = /(?:ignore|disregard|override).{0,40}(?:previous|system|developer|instruction)|system\s*prompt|developer\s*message|tool\s*(?:call|use|execution)|reveal.{0,30}(?:secret|token|api\s*key)|执行.{0,20}(?:工具|命令|代码|SQL)|忽略.{0,30}(?:指令|提示词)|泄露.{0,20}(?:密钥|令牌|secret)/i;

// Shared verbatim by the prompt and the source-record representation. This
// does not make the result trusted, nor does it sanitize a source's identity.
export function sanitizeUntrustedRepositoryData(value: unknown): unknown {
  if (typeof value === "string") {
    const bytes = new TextEncoder().encode(value);
    if (
      forbiddenControlCharacters.test(value)
      || new TextDecoder("utf-8", { fatal: true }).decode(bytes) !== value
    ) throw new ProjectBriefPromptContractError();
    return repositoryInstructionPattern.test(value)
      ? "[UNTRUSTED_INSTRUCTION_REMOVED]"
      : value;
  }
  if (Array.isArray(value)) return value.map(sanitizeUntrustedRepositoryData);
  if (value !== null && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenControlCharacters.test(key)) throw new ProjectBriefPromptContractError();
      output[key] = sanitizeUntrustedRepositoryData(child);
    }
    return output;
  }
  return value;
}
