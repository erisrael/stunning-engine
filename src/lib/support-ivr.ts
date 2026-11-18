// The IVR (Update 1.2, Phase 9): a call flow is a graph of nodes. Each node has outputs ("ports") that lead to other
// nodes. Shared by the builder (in the browser) and the engine (on the server), so both validate the same way.

export type IvrLang = "en" | "am";
export type IvrText = { en?: string; am?: string };

export type IvrNodeType =
  | "welcome"
  | "language"
  | "audio"
  | "tts"
  | "dtmf"
  | "menu"
  | "department"
  | "queue"
  | "agent"
  | "hours"
  | "holiday"
  | "condition"
  | "identify"
  | "payment"
  | "repeat"
  | "transfer"
  | "voicemail"
  | "callback"
  | "end";

export type IvrOption = { key: string; label: IvrText; lang?: IvrLang; category?: string };

export type IvrNode = {
  id: string;
  type: IvrNodeType;
  x: number;
  y: number;
  name?: string;
  text?: IvrText;
  audioUrl?: string | null;
  options?: IvrOption[];
  // Where each output leads: port name to node id.
  next: Record<string, string | null>;
  config?: Record<string, unknown>;
};

export type IvrGraph = {
  start: string | null;
  nodes: IvrNode[];
  settings: {
    timeoutSec: number;
    maxRetries: number;
    invalid: IvrText;
    noInput: IvrText;
    announcement: { on: boolean; text: IvrText };
  };
};

export const IVR_NODE_LABELS: Record<IvrNodeType, string> = {
  welcome: "Welcome message",
  language: "Language selection",
  audio: "Audio playback",
  tts: "Text-to-speech",
  dtmf: "Keypad input",
  menu: "Menu",
  department: "Department routing",
  queue: "Queue entry",
  agent: "Agent routing",
  hours: "Business hours check",
  holiday: "Holiday check",
  condition: "Condition",
  identify: "Customer identification",
  payment: "Payment verification routing",
  repeat: "Repeat menu",
  transfer: "Transfer",
  voicemail: "Voicemail",
  callback: "Call-back request",
  end: "End call",
};

export const IVR_NODE_HELP: Record<IvrNodeType, string> = {
  welcome: "Says or plays a greeting, then goes on.",
  language: "Asks the caller to choose a language. Each option sets the language for the rest of the call.",
  audio: "Plays a recording (a link to an audio file). The text shows on screen and is spoken if there is no file.",
  tts: "Speaks a text in the caller's language.",
  dtmf: "Collects digits from the keypad (for example an account number) into a named value.",
  menu: "Offers numbered choices. Each choice leads somewhere. A wrong key or no key is repeated up to the retry limit.",
  department: "Sends the caller to the first active queue of a department.",
  queue: "Puts the caller in a queue to talk to an agent. If the queue is closed or full, the \"full\" output is used.",
  agent: "Rings one agent. If they are not available, the \"unavailable\" output is used.",
  hours: "Checks the time in Addis Ababa against opening days and hours.",
  holiday: "Checks today against the workspace's public holidays and any dates listed here.",
  condition: "Branches on something known about the caller.",
  identify: "Knows the caller when they are signed in through the app, or by a phone number typed on the keypad.",
  payment: "Looks up the caller's recent Chapa payments by phone or email: paid, failed or none.",
  repeat: "Goes back to the last menu.",
  transfer: "Hands the caller to a queue or an agent.",
  voicemail: "Lets the caller leave a voice message on the conversation.",
  callback: "Asks for a phone number to call the caller back.",
  end: "Says goodbye and ends the call.",
};

// Outputs of each node type (menus and language selection also have one output per option).
export const IVR_PORTS: Record<IvrNodeType, string[]> = {
  welcome: ["next"],
  language: ["fail"],
  audio: ["next"],
  tts: ["next"],
  dtmf: ["next", "fail"],
  menu: ["fail"],
  department: ["full"],
  queue: ["full"],
  agent: ["unavailable"],
  hours: ["open", "closed"],
  holiday: ["holiday", "normal"],
  condition: ["yes", "no"],
  identify: ["known", "unknown"],
  payment: ["paid", "failed", "none"],
  repeat: [],
  transfer: ["full"],
  voicemail: [],
  callback: [],
  end: [],
};

export const PORT_LABELS: Record<string, string> = {
  next: "Then",
  fail: "Too many wrong keys",
  full: "Closed or full",
  unavailable: "Not available",
  open: "Open",
  closed: "Closed",
  holiday: "Holiday",
  normal: "Normal day",
  yes: "Yes",
  no: "No",
  known: "Known",
  unknown: "Not known",
  paid: "Paid",
  failed: "Failed",
  none: "No payment",
};

// Nodes that wait for the caller to press a key.
export const INPUT_NODES: IvrNodeType[] = ["language", "menu", "dtmf"];
// Nodes that end the IVR part of a call (the caller is routed, leaves a message, asks for a call-back or hangs up).
export const TERMINAL_NODES: IvrNodeType[] = ["queue", "agent", "department", "transfer", "voicemail", "callback", "end"];
// Ports a terminal node may leave unconnected (the engine then ends the call politely).
const OPTIONAL_PORTS = new Set(["full", "unavailable", "fail"]);

export const CONDITION_FIELDS = [
  { key: "verified", label: "Signed in through the app" },
  { key: "lang", label: "Language is" },
  { key: "category", label: "Topic is" },
  { key: "has_open_ticket", label: "Has an open conversation" },
  { key: "has_open_request", label: "Has an open support request" },
  { key: "tag", label: "Has the tag" },
  { key: "var", label: "Typed value equals" },
] as const;

export const portsOf = (n: IvrNode) => [...(n.type === "menu" || n.type === "language" ? (n.options ?? []).map((o) => `opt:${o.key}`) : []), ...IVR_PORTS[n.type]];

export const textOf = (t: IvrText | undefined, lang: IvrLang) => (t?.[lang] || t?.en || t?.am || "").trim();

export type IvrIssue = { nodeId: string | null; message: string };

// Checks a flow before it can be published: errors stop publishing, warnings do not.
export function validateIvr(g: IvrGraph): { errors: IvrIssue[]; warnings: IvrIssue[] } {
  const errors: IvrIssue[] = [];
  const warnings: IvrIssue[] = [];
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  if (!g.nodes.length) errors.push({ nodeId: null, message: "Add at least one node." });
  if (!g.start || !byId.has(g.start)) errors.push({ nodeId: null, message: "Choose the node the call starts at." });
  if (byId.size !== g.nodes.length) errors.push({ nodeId: null, message: "Two nodes share an id." });
  const name = (n: IvrNode) => n.name || IVR_NODE_LABELS[n.type];
  for (const n of g.nodes) {
    for (const p of portsOf(n)) {
      const to = n.next[p] ?? null;
      if (to && !byId.has(to)) errors.push({ nodeId: n.id, message: `${name(n)}: an output leads to a node that was removed.` });
      if (!to && !OPTIONAL_PORTS.has(p) && !TERMINAL_NODES.includes(n.type)) errors.push({ nodeId: n.id, message: `${name(n)}: connect "${p.startsWith("opt:") ? `key ${p.slice(4)}` : (PORT_LABELS[p] ?? p)}".` });
    }
    if (["welcome", "tts", "menu", "language", "dtmf"].includes(n.type) && !textOf(n.text, "en") && !n.audioUrl) errors.push({ nodeId: n.id, message: `${name(n)}: write what is said.` });
    if (n.type === "audio" && !n.audioUrl && !textOf(n.text, "en")) errors.push({ nodeId: n.id, message: `${name(n)}: give a recording link or a text.` });
    if (n.audioUrl && !/^(https:\/\/|\/api\/)/.test(n.audioUrl)) errors.push({ nodeId: n.id, message: `${name(n)}: a recording link starts with https://.` });
    if (n.type === "menu" || n.type === "language") {
      const keys = (n.options ?? []).map((o) => o.key);
      if (!keys.length) errors.push({ nodeId: n.id, message: `${name(n)}: add at least one choice.` });
      if (new Set(keys).size !== keys.length) errors.push({ nodeId: n.id, message: `${name(n)}: two choices use the same key.` });
      if (keys.some((k) => !/^[0-9*#]$/.test(k))) errors.push({ nodeId: n.id, message: `${name(n)}: each choice is one key, 0 to 9, * or #.` });
      if (n.type === "language" && (n.options ?? []).some((o) => o.lang !== "en" && o.lang !== "am")) errors.push({ nodeId: n.id, message: `${name(n)}: each choice sets English or Amharic.` });
    }
    const c = n.config ?? {};
    if (n.type === "queue" && !c.queueId && !c.category) errors.push({ nodeId: n.id, message: `${name(n)}: choose a queue or a topic.` });
    if (n.type === "department" && !c.department) errors.push({ nodeId: n.id, message: `${name(n)}: choose a department.` });
    if (n.type === "agent" && !c.agentId) errors.push({ nodeId: n.id, message: `${name(n)}: choose an agent.` });
    if (n.type === "transfer" && !c.queueId && !c.agentId) errors.push({ nodeId: n.id, message: `${name(n)}: choose a queue or an agent.` });
    if (n.type === "dtmf" && !/^[a-z][a-z0-9_]{0,30}$/.test(String(c.variable ?? ""))) errors.push({ nodeId: n.id, message: `${name(n)}: name the value it collects (small letters, for example account).` });
    if (n.type === "hours") {
      const days = Array.isArray(c.days) ? c.days : [];
      if (!days.length || !/^\d\d:\d\d$/.test(String(c.from ?? "")) || !/^\d\d:\d\d$/.test(String(c.to ?? ""))) errors.push({ nodeId: n.id, message: `${name(n)}: set the open days and hours.` });
    }
    if (n.type === "condition" && !CONDITION_FIELDS.some((f) => f.key === c.field)) errors.push({ nodeId: n.id, message: `${name(n)}: choose what to check.` });
  }
  // Every node should be reachable from the start.
  if (g.start && byId.has(g.start)) {
    const seen = new Set<string>();
    const stack = [g.start];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const to of Object.values(byId.get(id)?.next ?? {})) if (to && byId.has(to)) stack.push(to);
    }
    for (const n of g.nodes) if (!seen.has(n.id)) warnings.push({ nodeId: n.id, message: `${name(n)} cannot be reached from the start.` });
    // A loop of nodes that never asks the caller anything would spin forever.
    const auto = (n: IvrNode) => !INPUT_NODES.includes(n.type) && !TERMINAL_NODES.includes(n.type) && n.type !== "repeat" && n.type !== "identify";
    const state = new Map<string, number>();
    const visit = (id: string): boolean => {
      const n = byId.get(id);
      if (!n || !auto(n)) return false;
      if (state.get(id) === 1) return true;
      if (state.get(id) === 2) return false;
      state.set(id, 1);
      for (const to of Object.values(n.next)) if (to && visit(to)) return true;
      state.set(id, 2);
      return false;
    };
    for (const n of g.nodes) if (visit(n.id)) {
      errors.push({ nodeId: n.id, message: `${name(n)} is part of a loop that never asks the caller anything.` });
      break;
    }
  }
  const ends = g.nodes.filter((n) => TERMINAL_NODES.includes(n.type));
  if (g.nodes.length && !ends.length) errors.push({ nodeId: null, message: "The flow never reaches an agent, a message or an end." });
  if (!(g.settings.timeoutSec >= 3 && g.settings.timeoutSec <= 60)) errors.push({ nodeId: null, message: "The wait for a key is 3 to 60 seconds." });
  if (!(g.settings.maxRetries >= 0 && g.settings.maxRetries <= 5)) errors.push({ nodeId: null, message: "Retries are 0 to 5." });
  return { errors, warnings };
}

export const DEFAULT_IVR_SETTINGS: IvrGraph["settings"] = {
  timeoutSec: 8,
  maxRetries: 3,
  invalid: { en: "Sorry, that is not one of the choices.", am: "ይቅርታ፣ ያ ከምርጫዎቹ አንዱ አይደለም።" },
  noInput: { en: "We did not hear a choice.", am: "ምርጫ አልሰማንም።" },
  announcement: { on: false, text: { en: "", am: "" } },
};

// The spec's example flow (9.2): welcome, language, business hours, main menu with five topics and the operator.
export function defaultIvrGraph(): IvrGraph {
  const opt = (key: string, en: string, am: string, category?: string): IvrOption => ({ key, label: { en, am }, ...(category ? { category } : {}) });
  const q = (id: string, x: number, y: number, name: string, category: string): IvrNode => ({ id, type: "queue", x, y, name, config: { queueId: null, category }, next: { full: "callback" } });
  return {
    start: "welcome",
    settings: DEFAULT_IVR_SETTINGS,
    nodes: [
      { id: "welcome", type: "welcome", x: 40, y: 40, text: { en: "Welcome to MySeed Customer Support.", am: "ወደ ማይሲድ የደንበኞች አገልግሎት እንኳን በደህና መጡ።" }, next: { next: "language" } },
      {
        id: "language",
        type: "language",
        x: 40,
        y: 180,
        text: { en: "Press 1 for Amharic. Press 2 for English.", am: "ለአማርኛ 1 ይጫኑ። ለእንግሊዝኛ 2 ይጫኑ።" },
        options: [
          { key: "1", label: { en: "Amharic", am: "አማርኛ" }, lang: "am" },
          { key: "2", label: { en: "English", am: "እንግሊዝኛ" }, lang: "en" },
        ],
        next: { "opt:1": "hours", "opt:2": "hours", fail: "menu" },
      },
      { id: "hours", type: "hours", x: 40, y: 340, name: "Open hours", config: { days: [1, 2, 3, 4, 5, 6], from: "08:00", to: "18:00" }, next: { open: "menu", closed: "closed" } },
      { id: "closed", type: "tts", x: 360, y: 340, name: "We are closed", text: { en: "We are closed now. Leave a voice message or ask us to call you back.", am: "አሁን ዝግ ነን። የድምፅ መልእክት ይተዉ ወይም መልሰን እንድንደውልልዎ ይጠይቁ።" }, next: { next: "closed_menu" } },
      {
        id: "closed_menu",
        type: "menu",
        x: 680,
        y: 340,
        name: "After hours",
        text: { en: "Press 1 to leave a voice message. Press 2 to be called back.", am: "የድምፅ መልእክት ለመተው 1 ይጫኑ። መልሰን እንድንደውል 2 ይጫኑ።" },
        options: [opt("1", "Voice message", "የድምፅ መልእክት"), opt("2", "Call me back", "መልሰው ይደውሉልኝ")],
        next: { "opt:1": "voicemail", "opt:2": "callback", fail: "end" },
      },
      {
        id: "menu",
        type: "menu",
        x: 40,
        y: 500,
        name: "Main menu",
        text: {
          en: "Press 1 for account and login. Press 2 for learning and subscription. Press 3 for payment and billing. Press 4 for technical support. Press 5 to speak with an agent. Press 0 for the operator.",
          am: "ለመለያ እና መግቢያ 1 ይጫኑ። ለትምህርት እና ምዝገባ 2 ይጫኑ። ለክፍያ 3 ይጫኑ። ለቴክኒክ ድጋፍ 4 ይጫኑ። ከወኪል ጋር ለመነጋገር 5 ይጫኑ። ለኦፕሬተር 0 ይጫኑ።",
        },
        options: [
          opt("1", "Account and login", "መለያ እና መግቢያ", "account"),
          opt("2", "Learning and subscription", "ትምህርት እና ምዝገባ", "subscription"),
          opt("3", "Payment and billing", "ክፍያ", "payment"),
          opt("4", "Technical support", "ቴክኒክ ድጋፍ", "technical"),
          opt("5", "Speak with an agent", "ከወኪል ጋር መነጋገር", "general"),
          opt("0", "Operator", "ኦፕሬተር", "operator"),
        ],
        next: { "opt:1": "q_account", "opt:2": "q_subscription", "opt:3": "q_payment", "opt:4": "q_technical", "opt:5": "q_general", "opt:0": "q_general", fail: "q_general" },
      },
      q("q_account", 360, 660, "Account support", "account"),
      q("q_subscription", 620, 660, "Subscription support", "subscription"),
      q("q_payment", 880, 660, "Payment support", "payment"),
      q("q_technical", 1140, 660, "Technical support", "technical"),
      q("q_general", 40, 660, "General support", "general"),
      { id: "voicemail", type: "voicemail", x: 1000, y: 260, text: { en: "Leave your message after the tone.", am: "ከድምፁ በኋላ መልእክትዎን ይተዉ።" }, config: { maxSec: 120 }, next: {} },
      { id: "callback", type: "callback", x: 1000, y: 420, text: { en: "Give us a number and we will call you back.", am: "ቁጥርዎን ይስጡን፣ መልሰን እንደውላለን።" }, next: {} },
      { id: "end", type: "end", x: 1000, y: 560, text: { en: "Thank you for calling. Goodbye.", am: "ስለደወሉ እናመሰግናለን። ደህና ይሁኑ።" }, next: {} },
    ],
  };
}

// What the caller's screen shows at one step: prompts to speak, choices to press, or the end of the IVR part.
export type IvrScreen = {
  sessionId: string;
  lang: IvrLang;
  say: { text: string; audioUrl: string | null }[];
  ask: null | { kind: "choice" | "digits"; options: { key: string; label: string }[]; maxDigits?: number; timeoutSec: number };
  done: null | { action: "queue" | "agent" | "voicemail" | "callback" | "end"; queueId?: string | null; agentId?: string | null; maxSec?: number; category?: string | null };
};
