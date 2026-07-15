class ReaderState {
  final String readerScreen;
  final String currentView;
  final String battery;
  final String? resultText;
  final String? errorText;

  const ReaderState({
    required this.readerScreen,
    required this.currentView,
    required this.battery,
    this.resultText,
    this.errorText,
  });

  factory ReaderState.initial() {
    return const ReaderState(
      readerScreen: "UNKNOWN",
      currentView: "WAITING",
      battery: "UNKNOWN",
      resultText: null,
      errorText: null,
    );
  }

  ReaderState copyWith({
    String? readerScreen,
    String? currentView,
    String? battery,
    String? resultText,
    String? errorText,
    bool clearResult = false,
    bool clearError = false,
  }) {
    return ReaderState(
      readerScreen: readerScreen ?? this.readerScreen,
      currentView: currentView ?? this.currentView,
      battery: battery ?? this.battery,
      resultText: clearResult ? null : (resultText ?? this.resultText),
      errorText: clearError ? null : (errorText ?? this.errorText),
    );
  }
}

class ReaderProtocol {
  static String mapScreenToView(String screen) {
    switch (screen) {
      case "WAKEUP": return "WAKEUP";
      case "HOME": case "IDLE": return "INSERT_CARTRIDGE";
      case "POWEROFF": return "POWEROFF";
      case "BARCODESCAN": case "LOTIDLOAD": case "LOTIDBLESCAN": return "CHECKING";
      case "BARCODEINVALID": return "BARCODE_INVALID";
      case "LOTIDNOTFOUND": return "ERROR";
      case "SAMPLEDETECTION": return "APPLY_DROPS";
      case "SAMPLEDETECTED": return "SAMPLE_DETECTED";
      case "RUNASSAY": case "READWAIT": case "ASSAYLOCALSAVE": case "ASSAYUPLOAD": case "BLECONNECT": return "CHECKING";
      case "DISPLAYRESULT": return "UPDATE_FINISHED";
      case "UPDATEDETECTION": case "UPDATE": return "UPDATING";
      case "SYNCFINISH": return "UPDATE_FINISHED";
      case "DEVMODE": return "DEVMODE";
      case "CLEANLENS": return "CLEAN_LENS";
      default: return "ERROR";
    }
  }

  static String viewToDisplayText(String view) {
    final normalized = view.startsWith("VIEW:") ? view.substring("VIEW:".length) : view;

    switch (normalized) {
      case "WAKEUP": return "Wake device";
      case "INSERT_CARTRIDGE": return "Insert cartridge";
      case "CHECKING": return "Checking…";
      case "BARCODE_INVALID": return "Barcode invalid";
      case "UPDATE_FINISHED": return "Finished";
      case "DEVMODE": return "Developer mode";
      case "APPLY_DROPS": return "Apply drops";
      case "SAMPLE_DETECTED": return "Sample detected";
      case "ERROR": return "Error";
      case "CLEAN_LENS": return "Clean lens";
      case "NOCLINE": return "No C line";
      case "UPDATING": return "Updating";
      case "POWEROFF": return "Power off";
      case "WAITING": return "Waiting for reader";
      default: return normalized.replaceAll("_", " ");
    }
  }

  static ReaderState applyMessage(ReaderState state, String msg) {
    if (msg.startsWith("SCREEN:")) {
      final screen = msg.substring("SCREEN:".length).trim();
      return state.copyWith(
        readerScreen: screen,
        currentView: mapScreenToView(screen),
        clearResult: screen != "DISPLAYRESULT",
        clearError: screen != "DISPLAYRESULT",
      );
    }
    if (msg.startsWith("BATTERY:")) {
      return state.copyWith(battery: msg.substring("BATTERY:".length).trim());
    }
    if (msg.startsWith("RESULT:")) {
      return state.copyWith(resultText: msg.substring("RESULT:".length).trim(), errorText: null);
    }
    if (msg.startsWith("ERROR:")) {
      return state.copyWith(errorText: msg.substring("ERROR:".length).trim(), resultText: null, currentView: "VIEW:ERROR");
    }
    if (msg.startsWith("VIEW:")) {
      final view = msg.substring("VIEW:".length).trim();
      return state.copyWith(currentView: view);
    }
    return state;
  }
}