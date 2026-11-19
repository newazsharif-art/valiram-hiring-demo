/**
 * App side: Off-Platform webhook receiver logic.
 * In the demo the simulator calls this directly. In the real build,
 * src/app/api/opus/webhook/route.ts verifies the shared header, then calls this,
 * and must answer 200 within 15 s (Opus never resends).
 */
import "server-only";
import type { TaskRecord } from "@/domain/types";
import type { Db } from "../store";
import { nowIso } from "../store";
import type { OffPlatformPayload } from "../opus/types";

export function receiveOffPlatformTask(db: Db, p: OffPlatformPayload): TaskRecord {
  const req = db.requisitions.find(
    (r) => r.opus_job_ids.flow1 === p.execution_id || r.opus_job_ids.flow1b === p.execution_id,
  );
  if (!req) throw new Error(`No requisition for execution ${p.execution_id}`);
  const users = db.settings.users;
  const hr = users.find((u) => u.id === req.hr_assignee) ?? users.find((u) => u.role === "HR_RECRUITER")!;
  const hm = users.find((u) => u.id === req.hm_user)!;
  const type = p.inputs.task_type;
  const assignee = type === "HM_JD_REVISE" ? hm : hr;
  if (type !== "HM_JD_REVISE" && !req.hr_assignee) {
    req.hr_assignee = hr.id;
    req.hr_name = hr.name;
  }
  const title =
    type === "HR_JD_CHECK"
      ? `Verify JD · ${req.role}`
      : type === "HM_JD_REVISE"
        ? `Revise JD · ${req.role}`
        : "Select candidates · 70–89% band";
  db.seq.task += 1;
  const task: TaskRecord = {
    id: `T-${String(db.seq.task).padStart(4, "0")}`,
    task_type: type,
    execution_id: p.execution_id,
    workflow_id: p.workflow_id,
    workflow_name: p.workflow_name,
    node_id: p.node_id,
    requisition_id: req.id,
    title,
    round: typeof p.inputs.round === "number" ? p.inputs.round : undefined,
    assignee: assignee.id,
    assignee_name: assignee.name,
    status: "open",
    created_at: nowIso(),
    reminders: [],
    inputs: p.inputs,
    expected_output_schema: p.expected_output_schema,
    callback: p.callback, // token stays server-side
  };
  db.tasks.push(task);
  return task;
}
