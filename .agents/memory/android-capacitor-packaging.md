---
name: Android Capacitor packaging
description: Durable decisions for packaging the AbacusDetect web app as a native Android app that owns the USB serial connection to the reader.
---

# Android Capacitor packaging

The web app is wrapped with Capacitor so it runs as a native Android app that
itself owns the USB-serial connection to the MicroNow reader (phone as USB
host/OTG), matching the reference Flutter app.

## Durable decisions & constraints

- **The APK cannot be built inside Replit** — no Android SDK/JDK/Gradle in the
  container. Only Capacitor scaffolding/copy steps (`cap add`, `cap sync`) work
  here; compilation and running happen in Android Studio on the user's machine.
  Don't expect gradle / `cap run` to succeed in the container.

- **Native serial is a third transport** behind `Capacitor.isNativePlatform()`,
  alongside Web Serial and the simulator. It bridges to a small native Capacitor
  plugin built on mik3y's `usb-serial-for-android` — the same library the Flutter
  `usb_serial` plugin wraps.
  **How to apply:** keep the native behavior in lockstep with the Flutter
  `UsbService` (115200 8N1, DTR+RTS high, CRLF framing, commands sent with a
  trailing CRLF). Make native connect single-flight/idempotent and tear the port
  down on read errors (unplug) so the UI never stays falsely connected.

- **Backend reachability from the packaged app:** the native WebView origin is
  not the backend, so API calls need an absolute base. Enable `CapacitorHttp`
  (bypasses CORS on-device) and prefix a build-time base URL on native only; the
  server was left unchanged.
  **Why:** the results endpoints are unauthenticated (no cookies), so no CORS
  middleware / `cors` dependency is needed for a native-only concern.

- **Keep all Capacitor packages on the same major.** Installing them via
  `@latest` once pulled a mismatched CLI vs core/android major; always align
  them or `cap` sync/build drifts.

- **Rebuild before sync:** Capacitor copies the built web assets, so run the web
  build before `cap sync` or the app ships stale assets.
