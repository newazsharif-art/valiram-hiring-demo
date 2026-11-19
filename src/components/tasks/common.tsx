"use client";
import { Alert, AlertTitle } from "@mui/material";
import { NextLink } from "@/components/ui";
import { ApiClientError } from "@/lib/api";

export type SubmitState = { kind: "idle" } | { kind: "busy" } | { kind: "closed" } | { kind: "error"; message: string; field?: string };

export function toSubmitError(e: unknown): SubmitState {
  const err = e as ApiClientError;
  if (err.status === 401) return { kind: "closed" };
  return { kind: "error", message: err.message, field: err.field };
}

/** Callback returned 401: token spent or the run is no longer waiting. */
export function ClosedBanner({ reqId }: { reqId: string }) {
  return (
    <Alert severity="info" role="status" sx={(theme) => ({ bgcolor: "#eceff1", color: "#37474f", ...theme.applyStyles("dark", { bgcolor: "rgba(176,190,197,.12)", color: "#cfd8dc" }) })}>
      <AlertTitle sx={{ fontWeight: 500 }}>This step is already closed in Opus.</AlertTitle>
      Another user completed it, or the Opus job was cancelled. Nothing was sent. <NextLink href={`/requisitions/${reqId}`}>See what happened</NextLink>
    </Alert>
  );
}
