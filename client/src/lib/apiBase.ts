// Resolves API URLs for both the web app and the packaged native app.
//
// On the web (desktop/preview) the frontend and API share an origin, so
// relative paths like "/api/results" work as-is. Inside the packaged Android
// app the WebView origin is the bundled app (not the server), so requests must
// target the deployed backend. Set VITE_API_BASE_URL at build time to that URL
// (see client/.env.example). When it is empty, paths stay relative.
import { Capacitor } from "@capacitor/core";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

/** Prefix an API path with the deployed backend base URL when running natively. */
export function apiUrl(path: string): string {
  if (API_BASE && Capacitor.isNativePlatform()) {
    return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  }
  return path;
}
