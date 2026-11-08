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
    icons: [192,512].map(size=>({src:`/brand/kiosk-${size}.png`,sizes:`${size}x${size}`,type:"image/png",purpose:"any maskable"})),
  };

  return Response.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

