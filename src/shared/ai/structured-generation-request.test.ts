import { describe, expect, it } from "vitest";
import {
  createStructuredGenerationRequest,
  StructuredGenerationRequestError,
  structuredGenerationMaxOutputTokens,
  structuredGenerationSchemaNameMaxLength,
} from "./structured-generation-request";

const validInput = {
  systemPrompt: "  synthetic system instruction  ",
  userPrompt: "\nsynthetic user request\t",
  schemaName: " project_brief.contract-v1 ",
  maxOutputTokens: 512,
};

describe("StructuredGenerationRequest", () => {
  it("normalizes the reviewed request fields and attaches its explicit version", () => {
    expect(createStructuredGenerationRequest(validInput)).toEqual({
      contractVersion: "structured-generation-request.v1",
      systemPrompt: "synthetic system instruction",
      userPrompt: "synthetic user request",
      schemaName: "project_brief.contract-v1",
      maxOutputTokens: 512,
    });
  });

  it.each([
    ["empty system prompt", "", "system_prompt_required"],
    ["blank system prompt", " \n\t ", "system_prompt_required"],
  ] as const)("rejects %s", (_caseName, systemPrompt, expectedCode) => {
    expect(() => createStructuredGenerationRequest({
      ...validInput,
      systemPrompt,
    })).toThrow(expect.objectContaining({ code: expectedCode }));
  });

  it.each([
    ["empty user prompt", "", "user_prompt_required"],
    ["blank user prompt", " \n\t ", "user_prompt_required"],
  ] as const)("rejects %s", (_caseName, userPrompt, expectedCode) => {
    expect(() => createStructuredGenerationRequest({
      ...validInput,
      userPrompt,
    })).toThrow(expect.objectContaining({ code: expectedCode }));
  });

  it.each([
    ["empty schema name", ""],
    ["schema name beginning with a digit", "1project_brief"],
    ["schema name containing whitespace", "project brief"],
    ["schema name containing non-ASCII characters", "项目简报"],
    [
      "schema name exceeding the frozen limit",
      `a${"b".repeat(structuredGenerationSchemaNameMaxLength)}`,
    ],
  ] as const)("rejects %s", (_caseName, schemaName) => {
    expect(() => createStructuredGenerationRequest({
      ...validInput,
      schemaName,
    })).toThrow(expect.objectContaining({ code: "schema_name_invalid" }));
  });

  it.each([
    ["non-integer token limit", 1.5],
    ["zero token limit", 0],
    ["negative token limit", -1],
    ["non-finite token limit", Number.POSITIVE_INFINITY],
    ["token limit above the frozen maximum", structuredGenerationMaxOutputTokens + 1],
  ] as const)("rejects %s", (_caseName, maxOutputTokens) => {
    expect(() => createStructuredGenerationRequest({
      ...validInput,
      maxOutputTokens,
    })).toThrow(expect.objectContaining({ code: "max_output_tokens_invalid" }));
  });

  it("accepts the exact maxOutputTokens upper boundary", () => {
    expect(createStructuredGenerationRequest({
      ...validInput,
      maxOutputTokens: structuredGenerationMaxOutputTokens,
    }).maxOutputTokens).toBe(32_768);
  });

  it("returns only a stable code when invalid prompt input contains a secret marker", () => {
    const secret = "synthetic-api-key-never-echo";
    const error = (() => {
      try {
        createStructuredGenerationRequest({
          ...validInput,
          systemPrompt: " ",
          userPrompt: secret,
          apiKey: secret,
        });
      } catch (caught) {
        return caught;
      }
      throw new Error("expected request validation to fail");
    })();

    expect({
      isTyped: error instanceof StructuredGenerationRequestError,
      serialized: JSON.stringify(error),
      message: error instanceof Error ? error.message : String(error),
    }).toEqual({
      isTyped: true,
      serialized: '{"code":"system_prompt_required","name":"StructuredGenerationRequestError"}',
      message: "system_prompt_required",
    });
  });
});
