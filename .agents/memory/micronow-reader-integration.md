---
name: MicroNow reader integration
description: Non-obvious constraints for the serial-driven MicroNow reader in AbacusDetect — result-screen semantics, power-button handshake, and the Replit preview sandbox limits.
---

# MicroNow reader integration (AbacusDetect)

The physical reader is the HOST. It streams CRLF line messages over serial
(115200 8N1) that drive the phone UI. The phone only identifies nurse/patient
(QR) and sends button commands; every assay screen is device-driven.

## Result screen is DISPLAYRESULT-only
`applyMessage` clears `resultText` on **every** screen except `SCREEN:DISPLAYRESULT`.
Several screens map to `UPDATE_FINISHED` (e.g. `SYNCFINISH`), so `UPDATE_FINISHED`
must **not** be treated as a result view — doing so shows/saves a null result.

**Rule:** `DISPLAYRESULT` is the single trigger to display AND persist a result.
Never default a missing/NaN result value to `0` — a diagnostic app must show a
"result unavailable / retest" state instead of fabricating a band.
**Why:** a fabricated `0` renders as a "Very Low" clinical band; on the
`RESULT: → SYNCFINISH` path the payload is already cleared. Both silently
mislead. **How to apply:** gate save/render on `currentView === "DISPLAYRESULT"
&& parseResult(...).value != null`.

## Power-button handshake
Phone→device power button sends `"0 BUTTON"` (press) / `"0 BUTTON_UP"` (release),
i.e. a channel-prefixed verb — matching the real firmware in the reference
Flutter app, NOT the protocol doc's bare `BUTTON`.

## Replit preview sandbox limits
Web Serial (`navigator.serial`) and camera (`getUserMedia`) are blocked inside
the Replit preview iframe (and Web Serial needs desktop Chrome/Edge anyway).
So the app ships two seams that are REQUIRED for verification here, not just
nice-to-haves:
- a `SimulatorConnection` (inject lines by hand) alongside `WebSerialConnection`;
- a manual-entry fallback in the QR scanner.
**How to apply:** verify device flows via the simulator panel + the pure
`readerProtocol` state machine (run it under `tsx`), not by expecting live
hardware/camera in preview.

**Simulator must auto-drive the flow.** On entering the device-driven ("running")
phase in simulator mode the app auto-plays the reader sequence. A bare "connect
simulator" dead-ends at the WAITING screen (whose copy promises the screen
updates automatically) because nothing is host-feeding lines. **Why:** the reader
is the host; with no device and a hidden manual panel, users saw "nothing
happens." **How to apply:** keep the manual panel, but the default preview path
must advance on its own; gate the auto-play on `kind==='simulator'` so the
real-hardware path is untouched, and make WAITING copy simulator-aware.

## Cross-test contamination guards (result screen)
The result screen hosts async work (result auto-save, voice-note uploads,
"Push to Health Record"). Rules, born from a review-caught race:
- **Session token:** each async chain captures the per-test session counter at
  start and abandons remaining steps + ALL state updates if it changed ("New
  Test"/"Home" increment it). **Why:** a late completion otherwise marks the
  NEXT patient's test as pushed, or attaches notes to the previous result row.
- **Single-flight create:** auto-save and push must await one shared
  create-result promise, never issue independent creates for the same test.
- **Recorder unmount:** MediaRecorder `onstop` fires after unmount when the
  screen resets mid-recording; discard the clip via an unmounted flag — an
  `onAdd` there would drop the clip into the next test's note list.
- Pushing is blocked while the mic is live so no clip is silently left
  unuploaded on a "pushed" screen.
