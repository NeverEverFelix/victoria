import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Victoria — Your financial companion",
  description: "A financial companion that helps you turn everyday restraint into recorded savings."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
