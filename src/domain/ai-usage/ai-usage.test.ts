import { describe, expect, it } from "vitest";

import {
  aiInvocationStatuses,
  aiUsageErrorCodes,
  energyReservationStatuses,
  isAiInvocationTransitionAllowed,
  isEnergyReservationTransitionAllowed,
} from "./ai-usage";

describe("ai-usage.v1", () => {
  it("allows only pending invocation terminalization and terminal replay", () => {
    expect(aiInvocationStatuses).toEqual(["pending", "completed", "failed"]);
    expect(isAiInvocationTransitionAllowed("pending", "completed")).toBe(true);
    expect(isAiInvocationTransitionAllowed("pending", "failed")).toBe(true);
    expect(isAiInvocationTransitionAllowed("completed", "completed")).toBe(true);
    expect(isAiInvocationTransitionAllowed("completed", "pending")).toBe(false);
    expect(isAiInvocationTransitionAllowed("failed", "completed")).toBe(false);
  });

  it("allows reservation terminalization but never terminal switching", () => {
    expect(energyReservationStatuses).toEqual(["reserved", "consumed", "released"]);
    expect(isEnergyReservationTransitionAllowed("reserved", "consumed")).toBe(true);
    expect(isEnergyReservationTransitionAllowed("reserved", "released")).toBe(true);
    expect(isEnergyReservationTransitionAllowed("consumed", "consumed")).toBe(true);
    expect(isEnergyReservationTransitionAllowed("consumed", "released")).toBe(false);
    expect(isEnergyReservationTransitionAllowed("released", "consumed")).toBe(false);
  });

  it("publishes stable persistence failure codes without provider concerns", () => {
    expect(aiUsageErrorCodes).toEqual([
      "energy_unauthenticated",
      "energy_invalid_request",
      "energy_project_forbidden",
      "energy_insufficient_balance",
      "energy_idempotency_conflict",
      "energy_reservation_not_found",
      "energy_invalid_state",
    ]);
  });
});
