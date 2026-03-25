/**
 * miner.c — CapStash NDK mining loop
 * v3.0
 *
 * Changes from v2.1:
 *   1. Midstate optimization — block 1 hashed once per template, not per nonce
 *   2. T0-only Whirlpool — 2KB table vs 16KB, fits in L1 cache
 *   3. Partial target check — MSW first, >99.99% nonces rejected in 1 compare
 *   4. P-core pinning via syscall — threads 0-3 pinned to cores 4-7
 */

#include "miner.h"
#include "whirlpool.h"
#include "sha256.h"
#include "rpc.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <pthread.h>
#include <stdatomic.h>
#include <time.h>
#include <android/log.h>
#include <sys/syscall.h>

#define LOG_TAG "CapStash_Miner"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO,  LOG_TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN,  LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

// ── Tuning constants ──────────────────────────────────────────────────────────
#define MAINTENANCE_EVERY    65536
#define HASH_BATCH           4096
#define MAX_THREADS          8
#define TEMPLATE_RETRY_SEC   5
#define HASHRATE_WINDOW_SEC  5

// ── Global mining state ───────────────────────────────────────────────────────
static volatile int        g_running      = 0;
static miner_config_t      g_config;
static miner_callbacks_t   g_callbacks;
static pthread_t           g_threads[MAX_THREADS];
static int                 g_thread_count = 0;
static pthread_mutex_t     g_stats_mutex  = PTHREAD_MUTEX_INITIALIZER;

static atomic_uint_least64_t g_total_hashes = 0;
static atomic_uint_least32_t g_blocks_found = 0;

static pthread_mutex_t   g_template_mutex = PTHREAD_MUTEX_INITIALIZER;
static block_template_t  g_template;
static char              g_tip_hash[65];
static volatile int      g_template_valid = 0;

// ── Per-thread data ───────────────────────────────────────────────────────────
typedef struct {
    int          thread_id;
    rpc_config_t rpc;
    char         address[128];
    double       last_hashrate;
    uint64_t     midstate[8];
    uint64_t     tail0;
    uint64_t     tail1_base;
    uint64_t     target64[4];   // target as 4 x uint64 for fast compare
} thread_data_t;

// ── Address decode helpers ────────────────────────────────────────────────────

static const char BECH32_CHARSET[] = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

static int decode_bech32(const char *addr, uint8_t *out_hash160) {
    char lower[128];
    int  addr_len = (int)strlen(addr);
    if (addr_len < 8 || addr_len > 90) return 0;

    for (int i = 0; i < addr_len; i++)
        lower[i] = (addr[i] >= 'A' && addr[i] <= 'Z') ? addr[i] + 32 : addr[i];
    lower[addr_len] = '\0';

    int sep = -1;
    for (int i = addr_len - 1; i >= 0; i--) {
        if (lower[i] == '1') { sep = i; break; }
    }
    if (sep < 1) return 0;

    int data_len = addr_len - sep - 1 - 6;
    if (data_len < 1) return 0;

    uint8_t data[64];
    for (int i = 0; i < data_len; i++) {
        const char *p = strchr(BECH32_CHARSET, lower[sep + 1 + i]);
        if (!p) return 0;
        data[i] = (uint8_t)(p - BECH32_CHARSET);
    }

    if (data[0] != 0) return 0;

    uint8_t bytes[32];
    int byte_count = 0, acc = 0, bits = 0;
    for (int i = 1; i < data_len; i++) {
        acc  = (acc << 5) | data[i];
        bits += 5;
        if (bits >= 8) {
            bits -= 8;
            bytes[byte_count++] = (acc >> bits) & 0xff;
            if (byte_count > 20) return 0;
        }
    }
    if (byte_count != 20) return 0;
    memcpy(out_hash160, bytes, 20);
    return 1;
}

static const char BASE58_ALPHA[] =
    "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

static int decode_base58check(const char *addr, uint8_t *out_hash160) {
    int addr_len = (int)strlen(addr);
    if (addr_len < 25 || addr_len > 35) return 0;

    uint8_t decoded[64];
    memset(decoded, 0, sizeof(decoded));
    int decoded_len = 25;

    for (int i = 0; i < addr_len; i++) {
        const char *p = strchr(BASE58_ALPHA, addr[i]);
        if (!p) return 0;
        int carry = (int)(p - BASE58_ALPHA);
        for (int j = decoded_len - 1; j >= 0; j--) {
            carry += 58 * decoded[j];
            decoded[j] = carry & 0xff;
            carry >>= 8;
        }
        if (carry) return 0;
    }

    uint8_t check[32];
    sha256d(decoded, 21, check);
    if (decoded[21] != check[0] || decoded[22] != check[1] ||
        decoded[23] != check[2] || decoded[24] != check[3]) {
        LOGW("[miner] base58check checksum failed for address %s", addr);
        return 0;
    }
    memcpy(out_hash160, decoded + 1, 20);
    return 1;
}

// ── Build output scriptPubKey ─────────────────────────────────────────────────
static int build_output_script(const char *address, uint8_t *out_script) {
    uint8_t hash160[20];

    if (strncmp(address, "cap1", 4) == 0) {
        if (!decode_bech32(address, hash160)) {
            LOGE("[miner] bech32 decode failed for %s", address);
            return -1;
        }
        out_script[0] = 0x00;
        out_script[1] = 0x14;
        memcpy(out_script + 2, hash160, 20);
        return 22;
    } else if (address[0] == 'C') {
        if (!decode_base58check(address, hash160)) {
            LOGE("[miner] base58check decode failed for %s", address);
            return -1;
        }
        out_script[0] = 0x76;
        out_script[1] = 0xa9;
        out_script[2] = 0x14;
        memcpy(out_script + 3, hash160, 20);
        out_script[23] = 0x88;
        out_script[24] = 0xac;
        return 25;
    } else {
        LOGE("[miner] unrecognized address format: %s", address);
        return -1;
    }
}

// ── Coinbase transaction builder ──────────────────────────────────────────────
static int build_coinbase(const block_template_t *tmpl,
                           int extra_nonce1, uint64_t extra_nonce2,
                           const char *address,
                           uint8_t *out, size_t out_size) {
    uint8_t *p = out;

    write_le32(p, 0, 1); p += 4;   // version
    *p++ = 0x01;                    // vin count

    memset(p, 0x00, 32); p += 32;  // prevout hash (all zeros)
    write_le32(p, 0, 0xffffffff); p += 4;  // prevout index

    uint8_t scriptsig[64];
    uint8_t *sp = scriptsig;

    uint32_t h = tmpl->height;
    if (h == 0)          { *sp++ = 0x01; *sp++ = 0x00; }
    else if (h < 0x80)   { *sp++ = 0x01; *sp++ = (uint8_t)h; }
    else if (h < 0x8000) { *sp++ = 0x02; *sp++ = h & 0xff; *sp++ = (h >> 8) & 0xff; }
    else if (h < 0x800000) {
        *sp++ = 0x03;
        *sp++ = h & 0xff; *sp++ = (h >> 8) & 0xff; *sp++ = (h >> 16) & 0xff;
    } else {
        *sp++ = 0x04;
        *sp++ = h & 0xff; *sp++ = (h >> 8) & 0xff;
        *sp++ = (h >> 16) & 0xff; *sp++ = (h >> 24) & 0xff;
    }

    *sp++ = 0x04; write_le32(sp, 0, (uint32_t)extra_nonce1); sp += 4;
    *sp++ = 0x04; write_le32(sp, 0, (uint32_t)(extra_nonce2 & 0xffffffff)); sp += 4;
    *sp++ = 0x04; write_le32(sp, 0, (uint32_t)((extra_nonce2 >> 32) & 0xffffffff)); sp += 4;

    int ss_len = (int)(sp - scriptsig);
    *p++ = (uint8_t)ss_len;
    memcpy(p, scriptsig, ss_len); p += ss_len;

    write_le32(p, 0, 0xffffffff); p += 4;  // sequence
    *p++ = 0x01;                            // vout count

    uint64_t val = (uint64_t)tmpl->coinbase_value;
    for (int i = 0; i < 8; i++) *p++ = (val >> (i * 8)) & 0xff;

    uint8_t out_script[25];
    int script_len = build_output_script(address, out_script);
    if (script_len < 0) {
        LOGE("[miner] build_coinbase: address decode failed, aborting");
        return -1;
    }
    *p++ = (uint8_t)script_len;
    memcpy(p, out_script, script_len); p += script_len;

    write_le32(p, 0, 0); p += 4;  // locktime
    return (int)(p - out);
}

// ── Txid + merkle root ────────────────────────────────────────────────────────
static void compute_txid(const uint8_t *tx, int tx_len, uint8_t *txid) {
    sha256d(tx, (size_t)tx_len, txid);
}

static void compute_merkle_root(const uint8_t *coinbase_txid, uint8_t *merkle_root) {
    memcpy(merkle_root, coinbase_txid, 32);
}

// ── Block header builder ──────────────────────────────────────────────────────
static void build_header(const block_template_t *tmpl,
                          const uint8_t *merkle_root,
                          uint32_t nonce, uint8_t *header) {
    write_le32(header, 0, tmpl->version);

    uint8_t prev[32];
    hex_to_bytes(tmpl->prev_hash_hex, prev, 32);
    for (int i = 0; i < 32; i++) header[4 + i] = prev[31 - i];

    memcpy(header + 36, merkle_root, 32);
    write_le32(header, 68, tmpl->curtime);
    write_le32(header, 72, tmpl->bits);
    write_le32(header, 76, nonce);
}

// ── Block serialization ───────────────────────────────────────────────────────
static int serialize_block(const uint8_t *header,
                             const uint8_t *coinbase_tx, int cb_len,
                             char *out_hex, size_t out_hex_size) {
    uint8_t block_raw[80 + 1 + 512];
    uint8_t *p = block_raw;

    memcpy(p, header, 80); p += 80;
    *p++ = 0x01;

    if (cb_len > 512) { LOGE("[miner] coinbase too large: %d bytes", cb_len); return -1; }
    memcpy(p, coinbase_tx, cb_len); p += cb_len;

    int total_len = (int)(p - block_raw);
    if ((size_t)(total_len * 2 + 1) > out_hex_size) {
        LOGE("[miner] output hex buffer too small");
        return -1;
    }
    bytes_to_hex(block_raw, total_len, out_hex);
    return total_len;
}

// ── Template refresh ──────────────────────────────────────────────────────────
static int refresh_template(const rpc_config_t *rpc) {
    block_template_t new_tmpl;
    if (rpc_getblocktemplate(rpc, &new_tmpl) != 0) {
        LOGW("[miner] getblocktemplate failed — retry in %ds", TEMPLATE_RETRY_SEC);
        return -1;
    }
    pthread_mutex_lock(&g_template_mutex);
    memcpy(&g_template, &new_tmpl, sizeof(block_template_t));
    g_template_valid = 1;
    pthread_mutex_unlock(&g_template_mutex);
    return 0;
}

// ── Mining thread ─────────────────────────────────────────────────────────────
static void* mining_thread(void *arg) {
    thread_data_t *td = (thread_data_t*)arg;

    uint8_t  header[80];
    uint8_t  hash[32];
    uint8_t  coinbase[512];
    uint8_t  coinbase_txid[32];
    uint8_t  merkle_root[32];
    uint64_t extra_nonce2 = 0;
    uint32_t nonce;
    uint64_t hashes = 0;
    char     tip_local[65] = {0};
    char     tip_check[65];
    int      cb_len;

    block_template_t local_tmpl;
    time_t   hashrate_t0 = time(NULL);
    uint64_t hashrate_h0 = 0;

    LOGI("[thread %d] started", td->thread_id);

    // Pin to P-cores (4-7) via syscall — Bionic doesn't expose cpu_set_t
    int p_cores[]   = {4, 5, 6, 7};
    int target_core = p_cores[td->thread_id % 4];
    unsigned long mask = 1UL << target_core;
    if (syscall(__NR_sched_setaffinity, 0, sizeof(mask), &mask) != 0)
        LOGW("[thread %d] P-core pin failed (non-fatal)", td->thread_id);
    else
        LOGI("[thread %d] pinned to core %d", td->thread_id, target_core);

    while (g_running) {

        // ── Fetch template ────────────────────────────────────────────────────
        pthread_mutex_lock(&g_template_mutex);
        int valid = g_template_valid;
        if (valid) memcpy(&local_tmpl, &g_template, sizeof(block_template_t));
        pthread_mutex_unlock(&g_template_mutex);

        if (!valid) {
            if (td->thread_id == 0) refresh_template(&td->rpc);
            sleep(1);
            continue;
        }

        // Build coinbase
        cb_len = build_coinbase(&local_tmpl, td->thread_id, extra_nonce2,
                                td->address, coinbase, sizeof(coinbase));
        if (cb_len < 0) {
            if (g_callbacks.on_error)
                g_callbacks.on_error("Address decode failed — check mining address",
                                      g_callbacks.userdata);
            g_running = 0;
            break;
        }

        compute_txid(coinbase, cb_len, coinbase_txid);
        compute_merkle_root(coinbase_txid, merkle_root);

        // ── Compute midstate once per template (not per nonce) ────────────────
        build_header(&local_tmpl, merkle_root, 0, header);
        capstash_compute_midstate(header, td->midstate, &td->tail0, &td->tail1_base);

        // Convert byte target → 4 x uint64 for fast partial compare
        hex_to_bytes(local_tmpl.target_hex, (uint8_t*)td->target64, 32);

        // ── Nonce loop ────────────────────────────────────────────────────────
        nonce = (uint32_t)td->thread_id;

        while (g_running) {
            hashes++;

            if (capstash_hash_midstate(td->midstate, td->tail0, td->tail1_base,
                                        nonce, td->target64)) {
                // Valid PoW found — rebuild full header + hash for submission
                build_header(&local_tmpl, merkle_root, nonce, header);
                capstash_hash(header, hash);

                char hash_hex[65];
                bytes_to_hex(hash, 32, hash_hex);
                LOGI("[thread %d] ★ BLOCK FOUND! height=%u nonce=%u hash=%s",
                     td->thread_id, local_tmpl.height, nonce, hash_hex);

                char block_hex[2048];
                int block_len = serialize_block(header, coinbase, cb_len,
                                                block_hex, sizeof(block_hex));
                if (block_len > 0) {
                    int submit_result = rpc_submitblock(&td->rpc, block_hex);
                    if (submit_result == 0)
                        LOGI("[thread %d] Block submitted and accepted!", td->thread_id);
                    else
                        LOGW("[thread %d] Block submission rejected", td->thread_id);
                } else {
                    LOGE("[thread %d] Block serialization failed", td->thread_id);
                }

                atomic_fetch_add(&g_blocks_found, 1);
                if (g_callbacks.on_block)
                    g_callbacks.on_block(local_tmpl.height, hash_hex,
                                          g_callbacks.userdata);

                g_template_valid = 0;
                break;
            }

            // Batch update hash counter
            if (hashes % HASH_BATCH == 0)
                atomic_fetch_add(&g_total_hashes, HASH_BATCH);

            // Maintenance window
            if (hashes % MAINTENANCE_EVERY == 0) {

                // Hashrate report
                time_t  now     = time(NULL);
                double  elapsed = difftime(now, hashrate_t0);
                if (elapsed >= HASHRATE_WINDOW_SEC) {
                    double hr = (double)(hashes - hashrate_h0) / elapsed;
                    td->last_hashrate = hr;
                    if (td->thread_id == 0 && g_callbacks.on_hashrate)
                        g_callbacks.on_hashrate(hr * g_thread_count,
                                                 g_callbacks.userdata);
                    hashrate_t0 = now;
                    hashrate_h0 = hashes;
                }

                // Check for new block (thread 0 only)
                if (td->thread_id == 0) {
                    if (rpc_getbestblockhash(&td->rpc, tip_check) == 0) {
                        if (strcmp(tip_check, tip_local) != 0) {
                            LOGI("[thread 0] new block — refreshing template");
                            strncpy(tip_local, tip_check, 64);
                            tip_local[64] = '\0';
                            refresh_template(&td->rpc);
                            break;
                        }
                    }
                }

                // Sync timestamp from shared template
                pthread_mutex_lock(&g_template_mutex);
                if (g_template_valid)
                    local_tmpl.curtime = g_template.curtime;
                pthread_mutex_unlock(&g_template_mutex);
            }

            // Stride nonces across threads
            nonce += (uint32_t)g_thread_count;

            // Nonce exhausted — increment extra_nonce2, rebuild coinbase
            if (nonce < (uint32_t)td->thread_id) {
                extra_nonce2++;
                LOGI("[thread %d] nonce exhausted — extra_nonce2=%llu",
                     td->thread_id, (unsigned long long)extra_nonce2);
                break;
            }
        }

        // Duty cycle rest
        if (g_running &&
            g_config.duty_cycle_on > 0 && g_config.duty_cycle_off > 0) {
            sleep(g_config.duty_cycle_off);
        }
    }

    LOGI("[thread %d] stopped — %llu hashes", td->thread_id,
         (unsigned long long)hashes);
    free(td);
    return NULL;
}

// ── Public API ────────────────────────────────────────────────────────────────

int miner_start(const miner_config_t *config, const miner_callbacks_t *callbacks) {
    if (g_running) { LOGW("[miner] already running"); return -1; }
    if (!config || strlen(config->address) == 0) {
        LOGE("[miner] no mining address configured");
        return -1;
    }

    uint8_t test_hash[20];
    int addr_ok = 0;
    if (strncmp(config->address, "cap1", 4) == 0)
        addr_ok = decode_bech32(config->address, test_hash);
    else if (config->address[0] == 'C')
        addr_ok = decode_base58check(config->address, test_hash);

    if (!addr_ok) {
        LOGE("[miner] address validation failed: %s", config->address);
        return -1;
    }
    LOGI("[miner] address validated OK: %s", config->address);

    memcpy(&g_config, config, sizeof(miner_config_t));
    if (callbacks) memcpy(&g_callbacks, callbacks, sizeof(miner_callbacks_t));
    else           memset(&g_callbacks, 0,          sizeof(miner_callbacks_t));

    atomic_store(&g_total_hashes, 0);
    atomic_store(&g_blocks_found, 0);
    g_template_valid = 0;
    g_running = 1;

    int threads = config->threads;
    if (threads <= 0) threads = 4;
    if (threads > MAX_THREADS) threads = MAX_THREADS;
    g_thread_count = threads;

    rpc_config_t rpc = {0};
    strncpy(rpc.host, config->host, 63);
    rpc.port = config->port;
    strncpy(rpc.user, config->user, 63);
    strncpy(rpc.pass, config->pass, 63);

    if (refresh_template(&rpc) != 0) {
        LOGE("[miner] failed initial getblocktemplate — aborting");
        g_running = 0;
        return -1;
    }

    LOGI("[miner] starting %d threads → %s", threads, config->address);

    for (int i = 0; i < threads; i++) {
        thread_data_t *td = (thread_data_t*)calloc(1, sizeof(thread_data_t));
        td->thread_id = i;
        memcpy(&td->rpc, &rpc, sizeof(rpc_config_t));
        strncpy(td->address, config->address, 127);
        td->address[127] = '\0';

        if (pthread_create(&g_threads[i], NULL, mining_thread, td) != 0) {
            LOGE("[miner] failed to spawn thread %d", i);
            free(td);
        }
    }
    return 0;
}

void miner_stop(void) {
    if (!g_running) return;
    LOGI("[miner] stopping...");
    g_running = 0;
    for (int i = 0; i < g_thread_count; i++)
        pthread_join(g_threads[i], NULL);
    g_thread_count = 0;
    LOGI("[miner] stopped");
}

void miner_get_stats(miner_stats_t *stats) {
    pthread_mutex_lock(&g_stats_mutex);
    stats->total_hashes = atomic_load(&g_total_hashes);
    stats->blocks_found = atomic_load(&g_blocks_found);
    stats->running      = g_running;
    stats->thread_count = g_thread_count;
    stats->hashrate     = 0;
    pthread_mutex_unlock(&g_stats_mutex);
}

int miner_is_running(void) { return g_running; }

void miner_set_threads(int threads) {
    if (!g_running) return;
    miner_stop();
    g_config.threads = threads;
    miner_start(&g_config, &g_callbacks);
}