import type { ReactNode } from "react";
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";

const head = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--pt-head", weight: ["500", "600", "700", "800"], display: "swap" });
const body = Inter({ subsets: ["latin"], variable: "--pt-body", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--pt-mono", display: "swap" });

export const metadata = { title: "Distributor Portal", description: "Wholesale ordering preview" };

export default function PortalLayout({ children }: { children: ReactNode }) {
  return <div className={`${head.variable} ${body.variable} ${mono.variable}`}>{children}</div>;
}
