export const aiUsageContract = "ai-usage.v1" as const;

export const aiInvocationStatuses = ["pending", "completed", "failed"] as const;
export type AiInvocationStatus = (typeof aiInvocationStatuses)[number];

export const energyReservationStatuses = ["reserved", "consumed", "released"] as const;
export type EnergyReservationStatus = (typeof energyReservationStatuses)[number];

export const aiUsageErrorCodes = [
  "energy_unauthenticated",
  "energy_invalid_request",
  "energy_project_forbidden",
  "energy_insufficient_balance",
  "energy_idempotency_conflict",
  "energy_reservation_not_found",
  "energy_invalid_state",
] as const;
export type AiUsageErrorCode = (typeof aiUsageErrorCodes)[number];

export interface EnergyReservationReceipt {
  readonly reservationId: string;
  readonly status: EnergyReservationStatus;
  readonly outcome: EnergyReservationStatus | "replayed";
  readonly amount: number;
  readonly availableAfter: number;
  readonly businessDate: string | null;
}

export function isAiInvocationTransitionAllowed(
  current: AiInvocationStatus,
  target: AiInvocationStatus,
): boolean {
  return current === target || (
    current === "pending" && (target === "completed" || target === "failed")
  );
}

export function isEnergyReservationTransitionAllowed(
  current: EnergyReservationStatus,
  target: EnergyReservationStatus,
): boolean {
  return current === target || (
    current === "reserved" && (target === "consumed" || target === "released")
  );
}
