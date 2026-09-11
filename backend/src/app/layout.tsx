import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Research Room — backend",
  description: "API + agent runtime for the Research Room browser extension.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
