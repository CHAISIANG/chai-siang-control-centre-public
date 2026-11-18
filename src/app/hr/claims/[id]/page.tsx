"use client";
import { useParams } from "next/navigation";
import { ClaimDetail } from "@/components/claims/ClaimDetail";

export default function ClaimPage() {
  const { id } = useParams<{ id: string }>();
  return <ClaimDetail id={id} />;
}
