import { RequisitionInputSchema } from "@/domain/schemas";
import { currentUser, handle, readJson } from "@/server/http";
import { createRequisition, listRequisitions } from "@/server/service";

export const dynamic = "force-dynamic";

/** GET ?status=<RequisitionStatus|all>&q=<search>. Hiring managers see only their own. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const u = await currentUser();
  return handle(() =>
    listRequisitions(u, { status: url.searchParams.get("status") ?? undefined, q: url.searchParams.get("q") ?? undefined }),
  );
}

/** Submit a new requisition: creates the REQ and starts Flow 1. */
export async function POST(req: Request) {
  const u = await currentUser();
  return handle(async () => createRequisition(u, RequisitionInputSchema.parse(await readJson(req))), { status: 201 });
}
