import type { ReactNode } from "react";
import { ArShell } from "@/components/ar";

export default function ArLayout({ children }: { children: ReactNode }) {
  return <ArShell>{children}</ArShell>;
}
