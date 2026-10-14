import { installationManagementRoute } from "../installation-management-route";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => installationManagementRoute(request, "current");
export const POST = GET;
export const PATCH = GET;
export const PUT = GET;
export const DELETE = GET;
export const OPTIONS = GET;
export const HEAD = GET;
