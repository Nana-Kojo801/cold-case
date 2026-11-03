import type { Metadata, Viewport } from "next";
import { Barlow, Oswald, Special_Elite } from "next/font/google";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const body = Barlow({ variable: "--font-body", weight: ["400", "500", "600"], subsets: ["latin"] });
const oswald = Oswald({ variable: "--font-oswald", weight: ["500", "600", "700"], subsets: ["latin"] });
const typewriter = Special_Elite({ variable: "--font-typewriter", weight: "400", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cold Case: Cross-Examination Trainer",
  description: "A detective game that trains cross-examination. Question lying AI suspects out loud, catch contradictions, and get a debrief.",
};

export const viewport: Viewport = {
  themeColor: "#0d0b09",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark ${body.variable} ${oswald.variable} ${typewriter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
        <Toaster position="top-center" theme="dark" />
      </body>
    </html>
  );
}
