import "@/styles/globals.css";
import { Space_Grotesk, IBM_Plex_Sans } from "next/font/google";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

const ibmPlex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex",
});

export const metadata = {
  title: "Square Business AI",
  description: "AI ops copilot for small businesses",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${ibmPlex.variable}`}>
      <body className="min-h-screen bg-sand text-ink">
        {children}
      </body>
    </html>
  );
}
