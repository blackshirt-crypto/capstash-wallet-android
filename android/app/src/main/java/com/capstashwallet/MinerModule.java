/**
 * MinerModule.java — React Native NativeModule for CapStash C++ miner
 * v2.0
 *
 * Place at:
 * android/app/src/main/java/com/capstashwallet/MinerModule.java
 *
 * Exposes to React Native (NativeModules.CapStashMiner):
 *   start(config, callback)
 *   stop()
 *   getStats() → Promise<String JSON>
 *   isRunning() → Promise<Boolean>
 */

package com.capstashwallet;

import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

public class MinerModule extends ReactContextBaseJavaModule {

    private static final String TAG        = "CapStash_MinerModule";
    private static final String MODULE_NAME = "CapStashMiner";

    // Load the C++ shared library
    static {
        System.loadLibrary("capstash_miner");
    }

    private final ReactApplicationContext reactContext;

    public MinerModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
    }

    @NonNull
    @Override
    public String getName() {
        return MODULE_NAME;
    }

    // ── JNI declarations — implemented in jni_bridge.c ────────────────────────
    private native int     nativeStart(String host, int port, String user,
                                        String pass, String address, int threads,
                                        Object callbackObj);
    private native void    nativeStop();
    private native boolean nativeIsRunning();
    private native String  nativeGetStats();

    // ── Callbacks fired from C++ mining threads ───────────────────────────────
    // These are called via JNI — do NOT rename without updating jni_bridge.c

    /** Called every ~2 seconds with rolling hashrate in H/s */
    public void onHashrate(double hashrate) {
        WritableMap params = Arguments.createMap();
        params.putDouble("hashrate", hashrate);
        sendEvent("MinerHashrate", params);
    }

    /** Called when a valid block is found and submitted */
    public void onBlock(int height, String blockHash) {
        Log.i(TAG, "★ Block found! height=" + height + " hash=" + blockHash);
        WritableMap params = Arguments.createMap();
        params.putInt("height", height);
        params.putString("hash", blockHash);
        sendEvent("MinerBlockFound", params);
    }

    /** Called on RPC errors from mining threads */
    public void onError(String message) {
        Log.e(TAG, "Miner error: " + message);
        WritableMap params = Arguments.createMap();
        params.putString("message", message);
        sendEvent("MinerError", params);
    }

    // ── React Native methods ───────────────────────────────────────────────────

    /**
     * start — begin mining
     *
     * config map keys:
     *   host     {String}  — node IP (Tailscale for Wanderer, 127.0.0.1 for Drifter)
     *   port     {Int}     — RPC port
     *   user     {String}  — RPC username
     *   pass     {String}  — RPC password
     *   address  {String}  — mining reward address (cap1... or C...)
     *   threads  {Int}     — worker thread count (default 4)
     */
    @ReactMethod
    public void start(ReadableMap config, Promise promise) {
        try {
            String host    = config.hasKey("host")    ? config.getString("host")    : "";
            int    port    = config.hasKey("port")    ? config.getInt("port")       : 8332;
            String user    = config.hasKey("user")    ? config.getString("user")    : "";
            String pass    = config.hasKey("pass")    ? config.getString("pass")    : "";
            String address = config.hasKey("address") ? config.getString("address") : "";
            int    threads = config.hasKey("threads") ? config.getInt("threads")    : 4;

            if (host.isEmpty() || address.isEmpty()) {
                promise.reject("INVALID_CONFIG", "host and address are required");
                return;
            }

            Log.i(TAG, "start() → " + host + ":" + port + " addr=" + address
                        + " threads=" + threads);

            // Pass 'this' as callbackObj — JNI will call onHashrate/onBlock/onError
            int result = nativeStart(host, port, user, pass, address, threads, this);

            if (result == 0) {
                promise.resolve(true);
            } else {
                promise.reject("START_FAILED",
                    "Failed to start miner — check node connection and address");
            }

        } catch (Exception e) {
            Log.e(TAG, "start() exception: " + e.getMessage());
            promise.reject("EXCEPTION", e.getMessage());
        }
    }

    /**
     * stop — halt all mining threads
     */
    @ReactMethod
    public void stop(Promise promise) {
        try {
            nativeStop();
            Log.i(TAG, "stop() — miner halted");
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("EXCEPTION", e.getMessage());
        }
    }

    /**
     * isRunning — returns true if mining is active
     */
    @ReactMethod
    public void isRunning(Promise promise) {
        try {
            promise.resolve(nativeIsRunning());
        } catch (Exception e) {
            promise.reject("EXCEPTION", e.getMessage());
        }
    }

    /**
     * getStats — returns JSON string with current mining stats
     * {
     *   hashrate:    number   H/s
     *   totalHashes: number
     *   blocksFound: number
     *   running:     boolean
     *   threads:     number
     * }
     */
    @ReactMethod
    public void getStats(Promise promise) {
        try {
            String json = nativeGetStats();
            promise.resolve(json);
        } catch (Exception e) {
            promise.reject("EXCEPTION", e.getMessage());
        }
    }
    
    // ── Required by NativeEventEmitter ────────────────────────────────────────
    @ReactMethod
    public void addListener(String eventName) {
        // Required for NativeEventEmitter — no-op
    }

    @ReactMethod
    public void removeListeners(int count) {
        // Required for NativeEventEmitter — no-op
    }

    // ── Event emitter helper ──────────────────────────────────────────────────
    private void sendEvent(String eventName, @Nullable WritableMap params) {
        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(eventName, params);
        } catch (Exception e) {
            Log.e(TAG, "sendEvent(" + eventName + ") failed: " + e.getMessage());
        }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    @Override
    public void onCatalystInstanceDestroy() {
        // Stop mining if app is killed
        if (nativeIsRunning()) {
            Log.i(TAG, "App destroyed — stopping miner");
            nativeStop();
        }
    }
}