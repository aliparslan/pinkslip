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
  },
  ios: {
    // Show the web content under the status bar / home indicator like the PWA.
    contentInset: "always",
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
