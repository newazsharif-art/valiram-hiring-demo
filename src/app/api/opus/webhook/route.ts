import { NextResponse } from "next/server";
import { dataMode } from "@/server/app/callbackSender";

export const dynamic = "force-dynamic";

/**
 * Real Opus Off-Platform webhook receiver: integration point, not active in the demo.
 * To wire it (DATA_MODE=opus):
 *  1. Verify the shared header (OPUS_WEBHOOK_SECRET).
 *  2. Validate the payload (execution_id, workflow_id, inputs.task_type, callback, expected_output_schema).
 *  3. Store everything (Opus never resends), then call receiveOffPlatformTask() from src/server/app/webhook.ts.
 *  4. Return 200 within 15 s.
 * In the demo, the Opus simulator delivers tasks in-process instead.
 */
export async function POST() {
  if (dataMode() === "mock") {
    return NextResponse.json(
      { error: "not_enabled", message: "DATA_MODE=mock: the Opus simulator delivers Off-Platform tasks in-process." },
      { status: 501 },
    );
  }
  return NextResponse.json({ error: "not_implemented", message: "Real Opus webhook handling is not built yet." }, { status: 501 });
}
