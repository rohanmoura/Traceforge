import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TraceForge | Webhook observability",
  description:
    "Inspect webhook deliveries, trace failures, and recover automatically.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
