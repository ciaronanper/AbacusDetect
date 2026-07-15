// Serial transport layer for the MicroNow reader.
//
// The UI never talks to a transport directly — it goes through the
// `ReaderConnection` interface, so the same workflow works with:
//   • WebSerialConnection  — real hardware via the Web Serial API (desktop
//     Chrome/Edge today; the seam a Capacitor/WebUSB native bridge plugs into
//     for a packaged Android app).
//   • SimulatorConnection  — inject serial lines by hand for development and
//     for previewing the flow without the physical device.

import { SERIAL_BAUD_RATE } from "./readerProtocol";
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

type Listener<T> = (value: T) => void;

export interface ReaderConnection {
  readonly kind: "webserial" | "simulator" | "capacitor";
  isConnected(): boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(command: string): Promise<void>;
  /** Subscribe to decoded serial lines. Returns an unsubscribe fn. */
  onLine(cb: Listener<string>): () => void;
  /** Subscribe to human-readable status updates. Returns an unsubscribe fn. */
  onStatus(cb: Listener<string>): () => void;
}

/** True when this browser exposes the Web Serial API. */
export function isWebSerialSupported(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

abstract class BaseConnection {
  private lineListeners = new Set<Listener<string>>();
  private statusListeners = new Set<Listener<string>>();

  onLine(cb: Listener<string>): () => void {
    this.lineListeners.add(cb);
    return () => this.lineListeners.delete(cb);
  }
  onStatus(cb: Listener<string>): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }
  protected emitLine(line: string) {
    this.lineListeners.forEach((cb) => cb(line));
  }
  protected emitStatus(status: string) {
    this.statusListeners.forEach((cb) => cb(status));
  }
}

// === WEB SERIAL ============================================================

export class WebSerialConnection extends BaseConnection implements ReaderConnection {
  readonly kind = "webserial" as const;
  private port: any = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private keepReading = false;
  private buffer = "";

  isConnected(): boolean {
    return this.port != null;
  }

  async connect(): Promise<void> {
    const nav = navigator as any;
    if (!nav.serial) {
      this.emitStatus("Web Serial not supported");
      throw new Error("Web Serial not supported in this browser");
    }
    this.emitStatus("Requesting serial port…");
    // Requires a user gesture; opens the browser's port picker.
    const port = await nav.serial.requestPort();
    await port.open({
      baudRate: SERIAL_BAUD_RATE,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      flowControl: "none",
    });
    // Mirror the Flutter app: assert DTR + RTS so the firmware starts talking.
    try {
      await port.setSignals({ dataTerminalReady: true, requestToSend: true });
    } catch {
      /* not all platforms support setSignals */
    }
    this.port = port;
    this.keepReading = true;
    this.buffer = "";
    this.emitStatus("Connected to reader");
    void this.readLoop();
  }

  private async readLoop(): Promise<void> {
    const decoder = new TextDecoder();
    while (this.port && this.keepReading && this.port.readable) {
      const reader = this.port.readable.getReader();
      this.reader = reader;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            this.buffer += decoder.decode(value, { stream: true });
            this.flushLines();
          }
        }
      } catch {
        this.emitStatus("Serial read error");
      } finally {
        try {
          reader.releaseLock();
        } catch {
          /* ignore */
        }
      }
    }
  }

  private flushLines(): void {
    let match: RegExpMatchArray | null;
    // Split on CR, LF or CRLF; firmware terminates lines with CRLF.
    while ((match = this.buffer.match(/\r\n|\n|\r/)) !== null) {
      const idx = match.index ?? 0;
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + match[0].length);
      if (line.length > 0) this.emitLine(line);
    }
  }

  async send(command: string): Promise<void> {
    if (!this.port || !this.port.writable) return;
    const writer = this.port.writable.getWriter();
    try {
      const bytes = new TextEncoder().encode(`${command}\r\n`);
      await writer.write(bytes);
    } finally {
      try {
        writer.releaseLock();
      } catch {
        /* ignore */
      }
    }
  }

  async disconnect(): Promise<void> {
    this.keepReading = false;
    try {
      await this.reader?.cancel();
    } catch {
      /* ignore */
    }
    this.reader = null;
    try {
      await this.port?.close();
    } catch {
      /* ignore */
    }
    this.port = null;
    this.emitStatus("Disconnected");
  }
}

// === SIMULATOR =============================================================

export class SimulatorConnection extends BaseConnection implements ReaderConnection {
  readonly kind = "simulator" as const;
  private connected = false;

  isConnected(): boolean {
    return this.connected;
  }
  async connect(): Promise<void> {
    this.connected = true;
    this.emitStatus("Simulator connected");
  }
  async disconnect(): Promise<void> {
    this.connected = false;
    this.emitStatus("Disconnected");
  }
  async send(command: string): Promise<void> {
    // Echo outgoing commands so they appear in the log during development.
    this.emitStatus(`→ ${command}`);
  }
  /** Feed one or more serial lines into the pipeline as if from the device. */
  inject(payload: string): void {
    payload.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (trimmed) this.emitLine(trimmed);
    });
  }
}

// === NATIVE (CAPACITOR) ====================================================
// Talks to the reader over Android USB serial through the native ReaderSerial
// plugin (android/app/src/main/java/.../ReaderSerialPlugin.java). Selected
// automatically when the app runs inside the packaged native build. The plugin
// mirrors the Flutter UsbService: open the first device, 115200 8N1, DTR/RTS
// high, CRLF line framing, write commands with a trailing CRLF.

export interface SerialDeviceInfo {
  deviceName: string;
  vendorId: number;
  productId: number;
}

export interface ReaderSerialPlugin {
  listDevices(): Promise<{ devices: SerialDeviceInfo[] }>;
  connect(options?: { baudRate?: number }): Promise<void>;
  send(options: { command: string }): Promise<void>;
  disconnect(): Promise<void>;
  addListener(
    eventName: "line",
    listenerFunc: (data: { line: string }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "status",
    listenerFunc: (data: { status: string }) => void,
  ): Promise<PluginListenerHandle>;
}

export const ReaderSerial = registerPlugin<ReaderSerialPlugin>("ReaderSerial");

export class CapacitorSerialConnection extends BaseConnection implements ReaderConnection {
  readonly kind = "capacitor" as const;
  private connected = false;
  private handles: PluginListenerHandle[] = [];

  isConnected(): boolean {
    return this.connected;
  }

  async connect(): Promise<void> {
    // Subscribe before opening so no early lines are missed.
    this.handles.push(
      await ReaderSerial.addListener("line", ({ line }) => this.emitLine(line)),
    );
    this.handles.push(
      await ReaderSerial.addListener("status", ({ status }) => {
        this.emitStatus(status);
        const s = status.toLowerCase();
        if (s.includes("connected to reader")) {
          this.connected = true;
        } else if (
          s.includes("disconnect") ||
          s.includes("error") ||
          s.includes("denied") ||
          s.includes("no usb")
        ) {
          // Terminal states (unplug, read error, permission denied) mark the
          // transport as down so the UI can react and reconnect cleanly.
          this.connected = false;
        }
      }),
    );
    try {
      await ReaderSerial.connect({ baudRate: SERIAL_BAUD_RATE });
      this.connected = true;
    } catch (err) {
      await this.removeHandles();
      throw err;
    }
  }

  async send(command: string): Promise<void> {
    await ReaderSerial.send({ command });
  }

  async disconnect(): Promise<void> {
    try {
      await ReaderSerial.disconnect();
    } catch {
      /* ignore */
    }
    await this.removeHandles();
    this.connected = false;
    this.emitStatus("Disconnected");
  }

  private async removeHandles(): Promise<void> {
    for (const h of this.handles) {
      try {
        await h.remove();
      } catch {
        /* ignore */
      }
    }
    this.handles = [];
  }
}
