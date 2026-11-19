import { NextResponse } from "next/server";
import { db } from "@/server/service";
import { getAudit } from "@/server/opus/simulator";

export const dynamic = "force-dynamic";

/** Simulated GET /job/{id}/audit (no timestamps, like the real API). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const audit = getAudit(db(), id);
  if (!audit) return NextResponse.json({ error: "no_such_job" }, { status: 404 });
  return NextResponse.json(audit);
}
