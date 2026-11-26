import type { Metadata, Viewport } from "next";
import { Abyssinica_SIL, Atkinson_Hyperlegible, Bangers, Bebas_Neue, Comic_Neue, Fredoka, Geist_Mono, Rajdhani, VT323, IBM_Plex_Sans, Inter, Lora, Manrope, Noto_Sans_Ethiopic, Nunito, Plus_Jakarta_Sans, Roboto, Source_Sans_3 } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { VersionWatch } from "@/components/app/version-watch";
import { GlobalProgress } from "@/components/app/global-progress";
import * as React from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";
import "./ui-styles.css";
import "./motion.css";
import "./glass.css";
import "./toasts.css";
import { appearanceScript } from "@/lib/appearance-script";
import { ErrorReporter } from "@/components/app/error-reporter";
import { AndroidBridge } from "@/components/app/android-bridge";

const sans = Plus_Jakarta_Sans({ variable: "--font-app", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Every weight (variable font), so bold Amharic is drawn bold rather than faked.
const ethiopic = Noto_Sans_Ethiopic({ variable: "--font-ethiopic", subsets: ["ethiopic"] });
// Fonts a person can choose (account menu); not preloaded, so only the chosen one is downloaded.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], preload: false });
const readable = Atkinson_Hyperlegible({ variable: "--font-readable", subsets: ["latin"], weight: ["400", "700"], preload: false });
const rounded = Nunito({ variable: "--font-rounded", subsets: ["latin"], preload: false });
const serif = Lora({ variable: "--font-serif", subsets: ["latin"], preload: false });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], preload: false });
const plex = IBM_Plex_Sans({ variable: "--font-plex", subsets: ["latin"], preload: false });
const source = Source_Sans_3({ variable: "--font-source", subsets: ["latin"], preload: false });
const roboto = Roboto({ variable: "--font-roboto", subsets: ["latin"], preload: false });
const abyssinica = Abyssinica_SIL({ variable: "--font-abyssinica", subsets: ["ethiopic", "latin"], weight: "400", preload: false });
// The UI styles' own fonts (src/app/ui-styles.css); downloaded only when a style uses them.
const vt323 = VT323({ variable: "--font-vt323", subsets: ["latin"], weight: "400", preload: false });
const bangers = Bangers({ variable: "--font-bangers", subsets: ["latin"], weight: "400", preload: false });
const comic = Comic_Neue({ variable: "--font-comic", subsets: ["latin"], weight: ["400", "700"], preload: false });
const rajdhani = Rajdhani({ variable: "--font-rajdhani", subsets: ["latin"], weight: ["500", "600", "700"], preload: false });
const fredoka = Fredoka({ variable: "--font-fredoka", subsets: ["latin"], preload: false });
const bebas = Bebas_Neue({ variable: "--font-bebas", subsets: ["latin"], weight: "400", preload: false });
const FONT_VARS = [sans, mono, ethiopic, inter, readable, rounded, serif, manrope, plex, source, roboto, abyssinica, vt323, bangers, comic, rajdhani, fredoka, bebas].map((f) => f.variable).join(" ");

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
    // iPhone and iPad need a PNG for the home screen (180 px, Apple's size).
    icons: { icon, apple: [{ url: `/api/branding/app-icon?size=180&v=${id?.version ?? "0"}`, sizes: "180x180", type: "image/png" }], shortcut: icon },
    appleWebApp: { capable: true, title: id?.shortName ?? "Myseed", statusBarStyle: "default" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // An app, not a document: the page always fits the screen, so pinch zoom is off (text size is under Settings).
  maximumScale: 1,
  userScalable: false,
  // The keyboard makes the page shorter (Chrome on Android), so a message box stays above it.
  interactiveWidget: "resizes-content",
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1e1f21" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The colour theme Admin set for everyone who has not chosen one (Settings, Workspace).
  const ws = await import("@/server/settings").then((m) => m.getSettings()).then((s) => s.workspace).catch(() => null);
  const preset = ws?.themePreset ?? "";
  return (
    <html lang="en" suppressHydrationWarning className={`${FONT_VARS} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: appearanceScript(preset, { style: ws?.uiStyle ?? "", allowed: ws?.uiStyles ?? [], motion: ws?.motionDefault, cinematic: ws?.cinematicAllowed !== false, iconPack: ws?.iconPack }) }} />
      </head>
      <body className="min-h-full">
        <ErrorReporter />
        {/* A bar and a Loading card the moment a page or a change is on its way (components/app/global-progress). */}
        <React.Suspense fallback={null}>
          <GlobalProgress />
        </React.Suspense>
        <VersionWatch />
        <AndroidBridge />
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <TooltipProvider delayDuration={250}>
            {children}
            {/* At the top, in the person's UI style (toasts.css), clear of the status bar and the notch. */}
            <Toaster position="top-center" closeButton offset={{ top: 16 }} mobileOffset={{ top: "calc(env(safe-area-inset-top) + 10px)", left: 12, right: 12 }} />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
