import { describe, expect, it, vi } from "vitest";

import { SupabaseEnergyReservationClient } from "./supabase-energy-reservation-client";

const projectId = "11111111-1111-4111-8111-111111111111";
const reservationId = "22222222-2222-4222-8222-222222222222";

describe("SupabaseEnergyReservationClient", () => {
  it("uses only authenticated narrow RPCs for reserve, consume and release", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { reservation_id: reservationId, status: "reserved", outcome: "reserved", amount: 3, available_after: 7, business_date: "2026-08-24" }, error: null })
      .mockResolvedValueOnce({ data: { reservation_id: reservationId, status: "consumed", outcome: "consumed", amount: 3, available_after: 2 }, error: null })
      .mockResolvedValueOnce({ data: { reservation_id: reservationId, status: "released", outcome: "released", amount: 3, available_after: 5 }, error: null });
    const client = new SupabaseEnergyReservationClient({ rpc });

    await expect(client.reserve({
      projectId,
      requestKey: "brief:fixture:1",
    })).resolves.toMatchObject({ status: "reserved", amount: 3, businessDate: "2026-08-24" });
    await expect(client.consume(reservationId)).resolves.toMatchObject({ status: "consumed" });
    await expect(client.release(reservationId)).resolves.toMatchObject({ status: "released" });

    expect(rpc.mock.calls).toEqual([
      ["reserve_project_brief_energy", { p_project_id: projectId, p_request_key: "brief:fixture:1" }],
      ["consume_energy", { p_reservation_id: reservationId }],
      ["release_energy", { p_reservation_id: reservationId }],
    ]);
  });

  it("preserves only allow-listed stable database errors", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "energy_insufficient_balance", details: "sensitive", hint: "sensitive" },
    });
    const client = new SupabaseEnergyReservationClient({ rpc });

    await expect(client.reserve({
      projectId,
      requestKey: "brief:fixture:2",
    })).rejects.toThrow("energy_insufficient_balance");
  });

  it("preserves the shared Installation revocation error", async () => {
    const client = new SupabaseEnergyReservationClient({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "project_brief_authorization_failed", details: "private" },
      }),
    });
    await expect(client.reserve({ projectId, requestKey: "brief:fixture:revoked" }))
      .rejects.toThrow("project_brief_authorization_failed");
  });

  it("maps unknown failures to a non-sensitive storage error", async () => {
    const client = new SupabaseEnergyReservationClient({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "raw_database_detail" } }),
    });

    await expect(client.consume(reservationId)).rejects.toThrow("ai_usage_storage_failed");
  });
});
