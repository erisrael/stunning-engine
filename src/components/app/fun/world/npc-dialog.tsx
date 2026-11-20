"use client";

import * as React from "react";
import { MicIcon, SendIcon, Volume2Icon, VolumeXIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { F } from "../actions";
import type { NpcDef } from "./city";
import type { Personality } from "./npc-brain";
import { answer, greet, listenOnce, options, speakLine, understand, voiceFor, type Memory, type Reply, type TalkCtx, type Topic } from "./npc-talk";

// Talking to someone in town: they greet you (aloud, with subtitles, their mouth moving), you pick a topic, type
// or speak; directions put a marker on your map, tasks go on your list; what was said stays in the conversation.

export type NpcHost = {
  hours: number;
  weather: string;
  player: string;
  speak: (id: string, level: number) => void;
  mark: (m: { x: number; z: number; label: string } | null) => void;
  quest: (id: string, q: NonNullable<Memory["quest"]>) => void;
  act: (act: string, arg?: string) => void;
};

const EMPTY: Memory = { met: 0, relation: 0, topics: [], quest: null, done: 0 };

export function NpcConversation({ def, host, onClose }: { def: NpcDef; host: NpcHost; onClose: () => void }) {
  const [mem, setMem] = React.useState<Memory>(EMPTY);
  const [log, setLog] = React.useState<{ who: "me" | "npc"; text: string }[]>([]);
  const [text, setText] = React.useState("");
  const [voiceOn, setVoiceOn] = React.useState(() => {
    try {
      return localStorage.getItem("town.npcVoice") !== "0";
    } catch {
      return true;
    }
  });
  const [listening, setListening] = React.useState(false);
  const [thinking, setThinking] = React.useState(false);
  const stop = React.useRef<(() => void) | null>(null);
  const personality = (def.personality ?? "friendly") as Personality;
  const voice = React.useMemo(() => voiceFor(personality, !!def.female, def.seed), [personality, def.female, def.seed]);
  const ctx = (m: Memory): TalkCtx => ({ name: def.name, role: def.role || "Town folk", personality, hours: host.hours, weather: host.weather, player: host.player.split(" ")[0] ?? host.player, memory: m, places: [] });
  const scroller = React.useRef<HTMLDivElement>(null);

  const say = React.useCallback(
    (r: Reply) => {
      setLog((l) => [...l, { who: "npc", text: r.text }]);
      stop.current?.();
      if (voiceOn) stop.current = speakLine(r.text, voice, (v) => host.speak(def.id, v), () => host.speak(def.id, 0));
      else {
        // Silent: still move the mouth while the line shows.
        stop.current = speakLine("", voice, (v) => host.speak(def.id, v), () => host.speak(def.id, 0));
        const words = r.text.split(/\s+/).length;
        let i = 0;
        const id = window.setInterval(() => (host.speak(def.id, i % 2 ? 0.15 : 0.7), ++i > words * 2 && (window.clearInterval(id), host.speak(def.id, 0))), 150);
      }
      if (r.mark) host.mark(r.mark);
    },
    [voiceOn, voice, host, def.id],
  );

  // Load what they remember, then say hello.
  React.useEffect(() => {
    let live = true;
    void F.npcMemoryAction(def.id).then((r) => {
      if (!live) return;
      const m = r.ok && r.data ? (r.data as Memory) : EMPTY;
      setMem(m);
      if (m.quest) host.quest(def.id, m.quest);
      say(greet(ctx(m)));
      void F.npcTalkedAction(def.id, { topic: "hello" }).then((x) => x.ok && x.data && setMem(x.data as Memory));
    });
    return () => {
      live = false;
      stop.current?.();
      host.speak(def.id, 0);
    };
  }, [def.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // (A block body: newer browsers return a promise from scrollTo, which must not be the effect's cleanup.)
  React.useEffect(() => {
    void scroller.current?.scrollTo({ top: 1e6 });
  }, [log]);

  const ask = async (topic: Topic, arg = "", shown?: string) => {
    if (shown) setLog((l) => [...l, { who: "me", text: shown }]);
    if (topic === "free") {
      // Something the script does not cover: the town's AI answers for this person when Admin has it on.
      setThinking(true);
      const r = await F.npcAskAction({ name: def.name, role: def.role || "town folk", personality, context: `It is ${Math.floor(host.hours)}:00, the weather is ${host.weather}. You are talking with ${host.player}; you have met ${mem.met} times.`, history: log.slice(-8), text: arg });
      setThinking(false);
      const t = r.ok && typeof r.data === "string" && r.data ? r.data : null;
      say(t ? { text: t } : answer(ctx(mem), "smalltalk"));
      return;
    }
    const r = answer(ctx(mem), topic, arg);
    say(r);
    const saved = await F.npcTalkedAction(def.id, { topic, quest: r.quest ?? null });
    if (saved.ok && saved.data) {
      const m = saved.data as Memory;
      setMem(m);
      if (r.quest && m.quest) (host.quest(def.id, m.quest), toast.info(`New task from ${def.name}: go to ${m.quest.place}.`));
    }
    if (topic === "bye") window.setTimeout(onClose, 1800);
  };
  const submit = () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    const u = understand(t);
    void ask(u.topic, u.arg, t);
  };
  const mic = () => {
    const s = listenOnce(
      (t) => {
        if (!t) return;
        const u = understand(t);
        void ask(u.topic, u.arg, t);
      },
      () => setListening(false),
    );
    if (!s) return void toast.info("This browser cannot listen; type instead.");
    setListening(true);
  };

  return (
    <div className="absolute inset-x-2 bottom-24 z-20 mx-auto flex max-h-[60%] max-w-lg flex-col rounded-xl border-2 border-[#fde68a] bg-[#0f172a]/95 text-sm text-white shadow-xl sm:bottom-16" data-world-npc data-npc-id={def.id}>
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <span className="font-semibold text-[#fde68a]">{def.name}</span>
        <span className="text-xs text-white/60">
          {def.role}
          {def.personality ? ` · ${def.personality}` : ""}
          {mem.met > 1 ? ` · met ${mem.met} times` : ""}
        </span>
        <button
          type="button"
          aria-label={voiceOn ? "Mute their voice" : "Hear their voice"}
          className="ml-auto rounded p-1 hover:bg-white/10"
          onClick={() => {
            const v = !voiceOn;
            setVoiceOn(v);
            try {
              localStorage.setItem("town.npcVoice", v ? "1" : "0");
            } catch {}
            if (!v) window.speechSynthesis?.cancel();
          }}
          data-npc-voice
        >
          {voiceOn ? <Volume2Icon className="size-4" /> : <VolumeXIcon className="size-4" />}
        </button>
        <button type="button" aria-label="Close" onClick={onClose} className="rounded p-1 hover:bg-white/10">
          <XIcon className="size-4" />
        </button>
      </div>
      <div ref={scroller} className="min-h-16 flex-1 space-y-1.5 overflow-y-auto px-3 py-2" data-npc-log>
        {log.map((l, i) => (
          <p key={i} className={l.who === "me" ? "text-right text-[#93c5fd]" : ""} data-npc-line={l.who}>
            {l.who === "npc" ? <span className="mr-1 text-[#fde68a]">{def.name}:</span> : null}
            {l.text}
          </p>
        ))}
        {thinking && <p className="text-white/50">{def.name} is thinking...</p>}
      </div>
      <div className="flex flex-wrap gap-1 px-3 pb-1">
        {options(ctx(mem)).map((o) => (
          <Button key={o.label} size="xs" variant="secondary" onClick={() => void ask(o.topic, o.arg ?? "", o.label)} data-npc-option={o.topic}>
            {o.label}
          </Button>
        ))}
        {def.actions.map((a) => (
          <Button key={a.label} size="xs" onClick={() => host.act(a.act, a.arg)}>
            {a.label}
          </Button>
        ))}
        <Button size="xs" variant="ghost" className="text-white" onClick={() => void ask("bye", "", "Bye")}>
          Bye
        </Button>
      </div>
      <form
        className="flex items-center gap-1 border-t border-white/10 px-2 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Say something to ${def.name}...`} className="h-8 min-w-0 flex-1 rounded-md border border-white/20 bg-white/10 px-2 text-sm outline-none placeholder:text-white/40" data-npc-input />
        <Button type="button" size="icon-xs" variant="secondary" onClick={mic} aria-label="Speak" className={listening ? "animate-pulse" : ""}>
          <MicIcon />
        </Button>
        <Button type="submit" size="icon-xs" aria-label="Send" data-npc-send>
          <SendIcon />
        </Button>
      </form>
    </div>
  );
}
