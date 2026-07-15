---
name: Flutter app in this repl
description: The separate Flutter (Dart) reader app lives here, and what you can/can't verify in-container.
---

# AbacusDetect Flutter app (separate from the Capacitor app)

The repl's primary app is React/Express + Capacitor. There is ALSO a separate,
standalone **Flutter (Dart)** app — a minimal single-screen "reader mirror" —
kept in `flutter_app/abacusdetect_v1/`, deliberately in a subfolder so it does
not tangle with the Node app or its workflow. The user develops/builds it in
VS Code on their own machine.

## Verification constraint (non-obvious)
- Replit offers a **Dart** module (`dart-3.10`) but **no Flutter module**:
  `listAvailableModules({ language: "flutter" })` returns `[]`.
- Therefore, in-container you can only **syntax-check** Dart:
  `dart format --output=none lib/` (parses all files; exit 0 = OK). Run it as a
  dry-run so it does NOT rewrite the user's hand-formatting.
- You **cannot** run `flutter pub get`, `flutter analyze`, or build/launch the
  app here. `usb_serial` + `package:flutter/*` won't resolve without the SDK.
- The installed Dart (3.10) is also OLDER than the app's pubspec
  `sdk: ^3.12.2`, so pub resolution would fail regardless.

**Why:** full analyze/build/run happens on the user's machine (`flutter analyze`,
`flutter run`, `flutter build apk`).

**How to apply:** when editing this Flutter app, make tight, self-consistent
edits, syntax-check with `dart format`, do a careful manual review, and hand off
`flutter analyze`/run to the user. Don't try to install a Flutter SDK module
(not offered) or run flutter tooling in-container.
