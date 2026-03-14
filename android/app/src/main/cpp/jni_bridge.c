/**
 * jni_bridge.c — JNI entry points for React Native NativeModules
 * v2.0
 *
 * Place at: android/app/src/main/cpp/jni_bridge.c
 *
 * Exposes:
 *   Java_com_capstashwallet_MinerModule_nativeStart()
 *   Java_com_capstashwallet_MinerModule_nativeStop()
 *   Java_com_capstashwallet_MinerModule_nativeGetStats()
 *   Java_com_capstashwallet_MinerModule_nativeIsRunning()
 */

#include "miner.h"
#include <jni.h>
#include <string.h>
#include <stdlib.h>
#include <android/log.h>

#define LOG_TAG "CapStash_JNI"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO,  LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

// ── Cached JVM reference for firing callbacks from C threads ──────────────────
static JavaVM   *g_jvm        = NULL;
static jobject   g_callback   = NULL;  // MinerModule Java object (global ref)
static jmethodID g_onHashrate = NULL;
static jmethodID g_onBlock    = NULL;
static jmethodID g_onError    = NULL;

// ── Called once when the .so is loaded ───────────────────────────────────────
JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM *vm, void *reserved) {
    (void)reserved;
    g_jvm = vm;
    LOGI("JNI_OnLoad — CapStash miner v2.0 loaded");
    return JNI_VERSION_1_6;
}

// ── Callback bridge: C → Java ─────────────────────────────────────────────────
static void on_hashrate_cb(double hashrate, void *userdata) {
    (void)userdata;
    if (!g_jvm || !g_callback || !g_onHashrate) return;
    JNIEnv *env;
    int attached = 0;
    if ((*g_jvm)->GetEnv(g_jvm, (void**)&env, JNI_VERSION_1_6) != JNI_OK) {
        (*g_jvm)->AttachCurrentThread(g_jvm, &env, NULL);
        attached = 1;
    }
    (*env)->CallVoidMethod(env, g_callback, g_onHashrate, (jdouble)hashrate);
    if (attached) (*g_jvm)->DetachCurrentThread(g_jvm);
}

static void on_block_cb(uint32_t height, const char *hash_hex, void *userdata) {
    (void)userdata;
    if (!g_jvm || !g_callback || !g_onBlock) return;
    JNIEnv *env;
    int attached = 0;
    if ((*g_jvm)->GetEnv(g_jvm, (void**)&env, JNI_VERSION_1_6) != JNI_OK) {
        (*g_jvm)->AttachCurrentThread(g_jvm, &env, NULL);
        attached = 1;
    }
    jstring j_hash = (*env)->NewStringUTF(env, hash_hex);
    (*env)->CallVoidMethod(env, g_callback, g_onBlock, (jint)height, j_hash);
    (*env)->DeleteLocalRef(env, j_hash);
    if (attached) (*g_jvm)->DetachCurrentThread(g_jvm);
}

static void on_error_cb(const char *message, void *userdata) {
    (void)userdata;
    if (!g_jvm || !g_callback || !g_onError) return;
    JNIEnv *env;
    int attached = 0;
    if ((*g_jvm)->GetEnv(g_jvm, (void**)&env, JNI_VERSION_1_6) != JNI_OK) {
        (*g_jvm)->AttachCurrentThread(g_jvm, &env, NULL);
        attached = 1;
    }
    jstring j_msg = (*env)->NewStringUTF(env, message);
    (*env)->CallVoidMethod(env, g_callback, g_onError, j_msg);
    (*env)->DeleteLocalRef(env, j_msg);
    if (attached) (*g_jvm)->DetachCurrentThread(g_jvm);
}

// ── nativeStart ───────────────────────────────────────────────────────────────
// Params: host, port, user, pass, address, threads, callbackObj
JNIEXPORT jint JNICALL
Java_com_capstashwallet_MinerModule_nativeStart(
    JNIEnv *env, jobject thiz,
    jstring j_host, jint j_port,
    jstring j_user, jstring j_pass,
    jstring j_address, jint j_threads,
    jobject callback)
{
    miner_config_t cfg;
    memset(&cfg, 0, sizeof(cfg));

    const char *host    = (*env)->GetStringUTFChars(env, j_host,    NULL);
    const char *user    = (*env)->GetStringUTFChars(env, j_user,    NULL);
    const char *pass    = (*env)->GetStringUTFChars(env, j_pass,    NULL);
    const char *address = (*env)->GetStringUTFChars(env, j_address, NULL);

    strncpy(cfg.host,    host,    63);
    strncpy(cfg.user,    user,    63);
    strncpy(cfg.pass,    pass,    63);
    strncpy(cfg.address, address, 127);
    cfg.port    = (int)j_port;
    cfg.threads = (int)j_threads;

    (*env)->ReleaseStringUTFChars(env, j_host,    host);
    (*env)->ReleaseStringUTFChars(env, j_user,    user);
    (*env)->ReleaseStringUTFChars(env, j_pass,    pass);
    (*env)->ReleaseStringUTFChars(env, j_address, address);

    // Cache callback object and method IDs
    if (g_callback) (*env)->DeleteGlobalRef(env, g_callback);
    g_callback = (*env)->NewGlobalRef(env, callback);

    jclass cls    = (*env)->GetObjectClass(env, callback);
    g_onHashrate  = (*env)->GetMethodID(env, cls, "onHashrate", "(D)V");
    g_onBlock     = (*env)->GetMethodID(env, cls, "onBlock",    "(ILjava/lang/String;)V");
    g_onError     = (*env)->GetMethodID(env, cls, "onError",    "(Ljava/lang/String;)V");

    miner_callbacks_t cbs = {
        .on_hashrate = on_hashrate_cb,
        .on_block    = on_block_cb,
        .on_error    = on_error_cb,
        .userdata    = NULL,
    };

    LOGI("[JNI] nativeStart — %s:%d addr=%s threads=%d",
         cfg.host, cfg.port, cfg.address, cfg.threads);

    return (jint)miner_start(&cfg, &cbs);
}

// ── nativeStop ────────────────────────────────────────────────────────────────
JNIEXPORT void JNICALL
Java_com_capstashwallet_MinerModule_nativeStop(JNIEnv *env, jobject thiz) {
    (void)env; (void)thiz;
    LOGI("[JNI] nativeStop");
    miner_stop();
}

// ── nativeIsRunning ───────────────────────────────────────────────────────────
JNIEXPORT jboolean JNICALL
Java_com_capstashwallet_MinerModule_nativeIsRunning(JNIEnv *env, jobject thiz) {
    (void)env; (void)thiz;
    return (jboolean)miner_is_running();
}

// ── nativeGetStats — returns JSON string to JS ────────────────────────────────
JNIEXPORT jstring JNICALL
Java_com_capstashwallet_MinerModule_nativeGetStats(JNIEnv *env, jobject thiz) {
    (void)thiz;
    miner_stats_t stats;
    miner_get_stats(&stats);
    char buf[256];
    snprintf(buf, sizeof(buf),
        "{\"hashrate\":%.1f,\"totalHashes\":%llu,"
        "\"blocksFound\":%u,\"running\":%s,\"threads\":%d}",
        stats.hashrate,
        (unsigned long long)stats.total_hashes,
        stats.blocks_found,
        stats.running ? "true" : "false",
        stats.thread_count
    );
    return (*env)->NewStringUTF(env, buf);
}