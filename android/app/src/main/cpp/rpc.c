/**
 * rpc.c — Minimal HTTP RPC client for CapStash NDK miner
 * v2.0
 *
 * Place at: android/app/src/main/cpp/rpc.c
 *
 * Implements only what the miner needs:
 *   - getblocktemplate
 *   - submitblock
 *   - getbestblockhash (template staleness check)
 *
 * Uses raw POSIX sockets — no external HTTP library needed.
 * Handles Basic Auth encoding inline.
 */

#include "rpc.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <netdb.h>
#include <errno.h>
#include <android/log.h>

#define LOG_TAG "CapStash_RPC"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO,  LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

#define RPC_TIMEOUT_SEC  10
#define RPC_RECV_BUF     65536   // 64KB — enough for any getblocktemplate response
#define RPC_SEND_BUF     4096

// ── Base64 encoder for Basic Auth ─────────────────────────────────────────────
static const char B64_TABLE[] =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

static void base64_encode(const char *in, size_t in_len, char *out) {
    size_t i, j;
    for (i = 0, j = 0; i < in_len;) {
        uint32_t a = i < in_len ? (uint8_t)in[i++] : 0;
        uint32_t b = i < in_len ? (uint8_t)in[i++] : 0;
        uint32_t c = i < in_len ? (uint8_t)in[i++] : 0;
        uint32_t triple = (a << 16) | (b << 8) | c;
        out[j++] = B64_TABLE[(triple >> 18) & 0x3F];
        out[j++] = B64_TABLE[(triple >> 12) & 0x3F];
        out[j++] = B64_TABLE[(triple >>  6) & 0x3F];
        out[j++] = B64_TABLE[(triple      ) & 0x3F];
    }
    // Padding
    int pad = in_len % 3;
    if (pad == 1) { out[j-2] = '='; out[j-1] = '='; }
    if (pad == 2) { out[j-1] = '='; }
    out[j] = '\0';
}

// ── TCP connection helper ─────────────────────────────────────────────────────
static int rpc_connect(const char *host, int port) {
    struct sockaddr_in addr;
    struct hostent *he;
    int sock;
    struct timeval tv = { RPC_TIMEOUT_SEC, 0 };

    he = gethostbyname(host);
    if (!he) {
        LOGE("gethostbyname(%s) failed: %s", host, strerror(errno));
        return -1;
    }

    sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) {
        LOGE("socket() failed: %s", strerror(errno));
        return -1;
    }

    setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
    setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));

    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);
    memcpy(&addr.sin_addr, he->h_addr_list[0], he->h_length);

    if (connect(sock, (struct sockaddr*)&addr, sizeof(addr)) < 0) {
        LOGE("connect(%s:%d) failed: %s", host, port, strerror(errno));
        close(sock);
        return -1;
    }
    return sock;
}

// ── Core HTTP POST ─────────────────────────────────────────────────────────────
// Returns malloc'd response body string — caller must free()
// Returns NULL on error
static char* rpc_post(const rpc_config_t *cfg, const char *json_body) {
    int sock;
    char auth_plain[256], auth_b64[512];
    char request[RPC_SEND_BUF];
    char *response = NULL;
    char *recv_buf = NULL;
    int  total_recv = 0, n;

    // Build Basic Auth
    snprintf(auth_plain, sizeof(auth_plain), "%s:%s", cfg->user, cfg->pass);
    base64_encode(auth_plain, strlen(auth_plain), auth_b64);

    // Build HTTP request
    int body_len = (int)strlen(json_body);
    snprintf(request, sizeof(request),
        "POST / HTTP/1.1\r\n"
        "Host: %s:%d\r\n"
        "Authorization: Basic %s\r\n"
        "Content-Type: application/json\r\n"
        "Content-Length: %d\r\n"
        "Connection: close\r\n"
        "\r\n"
        "%s",
        cfg->host, cfg->port, auth_b64, body_len, json_body
    );

    sock = rpc_connect(cfg->host, cfg->port);
    if (sock < 0) return NULL;

    // Send
    if (send(sock, request, strlen(request), 0) < 0) {
        LOGE("send() failed: %s", strerror(errno));
        close(sock);
        return NULL;
    }

    // Receive
    recv_buf = (char*)malloc(RPC_RECV_BUF + 1);
    if (!recv_buf) { close(sock); return NULL; }
    memset(recv_buf, 0, RPC_RECV_BUF + 1);

    while ((n = recv(sock, recv_buf + total_recv,
                     RPC_RECV_BUF - total_recv, 0)) > 0) {
        total_recv += n;
        if (total_recv >= RPC_RECV_BUF) break;
    }
    close(sock);

    // Find HTTP body (after \r\n\r\n)
    char *body = strstr(recv_buf, "\r\n\r\n");
    if (!body) {
        LOGE("No HTTP body separator found");
        free(recv_buf);
        return NULL;
    }
    body += 4;
    response = strdup(body);
    free(recv_buf);
    return response;
}

// ── getblocktemplate ──────────────────────────────────────────────────────────
int rpc_getblocktemplate(const rpc_config_t *cfg, block_template_t *tmpl) {
    const char *req =
        "{\"jsonrpc\":\"1.0\",\"id\":\"miner\",\"method\":\"getblocktemplate\","
        "\"params\":[{\"rules\":[\"segwit\"]}]}";

    char *resp = rpc_post(cfg, req);
    if (!resp) {
        LOGE("[getblocktemplate] RPC call failed");
        return -1;
    }

    // Parse the JSON response manually (no JSON lib dependency)
    // Extract: height, previousblockhash, bits, curtime, coinbasevalue, transactions
    int parsed = rpc_parse_template(resp, tmpl);
    free(resp);

    if (parsed != 0) {
        LOGE("[getblocktemplate] Parse failed");
        return -1;
    }

    LOGI("[getblocktemplate] height=%u bits=%s", tmpl->height, tmpl->bits_hex);
    return 0;
}

// ── submitblock ───────────────────────────────────────────────────────────────
int rpc_submitblock(const rpc_config_t *cfg, const char *block_hex) {
    char req[65600];  // block hex can be large
    snprintf(req, sizeof(req),
        "{\"jsonrpc\":\"1.0\",\"id\":\"miner\",\"method\":\"submitblock\","
        "\"params\":[\"%s\"]}", block_hex);

    char *resp = rpc_post(cfg, req);
    if (!resp) {
        LOGE("[submitblock] RPC call failed");
        return -1;
    }

    // Check for "result":null (accepted) vs error
    int accepted = (strstr(resp, "\"result\":null") != NULL);
    if (!accepted) {
        LOGE("[submitblock] Rejected: %s", resp);
    } else {
        LOGI("[submitblock] Block accepted!");
    }
    free(resp);
    return accepted ? 0 : -1;
}

// ── getbestblockhash — for stale template detection ───────────────────────────
int rpc_getbestblockhash(const rpc_config_t *cfg, char *out_hash_hex) {
    const char *req =
        "{\"jsonrpc\":\"1.0\",\"id\":\"miner\",\"method\":\"getbestblockhash\","
        "\"params\":[]}";

    char *resp = rpc_post(cfg, req);
    if (!resp) return -1;

    // Extract "result":"<hash>"
    char *start = strstr(resp, "\"result\":\"");
    if (!start) { free(resp); return -1; }
    start += 10;
    char *end = strchr(start, '"');
    if (!end || (end - start) != 64) { free(resp); return -1; }
    strncpy(out_hash_hex, start, 64);
    out_hash_hex[64] = '\0';
    free(resp);
    return 0;
}

// ── Minimal JSON template parser ──────────────────────────────────────────────
// Extracts fields from getblocktemplate response without a full JSON library
static char* json_get_string(const char *json, const char *key,
                              char *out, size_t out_len) {
    char search[64];
    snprintf(search, sizeof(search), "\"%s\":\"", key);
    char *p = strstr(json, search);
    if (!p) return NULL;
    p += strlen(search);
    char *end = strchr(p, '"');
    if (!end) return NULL;
    size_t len = end - p;
    if (len >= out_len) len = out_len - 1;
    strncpy(out, p, len);
    out[len] = '\0';
    return out;
}

static int json_get_uint32(const char *json, const char *key, uint32_t *out) {
    char search[64];
    snprintf(search, sizeof(search), "\"%s\":", key);
    char *p = strstr(json, search);
    if (!p) return -1;
    p += strlen(search);
    *out = (uint32_t)strtoul(p, NULL, 10);
    return 0;
}

static int json_get_int64(const char *json, const char *key, int64_t *out) {
    char search[64];
    snprintf(search, sizeof(search), "\"%s\":", key);
    char *p = strstr(json, search);
    if (!p) return -1;
    p += strlen(search);
    *out = (int64_t)strtoll(p, NULL, 10);
    return 0;
}

int rpc_parse_template(const char *json, block_template_t *tmpl) {
    memset(tmpl, 0, sizeof(block_template_t));

    // Check for error field
    if (strstr(json, "\"error\":{") && !strstr(json, "\"error\":null")) {
        LOGE("[parse_template] RPC returned error");
        return -1;
    }

    json_get_uint32(json, "height",    &tmpl->height);
    json_get_uint32(json, "version",   &tmpl->version);
    json_get_uint32(json, "curtime",   &tmpl->curtime);
    json_get_int64 (json, "coinbasevalue", &tmpl->coinbase_value);

    json_get_string(json, "previousblockhash", tmpl->prev_hash_hex, 65);
    json_get_string(json, "bits",              tmpl->bits_hex,      16);
    json_get_string(json, "target",            tmpl->target_hex,    65);

    // Convert bits hex to uint32
    tmpl->bits = (uint32_t)strtoul(tmpl->bits_hex, NULL, 16);

    return 0;
}