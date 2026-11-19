// Presentation templates (Phase 24): the colours, fonts, logo, cover and background a deck is shown and exported
// with. Built in: Myseed (the brand, colourful), Myseed dark, International (plain and formal, for partners and
// donors), Ocean, Sunrise, eight more professional ones (Executive, Boardroom, Consulting, Minimal white, Donor
// report, Tech gradient, Ethiopia, Deep ocean) and seven fun ones (Comic pop, Neon night, Pastel party, Retro arcade,
// Space, Chalkboard, Jungle), some with a drawn background. Admin adds more, edits them, or imports one from PowerPoint, Google Slides, Keynote or
// Canva (a .pptx, .potx or .thmx file: its theme colours, fonts, background and logo).

export type DeckTemplate = {
  id: string;
  name: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    muted: string;
    chart: string[];
  };
  fonts: { heading: string; body: string };
  // A data URL (image) or null for the workspace's own logo.
  logo: string | null;
  cover: { style: "gradient" | "solid" | "split" | "image"; image: string | null };
  // A picture behind every slide (from an imported template), or null.
  background: string | null;
  footer: string;
  slideNumbers: boolean;
  source: "built-in" | "custom" | "imported";
  importedFrom?: string | null;
};

const MYSEED_CHART = ["#1E8E3E", "#1A73E8", "#F9AB00", "#D93025", "#9334E6", "#12B5CB", "#E8710A", "#E52592"];

export const BUILT_IN_TEMPLATES: DeckTemplate[] = [
  {
    id: "myseed",
    name: "Myseed",
    colors: { primary: "#0B7A3B", secondary: "#1A73E8", accent: "#F9AB00", background: "#FFFFFF", surface: "#F1F8F3", text: "#1F2937", muted: "#6B7280", chart: MYSEED_CHART },
    fonts: { heading: "Segoe UI Semibold", body: "Segoe UI" },
    logo: null,
    cover: { style: "gradient", image: null },
    background: null,
    footer: "Myseed",
    slideNumbers: true,
    source: "built-in",
  },
  {
    id: "myseed-dark",
    name: "Myseed dark",
    colors: { primary: "#34A853", secondary: "#8AB4F8", accent: "#FDD663", background: "#0F1A14", surface: "#18261D", text: "#F3F4F6", muted: "#9CA3AF", chart: ["#81C995", "#8AB4F8", "#FDD663", "#F28B82", "#C58AF9", "#78D9EC", "#FCAD70", "#FF8BCB"] },
    fonts: { heading: "Segoe UI Semibold", body: "Segoe UI" },
    logo: null,
    cover: { style: "split", image: null },
    background: null,
    footer: "Myseed",
    slideNumbers: true,
    source: "built-in",
  },
  {
    id: "international",
    name: "International (formal)",
    colors: { primary: "#1F3864", secondary: "#2E75B6", accent: "#C00000", background: "#FFFFFF", surface: "#F2F2F2", text: "#262626", muted: "#595959", chart: ["#1F3864", "#2E75B6", "#9DC3E6", "#A5A5A5", "#C00000", "#70AD47", "#FFC000", "#7F7F7F"] },
    fonts: { heading: "Calibri Light", body: "Calibri" },
    logo: null,
    cover: { style: "solid", image: null },
    background: null,
    footer: "",
    slideNumbers: true,
    source: "built-in",
  },
  {
    id: "ocean",
    name: "Ocean",
    colors: { primary: "#006D77", secondary: "#83C5BE", accent: "#E29578", background: "#FFFFFF", surface: "#EDF6F9", text: "#14213D", muted: "#5C677D", chart: ["#006D77", "#83C5BE", "#E29578", "#FFDDD2", "#3D5A80", "#98C1D9", "#EE6C4D", "#293241"] },
    fonts: { heading: "Georgia", body: "Segoe UI" },
    logo: null,
    cover: { style: "gradient", image: null },
    background: null,
    footer: "",
    slideNumbers: true,
    source: "built-in",
  },
  {
    id: "sunrise",
    name: "Sunrise",
    colors: { primary: "#E8710A", secondary: "#D93025", accent: "#FBBC04", background: "#FFFDF8", surface: "#FFF4E5", text: "#3C2A1E", muted: "#7A6A5E", chart: ["#E8710A", "#D93025", "#FBBC04", "#1E8E3E", "#9334E6", "#1A73E8", "#E52592", "#12B5CB"] },
    fonts: { heading: "Trebuchet MS", body: "Segoe UI" },
    logo: null,
    cover: { style: "gradient", image: null },
    background: null,
    footer: "",
    slideNumbers: true,
    source: "built-in",
  },
  {
    id: "executive",
    name: "Executive (navy and gold)",
    colors: { primary: "#0B1F3A", secondary: "#1E3A5F", accent: "#C9A227", background: "#FFFFFF", surface: "#F4F6FA", text: "#0B1F3A", muted: "#5B6B82", chart: ["#0B1F3A", "#C9A227", "#3E6FA8", "#8FA9C8", "#6B7F99", "#D9C27A", "#2E4A6B", "#B0B8C4"] },
    fonts: { heading: "Georgia", body: "Segoe UI" },
    logo: null,
    cover: { style: "split", image: null },
    background: null,
    footer: "",
    slideNumbers: true,
    source: "built-in",
  },
  {
    id: "boardroom",
    name: "Boardroom (black and white)",
    colors: { primary: "#111111", secondary: "#3A3A3A", accent: "#E11D48", background: "#FFFFFF", surface: "#F5F5F5", text: "#111111", muted: "#6B6B6B", chart: ["#111111", "#E11D48", "#6B6B6B", "#A3A3A3", "#3A3A3A", "#F43F5E", "#D4D4D4", "#525252"] },
    fonts: { heading: "Arial Black", body: "Arial" },
    logo: null,
    cover: { style: "solid", image: null },
    background: null,
    footer: "",
    slideNumbers: true,
    source: "built-in",
  },
  {
    id: "consulting",
    name: "Consulting (clean blue)",
    colors: { primary: "#0A4D8C", secondary: "#2F80ED", accent: "#27AE60", background: "#FFFFFF", surface: "#F2F7FC", text: "#1B2A3A", muted: "#5F6F82", chart: ["#0A4D8C", "#2F80ED", "#56CCF2", "#27AE60", "#F2994A", "#EB5757", "#9B51E0", "#828282"] },
    fonts: { heading: "Segoe UI Semibold", body: "Segoe UI" },
    logo: null,
    cover: { style: "gradient", image: null },
    background: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxNjAwJyBoZWlnaHQ9JzkwMCcgdmlld0JveD0nMCAwIDE2MDAgOTAwJz48ZGVmcz48cGF0dGVybiBpZD0ncCcgd2lkdGg9JzY0JyBoZWlnaHQ9JzY0JyBwYXR0ZXJuVW5pdHM9J3VzZXJTcGFjZU9uVXNlJz48cGF0aCBkPSdNNjQgMEgwVjY0JyBmaWxsPSdub25lJyBzdHJva2U9JyMwZjE3MmEnIHN0cm9rZS1vcGFjaXR5PScuMDYnLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPScxMDAlJyBoZWlnaHQ9JzEwMCUnIGZpbGw9J3VybCgjcCknLz48L3N2Zz4=",
    footer: "",
    slideNumbers: true,
    source: "built-in",
  },
  {
    id: "minimal-white",
    name: "Minimal white",
    colors: { primary: "#18181B", secondary: "#52525B", accent: "#2563EB", background: "#FFFFFF", surface: "#FAFAFA", text: "#18181B", muted: "#71717A", chart: ["#18181B", "#2563EB", "#71717A", "#A1A1AA", "#0EA5E9", "#22C55E", "#F59E0B", "#EF4444"] },
    fonts: { heading: "Helvetica", body: "Helvetica" },
    logo: null,
    cover: { style: "solid", image: null },
    background: null,
    footer: "",
    slideNumbers: true,
    source: "built-in",
  },
  {
    id: "donor-report",
    name: "Donor report (warm green)",
    colors: { primary: "#14532D", secondary: "#15803D", accent: "#CA8A04", background: "#FFFEF7", surface: "#F0FDF4", text: "#1C1917", muted: "#57534E", chart: ["#15803D", "#CA8A04", "#0E7490", "#86EFAC", "#A16207", "#4D7C0F", "#0F766E", "#78716C"] },
    fonts: { heading: "Cambria", body: "Calibri" },
    logo: null,
    cover: { style: "split", image: null },
    background: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxNjAwJyBoZWlnaHQ9JzkwMCcgdmlld0JveD0nMCAwIDE2MDAgOTAwJz48ZGVmcz48cGF0dGVybiBpZD0ncCcgd2lkdGg9JzQwJyBoZWlnaHQ9JzQwJyBwYXR0ZXJuVW5pdHM9J3VzZXJTcGFjZU9uVXNlJz48Y2lyY2xlIGN4PSc0JyBjeT0nNCcgcj0nMycgZmlsbD0nIzAwMCcgZmlsbC1vcGFjaXR5PScuMDgnLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPScxMDAlJyBoZWlnaHQ9JzEwMCUnIGZpbGw9J3VybCgjcCknLz48L3N2Zz4=",
    footer: "",
    slideNumbers: true,
    source: "built-in",
  },
  {
    id: "tech-gradient",
    name: "Tech gradient",
    colors: { primary: "#4F46E5", secondary: "#7C3AED", accent: "#06B6D4", background: "#FFFFFF", surface: "#F5F3FF", text: "#1E1B4B", muted: "#6B7280", chart: ["#4F46E5", "#7C3AED", "#06B6D4", "#10B981", "#F59E0B", "#EC4899", "#3B82F6", "#8B5CF6"] },
    fonts: { heading: "Segoe UI Semibold", body: "Segoe UI" },
    logo: null,
    cover: { style: "gradient", image: null },
    background: null,
    footer: "",
    slideNumbers: true,
    source: "built-in",
  },
  {
    id: "ethiopia",
    name: "Ethiopia (green, gold, red)",
    colors: { primary: "#078930", secondary: "#DA121A", accent: "#FCDD09", background: "#FFFFFF", surface: "#F3FAF5", text: "#1F2937", muted: "#6B7280", chart: ["#078930", "#FCDD09", "#DA121A", "#0F4C81", "#1E8E3E", "#E8710A", "#5F6368", "#9334E6"] },
    fonts: { heading: "Nyala", body: "Segoe UI" },
    logo: null,
    cover: { style: "gradient", image: null },
    background: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxNjAwJyBoZWlnaHQ9JzkwMCcgdmlld0JveD0nMCAwIDE2MDAgOTAwJz48cmVjdCB5PSc4NzAnIHdpZHRoPScxNjAwJyBoZWlnaHQ9JzEwJyBmaWxsPScjMDc4OTMwJy8+PHJlY3QgeT0nODgwJyB3aWR0aD0nMTYwMCcgaGVpZ2h0PScxMCcgZmlsbD0nI2ZjZGQwOScvPjxyZWN0IHk9Jzg5MCcgd2lkdGg9JzE2MDAnIGhlaWdodD0nMTAnIGZpbGw9JyNkYTEyMWEnLz48cGF0aCBkPSdNMCAwIEgxNjAwIFY4IEgwWicgZmlsbD0nIzA3ODkzMCcvPjwvc3ZnPg==",
    footer: "",
    slideNumbers: true,
    source: "built-in",
  },
  {
    id: "ocean-deep",
    name: "Deep ocean (dark)",
    colors: { primary: "#38BDF8", secondary: "#0EA5E9", accent: "#FBBF24", background: "#0B1220", surface: "#111C2E", text: "#E2E8F0", muted: "#94A3B8", chart: ["#38BDF8", "#FBBF24", "#34D399", "#F472B6", "#A78BFA", "#FB923C", "#22D3EE", "#E2E8F0"] },
    fonts: { heading: "Segoe UI Semibold", body: "Segoe UI" },
    logo: null,
    cover: { style: "split", image: null },
    background: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxNjAwJyBoZWlnaHQ9JzkwMCcgdmlld0JveD0nMCAwIDE2MDAgOTAwJz48cGF0aCBkPSdNMCA3NjAgQzMwMCA3MDAgNTAwIDg0MCA4MDAgNzgwIEMxMTAwIDcyMCAxMzAwIDg0MCAxNjAwIDc3MCBMMTYwMCA5MDAgTDAgOTAwWicgZmlsbD0nIzBlYTVlOScgZmlsbC1vcGFjaXR5PScuMTgnLz48cGF0aCBkPSdNMCA4MjAgQzM1MCA3ODAgNTUwIDg4MCA5MDAgODMwIEMxMjAwIDc5MCAxNDAwIDg4MCAxNjAwIDg0MCBMMTYwMCA5MDAgTDAgOTAwWicgZmlsbD0nIzAyODRjNycgZmlsbC1vcGFjaXR5PScuMjInLz48L3N2Zz4=",
    footer: "",
    slideNumbers: true,
    source: "built-in",
  },
  {
    id: "comic",
    name: "Comic pop (fun)",
    colors: { primary: "#E63946", secondary: "#1D3557", accent: "#FFD400", background: "#FFFBE8", surface: "#FFFFFF", text: "#111111", muted: "#4A4A4A", chart: ["#E63946", "#1D3557", "#FFD400", "#457B9D", "#F77F00", "#2A9D8F", "#9B5DE5", "#111111"] },
    fonts: { heading: "Comic Sans MS", body: "Comic Sans MS" },
    logo: null,
    cover: { style: "split", image: null },
    background: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxNjAwJyBoZWlnaHQ9JzkwMCcgdmlld0JveD0nMCAwIDE2MDAgOTAwJz48ZGVmcz48cGF0dGVybiBpZD0ncCcgd2lkdGg9JzE4JyBoZWlnaHQ9JzE4JyBwYXR0ZXJuVW5pdHM9J3VzZXJTcGFjZU9uVXNlJz48Y2lyY2xlIGN4PSc5JyBjeT0nOScgcj0nMy4yJyBmaWxsPScjZTYzOTQ2JyBmaWxsLW9wYWNpdHk9Jy4xMicvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9JzEwMCUnIGhlaWdodD0nMTAwJScgZmlsbD0ndXJsKCNwKScvPjxwYXRoIGQ9J00xNjAwIDAgTDE2MDAgMjYwIEwxMzQwIDAgWicgZmlsbD0nI2ZmZDQwMCcvPjxwYXRoIGQ9J00wIDkwMCBMMCA3MDAgTDIyMCA5MDAgWicgZmlsbD0nIzFkMzU1NycvPjwvc3ZnPg==",
    footer: "",
    slideNumbers: true,
    source: "built-in",
  },
  {
    id: "neon-night",
    name: "Neon night (fun, dark)",
    colors: { primary: "#FF2BD6", secondary: "#22D3EE", accent: "#FF7A18", background: "#0D0221", surface: "#1A0B3D", text: "#F5E9FF", muted: "#B9A3D9", chart: ["#FF2BD6", "#22D3EE", "#FF7A18", "#A3FF12", "#FFE600", "#7C4DFF", "#FF4D6D", "#4DFFF3"] },
    fonts: { heading: "Impact", body: "Trebuchet MS" },
    logo: null,
    cover: { style: "gradient", image: null },
    background: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxNjAwJyBoZWlnaHQ9JzkwMCcgdmlld0JveD0nMCAwIDE2MDAgOTAwJz48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9J2cnIHgxPScwJyB5MT0nMCcgeDI9JzAnIHkyPScxJz48c3RvcCBvZmZzZXQ9JzAnIHN0b3AtY29sb3I9JyNmZjJiZDYnIHN0b3Atb3BhY2l0eT0nLjAnLz48c3RvcCBvZmZzZXQ9JzEnIHN0b3AtY29sb3I9JyNmZjJiZDYnIHN0b3Atb3BhY2l0eT0nLjM1Jy8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3QgeT0nNTQwJyB3aWR0aD0nMTYwMCcgaGVpZ2h0PSczNjAnIGZpbGw9J3VybCgjZyknLz48ZyBzdHJva2U9JyMyMmQzZWUnIHN0cm9rZS1vcGFjaXR5PScuMzUnIHN0cm9rZS13aWR0aD0nMic+PGxpbmUgeDE9Jy04MDAnIHkxPSc5MDAnIHgyPSc1NjAuMCcgeTI9JzU2MCcvPjxsaW5lIHgxPSctNjQwJyB5MT0nOTAwJyB4Mj0nNTg0LjAnIHkyPSc1NjAnLz48bGluZSB4MT0nLTQ4MCcgeTE9JzkwMCcgeDI9JzYwOC4wJyB5Mj0nNTYwJy8+PGxpbmUgeDE9Jy0zMjAnIHkxPSc5MDAnIHgyPSc2MzIuMCcgeTI9JzU2MCcvPjxsaW5lIHgxPSctMTYwJyB5MT0nOTAwJyB4Mj0nNjU2LjAnIHkyPSc1NjAnLz48bGluZSB4MT0nMCcgeTE9JzkwMCcgeDI9JzY4MC4wJyB5Mj0nNTYwJy8+PGxpbmUgeDE9JzE2MCcgeTE9JzkwMCcgeDI9JzcwNC4wJyB5Mj0nNTYwJy8+PGxpbmUgeDE9JzMyMCcgeTE9JzkwMCcgeDI9JzcyOC4wJyB5Mj0nNTYwJy8+PGxpbmUgeDE9JzQ4MCcgeTE9JzkwMCcgeDI9Jzc1Mi4wJyB5Mj0nNTYwJy8+PGxpbmUgeDE9JzY0MCcgeTE9JzkwMCcgeDI9Jzc3Ni4wJyB5Mj0nNTYwJy8+PGxpbmUgeDE9JzgwMCcgeTE9JzkwMCcgeDI9JzgwMC4wJyB5Mj0nNTYwJy8+PGxpbmUgeDE9Jzk2MCcgeTE9JzkwMCcgeDI9JzgyNC4wJyB5Mj0nNTYwJy8+PGxpbmUgeDE9JzExMjAnIHkxPSc5MDAnIHgyPSc4NDguMCcgeTI9JzU2MCcvPjxsaW5lIHgxPScxMjgwJyB5MT0nOTAwJyB4Mj0nODcyLjAnIHkyPSc1NjAnLz48bGluZSB4MT0nMTQ0MCcgeTE9JzkwMCcgeDI9Jzg5Ni4wJyB5Mj0nNTYwJy8+PGxpbmUgeDE9JzE2MDAnIHkxPSc5MDAnIHgyPSc5MjAuMCcgeTI9JzU2MCcvPjxsaW5lIHgxPScxNzYwJyB5MT0nOTAwJyB4Mj0nOTQ0LjAnIHkyPSc1NjAnLz48bGluZSB4MT0nMTkyMCcgeTE9JzkwMCcgeDI9Jzk2OC4wJyB5Mj0nNTYwJy8+PGxpbmUgeDE9JzIwODAnIHkxPSc5MDAnIHgyPSc5OTIuMCcgeTI9JzU2MCcvPjxsaW5lIHgxPScyMjQwJyB5MT0nOTAwJyB4Mj0nMTAxNi4wJyB5Mj0nNTYwJy8+PGxpbmUgeDE9JzAnIHkxPSc2MDAnIHgyPScxNjAwJyB5Mj0nNjAwJy8+PGxpbmUgeDE9JzAnIHkxPSc2NTAnIHgyPScxNjAwJyB5Mj0nNjUwJy8+PGxpbmUgeDE9JzAnIHkxPSc3MjAnIHgyPScxNjAwJyB5Mj0nNzIwJy8+PGxpbmUgeDE9JzAnIHkxPSc4MTAnIHgyPScxNjAwJyB5Mj0nODEwJy8+PC9nPjxjaXJjbGUgY3g9JzgwMCcgY3k9JzUyMCcgcj0nMTUwJyBmaWxsPScjZmY3YTE4JyBmaWxsLW9wYWNpdHk9Jy4zNScvPjwvc3ZnPg==",
    footer: "",
    slideNumbers: true,
    source: "built-in",
  },
  {
    id: "pastel-party",
    name: "Pastel party (fun)",
    colors: { primary: "#FF7EB6", secondary: "#8E7CFF", accent: "#5EDFC0", background: "#FFF8FC", surface: "#FFFFFF", text: "#3A2541", muted: "#8A6B8F", chart: ["#FF7EB6", "#8E7CFF", "#5EDFC0", "#FFC75F", "#7FD6FF", "#FF9671", "#C2A5FF", "#A0E7AA"] },
    fonts: { heading: "Trebuchet MS", body: "Verdana" },
    logo: null,
    cover: { style: "gradient", image: null },
    background: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxNjAwJyBoZWlnaHQ9JzkwMCcgdmlld0JveD0nMCAwIDE2MDAgOTAwJz48Y2lyY2xlIGN4PScxNDUwJyBjeT0nMTIwJyByPScyNjAnIGZpbGw9JyNmZmQxZTgnIGZpbGwtb3BhY2l0eT0nLjcnLz48Y2lyY2xlIGN4PScxMjAnIGN5PSc4MjAnIHI9JzIyMCcgZmlsbD0nI2Q3YzhmZicgZmlsbC1vcGFjaXR5PScuNycvPjxjaXJjbGUgY3g9JzEzMDAnIGN5PSc4MDAnIHI9JzEyMCcgZmlsbD0nI2M4ZjVlOCcgZmlsbC1vcGFjaXR5PScuOCcvPjwvc3ZnPg==",
    footer: "",
    slideNumbers: true,
    source: "built-in",
  },
  {
    id: "retro-arcade",
    name: "Retro arcade (fun)",
    colors: { primary: "#22C55E", secondary: "#3B82F6", accent: "#EAB308", background: "#0B0F0C", surface: "#141A16", text: "#E5FFE9", muted: "#8FB99A", chart: ["#22C55E", "#EAB308", "#3B82F6", "#EF4444", "#A855F7", "#14B8A6", "#F97316", "#E5FFE9"] },
    fonts: { heading: "Courier New", body: "Courier New" },
    logo: null,
    cover: { style: "solid", image: null },
    background: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxNjAwJyBoZWlnaHQ9JzkwMCcgdmlld0JveD0nMCAwIDE2MDAgOTAwJz48cmVjdCB4PScxMjAnIHk9JzgwJyB3aWR0aD0nNDAnIGhlaWdodD0nNDAnIGZpbGw9JyMzYjgyZjYnIGZpbGwtb3BhY2l0eT0nLjE0Jy8+PHJlY3QgeD0nMjQwJyB5PScxNjAnIHdpZHRoPSc0MCcgaGVpZ2h0PSc0MCcgZmlsbD0nI2VhYjMwOCcgZmlsbC1vcGFjaXR5PScuMTQnLz48cmVjdCB4PSc0MDAnIHk9JzI0MCcgd2lkdGg9JzQwJyBoZWlnaHQ9JzQwJyBmaWxsPScjZWY0NDQ0JyBmaWxsLW9wYWNpdHk9Jy4xNCcvPjxyZWN0IHg9JzUyMCcgeT0nMzIwJyB3aWR0aD0nNDAnIGhlaWdodD0nNDAnIGZpbGw9JyMyMmM1NWUnIGZpbGwtb3BhY2l0eT0nLjE0Jy8+PHJlY3QgeD0nNjgwJyB5PSc0NDAnIHdpZHRoPSc0MCcgaGVpZ2h0PSc0MCcgZmlsbD0nIzNiODJmNicgZmlsbC1vcGFjaXR5PScuMTQnLz48cmVjdCB4PSc4MDAnIHk9JzUyMCcgd2lkdGg9JzQwJyBoZWlnaHQ9JzQwJyBmaWxsPScjZWFiMzA4JyBmaWxsLW9wYWNpdHk9Jy4xNCcvPjxyZWN0IHg9JzkyMCcgeT0nNjAwJyB3aWR0aD0nNDAnIGhlaWdodD0nNDAnIGZpbGw9JyNlZjQ0NDQnIGZpbGwtb3BhY2l0eT0nLjE0Jy8+PHJlY3QgeD0nMTA4MCcgeT0nNjgwJyB3aWR0aD0nNDAnIGhlaWdodD0nNDAnIGZpbGw9JyMyMmM1NWUnIGZpbGwtb3BhY2l0eT0nLjE0Jy8+PHJlY3QgeD0nMTIwMCcgeT0nODAwJyB3aWR0aD0nNDAnIGhlaWdodD0nNDAnIGZpbGw9JyMzYjgyZjYnIGZpbGwtb3BhY2l0eT0nLjE0Jy8+PHJlY3QgeD0nMTM2MCcgeT0nODgwJyB3aWR0aD0nNDAnIGhlaWdodD0nNDAnIGZpbGw9JyNlYWIzMDgnIGZpbGwtb3BhY2l0eT0nLjE0Jy8+PHJlY3QgeD0nMTQ4MCcgeT0nNDAnIHdpZHRoPSc0MCcgaGVpZ2h0PSc0MCcgZmlsbD0nI2VmNDQ0NCcgZmlsbC1vcGFjaXR5PScuMTQnLz48cmVjdCB4PSc0MCcgeT0nMTYwJyB3aWR0aD0nNDAnIGhlaWdodD0nNDAnIGZpbGw9JyMyMmM1NWUnIGZpbGwtb3BhY2l0eT0nLjE0Jy8+PHJlY3QgeD0nMTYwJyB5PScyNDAnIHdpZHRoPSc0MCcgaGVpZ2h0PSc0MCcgZmlsbD0nIzNiODJmNicgZmlsbC1vcGFjaXR5PScuMTQnLz48cmVjdCB4PScyODAnIHk9JzMyMCcgd2lkdGg9JzQwJyBoZWlnaHQ9JzQwJyBmaWxsPScjZWFiMzA4JyBmaWxsLW9wYWNpdHk9Jy4xNCcvPjxyZWN0IHg9JzQ0MCcgeT0nNDAwJyB3aWR0aD0nNDAnIGhlaWdodD0nNDAnIGZpbGw9JyNlZjQ0NDQnIGZpbGwtb3BhY2l0eT0nLjE0Jy8+PHJlY3QgeD0nNTYwJyB5PSc1MjAnIHdpZHRoPSc0MCcgaGVpZ2h0PSc0MCcgZmlsbD0nIzIyYzU1ZScgZmlsbC1vcGFjaXR5PScuMTQnLz48cmVjdCB4PSc3MjAnIHk9JzYwMCcgd2lkdGg9JzQwJyBoZWlnaHQ9JzQwJyBmaWxsPScjM2I4MmY2JyBmaWxsLW9wYWNpdHk9Jy4xNCcvPjxyZWN0IHg9Jzg0MCcgeT0nNjgwJyB3aWR0aD0nNDAnIGhlaWdodD0nNDAnIGZpbGw9JyNlYWIzMDgnIGZpbGwtb3BhY2l0eT0nLjE0Jy8+PHJlY3QgeD0nMTAwMCcgeT0nNzYwJyB3aWR0aD0nNDAnIGhlaWdodD0nNDAnIGZpbGw9JyNlZjQ0NDQnIGZpbGwtb3BhY2l0eT0nLjE0Jy8+PHJlY3QgeD0nMTEyMCcgeT0nODgwJyB3aWR0aD0nNDAnIGhlaWdodD0nNDAnIGZpbGw9JyMyMmM1NWUnIGZpbGwtb3BhY2l0eT0nLjE0Jy8+PHJlY3QgeD0nMTI0MCcgeT0nNDAnIHdpZHRoPSc0MCcgaGVpZ2h0PSc0MCcgZmlsbD0nIzNiODJmNicgZmlsbC1vcGFjaXR5PScuMTQnLz48cmVjdCB4PScxNDAwJyB5PScxMjAnIHdpZHRoPSc0MCcgaGVpZ2h0PSc0MCcgZmlsbD0nI2VhYjMwOCcgZmlsbC1vcGFjaXR5PScuMTQnLz48cmVjdCB4PScxNTIwJyB5PScyNDAnIHdpZHRoPSc0MCcgaGVpZ2h0PSc0MCcgZmlsbD0nI2VmNDQ0NCcgZmlsbC1vcGFjaXR5PScuMTQnLz48cmVjdCB4PSc4MCcgeT0nMzIwJyB3aWR0aD0nNDAnIGhlaWdodD0nNDAnIGZpbGw9JyMyMmM1NWUnIGZpbGwtb3BhY2l0eT0nLjE0Jy8+PHJlY3QgeD0nMjAwJyB5PSc0MDAnIHdpZHRoPSc0MCcgaGVpZ2h0PSc0MCcgZmlsbD0nIzNiODJmNicgZmlsbC1vcGFjaXR5PScuMTQnLz48cmVjdCB4PSczNjAnIHk9JzQ4MCcgd2lkdGg9JzQwJyBoZWlnaHQ9JzQwJyBmaWxsPScjZWFiMzA4JyBmaWxsLW9wYWNpdHk9Jy4xNCcvPjxyZWN0IHg9JzQ4MCcgeT0nNjAwJyB3aWR0aD0nNDAnIGhlaWdodD0nNDAnIGZpbGw9JyNlZjQ0NDQnIGZpbGwtb3BhY2l0eT0nLjE0Jy8+PHJlY3QgeD0nNjAwJyB5PSc2ODAnIHdpZHRoPSc0MCcgaGVpZ2h0PSc0MCcgZmlsbD0nIzIyYzU1ZScgZmlsbC1vcGFjaXR5PScuMTQnLz48cmVjdCB4PSc3NjAnIHk9Jzc2MCcgd2lkdGg9JzQwJyBoZWlnaHQ9JzQwJyBmaWxsPScjM2I4MmY2JyBmaWxsLW9wYWNpdHk9Jy4xNCcvPjxyZWN0IHg9Jzg4MCcgeT0nODQwJyB3aWR0aD0nNDAnIGhlaWdodD0nNDAnIGZpbGw9JyNlYWIzMDgnIGZpbGwtb3BhY2l0eT0nLjE0Jy8+PHJlY3QgeD0nMTA0MCcgeT0nNDAnIHdpZHRoPSc0MCcgaGVpZ2h0PSc0MCcgZmlsbD0nI2VmNDQ0NCcgZmlsbC1vcGFjaXR5PScuMTQnLz48cmVjdCB4PScxMTYwJyB5PScxMjAnIHdpZHRoPSc0MCcgaGVpZ2h0PSc0MCcgZmlsbD0nIzIyYzU1ZScgZmlsbC1vcGFjaXR5PScuMTQnLz48cmVjdCB4PScxMzIwJyB5PScyMDAnIHdpZHRoPSc0MCcgaGVpZ2h0PSc0MCcgZmlsbD0nIzNiODJmNicgZmlsbC1vcGFjaXR5PScuMTQnLz48cmVjdCB4PScxNDQwJyB5PSczMjAnIHdpZHRoPSc0MCcgaGVpZ2h0PSc0MCcgZmlsbD0nI2VhYjMwOCcgZmlsbC1vcGFjaXR5PScuMTQnLz48cmVjdCB4PScxNTYwJyB5PSc0MDAnIHdpZHRoPSc0MCcgaGVpZ2h0PSc0MCcgZmlsbD0nI2VmNDQ0NCcgZmlsbC1vcGFjaXR5PScuMTQnLz48cmVjdCB4PScxMjAnIHk9JzQ4MCcgd2lkdGg9JzQwJyBoZWlnaHQ9JzQwJyBmaWxsPScjMjJjNTVlJyBmaWxsLW9wYWNpdHk9Jy4xNCcvPjxyZWN0IHg9JzI0MCcgeT0nNTYwJyB3aWR0aD0nNDAnIGhlaWdodD0nNDAnIGZpbGw9JyMzYjgyZjYnIGZpbGwtb3BhY2l0eT0nLjE0Jy8+PHJlY3QgeD0nNDAwJyB5PSc2ODAnIHdpZHRoPSc0MCcgaGVpZ2h0PSc0MCcgZmlsbD0nI2VhYjMwOCcgZmlsbC1vcGFjaXR5PScuMTQnLz48cmVjdCB4PSc1MjAnIHk9Jzc2MCcgd2lkdGg9JzQwJyBoZWlnaHQ9JzQwJyBmaWxsPScjZWY0NDQ0JyBmaWxsLW9wYWNpdHk9Jy4xNCcvPjxyZWN0IHg9JzY4MCcgeT0nODQwJyB3aWR0aD0nNDAnIGhlaWdodD0nNDAnIGZpbGw9JyMyMmM1NWUnIGZpbGwtb3BhY2l0eT0nLjE0Jy8+PHJlY3QgeD0nODAwJyB5PSc0MCcgd2lkdGg9JzQwJyBoZWlnaHQ9JzQwJyBmaWxsPScjM2I4MmY2JyBmaWxsLW9wYWNpdHk9Jy4xNCcvPjxyZWN0IHg9JzkyMCcgeT0nMTIwJyB3aWR0aD0nNDAnIGhlaWdodD0nNDAnIGZpbGw9JyNlYWIzMDgnIGZpbGwtb3BhY2l0eT0nLjE0Jy8+PHJlY3QgeD0nMTA4MCcgeT0nMjAwJyB3aWR0aD0nNDAnIGhlaWdodD0nNDAnIGZpbGw9JyNlZjQ0NDQnIGZpbGwtb3BhY2l0eT0nLjE0Jy8+PHJlY3QgeD0nMTIwMCcgeT0nMjgwJyB3aWR0aD0nNDAnIGhlaWdodD0nNDAnIGZpbGw9JyMyMmM1NWUnIGZpbGwtb3BhY2l0eT0nLjE0Jy8+PHJlY3QgeD0nMTM2MCcgeT0nNDAwJyB3aWR0aD0nNDAnIGhlaWdodD0nNDAnIGZpbGw9JyMzYjgyZjYnIGZpbGwtb3BhY2l0eT0nLjE0Jy8+PHJlY3QgeD0nMTQ4MCcgeT0nNDgwJyB3aWR0aD0nNDAnIGhlaWdodD0nNDAnIGZpbGw9JyNlYWIzMDgnIGZpbGwtb3BhY2l0eT0nLjE0Jy8+PHJlY3QgeD0nMCcgeT0nNTYwJyB3aWR0aD0nNDAnIGhlaWdodD0nNDAnIGZpbGw9JyNlZjQ0NDQnIGZpbGwtb3BhY2l0eT0nLjE0Jy8+PHJlY3QgeD0nMTYwJyB5PSc2NDAnIHdpZHRoPSc0MCcgaGVpZ2h0PSc0MCcgZmlsbD0nIzIyYzU1ZScgZmlsbC1vcGFjaXR5PScuMTQnLz48cmVjdCB4PScyODAnIHk9Jzc2MCcgd2lkdGg9JzQwJyBoZWlnaHQ9JzQwJyBmaWxsPScjM2I4MmY2JyBmaWxsLW9wYWNpdHk9Jy4xNCcvPjxyZWN0IHg9JzQ0MCcgeT0nODQwJyB3aWR0aD0nNDAnIGhlaWdodD0nNDAnIGZpbGw9JyNlYWIzMDgnIGZpbGwtb3BhY2l0eT0nLjE0Jy8+PHJlY3QgeD0nNTYwJyB5PScwJyB3aWR0aD0nNDAnIGhlaWdodD0nNDAnIGZpbGw9JyNlZjQ0NDQnIGZpbGwtb3BhY2l0eT0nLjE0Jy8+PHJlY3QgeD0nNzIwJyB5PScxMjAnIHdpZHRoPSc0MCcgaGVpZ2h0PSc0MCcgZmlsbD0nIzIyYzU1ZScgZmlsbC1vcGFjaXR5PScuMTQnLz48cmVjdCB4PSc4NDAnIHk9JzIwMCcgd2lkdGg9JzQwJyBoZWlnaHQ9JzQwJyBmaWxsPScjM2I4MmY2JyBmaWxsLW9wYWNpdHk9Jy4xNCcvPjxyZWN0IHg9Jzk2MCcgeT0nMjgwJyB3aWR0aD0nNDAnIGhlaWdodD0nNDAnIGZpbGw9JyNlYWIzMDgnIGZpbGwtb3BhY2l0eT0nLjE0Jy8+PHJlY3QgeD0nMTEyMCcgeT0nMzYwJyB3aWR0aD0nNDAnIGhlaWdodD0nNDAnIGZpbGw9JyNlZjQ0NDQnIGZpbGwtb3BhY2l0eT0nLjE0Jy8+PHJlY3QgeD0nMTI0MCcgeT0nNDgwJyB3aWR0aD0nNDAnIGhlaWdodD0nNDAnIGZpbGw9JyMyMmM1NWUnIGZpbGwtb3BhY2l0eT0nLjE0Jy8+PHJlY3QgeD0nMTQwMCcgeT0nNTYwJyB3aWR0aD0nNDAnIGhlaWdodD0nNDAnIGZpbGw9JyMzYjgyZjYnIGZpbGwtb3BhY2l0eT0nLjE0Jy8+PHJlY3QgeD0nMTUyMCcgeT0nNjQwJyB3aWR0aD0nNDAnIGhlaWdodD0nNDAnIGZpbGw9JyNlYWIzMDgnIGZpbGwtb3BhY2l0eT0nLjE0Jy8+PHJlY3QgeD0nODAnIHk9JzcyMCcgd2lkdGg9JzQwJyBoZWlnaHQ9JzQwJyBmaWxsPScjZWY0NDQ0JyBmaWxsLW9wYWNpdHk9Jy4xNCcvPjwvc3ZnPg==",
    footer: "",
    slideNumbers: true,
    source: "built-in",
  },
  {
    id: "space",
    name: "Space (fun, dark)",
    colors: { primary: "#A78BFA", secondary: "#60A5FA", accent: "#F472B6", background: "#070B1A", surface: "#10172E", text: "#E5E7FF", muted: "#9AA3C7", chart: ["#A78BFA", "#60A5FA", "#F472B6", "#34D399", "#FBBF24", "#F87171", "#22D3EE", "#C4B5FD"] },
    fonts: { heading: "Segoe UI Semibold", body: "Segoe UI" },
    logo: null,
    cover: { style: "split", image: null },
    background: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxNjAwJyBoZWlnaHQ9JzkwMCcgdmlld0JveD0nMCAwIDE2MDAgOTAwJz48cmVjdCB3aWR0aD0nMTAwJScgaGVpZ2h0PScxMDAlJyBmaWxsPSdub25lJy8+PGNpcmNsZSBjeD0nMzk3JyBjeT0nMjExJyByPScyJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuMzcnLz48Y2lyY2xlIGN4PSc3OTQnIGN5PSc0MjInIHI9JzMnIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC40OScvPjxjaXJjbGUgY3g9JzExOTEnIGN5PSc2MzMnIHI9JzEnIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC42MScvPjxjaXJjbGUgY3g9JzE1ODgnIGN5PSc4NDQnIHI9JzInIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC43MycvPjxjaXJjbGUgY3g9JzM4NScgY3k9JzE1NScgcj0nMycgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjI1Jy8+PGNpcmNsZSBjeD0nNzgyJyBjeT0nMzY2JyByPScxJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuMzcnLz48Y2lyY2xlIGN4PScxMTc5JyBjeT0nNTc3JyByPScyJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuNDknLz48Y2lyY2xlIGN4PScxNTc2JyBjeT0nNzg4JyByPSczJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuNjEnLz48Y2lyY2xlIGN4PSczNzMnIGN5PSc5OScgcj0nMScgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjczJy8+PGNpcmNsZSBjeD0nNzcwJyBjeT0nMzEwJyByPScyJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuMjUnLz48Y2lyY2xlIGN4PScxMTY3JyBjeT0nNTIxJyByPSczJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuMzcnLz48Y2lyY2xlIGN4PScxNTY0JyBjeT0nNzMyJyByPScxJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuNDknLz48Y2lyY2xlIGN4PSczNjEnIGN5PSc0Mycgcj0nMicgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjYxJy8+PGNpcmNsZSBjeD0nNzU4JyBjeT0nMjU0JyByPSczJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuNzMnLz48Y2lyY2xlIGN4PScxMTU1JyBjeT0nNDY1JyByPScxJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuMjUnLz48Y2lyY2xlIGN4PScxNTUyJyBjeT0nNjc2JyByPScyJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuMzcnLz48Y2lyY2xlIGN4PSczNDknIGN5PSc4ODcnIHI9JzMnIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC40OScvPjxjaXJjbGUgY3g9Jzc0NicgY3k9JzE5OCcgcj0nMScgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjYxJy8+PGNpcmNsZSBjeD0nMTE0MycgY3k9JzQwOScgcj0nMicgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjczJy8+PGNpcmNsZSBjeD0nMTU0MCcgY3k9JzYyMCcgcj0nMycgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjI1Jy8+PGNpcmNsZSBjeD0nMzM3JyBjeT0nODMxJyByPScxJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuMzcnLz48Y2lyY2xlIGN4PSc3MzQnIGN5PScxNDInIHI9JzInIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC40OScvPjxjaXJjbGUgY3g9JzExMzEnIGN5PSczNTMnIHI9JzMnIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC42MScvPjxjaXJjbGUgY3g9JzE1MjgnIGN5PSc1NjQnIHI9JzEnIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC43MycvPjxjaXJjbGUgY3g9JzMyNScgY3k9Jzc3NScgcj0nMicgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjI1Jy8+PGNpcmNsZSBjeD0nNzIyJyBjeT0nODYnIHI9JzMnIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC4zNycvPjxjaXJjbGUgY3g9JzExMTknIGN5PScyOTcnIHI9JzEnIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC40OScvPjxjaXJjbGUgY3g9JzE1MTYnIGN5PSc1MDgnIHI9JzInIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC42MScvPjxjaXJjbGUgY3g9JzMxMycgY3k9JzcxOScgcj0nMycgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjczJy8+PGNpcmNsZSBjeD0nNzEwJyBjeT0nMzAnIHI9JzEnIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC4yNScvPjxjaXJjbGUgY3g9JzExMDcnIGN5PScyNDEnIHI9JzInIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC4zNycvPjxjaXJjbGUgY3g9JzE1MDQnIGN5PSc0NTInIHI9JzMnIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC40OScvPjxjaXJjbGUgY3g9JzMwMScgY3k9JzY2Mycgcj0nMScgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjYxJy8+PGNpcmNsZSBjeD0nNjk4JyBjeT0nODc0JyByPScyJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuNzMnLz48Y2lyY2xlIGN4PScxMDk1JyBjeT0nMTg1JyByPSczJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuMjUnLz48Y2lyY2xlIGN4PScxNDkyJyBjeT0nMzk2JyByPScxJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuMzcnLz48Y2lyY2xlIGN4PScyODknIGN5PSc2MDcnIHI9JzInIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC40OScvPjxjaXJjbGUgY3g9JzY4NicgY3k9JzgxOCcgcj0nMycgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjYxJy8+PGNpcmNsZSBjeD0nMTA4MycgY3k9JzEyOScgcj0nMScgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjczJy8+PGNpcmNsZSBjeD0nMTQ4MCcgY3k9JzM0MCcgcj0nMicgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjI1Jy8+PGNpcmNsZSBjeD0nMjc3JyBjeT0nNTUxJyByPSczJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuMzcnLz48Y2lyY2xlIGN4PSc2NzQnIGN5PSc3NjInIHI9JzEnIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC40OScvPjxjaXJjbGUgY3g9JzEwNzEnIGN5PSc3Mycgcj0nMicgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjYxJy8+PGNpcmNsZSBjeD0nMTQ2OCcgY3k9JzI4NCcgcj0nMycgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjczJy8+PGNpcmNsZSBjeD0nMjY1JyBjeT0nNDk1JyByPScxJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuMjUnLz48Y2lyY2xlIGN4PSc2NjInIGN5PSc3MDYnIHI9JzInIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC4zNycvPjxjaXJjbGUgY3g9JzEwNTknIGN5PScxNycgcj0nMycgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjQ5Jy8+PGNpcmNsZSBjeD0nMTQ1NicgY3k9JzIyOCcgcj0nMScgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjYxJy8+PGNpcmNsZSBjeD0nMjUzJyBjeT0nNDM5JyByPScyJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuNzMnLz48Y2lyY2xlIGN4PSc2NTAnIGN5PSc2NTAnIHI9JzMnIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC4yNScvPjxjaXJjbGUgY3g9JzEwNDcnIGN5PSc4NjEnIHI9JzEnIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC4zNycvPjxjaXJjbGUgY3g9JzE0NDQnIGN5PScxNzInIHI9JzInIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC40OScvPjxjaXJjbGUgY3g9JzI0MScgY3k9JzM4Mycgcj0nMycgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjYxJy8+PGNpcmNsZSBjeD0nNjM4JyBjeT0nNTk0JyByPScxJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuNzMnLz48Y2lyY2xlIGN4PScxMDM1JyBjeT0nODA1JyByPScyJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuMjUnLz48Y2lyY2xlIGN4PScxNDMyJyBjeT0nMTE2JyByPSczJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuMzcnLz48Y2lyY2xlIGN4PScyMjknIGN5PSczMjcnIHI9JzEnIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC40OScvPjxjaXJjbGUgY3g9JzYyNicgY3k9JzUzOCcgcj0nMicgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjYxJy8+PGNpcmNsZSBjeD0nMTAyMycgY3k9Jzc0OScgcj0nMycgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjczJy8+PGNpcmNsZSBjeD0nMTQyMCcgY3k9JzYwJyByPScxJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuMjUnLz48Y2lyY2xlIGN4PScyMTcnIGN5PScyNzEnIHI9JzInIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC4zNycvPjxjaXJjbGUgY3g9JzYxNCcgY3k9JzQ4Micgcj0nMycgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjQ5Jy8+PGNpcmNsZSBjeD0nMTAxMScgY3k9JzY5Mycgcj0nMScgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjYxJy8+PGNpcmNsZSBjeD0nMTQwOCcgY3k9JzQnIHI9JzInIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC43MycvPjxjaXJjbGUgY3g9JzIwNScgY3k9JzIxNScgcj0nMycgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjI1Jy8+PGNpcmNsZSBjeD0nNjAyJyBjeT0nNDI2JyByPScxJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuMzcnLz48Y2lyY2xlIGN4PSc5OTknIGN5PSc2MzcnIHI9JzInIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC40OScvPjxjaXJjbGUgY3g9JzEzOTYnIGN5PSc4NDgnIHI9JzMnIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC42MScvPjxjaXJjbGUgY3g9JzE5MycgY3k9JzE1OScgcj0nMScgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjczJy8+PGNpcmNsZSBjeD0nNTkwJyBjeT0nMzcwJyByPScyJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuMjUnLz48Y2lyY2xlIGN4PSc5ODcnIGN5PSc1ODEnIHI9JzMnIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC4zNycvPjxjaXJjbGUgY3g9JzEzODQnIGN5PSc3OTInIHI9JzEnIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC40OScvPjxjaXJjbGUgY3g9JzE4MScgY3k9JzEwMycgcj0nMicgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjYxJy8+PGNpcmNsZSBjeD0nNTc4JyBjeT0nMzE0JyByPSczJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuNzMnLz48Y2lyY2xlIGN4PSc5NzUnIGN5PSc1MjUnIHI9JzEnIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC4yNScvPjxjaXJjbGUgY3g9JzEzNzInIGN5PSc3MzYnIHI9JzInIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC4zNycvPjxjaXJjbGUgY3g9JzE2OScgY3k9JzQ3JyByPSczJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuNDknLz48Y2lyY2xlIGN4PSc1NjYnIGN5PScyNTgnIHI9JzEnIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC42MScvPjxjaXJjbGUgY3g9Jzk2MycgY3k9JzQ2OScgcj0nMicgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjczJy8+PGNpcmNsZSBjeD0nMTM2MCcgY3k9JzY4MCcgcj0nMycgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjI1Jy8+PGNpcmNsZSBjeD0nMTU3JyBjeT0nODkxJyByPScxJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuMzcnLz48Y2lyY2xlIGN4PSc1NTQnIGN5PScyMDInIHI9JzInIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC40OScvPjxjaXJjbGUgY3g9Jzk1MScgY3k9JzQxMycgcj0nMycgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjYxJy8+PGNpcmNsZSBjeD0nMTM0OCcgY3k9JzYyNCcgcj0nMScgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjczJy8+PGNpcmNsZSBjeD0nMTQ1JyBjeT0nODM1JyByPScyJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuMjUnLz48Y2lyY2xlIGN4PSc1NDInIGN5PScxNDYnIHI9JzMnIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC4zNycvPjxjaXJjbGUgY3g9JzkzOScgY3k9JzM1Nycgcj0nMScgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjQ5Jy8+PGNpcmNsZSBjeD0nMTMzNicgY3k9JzU2OCcgcj0nMicgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjYxJy8+PGNpcmNsZSBjeD0nMTMzJyBjeT0nNzc5JyByPSczJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuNzMnLz48Y2lyY2xlIGN4PSc1MzAnIGN5PSc5MCcgcj0nMScgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjI1Jy8+PGNpcmNsZSBjeD0nOTI3JyBjeT0nMzAxJyByPScyJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuMzcnLz48Y2lyY2xlIGN4PScxMzI0JyBjeT0nNTEyJyByPSczJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuNDknLz48Y2lyY2xlIGN4PScxMjEnIGN5PSc3MjMnIHI9JzEnIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC42MScvPjxjaXJjbGUgY3g9JzUxOCcgY3k9JzM0JyByPScyJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuNzMnLz48Y2lyY2xlIGN4PSc5MTUnIGN5PScyNDUnIHI9JzMnIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC4yNScvPjxjaXJjbGUgY3g9JzEzMTInIGN5PSc0NTYnIHI9JzEnIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC4zNycvPjxjaXJjbGUgY3g9JzEwOScgY3k9JzY2Nycgcj0nMicgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjQ5Jy8+PGNpcmNsZSBjeD0nNTA2JyBjeT0nODc4JyByPSczJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuNjEnLz48Y2lyY2xlIGN4PSc5MDMnIGN5PScxODknIHI9JzEnIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC43MycvPjxjaXJjbGUgY3g9JzEzMDAnIGN5PSc0MDAnIHI9JzInIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC4yNScvPjxjaXJjbGUgY3g9Jzk3JyBjeT0nNjExJyByPSczJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuMzcnLz48Y2lyY2xlIGN4PSc0OTQnIGN5PSc4MjInIHI9JzEnIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC40OScvPjxjaXJjbGUgY3g9Jzg5MScgY3k9JzEzMycgcj0nMicgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjYxJy8+PGNpcmNsZSBjeD0nMTI4OCcgY3k9JzM0NCcgcj0nMycgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjczJy8+PGNpcmNsZSBjeD0nODUnIGN5PSc1NTUnIHI9JzEnIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC4yNScvPjxjaXJjbGUgY3g9JzQ4MicgY3k9Jzc2Nicgcj0nMicgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjM3Jy8+PGNpcmNsZSBjeD0nODc5JyBjeT0nNzcnIHI9JzMnIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC40OScvPjxjaXJjbGUgY3g9JzEyNzYnIGN5PScyODgnIHI9JzEnIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC42MScvPjxjaXJjbGUgY3g9JzczJyBjeT0nNDk5JyByPScyJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuNzMnLz48Y2lyY2xlIGN4PSc0NzAnIGN5PSc3MTAnIHI9JzMnIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC4yNScvPjxjaXJjbGUgY3g9Jzg2NycgY3k9JzIxJyByPScxJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuMzcnLz48Y2lyY2xlIGN4PScxMjY0JyBjeT0nMjMyJyByPScyJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuNDknLz48Y2lyY2xlIGN4PSc2MScgY3k9JzQ0Mycgcj0nMycgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjYxJy8+PGNpcmNsZSBjeD0nNDU4JyBjeT0nNjU0JyByPScxJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuNzMnLz48Y2lyY2xlIGN4PSc4NTUnIGN5PSc4NjUnIHI9JzInIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC4yNScvPjxjaXJjbGUgY3g9JzEyNTInIGN5PScxNzYnIHI9JzMnIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC4zNycvPjxjaXJjbGUgY3g9JzQ5JyBjeT0nMzg3JyByPScxJyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAuNDknLz48Y2lyY2xlIGN4PSc0NDYnIGN5PSc1OTgnIHI9JzInIGZpbGw9JyNmZmYnIGZpbGwtb3BhY2l0eT0nMC42MScvPjxjaXJjbGUgY3g9Jzg0MycgY3k9JzgwOScgcj0nMycgZmlsbD0nI2ZmZicgZmlsbC1vcGFjaXR5PScwLjczJy8+PC9zdmc+",
    footer: "",
    slideNumbers: true,
    source: "built-in",
  },
  {
    id: "chalkboard",
    name: "Chalkboard (fun, teaching)",
    colors: { primary: "#F5F5DC", secondary: "#9AE6B4", accent: "#FBD38D", background: "#1F3A2E", surface: "#264536", text: "#F5F5DC", muted: "#C6D3C8", chart: ["#F5F5DC", "#9AE6B4", "#FBD38D", "#90CDF4", "#FEB2B2", "#D6BCFA", "#FAF089", "#B2F5EA"] },
    fonts: { heading: "Segoe Print", body: "Segoe UI" },
    logo: null,
    cover: { style: "solid", image: null },
    background: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxNjAwJyBoZWlnaHQ9JzkwMCcgdmlld0JveD0nMCAwIDE2MDAgOTAwJz48ZyBzdHJva2U9JyNmZmYnIHN0cm9rZS1vcGFjaXR5PScuMDgnIHN0cm9rZS13aWR0aD0nMycgZmlsbD0nbm9uZSc+PHBhdGggZD0nTTgwIDEyMCBxNjAgLTQwIDEyMCAwIHQxMjAgMCcvPjxwYXRoIGQ9J00xMzAwIDc2MCBxNjAgLTQwIDEyMCAwIHQxMjAgMCcvPjxjaXJjbGUgY3g9JzE0NTAnIGN5PScxNjAnIHI9JzYwJy8+PHBhdGggZD0nTTEyMCA3NjAgbDgwIC04MCBsODAgODAgeicvPjwvZz48L3N2Zz4=",
    footer: "",
    slideNumbers: true,
    source: "built-in",
  },
  {
    id: "jungle",
    name: "Jungle (fun)",
    colors: { primary: "#166534", secondary: "#65A30D", accent: "#F59E0B", background: "#FBFDF7", surface: "#ECFCCB", text: "#14270F", muted: "#4D5E44", chart: ["#166534", "#65A30D", "#F59E0B", "#0E7490", "#B45309", "#84CC16", "#047857", "#78350F"] },
    fonts: { heading: "Trebuchet MS", body: "Segoe UI" },
    logo: null,
    cover: { style: "gradient", image: null },
    background: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxNjAwJyBoZWlnaHQ9JzkwMCcgdmlld0JveD0nMCAwIDE2MDAgOTAwJz48ZyBmaWxsPScjMTQ1MzJkJyBmaWxsLW9wYWNpdHk9Jy4xOCc+PHBhdGggZD0nTTAgMCBDMjAwIDgwIDEyMCAyNjAgMCAzMjBaJy8+PHBhdGggZD0nTTE2MDAgOTAwIEMxMzgwIDgyMCAxNDYwIDY0MCAxNjAwIDU4MFonLz48cGF0aCBkPSdNMTYwMCAwIEMxNDIwIDYwIDE1MDAgMjIwIDE2MDAgMjYwWicvPjwvZz48L3N2Zz4=",
    footer: "",
    slideNumbers: true,
    source: "built-in",
  },
];

export const DEFAULT_TEMPLATE_ID = "myseed";

const HEX = /^#[0-9a-f]{6}$/i;
export const hex = (v: unknown, fallback: string) => {
  const s = String(v ?? "").trim();
  const h = s.startsWith("#") ? s : `#${s}`;
  return HEX.test(h) ? h.toUpperCase() : fallback;
};

// A template made safe to keep: colours as #RRGGBB, short names, images as data URLs within limits.
export function cleanTemplate(input: Partial<Omit<DeckTemplate, "id" | "importedFrom">> & { importedFrom?: string | null }, base: DeckTemplate = BUILT_IN_TEMPLATES[0]!): Omit<DeckTemplate, "id" | "source"> {
  const c: Partial<DeckTemplate["colors"]> = input.colors ?? {};
  const img = (v: unknown, max = 3_000_000) => (typeof v === "string" && /^data:image\/(png|jpe?g|gif|svg\+xml|webp);base64,/.test(v) && v.length <= max ? v : null);
  const chart = Array.isArray(c.chart) ? c.chart.map((x, i) => hex(x, base.colors.chart[i % base.colors.chart.length]!)).slice(0, 10) : base.colors.chart;
  return {
    name: String(input.name ?? "").trim().slice(0, 60) || "Template",
    colors: {
      primary: hex(c.primary, base.colors.primary),
      secondary: hex(c.secondary, base.colors.secondary),
      accent: hex(c.accent, base.colors.accent),
      background: hex(c.background, base.colors.background),
      surface: hex(c.surface, base.colors.surface),
      text: hex(c.text, base.colors.text),
      muted: hex(c.muted, base.colors.muted),
      chart: chart.length >= 3 ? chart : base.colors.chart,
    },
    fonts: { heading: String(input.fonts?.heading ?? base.fonts.heading).replace(/[^\w \-]/g, "").slice(0, 40) || base.fonts.heading, body: String(input.fonts?.body ?? base.fonts.body).replace(/[^\w \-]/g, "").slice(0, 40) || base.fonts.body },
    logo: img(input.logo, 600_000),
    cover: { style: (["gradient", "solid", "split", "image"] as const).includes(input.cover?.style as never) ? input.cover!.style : base.cover.style, image: img(input.cover?.image) },
    background: img(input.background),
    footer: String(input.footer ?? "").slice(0, 80),
    slideNumbers: input.slideNumbers !== false,
    importedFrom: input.importedFrom ? String(input.importedFrom).slice(0, 120) : null,
  };
}

// Light or dark text on a colour.
export function onColor(bg: string) {
  const h = bg.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return lum > 0.6 ? "#1F2937" : "#FFFFFF";
}
