package com.capstashwallet;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

public class NodeService extends Service {

    private static final String TAG             = "NodeService";
    private static final String CHANNEL_ID      = "capstash_node_channel";
    private static final int    NOTIFICATION_ID = 1001;

    private static final String DAEMON_NAME     = "CapStashd";
    private static final String CONF_DIR        = "capstash";
    private static final String CONF_FILE       = "capstash.conf";

    private Process nodeProcess = null;

    // ── Lifecycle ──────────────────────────────────────────

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.i(TAG, "NodeService onStartCommand");
        createNotificationChannel();
        startForeground(NOTIFICATION_ID, buildNotification("WANDERER NODE STARTING..."));
        new Thread(this::startNode).start();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        Log.i(TAG, "NodeService onDestroy — stopping node");
        stopNode();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // ── Node management ────────────────────────────────────

    private void startNode() {
        try {
            File daemonFile = extractDaemon();
            if (daemonFile == null) {
                Log.e(TAG, "Failed to extract CapStashd");
                updateNotification("NODE ERROR — EXTRACTION FAILED");
                stopSelf();
                return;
            }

            File dataDir = getNodeDataDir();
            File confFile = new File(dataDir, CONF_FILE);

            if (!confFile.exists()) {
                Log.w(TAG, "capstash.conf not found — writing default config");
                writeDefaultConf(confFile);
            }

            String[] cmd = {
                "/system/bin/linker64",
                daemonFile.getAbsolutePath(),
                "-datadir=" + dataDir.getAbsolutePath(),
                "-conf="    + confFile.getAbsolutePath(),
                "-daemon=0",
                "-server=1",
                "-rpcuser=capstash",
                "-rpcpassword=localnode",
                "-rpcport=8332",
                "-rpcbind=127.0.0.1",
                "-rpcallowip=127.0.0.1",
                "-addnode=bitcoinii.ddns.net:9999",
                "-listen=0",
                "-maxconnections=8",
                "-dbcache=64",
                "-par=2",
                "-prune=550",
                "-wallet=wanderer"
            };

            Log.i(TAG, "Starting CapStashd: " + daemonFile.getAbsolutePath());
            ProcessBuilder pb = new ProcessBuilder(cmd);
            pb.redirectErrorStream(true);
            pb.directory(dataDir);
            // Tell the linker where to find libc++_shared.so and other bundled libs
            pb.environment().put("LD_LIBRARY_PATH", getApplicationInfo().nativeLibraryDir);

            nodeProcess = pb.start();
            updateNotification("WANDERER NODE RUNNING");
            Log.i(TAG, "CapStashd started, PID tracking active");

            // Stream logs
            streamLogs(nodeProcess);

            int exitCode = nodeProcess.waitFor();
            Log.w(TAG, "CapStashd exited with code: " + exitCode);
            updateNotification("NODE STOPPED (exit " + exitCode + ")");

        } catch (Exception e) {
            Log.e(TAG, "startNode error: " + e.getMessage(), e);
            updateNotification("NODE ERROR: " + e.getMessage());
        }
    }

    private void stopNode() {
        if (nodeProcess != null) {
            try {
                // Send stop command via RPC first for clean shutdown
                Runtime.getRuntime().exec(new String[]{
                    new File(getFilesDir(), DAEMON_NAME).getAbsolutePath(),
                    "-rpcuser=capstash",
                    "-rpcpassword=localnode",
                    "-rpcport=8332",
                    "stop"
                });
                Thread.sleep(3000);
            } catch (Exception e) {
                Log.w(TAG, "Clean stop failed, forcing: " + e.getMessage());
            }
            nodeProcess.destroy();
            nodeProcess = null;
        }
    }

    // ── Daemon extraction ──────────────────────────────────
    private File extractDaemon() {
        File srcFile = new File(getApplicationInfo().nativeLibraryDir, "libcapstashd.so");
        if (!srcFile.exists()) {
            Log.e(TAG, "libcapstashd.so not found: " + srcFile.getAbsolutePath());
            return null;
        }
        // Copy to codeCacheDir — this dir has the correct SELinux context for exec
        File destFile = new File(getCodeCacheDir(), "capstashd");
        try {
            if (!destFile.exists() || srcFile.lastModified() > destFile.lastModified()) {
                Log.i(TAG, "Copying CapStashd to codeCacheDir...");
                java.nio.file.Files.copy(
                    srcFile.toPath(), destFile.toPath(),
                    java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                Log.i(TAG, "Copy complete");
            }
            destFile.setExecutable(true, false);
        } catch (Exception e) {
            Log.e(TAG, "Failed to copy capstashd: " + e.getMessage());
            return null;
        }
        Log.i(TAG, "CapStashd ready at: " + destFile.getAbsolutePath()
              + " (" + destFile.length() + " bytes)");
        return destFile;
    }

    // ── Data directory ─────────────────────────────────────

    private File getNodeDataDir() {
        File dir = new File(getFilesDir(), CONF_DIR);
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    // ── Default conf writer ────────────────────────────────

    private void writeDefaultConf(File confFile) throws IOException {
        String conf =
            "server=1\n" +
            "rpcuser=capstash\n" +
            "rpcpassword=localnode\n" +
            "rpcport=8332\n" +
            "rpcallowip=127.0.0.1\n" +
            "rpcbind=127.0.0.1\n" +
            "addnode=bitcoinii.ddns.net:9999\n" +
            "listen=0\n" +
            "maxconnections=8\n" +
            "dbcache=64\n" +
            "par=2\n" +
            "prune=550\n" +
            "wallet=wanderer\n";

        try (FileOutputStream fos = new FileOutputStream(confFile)) {
            fos.write(conf.getBytes());
        }
        Log.i(TAG, "Default capstash.conf written to: " + confFile.getAbsolutePath());
    }

    // ── Log streaming ──────────────────────────────────────

    private void streamLogs(Process process) {
        new Thread(() -> {
            try (java.io.BufferedReader reader = new java.io.BufferedReader(
                    new java.io.InputStreamReader(process.getInputStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    Log.d(TAG, "[CapStashd] " + line);
                }
            } catch (IOException e) {
                Log.w(TAG, "Log stream ended: " + e.getMessage());
            }
        }).start();
    }

    // ── Notification helpers ───────────────────────────────

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "CapStash Node",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Wanderer mode local node");
            NotificationManager mgr = getSystemService(NotificationManager.class);
            if (mgr != null) mgr.createNotificationChannel(channel);
        }
    }

    private Notification buildNotification(String text) {
        Intent intent = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("CapStash Wanderer")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setContentIntent(pi)
            .setOngoing(true)
            .build();
    }

    private void updateNotification(String text) {
        NotificationManager mgr = getSystemService(NotificationManager.class);
        if (mgr != null) mgr.notify(NOTIFICATION_ID, buildNotification(text));
    }
}
