import type { ReactNode } from "react";
import { ClaimsBar, ClaimsView } from "@/components/claims/ui";

export default function ClaimsLayout({ children }: { children: ReactNode }) {
  return (
    <ClaimsView live>
      <ClaimsBar />
      {children}
    </ClaimsView>
  );
}
