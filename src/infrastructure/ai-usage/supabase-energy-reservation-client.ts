import type {
  EnergyReservationPersistence,
  ReserveEnergyInput,
} from "@/application/ai-usage/ai-usage-persistence";
import {
  aiUsageErrorCodes,
  energyReservationStatuses,
  type EnergyReservationReceipt,
} from "@/domain/ai-usage/ai-usage";
import { z } from "zod";

type RpcResult = { readonly data: unknown; readonly error: unknown };
type AuthenticatedRpcClient = {
  rpc(name: string, parameters: Readonly<Record<string, unknown>>): PromiseLike<RpcResult>;
};

const receiptSchema = z.object({
  reservation_id: z.string().uuid(),
  status: z.enum(energyReservationStatuses),
  outcome: z.enum([...energyReservationStatuses, "replayed"]),
  amount: z.number().int().positive(),
  available_after: z.number().int().nonnegative(),
  business_date: z.iso.date().nullable().optional(),
}).strict();

const allowedErrors = new Set<string>([
  ...aiUsageErrorCodes,
  "project_brief_authorization_failed",
]);

function errorMessage(value: unknown): string | null {
  if (
    typeof value === "object"
    && value !== null
    && "message" in value
    && typeof value.message === "string"
  ) return value.message;
  return null;
}

function storageFailure(cause?: unknown): Error {
  return new Error("ai_usage_storage_failed", { cause });
}

function receipt(value: unknown): EnergyReservationReceipt {
  const parsed = receiptSchema.safeParse(value);
  if (!parsed.success) throw storageFailure(parsed.error);
  return {
    reservationId: parsed.data.reservation_id,
    status: parsed.data.status,
    outcome: parsed.data.outcome,
    amount: parsed.data.amount,
    availableAfter: parsed.data.available_after,
    businessDate: parsed.data.business_date ?? null,
  };
}

export class SupabaseEnergyReservationClient implements EnergyReservationPersistence {
  constructor(private readonly client: AuthenticatedRpcClient) {}

  reserve(input: ReserveEnergyInput): Promise<EnergyReservationReceipt> {
    return this.execute("reserve_project_brief_energy", {
      p_project_id: input.projectId,
      p_request_key: input.requestKey,
    });
  }

  consume(reservationId: string): Promise<EnergyReservationReceipt> {
    return this.execute("consume_energy", { p_reservation_id: reservationId });
  }

  release(reservationId: string): Promise<EnergyReservationReceipt> {
    return this.execute("release_energy", { p_reservation_id: reservationId });
  }

  private async execute(
    name: string,
    parameters: Readonly<Record<string, unknown>>,
  ): Promise<EnergyReservationReceipt> {
    let result: RpcResult;
    try {
      result = await this.client.rpc(name, parameters);
    } catch (error) {
      throw storageFailure(error);
    }
    if (result.error) {
      const message = errorMessage(result.error);
      if (message && allowedErrors.has(message)) throw new Error(message);
      throw storageFailure(result.error);
    }
    return receipt(result.data);
  }
}
