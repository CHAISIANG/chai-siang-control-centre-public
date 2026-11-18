import type { ReactNode } from "react";
import { HrProvider } from "@/lib/hr/store";
import { HrBar, HrGate } from "@/components/hr/HrBar";

export default function HrLayout({ children }: { children: ReactNode }) {
  return (
    <HrProvider live>
      <HrBar />
      <HrGate>{children}</HrGate>
    </HrProvider>
  );
}
