import { NextResponse } from "next/server";
import { currentUser } from "@/server/http";
import { ApiError, getRequisition } from "@/server/service";
import { buildJobPostPdf } from "@/server/pdf";
import { withStore } from "@/server/store";

export const dynamic = "force-dynamic";

/** Job post PDF (demo output of the Opus "Job posting" step). ?download=1 returns it as an attachment. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await currentUser();
  try {
    const r = await withStore(() => getRequisition(u, id));
    if (!r.posting) throw new ApiError(404, "no_posting", "No job posting yet: the JD is not live.");
    const bytes = await buildJobPostPdf(r);
    const download = new URL(req.url).searchParams.get("download") === "1";
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${download ? "attachment" : "inline"}; filename="${r.posting.file_name}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof ApiError) return NextResponse.json({ error: e.code, message: e.message }, { status: e.status });
    throw e;
  }
}
