import { RequisitionInputSchema } from "@/domain/schemas";
import { currentUser, handle, readJson } from "@/server/http";
import { getRequisition, updateDraft } from "@/server/service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const u = await currentUser();
  return handle(() => getRequisition(u, id));
}

/** Update a draft (action "draft") or submit it (action "submit" starts Flow 1). */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const u = await currentUser();
  return handle(async () => updateDraft(u, id, RequisitionInputSchema.parse(await readJson(req))));
}
