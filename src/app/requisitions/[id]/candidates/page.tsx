"use client";
import { useParams } from "next/navigation";
import { CandidatesView } from "@/components/CandidatesView";

export default function RequisitionCandidatesPage() {
  const { id } = useParams<{ id: string }>();
  return <CandidatesView reqId={id} />;
}
