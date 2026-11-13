import type { ReactNode } from "react";
import { FinanceProvider } from "@/components/finance";

export default function FinanceLayout({ children }: { children: ReactNode }) {
  return <FinanceProvider>{children}</FinanceProvider>;
}
