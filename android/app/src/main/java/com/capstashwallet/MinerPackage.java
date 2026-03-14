/**
 * MinerPackage.java — registers MinerModule with React Native
 * v2.0
 *
 * Place at:
 * android/app/src/main/java/com/capstashwallet/MinerPackage.java
 *
 * Then add  packages.add(new MinerPackage());
 * to MainApplication.java in getPackages()
 */

package com.capstashwallet;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class MinerPackage implements ReactPackage {

    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
        List<NativeModule> modules = new ArrayList<>();
        modules.add(new MinerModule(reactContext));
        return modules;
    }

    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
        return Collections.emptyList();
    }
}