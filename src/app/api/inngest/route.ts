import { serve } from "inngest/next";
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

export const POST: InngestHandlers["POST"] = async (...args) =>
  getHandlers().POST(...args);

export const PUT: InngestHandlers["PUT"] = async (...args) =>
  getHandlers().PUT(...args);
