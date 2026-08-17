import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const GET = vi.fn(async () => new Response(null, { status: 204 }));
  const POST = vi.fn(async () => new Response(null, { status: 204 }));
  const PUT = vi.fn(async () => new Response(null, { status: 204 }));

  return {
    GET,
    POST,
    PUT,
    serve: vi.fn(() => ({ GET, POST, PUT })),
    createInngestRouteDependencies: vi.fn(() => ({
      client: { id: "synthetic" },
      functions: ["project", "webhook", "daily"],
    })),
  };
});

vi.mock("inngest/next", () => ({ serve: mocks.serve }));
vi.mock("./inngest-route-dependencies", () => ({
  createInngestRouteDependencies: mocks.createInngestRouteDependencies,
}));

describe("/api/inngest", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.GET.mockClear();
    mocks.POST.mockClear();
    mocks.PUT.mockClear();
    mocks.serve.mockClear();
    mocks.createInngestRouteDependencies.mockReset();
    mocks.createInngestRouteDependencies.mockReturnValue({
      client: { id: "synthetic" },
      functions: ["project", "webhook", "daily"],
    });
  });

  it("creates and invokes all production handlers only when a request arrives", async () => {
    const route = await import("./route");
    const request = new NextRequest("https://synthetic.example.test/api/inngest");
    const context = {};

    expect(route.runtime).toBe("nodejs");
    expect(mocks.createInngestRouteDependencies).not.toHaveBeenCalled();
    expect(mocks.serve).not.toHaveBeenCalled();

    await route.GET(request, context);
    await route.POST(request, context);
    await route.PUT(request, context);

    expect(mocks.createInngestRouteDependencies).toHaveBeenCalledTimes(1);
    expect(mocks.serve).toHaveBeenCalledTimes(1);
    expect(mocks.GET).toHaveBeenCalledWith(request, context);
    expect(mocks.POST).toHaveBeenCalledWith(request, context);
    expect(mocks.PUT).toHaveBeenCalledWith(request, context);
  });

  it("defers missing runtime configuration failure until request handling", async () => {
    mocks.createInngestRouteDependencies.mockImplementation(() => {
      throw new Error("inngest_runtime_configuration_missing");
    });

    const route = await import("./route");
    const request = new NextRequest("https://synthetic.example.test/api/inngest");

    expect(mocks.createInngestRouteDependencies).not.toHaveBeenCalled();
    await expect(route.POST(request, {})).rejects.toThrow(
      "inngest_runtime_configuration_missing",
    );
    expect(mocks.serve).not.toHaveBeenCalled();
  });
});
