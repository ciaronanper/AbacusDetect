// Minimal smoke test for AbacusDetect.
//
// The app auto-connects to USB serial on startup, which isn't available in the
// test environment, so we exercise the pure protocol mapping instead of pumping
// the full widget tree.

import 'package:flutter_test/flutter_test.dart';

import 'package:abacusdetect_v1/reader_protocol.dart';

void main() {
  test('ReaderProtocol.viewToDisplayText returns a string for any view', () {
    expect(ReaderProtocol.viewToDisplayText('IDLE'), isA<String>());
    expect(ReaderProtocol.viewToDisplayText('UNKNOWN'), isA<String>());
  });
}
