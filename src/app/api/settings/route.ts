import { z } from "zod";
import { DepartmentSchema, NodeMapSchema, ShortlistRulesSchema, StoreSchema } from "@/domain/schemas";
import { currentUser, handle, readJson } from "@/server/http";
import { getSettings, updateSettings } from "@/server/service";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  stores: z.array(StoreSchema).optional(),
  departments: z.array(DepartmentSchema).optional(),
  rules: ShortlistRulesSchema.optional(),
  node_map: z.array(NodeMapSchema).optional(),
  how_to_apply: z.string().optional(),
});

export async function GET() {
  return handle(() => getSettings());
}

/** HR admin only. */
export async function PUT(req: Request) {
  const u = await currentUser();
  return handle(async () => updateSettings(u, PatchSchema.parse(await readJson(req))));
}
