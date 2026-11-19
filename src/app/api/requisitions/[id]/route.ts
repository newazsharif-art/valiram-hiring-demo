import { currentUser, handle } from "@/server/http";
import { getRequisition } from "@/server/service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const u = await currentUser();
  return handle(() => getRequisition(u, id));
}

