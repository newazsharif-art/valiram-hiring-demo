import { currentUser, handle } from "@/server/http";
import { listTasks } from "@/server/service";

export const dynamic = "force-dynamic";

/** Tasks for the current user. ?status=open|done|all */
export async function GET(req: Request) {
  const u = await currentUser();
  const status = new URL(req.url).searchParams.get("status") ?? "all";
  return handle(() => listTasks(u, status));
}
