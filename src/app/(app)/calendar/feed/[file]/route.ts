import { icsForToken } from "@/server/tools-data";
import { appOrigin } from "@/server/password-reset";

// A person's private reminder feed for Google Calendar, Outlook and Apple Calendar:
//   /calendar/feed/<token>.ics   (Tools, Reminder Calendar, Subscribe). The token is the only key, so it is long,
// random, stored only as a hash, expires after a year and can be replaced at any time.
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const token = file.replace(/\.ics$/i, "");
  const body = await icsForToken(token, await appOrigin());
  if (!body) return new Response("This calendar link is not valid any more. Make a new one in Myseed, Tools, Reminder Calendar.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="myseed-reminders.ics"',
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
    },
  });
}
