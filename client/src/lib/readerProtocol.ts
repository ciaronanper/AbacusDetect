// MicroNow Phone Protocol v1 — TypeScript port of the device reader protocol.
//
// The physical reader is the HOST. It streams line-based messages over serial
// (115200 8N1, CRLF-terminated) that tell the phone what to display. This module
// is a faithful port of the Flutter `ReaderProtocol` / `ReaderState` so the same
// state machine drives the web/Android UI.
//
// Device -> Phone message families:
//   SCREEN:<name>          reader's current screen (mapped to a view)
//   VIEW:<name>            explicit view override
//   RESULT:<value>:<units> assay result, e.g. RESULT:12.34:mg/dL
//   ERROR:<code>           e.g. ERROR:LOW_CLINE
//   BATTERY:<level>        DEAD | LOW | MID | HIGH_MID | HIGH
//   BLE:<state>            CONNECTED | DISCONNECTED | SYNCING | SYNC_COMPLETE
//   STATUS:<state>         CARTRIDGE_INSERTED | SAMPLE_DETECTED | ...
//
// Phone -> Device commands (see BUTTON_* constants below).

export interface ReaderState {
  /** Last raw SCREEN:* value from the device. */
  readerScreen: string;
  /** Normalized view that drives the UI (see mapScreenToView / VIEW: messages). */
  currentView: string;
  /** DEAD | LOW | MID | HIGH_MID | HIGH | UNKNOWN */
  battery: string;
  /** Raw "value:units" payload from the last RESULT: message. */
  resultText: string | null;
  /** Raw code from the last ERROR: message. */
  errorText: string | null;
  /** CONNECTED | DISCONNECTED | SYNCING | SYNC_COMPLETE | UNKNOWN */
  ble: string;
  /** Last STATUS:* value from the device. */
  status: string;
}

export function initialReaderState(): ReaderState {
  return {
    readerScreen: "UNKNOWN",
    currentView: "WAITING",
    battery: "UNKNOWN",
    resultText: null,
    errorText: null,
    ble: "UNKNOWN",
    status: "UNKNOWN",
  };
}

/** Map a device SCREEN:* value to the normalized view the UI renders. */
export function mapScreenToView(screen: string): string {
  switch (screen) {
    case "WAKEUP":
      return "WAKEUP";
    case "HOME":
    case "IDLE":
      return "INSERT_CARTRIDGE";
    case "POWEROFF":
      return "POWEROFF";
    case "BARCODESCAN":
    case "LOTIDLOAD":
    case "LOTIDBLESCAN":
      return "CHECKING";
    case "BARCODEINVALID":
      return "BARCODE_INVALID";
    case "LOTIDNOTFOUND":
      return "ERROR";
    case "SAMPLEDETECTION":
      return "APPLY_DROPS";
    case "SAMPLEDETECTED":
      return "SAMPLE_DETECTED";
    case "RUNASSAY":
    case "READWAIT":
    case "ASSAYLOCALSAVE":
    case "ASSAYUPLOAD":
    case "BLECONNECT":
      return "CHECKING";
    case "DISPLAYRESULT":
      // Dedicated result view so the UI can show the rich result screen.
      return "DISPLAYRESULT";
    case "UPDATEDETECTION":
    case "UPDATE":
      return "UPDATING";
    case "SYNCFINISH":
      return "UPDATE_FINISHED";
    case "DEVMODE":
      return "DEVMODE";
    case "CLEANLENS":
      return "CLEAN_LENS";
    default:
      return "ERROR";
  }
}

/** Friendly text for a view (used as a fallback headline). */
export function viewToDisplayText(view: string): string {
  const normalized = view.startsWith("VIEW:") ? view.slice("VIEW:".length) : view;
  switch (normalized) {
    case "WAKEUP":
      return "Wake device";
    case "INSERT_CARTRIDGE":
      return "Insert cartridge";
    case "CHECKING":
      return "Checking…";
    case "BARCODE_INVALID":
      return "Barcode invalid";
    case "UPDATE_FINISHED":
      return "Finished";
    case "DISPLAYRESULT":
      return "Result ready";
    case "DEVMODE":
      return "Developer mode";
    case "APPLY_DROPS":
      return "Apply drops";
    case "SAMPLE_DETECTED":
      return "Sample detected";
    case "ERROR":
      return "Error";
    case "CLEAN_LENS":
      return "Clean lens";
    case "NOCLINE":
      return "No control line";
    case "UPDATING":
      return "Updating";
    case "POWEROFF":
      // Never surfaced as "powering off" — the app always shows the next
      // actionable step instead.
      return "Insert cartridge";
    case "CARTRIDGE_REMOVED":
      return "Cartridge removed";
    case "CARTIRDGE_USED":
    case "CARTRIDGE_USED":
      return "Cartridge already used";
    case "CHECKINSERT":
      return "Checking insertion";
    case "CHECKINGBATTERY":
      return "Checking battery";
    case "WAITING":
      // Never surfaced as "waiting for reader" — the app always shows the
      // next actionable step instead.
      return "Insert cartridge";
    default:
      return normalized.replace(/_/g, " ");
  }
}

/** Friendly text for an ERROR:* code. */
export function errorToDisplayText(code: string): string {
  switch (code) {
    case "LOW_CLINE":
      return "Low control line — please retest";
    case "HIGH_CLINE":
      return "High control line — please retest";
    case "LOTID_NOT_FOUND":
      return "Lot ID not found";
    case "BARCODE_INVALID":
      return "Barcode invalid";
    default:
      return code.replace(/_/g, " ");
  }
}

/** Apply a single serial line to the reader state, returning the next state. */
export function applyMessage(state: ReaderState, rawMsg: string): ReaderState {
  const msg = rawMsg.trim();

  if (msg.startsWith("SCREEN:")) {
    const screen = msg.slice("SCREEN:".length).trim();
    const keepResult = screen === "DISPLAYRESULT";
    return {
      ...state,
      readerScreen: screen,
      currentView: mapScreenToView(screen),
      resultText: keepResult ? state.resultText : null,
      errorText: keepResult ? state.errorText : null,
    };
  }
  if (msg.startsWith("BATTERY:")) {
    return { ...state, battery: msg.slice("BATTERY:".length).trim() };
  }
  if (msg.startsWith("RESULT:")) {
    return { ...state, resultText: msg.slice("RESULT:".length).trim(), errorText: null };
  }
  if (msg.startsWith("ERROR:")) {
    return {
      ...state,
      errorText: msg.slice("ERROR:".length).trim(),
      resultText: null,
      currentView: "ERROR",
    };
  }
  if (msg.startsWith("VIEW:")) {
    return { ...state, currentView: msg.slice("VIEW:".length).trim() };
  }
  if (msg.startsWith("BLE:")) {
    return { ...state, ble: msg.slice("BLE:".length).trim() };
  }
  if (msg.startsWith("STATUS:")) {
    return { ...state, status: msg.slice("STATUS:".length).trim() };
  }
  return state;
}

// === RESULT PARSING / CLASSIFICATION =======================================

export interface ParsedResult {
  value: number | null;
  units: string;
  raw: string;
}

/** Parse a RESULT payload "value:units" (e.g. "12.34:mg/dL"). */
export function parseResult(resultText: string | null): ParsedResult {
  if (!resultText) return { value: null, units: "", raw: "" };
  const parts = resultText.split(":");
  const value = parseFloat(parts[0]);
  const units = parts.slice(1).join(":").trim();
  return { value: Number.isNaN(value) ? null : value, units, raw: resultText };
}

export interface Classification {
  level: string;
  interpretation: string;
}

/** SAA2 5-band classification derived from the numeric result value. */
export function classifyValue(value: number): Classification {
  if (value < 10) return { level: "Very Low", interpretation: "Very low probability of SBI" };
  if (value < 50) return { level: "Low", interpretation: "Low probability of SBI" };
  if (value <= 200) return { level: "Moderate", interpretation: "Moderate probability of SBI" };
  if (value <= 300) return { level: "High", interpretation: "High probability of SBI" };
  return { level: "Very High", interpretation: "Very high probability of SBI" };
}

// === PHONE -> DEVICE COMMANDS ==============================================
// Matches the physical firmware handshake used by the Flutter app: a channel
// prefix ("0 ") followed by the button verb. Adjust here if firmware changes.
export const BUTTON_DOWN_COMMAND = "0 BUTTON";
export const BUTTON_UP_COMMAND = "0 BUTTON_UP";

// === SERIAL LINK SETTINGS ==================================================
export const SERIAL_BAUD_RATE = 115200;
export const SERIAL_LINE_DELIMITER = "\r\n";
