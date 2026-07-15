# AbacusDetect — Android app (Capacitor)

The AbacusDetect web app is packaged as a native Android app with
[Capacitor](https://capacitorjs.com/) so the **app initiates the USB serial
connection** to the MicroNow reader (the phone/tablet is the USB host via OTG).
This mirrors the reference Flutter app.

The Replit container has **no Android SDK / JDK / Gradle**, so the APK is built
on your machine in Android Studio. Everything needed is committed under
`android/`.

## Prerequisites

- Android Studio (Hedgehog or newer) with the Android SDK.
- JDK 21 (bundled with recent Android Studio).
- Node.js 20+ with this repo checked out locally.
- A physical Android device with **USB-OTG (USB host) support** plus an OTG
  cable/adapter for the reader. The emulator cannot access USB serial hardware.

## Build the web layer and sync it into Android

Run from the repo root. Repeat steps 3–4 after any frontend change:

```bash
# 1. Install JS dependencies
npm install

# 2. Point the packaged app at your deployed backend so results are saved.
#    (See client/.env.example. Omit only if you don't need result syncing.)
export VITE_API_BASE_URL="https://<your-app>.replit.app"

# 3. Build the web app
npm run build

# 4. Copy the web build + Capacitor config into the Android project
npx cap sync android
```

## Open, build, and run

```bash
npx cap open android      # opens the project in Android Studio
```

In Android Studio: pick your connected device and press **Run** (▶).
To produce a shareable APK: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

## Testing with the reader (on-device)

1. Install and open the app on the device.
2. Connect the MicroNow reader to the phone with the USB-OTG adapter.
3. The app **auto-connects** when the reader screen appears (matching the Flutter
   app). You can also tap **Connect Reader (USB)**.
4. The first time, Android shows a USB permission dialog — tap **OK** (tick
   "always" to remember it). From there the assay flow is driven by the reader,
   exactly as in the web app.

### If the reader isn't detected

The native plugin opens the first recognized USB-serial device.
`usb-serial-for-android` supports FTDI, CP210x, CH34x, Prolific, and CDC-ACM
chips out of the box.

- Find the reader's vendor ID (VID) and product ID (PID) — e.g. plug it into a
  computer (`lsusb`) or run `adb shell dumpsys usb`.
- Add it to `android/app/src/main/res/xml/device_filter.xml`. VID/PID there are
  **decimal** (hex `0x0403` → `1027`). This only affects auto-launch on plug-in;
  the driver prober already handles the common chips listed above.

## Where things live

| Piece | Path |
| --- | --- |
| Capacitor config | `capacitor.config.ts` |
| Native USB-serial plugin | `android/app/src/main/java/com/abacuslabs/abacusdetect/ReaderSerialPlugin.java` |
| Plugin registration | `android/app/src/main/java/com/abacuslabs/abacusdetect/MainActivity.java` |
| USB host feature + attach intent filter | `android/app/src/main/AndroidManifest.xml` |
| USB device filter | `android/app/src/main/res/xml/device_filter.xml` |
| Serial library dependency | `android/app/build.gradle` (`usb-serial-for-android`) |
| TS side of the plugin | `client/src/lib/readerConnection.ts` (`CapacitorSerialConnection`) |
| Backend base URL | `client/.env.example` (`VITE_API_BASE_URL`) |

## Notes

- USB serial and the camera only work on a **physical device** — not the
  emulator, and not the Replit preview.
- The app talks to the reader at **115200 8N1, DTR/RTS high, CRLF framing** — the
  same as the Flutter `usb_serial` implementation. Commands are written with a
  trailing `\r\n`.
- Results are sent to the deployed backend. If the network or
  `VITE_API_BASE_URL` is unavailable, the app keeps working and simply reports
  the save failure (the diagnostic flow itself never depends on the network).
