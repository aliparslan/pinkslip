import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "dev.alip.pinkslip",
  appName: "pinkslip",
  // `dist` (frontend/dist) is the bundled web build, used as an offline fallback.
  webDir: "dist",
  server: {
    // Run the WebView against the live origin so the existing cookie session,
    // SSE tailoring, and client-side PDF/Typst all work unchanged. Loading the
    // production origin (not capacitor://localhost) keeps cookies first-party.
    url: "https://pinkslip.alip.dev",
    cleartext: false,
    // For local live-reload dev: set url to "http://localhost:5173" + cleartext true,
    // run `vite` + `wrangler dev`, then `cap copy ios` and rebuild.
  },
  ios: {
    // Run edge-to-edge; the web app handles status bar / home-indicator spacing
    // itself via CSS env(safe-area-inset-*).
    contentInset: "never",
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
