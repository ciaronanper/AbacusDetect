import 'dart:async';
import 'package:flutter/material.dart';
import 'reader_protocol.dart';
import 'usb_service.dart';

class SerialReaderScreen extends StatefulWidget {
  const SerialReaderScreen({super.key});

  @override
  State<SerialReaderScreen> createState() => _SerialReaderScreenState();
}

class _SerialReaderScreenState extends State<SerialReaderScreen> {
  final UsbService _usbService = UsbService();
  ReaderState _readerState = ReaderState.initial();

  String _status = "Disconnected";
  String _bleState = "UNKNOWN";
  String _deviceStatus = "UNKNOWN";
  final List<String> _logs = [];

  StreamSubscription? _lineSub;
  StreamSubscription? _statusSub;

  bool _buttonPressed = false;

  @override
  void initState() {
    super.initState();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _setupUsbConnections();
      Future.delayed(const Duration(milliseconds: 300), () {
        if (!mounted) return;
        _usbService.connect();
      });
    });
  }

  void _setupUsbConnections() {
    _lineSub = _usbService.onLineReceived.listen((line) {
      if (!mounted) return;
      setState(() {
        _logs.add(line);
        if (_logs.length > 300) _logs.removeAt(0);
        _readerState = ReaderProtocol.applyMessage(_readerState, line);
      });
    });

    _statusSub = _usbService.onStatusChanged.listen((statusUpdate) {
      if (!mounted) return;
      setState(() {
        _status = statusUpdate;
        _logs.add("[SYSTEM]: $statusUpdate");
        if (_logs.length > 300) _logs.removeAt(0);
      });
    });
  }

  void _handleButtonDown() {
    setState(() {
      _buttonPressed = true;
    });

    _logs.add("[APP]: 0 BUTTON");
    if (_logs.length > 300) _logs.removeAt(0);

    _usbService.sendCommand("0 BUTTON");
  }

  void _handleButtonUp() {
    setState(() {
      _buttonPressed = false;
    });

    _logs.add("[APP]: 0 BUTTON_UP");
    if (_logs.length > 300) _logs.removeAt(0);

    _usbService.sendCommand("0 BUTTON_UP");
  }

  void _showLogsSheet() {
  showModalBottomSheet(
    useSafeArea: true,
    context: context,
    backgroundColor: const Color(0xFF0E1116),
    isScrollControlled: true,
    builder: (_) {
      return SafeArea(
        child: RotatedBox(
          quarterTurns: 2,
          child: SizedBox(
            height: MediaQuery.of(context).size.height * 0.72,
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 12, 8),
                  child: Row(
                    children: [
                      const Text(
                        "UART Logs",
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const Spacer(),
                      TextButton(
                        onPressed: () {
                          setState(() {
                            _logs.clear();
                          });
                          Navigator.pop(context);
                        },
                        child: const Text("Clear"),
                      ),
                    ],
                  ),
                ),
                const Divider(
                  height: 1,
                  color: Colors.white12,
                ),
                Expanded(
                  child: _logs.isEmpty
                      ? const Center(
                          child: Text(
                            "No UART logs yet",
                            style: TextStyle(color: Colors.white54),
                          ),
                        )
                      : ListView.builder(
                          padding: const EdgeInsets.all(12),
                          itemCount: _logs.length,
                          itemBuilder: (context, index) {
                            return Padding(
                              padding: const EdgeInsets.symmetric(vertical: 2),
                              child: Text(
                                _logs[index],
                                style: const TextStyle(
                                  fontFamily: 'monospace',
                                  color: Colors.greenAccent,
                                  fontSize: 12,
                                ),
                              ),
                            );
                          },
                        ),
                ),
              ],
            ),
          ),
        ),
      );
    },
  );
}

  Color _batteryColor(String battery) {
    switch (battery) {
      case "DEAD":
        return Colors.redAccent;
      case "LOW":
        return Colors.orangeAccent;
      case "MID":
        return Colors.amberAccent;
      case "HIGH_MID":
      case "HIGH":
        return Colors.lightGreenAccent;
      default:
        return Colors.white54;
    }
  }

  IconData _batteryIcon(String battery) {
    switch (battery) {
      case "DEAD":
        return Icons.battery_0_bar;
      case "LOW":
        return Icons.battery_2_bar;
      case "MID":
        return Icons.battery_4_bar;
      case "HIGH_MID":
        return Icons.battery_5_bar;
      case "HIGH":
        return Icons.battery_full;
      default:
        return Icons.battery_unknown;
    }
  }

  String _friendlyViewText(String view) {
    return ReaderProtocol.viewToDisplayText(view);
  }

  String _resultText() {
    if (_readerState.resultText != null &&
        _readerState.resultText!.trim().isNotEmpty) {
      return _readerState.resultText!;
    }

    if (_readerState.errorText != null &&
        _readerState.errorText!.trim().isNotEmpty) {
      return _readerState.errorText!;
    }

    return "—";
  }

  @override
  void dispose() {
    _lineSub?.cancel();
    _statusSub?.cancel();
    _usbService.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final view = _readerState.currentView;
    final resultText = _resultText();
    final displayText = resultText != "—" ? resultText : _friendlyViewText(view);
    final battery = _readerState.battery;

    if (_readerState.currentView == "BLECONNECTED") {
      _bleState = "CONNECTED";
    }

    final isConnected = _status.toLowerCase().contains("connect") ||
        _status.toLowerCase().contains("open") ||
        _status.toLowerCase().contains("ready");
    final statusText = isConnected ? "USB" : _status;
    final statusValue = battery != null && battery.isNotEmpty ? "$battery" : null;

    final buttonColor =
        _buttonPressed ? const Color(0xFF9B111E) : const Color(0xFFC1121F);
    final buttonScale = _buttonPressed ? 0.94 : 1.0;

    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: RotatedBox(
          quarterTurns: 2,
          child: Stack(
            children: [
              Positioned.fill(
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: Text(
                      displayText,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 36,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                        height: 1.1,
                      ),
                    ),
                  ),
                ),
              ),
              Positioned(
                top: 8,
                right: 12,
                child: _TinyStatusPill(
                  text: statusValue == null ? statusText : "$statusText • $statusValue",
                  color: isConnected ? Colors.greenAccent : Colors.orangeAccent,
                ),
              ),
              Positioned(
                left: 0,
                right: 0,
                bottom: 24,
                child: Center(
                  child: GestureDetector(
                    onTapDown: (_) => _handleButtonDown(),
                    onTapUp: (_) => _handleButtonUp(),
                    onTapCancel: _handleButtonUp,
                    child: AnimatedScale(
                      scale: buttonScale,
                      duration: const Duration(milliseconds: 100),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 100),
                        width: 96,
                        height: 96,
                        decoration: BoxDecoration(
                          color: buttonColor,
                          shape: BoxShape.circle,
                          boxShadow: [
                            BoxShadow(
                              color: Colors.red.withOpacity(
                                _buttonPressed ? 0.18 : 0.35,
                              ),
                              blurRadius: _buttonPressed ? 10 : 18,
                              spreadRadius: 1,
                            ),
                          ],
                        ),
                        child: const Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.power_settings_new,
                              color: Colors.white,
                              size: 42,
                            ),
                            SizedBox(height: 2),
                            Text(
                              "POWER",
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 10,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 0.8,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TinyStatusPill extends StatelessWidget {
  final String text;
  final Color color;

  const _TinyStatusPill({
    required this.text,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(maxWidth: 140),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: const Color(0xFF161B22),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white10),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              text,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Colors.white70,
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}