"use client";

import * as React from "react";
import dynamic from "next/dynamic";

// Parts of the app shell that are not needed to show the page: they load in their own files after the page is up, so
// the first visit downloads and runs less (the assistant alone is a large part of the shell).
// The assistant: Alt+A or the top-bar button pressed before it has loaded is remembered and replayed once it is ready.
let assistantReady = false;
let assistantToggles = 0;
const AssistantLoaded = dynamic(
  () =>
    import("./assistant").then((m) => {
      function Loaded(props: React.ComponentProps<typeof m.Assistant>) {
        React.useEffect(() => {
          assistantReady = true;
          if (assistantToggles % 2 === 1) window.dispatchEvent(new Event("myseed:assistant"));
          assistantToggles = 0;
        }, []);
        return <m.Assistant {...props} />;
      }
      return Loaded;
    }),
  { ssr: false },
);
function EarlyAssistantKeys() {
  React.useEffect(() => {
    const onToggle = () => void (!assistantReady && assistantToggles++);
    const onKey = (e: KeyboardEvent) => {
      if (assistantReady || !e.altKey || e.ctrlKey || e.metaKey || e.code !== "KeyA") return;
      e.preventDefault();
      assistantToggles++;
    };
    window.addEventListener("myseed:assistant", onToggle);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("myseed:assistant", onToggle);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  return null;
}
export function Assistant(props: React.ComponentProps<typeof AssistantLoaded>) {
  return (
    <>
      <EarlyAssistantKeys />
      <AssistantLoaded {...props} />
    </>
  );
}
export const AskAnywhere = dynamic(() => import("./ask-anywhere").then((m) => m.AskAnywhere), { ssr: false });
export const TerminalAmbient = dynamic(() => import("./terminal-ambient").then((m) => m.TerminalAmbient), { ssr: false });
export const EthiopianDatePicker = dynamic(() => import("./ethiopian-picker").then((m) => m.EthiopianDatePicker), { ssr: false });
export const FunMode = dynamic(() => import("./fun/fun-mode").then((m) => m.FunMode), { ssr: false });
export const GetStarted = dynamic(() => import("./get-started").then((m) => m.GetStarted), { ssr: false });
