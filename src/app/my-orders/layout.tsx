import type { ReactNode } from "react";
import { PoProvider } from "@/components/po";

export default function MyOrdersLayout({ children }: { children: ReactNode }) {
  return <PoProvider needs="mine">{children}</PoProvider>;
}
