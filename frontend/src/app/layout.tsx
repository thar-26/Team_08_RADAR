import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import Footer from "@/components/Footer";
import Masthead from "@/components/Masthead";
import Providers from "@/components/Providers";
import { RoleProvider } from "@/components/RoleGate";
import { LangProvider } from "@/lib/i18n";
import "./globals.css";

const roboto = Roboto({ variable: "--font-roboto", subsets: ["latin", "latin-ext"], weight: ["400", "500", "700", "900"] });

export const metadata: Metadata = {
  title: "Radar · för Blue Science Parks medlemmar",
  description: "AI-agenter som förstår Blue Science Parks medlemmar och hittar finansiering, evenemang, testbäddar och partner, med källa på varje påstående.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // Browser translation (e.g. Chrome Translate) rewrites lang/class on <html>
    // before React loads; tolerate that on this one element only.
    <html lang="sv" suppressHydrationWarning>
      <body className={roboto.variable}>
        <Providers>
        <LangProvider>
        <RoleProvider>
          <a className="skip" href="#main">Hoppa till innehållet / Skip to content</a>
          <Masthead />
          <main id="main">{children}</main>
          <Footer />
        </RoleProvider>
        </LangProvider>
        </Providers>
      </body>
    </html>
  );
}
