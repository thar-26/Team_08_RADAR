import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Poppins } from "next/font/google";
import Footer from "@/components/Footer";
import Masthead from "@/components/Masthead";
import { LangProvider } from "@/lib/i18n";
import "./globals.css";

const head = Poppins({ variable: "--font-head", subsets: ["latin", "latin-ext"], weight: ["500", "600", "700"] });
const sans = Inter({ variable: "--font-sans", subsets: ["latin", "latin-ext"] });
const mono = IBM_Plex_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400"] });

export const metadata: Metadata = {
  title: "Radar · Blue Science Park",
  description: "AI-agenter som förstår Blue Science Parks medlemmar och hittar finansiering, evenemang, testbäddar och partner — med källa på varje påstående.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sv">
      <body className={`${head.variable} ${sans.variable} ${mono.variable}`}>
        <LangProvider>
          <Masthead />
          <main>{children}</main>
          <Footer />
        </LangProvider>
      </body>
    </html>
  );
}
