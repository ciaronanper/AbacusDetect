import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.abacuslabs.abacusdetect",
  appName: "AbacusDetect",
  webDir: "dist/public",
  plugins: {
    // Route fetch/XHR through native HTTP on-device so the packaged app can
    // reach the deployed backend (see VITE_API_BASE_URL) without running into
    // cross-origin/CORS restrictions. No effect on the web build.
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
