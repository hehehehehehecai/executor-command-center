// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createUseCases: vi.fn(),
  deselectExecute: vi.fn(),
}));

vi.mock("../repository-selection-route-dependencies", () => ({
  createRepositorySelectionUseCases: mocks.createUseCases,
}));

import { DELETE, dynamic } from "./route";

describe("DELETE /api/github/repository-selections/{repositoryId}", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("APP_ORIGIN", "https://executor.example.test");
    mocks.deselectExecute.mockResolvedValue(undefined);
    mocks.createUseCases.mockResolvedValue({
      list: { execute: vi.fn() },
      select: { execute: vi.fn() },
      deselect: { execute: mocks.deselectExecute },
    });
  });

  it("is dynamic and returns a truly empty 204", async () => {
    const response = await DELETE(
      new Request(
        "https://executor.example.test/api/github/repository-selections/9600001",
        {
          method: "DELETE",
          headers: { origin: "https://executor.example.test" },
        },
      ),
      { params: Promise.resolve({ repositoryId: "9600001" }) },
    );

    expect(dynamic).toBe("force-dynamic");
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(mocks.deselectExecute).toHaveBeenCalledWith({
      repositoryId: 9_600_001,
    });
  });

  it("rejects Origin before route parameter work or dependency construction", async () => {
    let paramsRead = false;
    const response = await DELETE(
      new Request(
        "https://executor.example.test/api/github/repository-selections/invalid",
        {
          method: "DELETE",
          headers: { origin: "https://evil.example.test" },
        },
      ),
      {
        params: {
          then() {
            paramsRead = true;
            throw new Error("params must not be read");
          },
        } as never,
      },
    );

    expect(response.status).toBe(403);
    expect(paramsRead).toBe(false);
    expect(mocks.createUseCases).not.toHaveBeenCalled();
    expect(mocks.deselectExecute).not.toHaveBeenCalled();
  });

  it("rejects an invalid route parameter before dependency construction", async () => {
    const response = await DELETE(
      deleteRequest(),
      { params: Promise.resolve({ repositoryId: "01" }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.createUseCases).not.toHaveBeenCalled();
  });
});

function deleteRequest() {
  return new Request(
    "https://executor.example.test/api/github/repository-selections/01",
    {
      method: "DELETE",
      headers: { origin: "https://executor.example.test" },
    },
  );
}
