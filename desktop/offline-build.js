// Builds the offline edition of the desktop app: the site's self-contained server (built first with
// NEXT_OUTPUT=standalone, with .next/static and public copied in) travels inside the app as resources/server.
// The app starts it on this computer with its own database and opens the arcade: no account, no internet.
const { build } = require("electron-builder");
const base = require("./package.json").build;

build({
  win: ["nsis"],
  x64: true,
  config: {
    ...base,
    appId: `${base.appId}.offline`,
    productName: "Seed Town Offline",
    extraResources: [{ from: "../.next/standalone", to: "server", filter: ["**/*"] }],
    win: { ...base.win, target: ["nsis"], artifactName: "SeedTown-Offline-${version}-${arch}.${ext}" },
    nsis: { ...(base.nsis || {}), artifactName: "SeedTown-Offline-${version}-${arch}.${ext}" },
    publish: null,
  },
}).then(
  (files) => console.log("built", files.join(", ")),
  (e) => (console.error(e), process.exit(1)),
);
