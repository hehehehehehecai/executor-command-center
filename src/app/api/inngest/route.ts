import { serve } from "inngest/next";
import { createInngestRouteDependencies } from "./inngest-route-dependencies";
export const runtime = "nodejs";
const { client, functions } = createInngestRouteDependencies(process.env);
const handlers = serve({ client, functions });
export const GET = handlers.GET;
export const POST = handlers.POST;
export const PUT = handlers.PUT;
