// A YouTube video's ID from any of its link forms (youtu.be, watch?v=, embed, shorts, live), for the browser and the
// server alike. Null when the link is not a YouTube video.
export function youtubeIdOf(url: string): string | null {
  const u = String(url ?? "").trim().slice(0, 400);
  if (!u) return null;
  let p: URL;
  try {
    p = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`);
  } catch {
    return null;
  }
  const host = p.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = p.pathname.slice(1).split("/")[0] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (p.pathname === "/watch") id = p.searchParams.get("v");
    else {
      const m = /^\/(embed|shorts|live|v)\/([^/?#]+)/.exec(p.pathname);
      id = m ? m[2]! : null;
    }
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

/** What the app's YouTube player (components/help/article-body YouTube) needs for a video ID. */
export const youtubeVideo = (id: string, title: string | null = null) => ({
  id,
  title,
  url: `https://www.youtube.com/watch?v=${id}`,
  thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  embed: `https://www.youtube-nocookie.com/embed/${id}`,
});
