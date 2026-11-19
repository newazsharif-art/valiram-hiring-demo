import { currentUser, handle } from "@/server/http";
import { copyRequisition } from "@/server/service";

export const dynamic = "force-dynamic";

/** "Copy to new requisition": creates a prefilled Draft; submitting it starts a fresh Flow 1 with 3 rounds. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await currentUser();
  return handle(() => copyRequisition(u, id), { status: 201 });
}
