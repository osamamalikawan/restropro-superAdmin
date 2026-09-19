import type { Metadata } from "next";
import { Fraunces, Public_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
});
const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-public-sans",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "Restro Pro — Super Admin",
  description: "Platform console for Restro Pro.",
};

export const viewport = {
  themeColor: "#161310",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the saved theme before first paint — avoids a flash of the wrong theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem("rp_theme");
                  document.documentElement.setAttribute("data-theme", saved === "light" ? "light" : "dark");
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className={`${fraunces.variable} ${publicSans.variable} ${plexMono.variable} font-body`}>
        {children}
      </body>
    </html>
  );
}
