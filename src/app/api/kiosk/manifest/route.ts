export function GET() {
  const manifest = {
    name: "MySeed Attendance Kiosk",
    short_name: "Kiosk",
    description: "MySeed Attendance Tablet & Mobile Kiosk Station",
    start_url: "/kiosk",
    display: "standalone",
    id: "/kiosk",
    scope: "/kiosk",
    background_color: "#ffffff",
    theme_color: "#7b68ee",
    orientation: "any",
    icons: [{ src: "/api/branding/favicon", sizes: "any", purpose: "any" }],
  };

  return Response.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

