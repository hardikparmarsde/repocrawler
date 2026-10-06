import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RepoCrawler — Contribute to any open-source project in 10 minutes",
  description:
    "Paste any GitHub repo. Get a personalized contributor onboarding path — matched issues, codebase map, active reviewers, project conventions.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
