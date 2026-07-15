import 'package:flutter/material.dart';
import 'serial_reader_screen.dart';

void main() {
  runApp(const AbacusDetectApp());
}

class AbacusDetectApp extends StatelessWidget {
  const AbacusDetectApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Abacus Detect',
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark(useMaterial3: true),
      home: const SerialReaderScreen(),
    );
  }
}