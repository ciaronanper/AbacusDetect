package com.abacuslabs.abacusdetect;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must be registered before super.onCreate() so the WebView can see it.
        registerPlugin(ReaderSerialPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
