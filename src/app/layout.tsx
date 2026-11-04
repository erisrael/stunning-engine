import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Geist_Mono, Inter, Lora, Noto_Sans_Ethiopic, Nunito, Plus_Jakarta_Sans } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";
import { APPEARANCE_SCRIPT } from "@/components/app/appearance";
import { ErrorReporter } from "@/components/app/error-reporter";

const sans = Plus_Jakarta_Sans({ variable: "--font-app", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const ethiopic = Noto_Sans_Ethiopic({ variable: "--font-ethiopic", subsets: ["ethiopic"], weight: ["400", "500", "600"] });
// Fonts a person can choose (account menu); not preloaded, so only the chosen one is downloaded.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], preload: false });
const readable = Atkinson_Hyperlegible({ variable: "--font-readable", subsets: ["latin"], weight: ["400", "700"], preload: false });
const rounded = Nunito({ variable: "--font-rounded", subsets: ["latin"], preload: false });
const serif = Lora({ variable: "--font-serif", subsets: ["latin"], preload: false });

// The name, tagline and favicon Admin set (Branding, Name and logo).
export async function generateMetadata(): Promise<Metadata> {
  const { identity, fullName } = await import("@/server/identity");
  const id = await identity().catch(() => null);
  const name = id ? fullName(id) : "Myseed Content Manager";
  const icon = `/api/branding/favicon?v=${id?.version ?? "0"}`;
  return {
    title: { default: name, template: `%s - ${name}` },
    description: "Production workflow for educational content: recording, editing, uploading and publication.",
    applicationName: name,
    // Installable app (Add to Home Screen), needed for push notifications on iPhone and iPad.
    manifest: "/manifest.webmanifest",
    icons: { icon, apple: icon, shortcut: icon },
    appleWebApp: { capable: true, title: id?.shortName ?? "Myseed", statusBarStyle: "default" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The keyboard makes the page shorter (Chrome on Android), so a message box stays above it.
  interactiveWidget: "resizes-content",
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1e1f21" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable} ${ethiopic.variable} ${inter.variable} ${readable.variable} ${rounded.variable} ${serif.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <ErrorReporter />
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <TooltipProvider delayDuration={250}>
            {children}
            <Toaster position="bottom-right" richColors closeButton />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
