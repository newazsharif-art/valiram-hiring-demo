import { currentUser, handle } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await currentUser();
  return handle(() => u);
}
