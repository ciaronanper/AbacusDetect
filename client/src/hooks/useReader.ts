import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyMessage,
  initialReaderState,
  type ReaderState,
  BUTTON_DOWN_COMMAND,
  BUTTON_UP_COMMAND,
} from "@/lib/readerProtocol";
import {
  CapacitorSerialConnection,
  isWebSerialSupported,
  SimulatorConnection,
  WebSerialConnection,
  type ReaderConnection,
} from "@/lib/readerConnection";
import { Capacitor } from "@capacitor/core";

const MAX_LOGS = 300;

export type ConnectionKind = "webserial" | "simulator" | "capacitor" | null;

/**
 * Owns the serial connection and derives `ReaderState` from the incoming line
 * stream. The device is the host: every SCREEN/VIEW/RESULT/ERROR/BATTERY line
 * it sends updates the state that drives the UI.
 */
export function useReader() {
  const [readerState, setReaderState] = useState<ReaderState>(initialReaderState);
  const [status, setStatus] = useState("Disconnected");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [kind, setKind] = useState<ConnectionKind>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const connRef = useRef<ReaderConnection | null>(null);
  const unsubsRef = useRef<Array<() => void>>([]);
  const connectingRef = useRef<Promise<void> | null>(null);

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

  // Single-flight connect: concurrent calls (e.g. native auto-connect racing a
  // manual tap) join the same in-flight promise instead of opening a second
  // connection, and any previous connection is torn down before a new one is
  // attached so listener handles and ports never leak.
  const runConnect = useCallback(
    (factory: () => ReaderConnection, kindName: Exclude<ConnectionKind, null>) => {
      if (connRef.current?.isConnected()) return Promise.resolve();
      if (connectingRef.current) return connectingRef.current;
      const promise = (async () => {
        setConnecting(true);
        try {
          const prev = connRef.current;
          if (prev) {
            try {
              await prev.disconnect();
            } catch {
              /* ignore teardown errors on the old connection */
            }
          }
          const conn = factory();
          attach(conn);
          setKind(kindName);
          await conn.connect();
          setConnected(conn.isConnected());
        } finally {
          connectingRef.current = null;
          setConnecting(false);
        }
      })();
      connectingRef.current = promise;
      return promise;
    },
    [attach],
  );

  const connectWebSerial = useCallback(
    () => runConnect(() => new WebSerialConnection(), "webserial"),
    [runConnect],
  );

  const connectNative = useCallback(
    () => runConnect(() => new CapacitorSerialConnection(), "capacitor"),
    [runConnect],
  );

  const connectSimulator = useCallback(
    () => runConnect(() => new SimulatorConnection(), "simulator"),
    [runConnect],
  );

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
    connecting,
    kind,
    logs,
    webSerialSupported: isWebSerialSupported(),
    isNativePlatform: Capacitor.isNativePlatform(),
    connectWebSerial,
    connectNative,
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
