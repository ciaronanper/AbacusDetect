import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyMessage,
  initialReaderState,
  type ReaderState,
  BUTTON_DOWN_COMMAND,
  BUTTON_UP_COMMAND,
} from "@/lib/readerProtocol";
import {
  isWebSerialSupported,
  SimulatorConnection,
  WebSerialConnection,
  type ReaderConnection,
} from "@/lib/readerConnection";

const MAX_LOGS = 300;

export type ConnectionKind = "webserial" | "simulator" | null;

/**
 * Owns the serial connection and derives `ReaderState` from the incoming line
 * stream. The device is the host: every SCREEN/VIEW/RESULT/ERROR/BATTERY line
 * it sends updates the state that drives the UI.
 */
export function useReader() {
  const [readerState, setReaderState] = useState<ReaderState>(initialReaderState);
  const [status, setStatus] = useState("Disconnected");
  const [connected, setConnected] = useState(false);
  const [kind, setKind] = useState<ConnectionKind>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const connRef = useRef<ReaderConnection | null>(null);
  const unsubsRef = useRef<Array<() => void>>([]);

  const pushLog = useCallback((entry: string) => {
    setLogs((prev) => {
      const next = prev.length >= MAX_LOGS ? prev.slice(prev.length - MAX_LOGS + 1) : prev;
      return [...next, entry];
    });
  }, []);

  const attach = useCallback(
    (conn: ReaderConnection) => {
      // Tear down any previous subscriptions.
      unsubsRef.current.forEach((u) => u());
      unsubsRef.current = [];
      connRef.current = conn;

      unsubsRef.current.push(
        conn.onLine((line) => {
          pushLog(line);
          setReaderState((prev) => applyMessage(prev, line));
        }),
      );
      unsubsRef.current.push(
        conn.onStatus((s) => {
          setStatus(s);
          setConnected(conn.isConnected());
          pushLog(`[SYSTEM]: ${s}`);
        }),
      );
    },
    [pushLog],
  );

  const connectWebSerial = useCallback(async () => {
    const conn = new WebSerialConnection();
    attach(conn);
    setKind("webserial");
    await conn.connect();
    setConnected(conn.isConnected());
  }, [attach]);

  const connectSimulator = useCallback(async () => {
    const conn = new SimulatorConnection();
    attach(conn);
    setKind("simulator");
    await conn.connect();
    setConnected(true);
  }, [attach]);

  const disconnect = useCallback(async () => {
    await connRef.current?.disconnect();
    setConnected(false);
  }, []);

  const sendCommand = useCallback(
    async (command: string) => {
      pushLog(`[APP]: ${command}`);
      await connRef.current?.send(command);
    },
    [pushLog],
  );

  const sendButtonDown = useCallback(() => sendCommand(BUTTON_DOWN_COMMAND), [sendCommand]);
  const sendButtonUp = useCallback(() => sendCommand(BUTTON_UP_COMMAND), [sendCommand]);

  /** Inject a raw line (simulator only). No-op on real hardware. */
  const inject = useCallback((line: string) => {
    const conn = connRef.current;
    if (conn && conn.kind === "simulator") {
      (conn as SimulatorConnection).inject(line);
    }
  }, []);

  const resetReaderState = useCallback(() => setReaderState(initialReaderState()), []);
  const clearLogs = useCallback(() => setLogs([]), []);

  useEffect(() => {
    return () => {
      unsubsRef.current.forEach((u) => u());
      void connRef.current?.disconnect();
    };
  }, []);

  return {
    readerState,
    status,
    connected,
    kind,
    logs,
    webSerialSupported: isWebSerialSupported(),
    connectWebSerial,
    connectSimulator,
    disconnect,
    sendCommand,
    sendButtonDown,
    sendButtonUp,
    inject,
    resetReaderState,
    clearLogs,
  };
}
