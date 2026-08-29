import { serve } from "inngest/next";
import { safeHttpErrorResponse } from "@/shared/security/safe-http-error";
import { createInngestRouteDependencies } from "./inngest-route-dependencies";

export const runtime = "nodejs";

type InngestHandlers = ReturnType<typeof serve>;

let handlers: InngestHandlers | undefined;

function getHandlers(): InngestHandlers {
  if (!handlers) {
    const { client, functions } = createInngestRouteDependencies(process.env);
    handlers = serve({ client, functions });
  }

  return handlers;
}

export const GET: InngestHandlers["GET"] = async (...args) =>
  getHandlers().GET(...args);

export const POST: InngestHandlers["POST"] = async (...args) => {
  if (!args[0].headers.get("x-inngest-signature")?.trim()) {
    return safeHttpErrorResponse({
      error: { code: "inngest_signature_required" },
      allowedCodes: ["inngest_signature_required"],
      fallbackCode: "inngest_signature_required",
      statusByCode: { inngest_signature_required: 401 },
    });
  }

  return getHandlers().POST(...args);
};

export const PUT: InngestHandlers["PUT"] = async (...args) =>
  getHandlers().PUT(...args);
