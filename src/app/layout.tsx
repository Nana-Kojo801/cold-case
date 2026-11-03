import type { Metadata, Viewport } from "next";
import { Geist, Special_Elite } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const typewriter = Special_Elite({
  variable: "--font-typewriter",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cold Case: Cross-Examination Trainer",
  description: "A detective game that trains cross-examination. Question lying AI suspects out loud, catch contradictions, and get a debrief.",
};

export const viewport: Viewport = {
  themeColor: "#1a1714",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark ${geistSans.variable} ${typewriter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster position="top-center" theme="dark" />
      </body>
    </html>
  );
}
