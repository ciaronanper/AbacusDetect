package com.abacuslabs.abacusdetect;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbManager;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.hoho.android.usbserial.driver.UsbSerialDriver;
import com.hoho.android.usbserial.driver.UsbSerialPort;
import com.hoho.android.usbserial.driver.UsbSerialProber;
import com.hoho.android.usbserial.util.SerialInputOutputManager;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Native USB-serial bridge for the MicroNow reader.
 *
 * <p>Mirrors the reference Flutter {@code UsbService}: open the first attached
 * serial device, configure 115200 8N1 with no parity, raise DTR and RTS, read
 * bytes on a background thread and emit CRLF-delimited lines, and write commands
 * with a trailing CRLF. Events are pushed to JavaScript via {@code notifyListeners}:
 * <ul>
 *   <li>{@code "line"}  &rarr; {@code { line: string }} for each received line</li>
 *   <li>{@code "status"} &rarr; {@code { status: string }} for connection state</li>
 * </ul>
 *
 * <p>{@code connect()} is single-flight and idempotent, and read errors (e.g. an
 * unplugged cable) tear the port down and report a disconnect so the UI never
 * stays falsely "connected".
 */
@CapacitorPlugin(name = "ReaderSerial")
public class ReaderSerialPlugin extends Plugin implements SerialInputOutputManager.Listener {

    private static final String ACTION_USB_PERMISSION = "com.abacuslabs.abacusdetect.USB_PERMISSION";
    private static final int WRITE_TIMEOUT_MS = 2000;
    private static final int DEFAULT_BAUD_RATE = 115200;

    // Read on the serial IO thread (onRunError) as well as the main thread.
    private volatile UsbSerialPort port;
    private SerialInputOutputManager ioManager;
    private final StringBuilder lineBuffer = new StringBuilder();
    private int baudRate = DEFAULT_BAUD_RATE;
    private BroadcastReceiver permissionReceiver;
    // Guards against overlapping connect attempts (main-thread only).
    private boolean connecting = false;

    @PluginMethod
    public void listDevices(PluginCall call) {
        UsbManager manager = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
        List<UsbSerialDriver> drivers = UsbSerialProber.getDefaultProber().findAllDrivers(manager);
        JSArray devices = new JSArray();
        for (UsbSerialDriver driver : drivers) {
            UsbDevice device = driver.getDevice();
            JSObject info = new JSObject();
            info.put("deviceName", device.getDeviceName());
            info.put("vendorId", device.getVendorId());
            info.put("productId", device.getProductId());
            devices.put(info);
        }
        JSObject ret = new JSObject();
        ret.put("devices", devices);
        call.resolve(ret);
    }

    @PluginMethod
    public void connect(PluginCall call) {
        if (port != null) {
            // Already connected — idempotent success.
            emitStatus("Connected to reader");
            call.resolve();
            return;
        }
        if (connecting) {
            call.reject("Connect already in progress");
            return;
        }
        connecting = true;

        Integer baud = call.getInt("baudRate", DEFAULT_BAUD_RATE);
        baudRate = baud != null ? baud : DEFAULT_BAUD_RATE;

        UsbManager manager = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
        List<UsbSerialDriver> drivers = UsbSerialProber.getDefaultProber().findAllDrivers(manager);
        if (drivers.isEmpty()) {
            connecting = false;
            emitStatus("No USB devices found");
            call.reject("No USB devices found");
            return;
        }

        UsbSerialDriver driver = drivers.get(0);
        if (!manager.hasPermission(driver.getDevice())) {
            requestPermission(manager, driver, call);
            return;
        }
        openDriver(manager, driver, call);
    }

    private void requestPermission(final UsbManager manager, final UsbSerialDriver driver, final PluginCall call) {
        // Drop any receiver left over from a prior attempt before starting a new flow.
        unregisterPermissionReceiver();

        emitStatus("Requesting USB permission");
        // USB permission requires a mutable PendingIntent (API 31+) so the
        // framework can attach the granted-device extras to the broadcast it
        // sends back; FLAG_UPDATE_CURRENT keeps repeat requests on one intent.
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            flags |= PendingIntent.FLAG_MUTABLE;
        }
        Intent intent = new Intent(ACTION_USB_PERMISSION).setPackage(getContext().getPackageName());
        final PendingIntent pending = PendingIntent.getBroadcast(getContext(), 0, intent, flags);

        permissionReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent received) {
                if (!ACTION_USB_PERMISSION.equals(received.getAction())) {
                    return;
                }
                unregisterPermissionReceiver();
                boolean granted = received.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);
                if (granted) {
                    openDriver(manager, driver, call);
                } else {
                    connecting = false;
                    emitStatus("USB permission denied");
                    call.reject("USB permission denied");
                }
            }
        };

        IntentFilter filter = new IntentFilter(ACTION_USB_PERMISSION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(permissionReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(permissionReceiver, filter);
        }
        manager.requestPermission(driver.getDevice(), pending);
    }

    private void unregisterPermissionReceiver() {
        if (permissionReceiver != null) {
            try {
                getContext().unregisterReceiver(permissionReceiver);
            } catch (Exception ignored) {
            }
            permissionReceiver = null;
        }
    }

    private void openDriver(UsbManager manager, UsbSerialDriver driver, PluginCall call) {
        try {
            UsbDeviceConnection connection = manager.openDevice(driver.getDevice());
            if (connection == null) {
                connecting = false;
                emitStatus("Failed to open USB device");
                call.reject("Failed to open USB device");
                return;
            }
            UsbSerialPort serialPort = driver.getPorts().get(0);
            serialPort.open(connection);
            serialPort.setParameters(baudRate, 8, UsbSerialPort.STOPBITS_1, UsbSerialPort.PARITY_NONE);
            // The reader needs both control lines asserted, exactly like the Flutter app.
            try { serialPort.setDTR(true); } catch (Exception ignored) {}
            try { serialPort.setRTS(true); } catch (Exception ignored) {}

            synchronized (lineBuffer) {
                lineBuffer.setLength(0);
            }
            port = serialPort;
            ioManager = new SerialInputOutputManager(serialPort, this);
            ioManager.start();

            connecting = false;
            emitStatus("Connected to reader");
            call.resolve();
        } catch (Exception e) {
            closePort();
            connecting = false;
            emitStatus("Connection error");
            call.reject("Connection error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void send(PluginCall call) {
        String command = call.getString("command");
        if (command == null) {
            call.reject("Missing command");
            return;
        }
        UsbSerialPort serialPort = port;
        if (serialPort == null) {
            call.reject("Not connected");
            return;
        }
        try {
            byte[] bytes = (command + "\r\n").getBytes(StandardCharsets.UTF_8);
            serialPort.write(bytes, WRITE_TIMEOUT_MS);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to send command: " + e.getMessage());
        }
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        closePort();
        connecting = false;
        emitStatus("Disconnected");
        call.resolve();
    }

    private synchronized void closePort() {
        SerialInputOutputManager io = ioManager;
        ioManager = null;
        UsbSerialPort p = port;
        // Null the port first so read errors triggered by the close are treated
        // as shutdown noise rather than surfaced to the UI (see onRunError).
        port = null;
        if (io != null) {
            try {
                io.stop();
            } catch (Exception ignored) {
            }
        }
        if (p != null) {
            try {
                p.close();
            } catch (Exception ignored) {
            }
        }
    }

    @Override
    public void onNewData(byte[] data) {
        String chunk = new String(data, StandardCharsets.UTF_8);
        List<String> lines = new ArrayList<>();
        synchronized (lineBuffer) {
            lineBuffer.append(chunk);
            int start = 0;
            int i = 0;
            while (i < lineBuffer.length()) {
                char c = lineBuffer.charAt(i);
                if (c == '\n' || c == '\r') {
                    String line = lineBuffer.substring(start, i).trim();
                    if (!line.isEmpty()) {
                        lines.add(line);
                    }
                    // Consume the paired LF of a CRLF sequence.
                    if (c == '\r' && i + 1 < lineBuffer.length() && lineBuffer.charAt(i + 1) == '\n') {
                        i++;
                    }
                    start = i + 1;
                }
                i++;
            }
            String remainder = lineBuffer.substring(start);
            lineBuffer.setLength(0);
            lineBuffer.append(remainder);
        }
        for (String line : lines) {
            emitLine(line);
        }
    }

    @Override
    public void onRunError(Exception e) {
        // Ignore errors that fire while we are already tearing the connection down.
        if (port == null) {
            return;
        }
        // A read error means the device is gone (e.g. unplugged): tear down and
        // report a disconnect so the TS layer clears its connected state.
        closePort();
        emitStatus("Reader disconnected");
    }

    private void emitLine(String line) {
        JSObject data = new JSObject();
        data.put("line", line);
        notifyListeners("line", data);
    }

    private void emitStatus(String status) {
        JSObject data = new JSObject();
        data.put("status", status);
        notifyListeners("status", data);
    }

    @Override
    protected void handleOnDestroy() {
        closePort();
        connecting = false;
        unregisterPermissionReceiver();
    }
}
