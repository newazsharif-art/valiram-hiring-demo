import { CompleteTaskBodySchema } from "@/domain/schemas";
import { currentUser, handle, readJson } from "@/server/http";
import { completeTask } from "@/server/service";

export const dynamic = "force-dynamic";

/**
 * Body: { "output_data": { ...bare values... } }
 * The app backend sends the Off-Platform callback with the token it stored (never sent to the browser).
 * 401 = task closed (token spent or run not waiting) · 422 = undeclared output field or wrapped value.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await currentUser();
  return handle(async () => {
    const body = CompleteTaskBodySchema.parse(await readJson(req));
    return completeTask(u, id, body.output_data);
  });
}
