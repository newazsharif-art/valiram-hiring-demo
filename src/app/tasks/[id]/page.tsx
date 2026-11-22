"use client";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useApi } from "@/components/SessionProvider";
import { ErrorNote, Loading } from "@/components/ui";
import { HrVerifyTask } from "@/components/tasks/HrVerifyTask";
import { HmReviseTask } from "@/components/tasks/HmReviseTask";
import { OpusReviseTask } from "@/components/tasks/OpusReviseTask";
import { OpusHrReviewTask } from "@/components/tasks/OpusHrReviewTask";
import { ShortlistReviewTask } from "@/components/tasks/ShortlistReviewTask";

/** The task type picks the screen: HR verification, HM revise (variant), or Shortlist review. */
export default function TaskPage() {
  const { id } = useParams<{ id: string }>();
  const res = useApi(() => api.tasks.get(id), [id]);
  if (res.error) return <ErrorNote error={res.error} />;
  if (!res.data) return <Loading />;
  const { task, requisition, candidates } = res.data;
  const reload = () => res.reload();
  switch (task.task_type) {
    case "HR_JD_CHECK":
      // HR final check from the real Opus webhook carries a form prefill (spec 03 §8).
      return task.inputs.prefill ? (
        <OpusHrReviewTask key={task.id} task={task} requisition={requisition} onChanged={reload} />
      ) : (
        <HrVerifyTask key={task.id} task={task} requisition={requisition} onChanged={reload} />
      );
    case "HM_JD_REVISE":
      // Tasks from the real Opus webhook carry a form prefill (spec 02 §8); simulator tasks keep the JD-only screen.
      return task.inputs.prefill ? (
        <OpusReviseTask key={task.id} task={task} requisition={requisition} onChanged={reload} />
      ) : (
        <HmReviseTask key={task.id} task={task} requisition={requisition} onChanged={reload} />
      );
    default:
      return <ShortlistReviewTask key={task.id} task={task} requisition={requisition} candidates={candidates} onChanged={reload} />;
  }
}
