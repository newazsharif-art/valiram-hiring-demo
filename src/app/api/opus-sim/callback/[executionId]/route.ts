import { NextResponse } from "next/server";
import { db } from "@/server/service";
import { receiveCallback } from "@/server/opus/simulator";
import type { CallbackBody } from "@/server/opus/types";

export const dynamic = "force-dynamic";

/**
 * Simulated Opus callback endpoint (what `callback.url` points at in the demo).
 * Header X-Opus-Callback-Token; body {"output_data": {...}, "status": "success"}.
 * The app normally calls the simulator in-process; this route lets the contract be tried with curl.
 */
export async function POST(req: Request, { params }: { params: Promise<{ executionId: string }> }) {
  const { executionId } = await params;
  let body: CallbackBody;
  try {
    body = (await req.json()) as CallbackBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const d = db();
  const open = d.tasks.find((x) => x.execution_id === executionId && x.status === "open");
  const res = receiveCallback(d, executionId, req.headers.get("x-opus-callback-token"), body);
  if (res.status === 200 && open) {
    open.status = "done";
    open.completed_at = new Date().toISOString();
    open.outcome_label = "Completed via callback";
  }
  return NextResponse.json(res.body, { status: res.status });
}
