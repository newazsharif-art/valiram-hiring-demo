import { currentUser, handle } from "@/server/http";
import { getTask } from "@/server/service";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await currentUser();
  return handle(() => getTask(u, id));
}
