import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import Masthead from "@/components/Masthead";
import "./globals.css";

const serif = Newsreader({ variable: "--font-serif", subsets: ["latin"], weight: ["400", "500"], style: ["normal", "italic"] });
const sans = IBM_Plex_Sans({ variable: "--font-sans", subsets: ["latin"], weight: ["400", "500", "600"] });
const mono = IBM_Plex_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Radar · Blue Science Park",
  description: "AI agents that understand Blue Science Park members and surface funding, events, testbeds and partners — with a source on every claim.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
        <Masthead />
        <main>{children}</main>
        <footer className="footer">
          <div className="shell spread">
            <span>
              Radar — a prototype built for the BUILD Hackathon 2026 challenge by Blue Science Park. Not an official Blue Science Park service.
            </span>
            <span className="mono">Public sources only · every claim carries its link and retrieval date</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
