import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import Footer from "@/components/Footer";
import Masthead from "@/components/Masthead";
import { LangProvider } from "@/lib/i18n";
import "./globals.css";

const roboto = Roboto({ variable: "--font-roboto", subsets: ["latin", "latin-ext"], weight: ["400", "500", "700", "900"] });

export const metadata: Metadata = {
  title: "Radar · för Blue Science Parks medlemmar",
  description: "AI-agenter som förstår Blue Science Parks medlemmar och hittar finansiering, evenemang, testbäddar och partner — med källa på varje påstående.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sv">
      <body className={roboto.variable}>
        <LangProvider>
          <a className="skip" href="#main">Hoppa till innehållet / Skip to content</a>
          <Masthead />
          <main id="main">{children}</main>
          <Footer />
        </LangProvider>
      </body>
    </html>
  );
}
