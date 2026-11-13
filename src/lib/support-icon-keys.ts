// Help-menu icon keys (shared by the server and the pages). Old menus saved with emojis map to a key on read.
export const SUPPORT_ICON_KEYS = ["zap", "help", "book", "package", "card", "receipt", "user", "phone", "call", "person", "agent", "chat", "video", "school", "security", "fix"] as const;
export const EMOJI_TO_KEY: Record<string, string> = { "\u26A1": "zap", "\u2753": "help", "\u{1F4D8}": "book", "\u{1F4E6}": "package", "\u{1F4B3}": "card", "\u{1F464}": "user", "\u{1F4F1}": "phone", "\u{1F64B}": "person", "\u{1F4AC}": "chat" };

// Any stored value (a key, an old emoji or nothing) as a known key.
export function supportIconKey(v: string | null | undefined): string {
  const s = String(v ?? "").trim();
  if ((SUPPORT_ICON_KEYS as readonly string[]).includes(s)) return s;
  return EMOJI_TO_KEY[s] ?? "chat";
}
