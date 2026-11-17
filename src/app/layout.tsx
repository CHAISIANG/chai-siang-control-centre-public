import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Sans_Condensed } from "next/font/google";
import "./globals.css";
import Shell from "@/components/Shell";

// Plex Sans for reading, Plex Sans Condensed for big figures: a ledger-like, businesslike pair with even-width numbers.
const body = IBM_Plex_Sans({ variable: "--nf-body", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const display = IBM_Plex_Sans_Condensed({ variable: "--nf-display", subsets: ["latin"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: "Chai Siang Control Centre",
  description: "Company dashboard for Chai Siang Sdn Bhd",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${body.variable} ${display.variable} h-full antialiased`}>
      <head>
        {/* Apply the saved theme before first paint to avoid a flash. */}
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem("cssb-theme")==="dark")document.documentElement.classList.add("dark")}catch(e){}` }} />
      </head>
      <body className="min-h-full"><Shell>{children}</Shell></body>
    </html>
  );
}
