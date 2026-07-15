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
