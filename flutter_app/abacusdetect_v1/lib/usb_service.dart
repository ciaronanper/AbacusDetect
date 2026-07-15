import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:usb_serial/transaction.dart';
import 'package:usb_serial/usb_serial.dart';

class UsbService {
  UsbPort? _port;
  StreamSubscription<String>? _subscription;
  Transaction<String>? _transaction;

  final _onLineReceivedController = StreamController<String>.broadcast();
  final _onStatusChangedController = StreamController<String>.broadcast();

  Stream<String> get onLineReceived => _onLineReceivedController.stream;
  Stream<String> get onStatusChanged => _onStatusChangedController.stream;
  bool get isConnected => _port != null;

  Future<void> connect() async {
    try {
      _onStatusChangedController.add("Scanning for USB devices...");
      final devices = await UsbSerial.listDevices();

      if (devices.isEmpty) {
        _onStatusChangedController.add("No USB devices found");
        return;
      }

      final device = devices.first;
      final port = await device.create();
      if (port == null) {
        _onStatusChangedController.add("Failed to create USB port");
        return;
      }

      final openResult = await port.open();
      if (!openResult) {
        _onStatusChangedController.add("Failed to open USB port");
        return;
      }

      await port.setDTR(true);
      await port.setRTS(true);
      await port.setPortParameters(
        115200,
        UsbPort.DATABITS_8,
        UsbPort.STOPBITS_1,
        UsbPort.PARITY_NONE,
      );

      _port = port;

      _transaction = Transaction.stringTerminated(
        port.inputStream!,
        Uint8List.fromList([13, 10]), // <-- Pass the CRLF bytes (\r\n) here!
      );

      _subscription = _transaction!.stream.listen(
        (line) {
          final clean = line.trim();
          if (clean.isNotEmpty) {
            _onLineReceivedController.add(clean);
          }
        },
        onError: (e) {
          _onStatusChangedController.add("Serial read error");
        },
        onDone: () {
          _onStatusChangedController.add("Reader disconnected");
        },
      );

      _onStatusChangedController.add("Connected to reader");
    } catch (e) {
      _onStatusChangedController.add("Connection error");
    }
  }

  /// Sends raw payload string down the wire to your firmware UART
  Future<void> sendCommand(String command) async {
    if (_port == null) return;
    try {
      String fullCommand = "$command\r\n";
      Uint8List bytes = Uint8List.fromList(utf8.encode(fullCommand));
      await _port!.write(bytes);
    } catch (e) {
      _onLineReceivedController.add("[SYSTEM ERROR]: Failed to send command");
    }
  }

  Future<void> disconnect() async {
    await _subscription?.cancel();
    _subscription = null;
    _transaction?.dispose();
    _transaction = null;
    await _port?.close();
    _port = null;
    _onStatusChangedController.add("Disconnected");
  }

  void dispose() {
    disconnect();
    _onLineReceivedController.close();
    _onStatusChangedController.close();
  }
}