import { z } from "zod";
import { handle, readJson } from "@/server/http";
import { ApiError, demoAdvance, demoCloseScreening, demoReset, demoSetPrecheck, demoState } from "@/server/service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ action: string }> };

/** GET /api/demo/state */
export async function GET(_req: Request, { params }: Ctx) {
  const { action } = await params;
  return handle(() => {
    if (action !== "state") throw new ApiError(404, "not_found", "Unknown demo action");
    return demoState();
  });
}

/** Presenter actions: reset | precheck {mode} | close-screening {requisitionId} | advance {requisitionId} */
export async function POST(req: Request, { params }: Ctx) {
  const { action } = await params;
  return handle(async () => {
    switch (action) {
      case "reset":
        return demoReset();
      case "precheck":
        return demoSetPrecheck(z.object({ mode: z.enum(["auto", "pass", "fail"]) }).parse(await readJson(req)).mode);
      case "close-screening":
        return demoCloseScreening(z.object({ requisitionId: z.string() }).parse(await readJson(req)).requisitionId);
      case "advance":
        return demoAdvance(z.object({ requisitionId: z.string() }).parse(await readJson(req)).requisitionId);
      default:
        throw new ApiError(404, "not_found", "Unknown demo action");
    }
  });
}
