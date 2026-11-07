export function GET() {
  const manifest = {
    name: "MySeed Attendance Kiosk",
    short_name: "Kiosk",
    description: "MySeed Attendance Tablet & Mobile Kiosk Station",
    start_url: "/kiosk",
    display: "standalone",
    background_color: "#0a0a14",
    theme_color: "#14132a",
    orientation: "any",
    icons: [
      {
        src: "/icon.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  };

  return Response.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

