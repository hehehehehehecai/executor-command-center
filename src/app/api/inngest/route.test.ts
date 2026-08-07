import { beforeEach, describe, expect, it, vi } from "vitest";
const GET = vi.fn(); const POST = vi.fn(); const PUT = vi.fn();
const serve = vi.fn(() => ({ GET, POST, PUT }));
vi.mock("inngest/next", () => ({ serve }));
vi.mock("./inngest-route-dependencies", () => ({ createInngestRouteDependencies: vi.fn(() => ({ client: { id: "synthetic" }, functions: ["project", "webhook", "daily"] })) }));
describe("/api/inngest", () => {
  beforeEach(() => vi.clearAllMocks());
  it("exports the complete Inngest Next receiving methods and all production functions", async () => { const route = await import("./route"); expect(route.runtime).toBe("nodejs"); expect(route.GET).toBe(GET); expect(route.POST).toBe(POST); expect(route.PUT).toBe(PUT); expect(serve).toHaveBeenCalledWith({ client: { id: "synthetic" }, functions: ["project", "webhook", "daily"] }); });
});
