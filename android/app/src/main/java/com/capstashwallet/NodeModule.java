package com.capstashwallet;

import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import java.io.File;

public class NodeModule extends ReactContextBaseJavaModule {

    private static final String TAG = "NodeModule";

    public NodeModule(ReactApplicationContext context) {
        super(context);
    }

    @NonNull
    @Override
    public String getName() {
        return "CapStashNode";
    }

    // ── Start the node foreground service ─────────────────
    @ReactMethod
    public void startNode(Promise promise) {
        try {
            ReactApplicationContext ctx = getReactApplicationContext();
            Intent intent = new Intent(ctx, NodeService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(intent);
            } else {
                ctx.startService(intent);
            }
            Log.i(TAG, "NodeService start requested");
            promise.resolve(true);
        } catch (Exception e) {
            Log.e(TAG, "startNode failed: " + e.getMessage(), e);
            promise.reject("START_FAILED", e.getMessage());
        }
    }

    // ── Stop the node foreground service ──────────────────
    @ReactMethod
    public void stopNode(Promise promise) {
        try {
            ReactApplicationContext ctx = getReactApplicationContext();
            Intent intent = new Intent(ctx, NodeService.class);
            ctx.stopService(intent);
            Log.i(TAG, "NodeService stop requested");
            promise.resolve(true);
        } catch (Exception e) {
            Log.e(TAG, "stopNode failed: " + e.getMessage(), e);
            promise.reject("STOP_FAILED", e.getMessage());
        }
    }

    // ── Check if node binary exists on device ─────────────
    @ReactMethod
    public void isNodeExtracted(Promise promise) {
        try {
            File daemonFile = new File(
                getReactApplicationContext().getFilesDir(), "CapStashd"
            );
            promise.resolve(daemonFile.exists() && daemonFile.length() > 1_000_000);
        } catch (Exception e) {
            promise.resolve(false);
        }
    }

    // ── Get node data directory path ──────────────────────
    @ReactMethod
    public void getDataDir(Promise promise) {
        try {
            File dataDir = new File(
                getReactApplicationContext().getFilesDir(), "capstash"
            );
            promise.resolve(dataDir.getAbsolutePath());
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }
}
