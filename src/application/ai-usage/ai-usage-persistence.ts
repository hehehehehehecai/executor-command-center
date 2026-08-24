import type { EnergyReservationReceipt } from "@/domain/ai-usage/ai-usage";

export interface ReserveEnergyInput {
  readonly projectId: string;
  readonly requestKey: string;
}

export interface EnergyReservationPersistence {
  reserve(input: ReserveEnergyInput): Promise<EnergyReservationReceipt>;
  consume(reservationId: string): Promise<EnergyReservationReceipt>;
  release(reservationId: string): Promise<EnergyReservationReceipt>;
}
