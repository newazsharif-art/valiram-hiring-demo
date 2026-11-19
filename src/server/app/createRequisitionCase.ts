/**
 * App side of the Opus "Create Requisition" workflow (spec 01-OpusIntegration-CreateRequisition).
 * On submit, the app creates an Opus case (initiate + execute) with the requisition's form values.
 * Any failure becomes an ApiError with a plain-language message, and the caller saves nothing.
 */
import "server-only";
import type { Requisition, User } from "@/domain/types";
import { executeCase, initiateCase, OpusApiError, type OpusPayload, type OpusPayloadValue } from "../opus/caseClient";
import { ApiError } from "../service";

type InputType = OpusPayloadValue["type"];

/** Opus input ID → front-end label, Opus type and value. A workflow change only touches this list. */
export const CREATE_REQUISITION_INPUTS: { id: string; label: string; type: InputType; value: (r: Requisition) => string | number }[] = [
  { id: "workflow_input_78r0ypse6", label: "Department", type: "str", value: (r) => r.department },
  { id: "workflow_input_edauqmje5", label: "Role", type: "str", value: (r) => r.role },
  { id: "workflow_input_c2boa99wg", label: "Store", type: "str", value: (r) => r.store },
  { id: "workflow_input_pqsxw3kio", label: "Region", type: "str", value: (r) => r.region },
  { id: "workflow_input_kqinwjdml", label: "Employment type", type: "str", value: (r) => r.employment_type },
  { id: "workflow_input_0xzhza9py", label: "Openings", type: "float", value: (r) => r.openings },
  { id: "workflow_input_128uhde7w", label: "Target Start Date", type: "date", value: (r) => r.target_start },
  { id: "workflow_input_y7mukgkh9", label: "Base salary from", type: "float", value: (r) => r.base_min },
  { id: "workflow_input_al1kdjqqd", label: "Base salary to", type: "float", value: (r) => r.base_max },
  { id: "workflow_input_xl67jxp25", label: "About the role", type: "str", value: (r) => r.jd_sections.about },
  { id: "workflow_input_virmywhg8", label: "What you will do", type: "str", value: (r) => r.jd_sections.duties.join("\n") },
  { id: "workflow_input_31tedhzgn", label: "What we look for", type: "str", value: (r) => r.jd_sections.requirements.join("\n") },
  { id: "workflow_input_s3qdueq3e", label: "Benefits", type: "str", value: (r) => r.jd_sections.benefits },
  { id: "workflow_input_caakchhja", label: "Shift pattern", type: "str", value: (r) => r.jd_sections.shift_pattern ?? "" },
];

export function buildPayload(r: Requisition): OpusPayload {
  const payload: OpusPayload = {};
  for (const i of CREATE_REQUISITION_INPUTS) payload[i.id] = { value: i.value(r), type: i.type, displayName: i.label };
  return payload;
}

type Config = { enabled: false } | { enabled: true; workflowId: string };

function config(): Config {
  const key = process.env.OPUS_SERVICE_KEY?.trim();
  const workflowId = process.env.OPUS_CREATE_REQUISITION_WORKFLOW_ID?.trim();
  if (!key && !workflowId) return { enabled: false };
  if (!key || !workflowId) {
    console.error("[opus] Create Requisition: OPUS_SERVICE_KEY and OPUS_CREATE_REQUISITION_WORKFLOW_ID must both be set.");
    throw userError("opus_not_configured");
  }
  return { enabled: true, workflowId };
}

const MESSAGES = {
  opus_unavailable:
    "We couldn't reach Opus to start the hiring workflow, so the requisition wasn't submitted. Please try again in a few minutes.",
  opus_timeout: "Opus took too long to respond, so the requisition wasn't submitted. Please try again.",
  opus_auth:
    "The app couldn't sign in to Opus, so the requisition wasn't submitted. Please contact your system administrator.",
  opus_workflow_not_found:
    "The hiring workflow couldn't be found in Opus, so the requisition wasn't submitted. Please contact your system administrator.",
  opus_rejected:
    "Opus didn't accept the requisition details, so it wasn't submitted. Please check the form and try again, or contact your system administrator.",
  opus_not_configured:
    "The Opus connection isn't set up, so the requisition wasn't submitted. Please contact your system administrator.",
} as const;

type Code = keyof typeof MESSAGES;

function userError(code: Code): ApiError {
  return new ApiError(code === "opus_timeout" ? 504 : 502, code, MESSAGES[code]);
}

function codeFor(e: OpusApiError): Code {
  if (e.kind === "timeout") return "opus_timeout";
  if (e.kind === "rejected") return "opus_rejected";
  if (e.kind === "http" && e.httpStatus !== undefined) {
    if (e.httpStatus === 401 || e.httpStatus === 403) return "opus_auth";
    if (e.httpStatus >= 400 && e.httpStatus < 500) {
      // Initiate only sends the workflow ID, so a 4xx there means the workflow is wrong or inactive.
      return e.step === "initiate" ? "opus_workflow_not_found" : "opus_rejected";
    }
  }
  return "opus_unavailable"; // network error, 5xx, unreadable response
}

/**
 * Creates and executes the Opus case for a requisition that is about to be submitted.
 * Returns the case (or null when the integration is off). Throws ApiError on any failure;
 * nothing has been written to the store at that point.
 */
export async function startCreateRequisitionCase(r: Requisition, actor: User): Promise<{ caseId: string; workflowId: string } | null> {
  const cfg = config();
  if (!cfg.enabled) {
    console.info(`[opus] Create Requisition integration is off (no env vars); ${r.id} submitted without an Opus case.`);
    return null;
  }

  let caseId: string | undefined;
  try {
    caseId = await initiateCase({
      workflowId: cfg.workflowId,
      title: `${r.id} · ${r.role} · ${r.store}`,
      description: `Requisition ${r.id} submitted by ${actor.name}`,
    });
    await executeCase(caseId, buildPayload(r));
    return { caseId, workflowId: cfg.workflowId };
  } catch (e) {
    if (!(e instanceof OpusApiError)) {
      console.error(`[opus] Create Requisition ${r.id}: unexpected error`, e);
      throw userError("opus_unavailable");
    }
    console.error(
      `[opus] Create Requisition ${r.id}: ${e.step} failed (${e.kind}${e.httpStatus ? `, HTTP ${e.httpStatus}` : ""}): ${e.message}` +
        (e.body ? ` | body: ${e.body}` : "") +
        (caseId ? ` | orphaned unexecuted caseId: ${caseId}` : ""),
    );
    throw userError(codeFor(e));
  }
}
