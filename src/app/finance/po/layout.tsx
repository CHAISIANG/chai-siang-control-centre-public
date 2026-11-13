import type { ReactNode } from "react";
import { PoProvider } from "@/components/po";

export default function PoLayout({ children }: { children: ReactNode }) {
  return <PoProvider needs="finance">{children}</PoProvider>;
}
