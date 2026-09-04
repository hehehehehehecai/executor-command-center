import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("project Freshness production boundary", () => {
  it("has a production page at the registered /project-galaxy route", () => {
    expect(() => readFileSync(resolve(root, "src/app/project-galaxy/page.tsx"), "utf8")).not.toThrow();
  });

  it("never imports demo data or service-role configuration into the real route", () => {
    const page = readFileSync(resolve(root, "src/app/project-galaxy/page.tsx"), "utf8");
    const reader = readFileSync(resolve(root, "src/infrastructure/synchronization/supabase-project-freshness-reader.ts"), "utf8");
    expect(`${page}\n${reader}`).not.toMatch(/commandDeckPreviewFixture|demo-data|SERVICE_ROLE|serviceRole/i);
  });

  it("keeps the database ownership policies that back the session-scoped reader", () => {
    const projects = readFileSync(resolve(root, "supabase/migrations/20260801091000_create_project_calibration.sql"), "utf8");
    const runs = readFileSync(resolve(root, "supabase/migrations/20260805190000_create_sync_runs.sql"), "utf8");
    expect(projects).toContain("create policy projects_select_own");
    expect(runs).toContain("create policy sync_runs_select_own");
    expect(runs).toContain("grant select on table public.sync_runs to authenticated");
  });
});
