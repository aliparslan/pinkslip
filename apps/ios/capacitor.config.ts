import type { CapacitorConfig } from "@capacitor/cli";

// Local live-reload is opt-in. Production builds always package the iOS bundle
// so a release cannot silently turn into a remote website when the network is
// unavailable or the deployment changes underneath an App Store binary.
//
//   bun run dev                            # worker on :8787  (terminal 1)
//   bun --filter @pinkslip/ios dev         # vite on :5173    (terminal 2)
//   CAP_SERVER_URL=http://localhost:5173 bun --filter @pinkslip/ios sync
//
const serverUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: "dev.alip.pinkslip",
  appName: "pinkslip",
  webDir: "dist",
  // Initial native surface. Capacitor 8.0.4+ replaces the keyboard backdrop
  // from the live DOM color so light/dark app themes remain in sync.
  backgroundColor: "#faf9f7",
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          cleartext: serverUrl.startsWith("http://"),
        },
      }
    : {}),
  ios: {
    // Run edge-to-edge; the web app handles status bar / home-indicator spacing
    // itself via CSS env(safe-area-inset-*).
    contentInset: "never",
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    Keyboard: {
      // Resize the WebView when the keyboard appears so focused inputs aren't
      // covered. CSS hides the mobile tab bar while a field has focus.
      resize: "native",
      autoBackdropColor: "dom",
    },
  },
};

export default config;
