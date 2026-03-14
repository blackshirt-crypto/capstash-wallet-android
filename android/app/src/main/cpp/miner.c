/**
 * miner.c — CapStash NDK mining loop
 * v2.0
 *
 * Place at: android/app/src/main/cpp/miner.c
 *
 * Ported from dev's Qt internal miner (MinerThread) with:
 *   - chainstate access replaced by RPC calls
 *   - pthreads for Android (no std::thread dependency)
 *   - Duty cycle support for thermal management
 */

#include "miner.h"
#include "whirlpool.h"
#include "rpc.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <pthread.h>
#include <stdatomic.h>
#include <time.h>
#include <android/log.h>

#define LOG_TAG "CapStash_Miner"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO,  LOG_TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN,  LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

// ── Tuning constants (mirrored from dev's Qt miner) ──────────────────────────
#define MAINTENANCE_EVERY    65536    // check template staleness every N hashes
#define HASH_BATCH           4096     // batch size before atomic counter update
#define MAX_THREADS          8        // hard cap — Snapdragon 765G has 8 cores
#define TEMPLATE_RETRY_SEC   5        // wait before retrying failed getblocktemplate
#define HASHRATE_WINDOW_SEC  5        // rolling window for hashrate calculation

// ── Global mining state ───────────────────────────────────────────────────────
static volatile int        g_running     = 0;
static miner_config_t      g_config;
static miner_callbacks_t   g_callbacks;
static pthread_t           g_threads[MAX_THREADS];
static int                 g_thread_count = 0;
static pthread_mutex_t     g_stats_mutex  = PTHREAD_MUTEX_INITIALIZER;

// Atomic counters — updated by all threads, read by stats
static atomic_uint_least64_t g_total_hashes  = 0;
static atomic_uint_least32_t g_blocks_found  = 0;

// Shared block template — protected by template mutex
static pthread_mutex_t   g_template_mutex = PTHREAD_MUTEX_INITIALIZER;
static block_template_t  g_template;
static char              g_tip_hash[65];   // last known best block hash
static volatile int      g_template_valid = 0;

// ── Per-thread data ───────────────────────────────────────────────────────────
typedef struct {
    int          thread_id;
    rpc_config_t rpc;
    char         address[128];
    // Hashrate tracking
    uint64_t     hashes_this_window;
    time_t       window_start;
    double       last_hashrate;
} thread_data_t;

// ── Coinbase transaction builder ──────────────────────────────────────────────
// Produces a minimal coinbase tx paying reward to mining address
// Returns length of serialized coinbase in bytes
static int build_coinbase(const block_template_t *tmpl,
                           int extra_nonce1,
                           uint64_t extra_nonce2,
                           const char *address,
                           uint8_t *out, size_t out_size) {
    // Minimal coinbase:
    // version(4) + vin_count(1) + vin(41+scriptsig) + vout_count(1) + vout(34) + locktime(4)
    uint8_t *p = out;

    // Version: 1
    write_le32(p, 0, 1); p += 4;

    // vin count: 1
    *p++ = 0x01;

    // Prevout hash (all zeros) + index (0xffffffff)
    memset(p, 0x00, 32); p += 32;
    write_le32(p, 0, 0xffffffff); p += 4;

    // ScriptSig: height + extranonces (following dev's format)
    uint8_t scriptsig[64];
    uint8_t *sp = scriptsig;
    // BIP34 height push
    uint32_t h = tmpl->height;
    if (h < 0x80) {
        *sp++ = 0x01; *sp++ = (uint8_t)h;
    } else if (h < 0x8000) {
        *sp++ = 0x02;
        *sp++ = h & 0xff;
        *sp++ = (h >> 8) & 0xff;
    } else {
        *sp++ = 0x03;
        *sp++ = h & 0xff;
        *sp++ = (h >> 8) & 0xff;
        *sp++ = (h >> 16) & 0xff;
    }
    // extra_nonce1 (thread id)
    *sp++ = 0x04;
    write_le32(sp, 0, (uint32_t)extra_nonce1); sp += 4;
    // extra_nonce2 low + high
    *sp++ = 0x04;
    write_le32(sp, 0, (uint32_t)(extra_nonce2 & 0xffffffff)); sp += 4;
    *sp++ = 0x04;
    write_le32(sp, 0, (uint32_t)((extra_nonce2 >> 32) & 0xffffffff)); sp += 4;

    int ss_len = (int)(sp - scriptsig);
    *p++ = (uint8_t)ss_len;
    memcpy(p, scriptsig, ss_len); p += ss_len;

    // Sequence: 0xffffffff
    write_le32(p, 0, 0xffffffff); p += 4;

    // vout count: 1
    *p++ = 0x01;

    // Value (coinbase reward) — little-endian 8 bytes
    uint64_t val = (uint64_t)tmpl->coinbase_value;
    for (int i = 0; i < 8; i++) {
        *p++ = (val >> (i * 8)) & 0xff;
    }

    // P2WPKH scriptPubKey for bech32 address (22 bytes: OP_0 <20-byte hash>)
    // For now use P2PKH (25 bytes) as placeholder — Drifter mode will handle proper derivation
    // TODO: decode bech32 address and build correct scriptPubKey
    *p++ = 0x19;  // script length = 25
    *p++ = 0x76;  // OP_DUP
    *p++ = 0xa9;  // OP_HASH160
    *p++ = 0x14;  // push 20 bytes
    memset(p, 0xAB, 20); p += 20;  // placeholder hash160 — replace with real decode
    *p++ = 0x88;  // OP_EQUALVERIFY
    *p++ = 0xac;  // OP_CHECKSIG

    // Locktime: 0
    write_le32(p, 0, 0); p += 4;

    return (int)(p - out);
}

// ── Merkle root computation ───────────────────────────────────────────────────
// Solo mining: single coinbase transaction = merkle root is txid of coinbase
static void compute_merkle_root(const uint8_t *coinbase, int cb_len, uint8_t *merkle_root) {
    // Double-SHA256 of coinbase = txid
    // For Whirlpool chain: use capstash_hash of the coinbase tx
    // NOTE: confirm with dev whether txid uses SHA256d or Whirlpool
    // Using capstash_hash (Whirlpool XOR-fold) for now
    if (cb_len <= 80) {
        capstash_hash(coinbase, merkle_root);
    } else {
        // For longer coinbase, hash in chunks — use Whirlpool directly
        uint8_t digest[64];
        whirlpool512(coinbase, (size_t)cb_len, digest);
        for (int i = 0; i < 32; i++) merkle_root[i] = digest[i] ^ digest[i + 32];
    }
}

// ── Block header serializer ───────────────────────────────────────────────────
static void build_header(const block_template_t *tmpl,
                          const uint8_t *merkle_root,
                          uint32_t nonce,
                          uint8_t *header) {
    // 0-3:   version
    write_le32(header, 0, tmpl->version);
    // 4-35:  prev block hash (convert from hex, reverse byte order)
    uint8_t prev[32];
    hex_to_bytes(tmpl->prev_hash_hex, prev, 32);
    for (int i = 0; i < 32; i++) header[4 + i] = prev[31 - i];
    // 36-67: merkle root
    memcpy(header + 36, merkle_root, 32);
    // 68-71: time
    write_le32(header, 68, tmpl->curtime);
    // 72-75: bits
    write_le32(header, 72, tmpl->bits);
    // 76-79: nonce
    write_le32(header, 76, nonce);
}

// ── Template refresh ──────────────────────────────────────────────────────────
static int refresh_template(const rpc_config_t *rpc) {
    block_template_t new_tmpl;
    if (rpc_getblocktemplate(rpc, &new_tmpl) != 0) {
        LOGW("[miner] getblocktemplate failed — retrying in %ds", TEMPLATE_RETRY_SEC);
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
    uint8_t  target[32];
    uint8_t  coinbase[512];
    uint8_t  merkle_root[32];
    uint64_t extra_nonce2 = 0;
    uint32_t nonce;
    uint64_t hashes = 0;
    char     tip_check[65];
    char     tip_local[65] = {0};
    int      cb_len;

    block_template_t local_tmpl;
    time_t   hashrate_t0 = time(NULL);
    uint64_t hashrate_h0 = 0;

    LOGI("[thread %d] started", td->thread_id);

    while (g_running) {

        // ── Get fresh template ──────────────────────────────────────────────
        pthread_mutex_lock(&g_template_mutex);
        int valid = g_template_valid;
        if (valid) memcpy(&local_tmpl, &g_template, sizeof(block_template_t));
        pthread_mutex_unlock(&g_template_mutex);

        if (!valid) {
            if (td->thread_id == 0) refresh_template(&td->rpc);
            sleep(1);
            continue;
        }

        // Parse target
        hex_to_bytes(local_tmpl.target_hex, target, 32);

        // Build coinbase with this thread's extranonce
        cb_len = build_coinbase(&local_tmpl, td->thread_id, extra_nonce2,
                                td->address, coinbase, sizeof(coinbase));
        compute_merkle_root(coinbase, cb_len, merkle_root);

        // ── Nonce loop (from dev's MinerThread pattern) ─────────────────────
        // Each thread strides: thread 0 does 0,N,2N...  thread 1 does 1,N+1,2N+1...
        nonce = (uint32_t)td->thread_id;

        while (g_running) {
            build_header(&local_tmpl, merkle_root, nonce, header);
            capstash_hash(header, hash);
            hashes++;

            // Check solution
            if (capstash_hash_meets_target(hash, target)) {
                char hash_hex[65];
                bytes_to_hex(hash, 32, hash_hex);
                LOGI("[thread %d] ★ BLOCK FOUND! height=%u hash=%s",
                     td->thread_id, local_tmpl.height, hash_hex);

                // TODO: serialize full block + submit
                // rpc_submitblock(&td->rpc, block_hex);
                atomic_fetch_add(&g_blocks_found, 1);
                if (g_callbacks.on_block) {
                    g_callbacks.on_block(local_tmpl.height, hash_hex,
                                         g_callbacks.userdata);
                }
                // Force template refresh after solution
                g_template_valid = 0;
                break;
            }

            // Batch update hash counter
            if (hashes % HASH_BATCH == 0) {
                atomic_fetch_add(&g_total_hashes, HASH_BATCH);
            }

            // Maintenance: check for new block / template staleness
            if (hashes % MAINTENANCE_EVERY == 0) {
                // Hashrate calculation
                time_t now = time(NULL);
                double elapsed = difftime(now, hashrate_t0);
                if (elapsed >= HASHRATE_WINDOW_SEC) {
                    double hr = (double)(hashes - hashrate_h0) / elapsed;
                    td->last_hashrate = hr;
                    if (td->thread_id == 0 && g_callbacks.on_hashrate) {
                        // Thread 0 reports combined estimate
                        g_callbacks.on_hashrate(hr * g_thread_count,
                                                 g_callbacks.userdata);
                    }
                    hashrate_t0 = now;
                    hashrate_h0 = hashes;
                }

                // Check if chain tip changed (new block from network)
                if (td->thread_id == 0) {
                    if (rpc_getbestblockhash(&td->rpc, tip_check) == 0) {
                        if (strcmp(tip_check, tip_local) != 0) {
                            LOGI("[thread 0] new block detected — refreshing template");
                            strncpy(tip_local, tip_check, 64);
                            refresh_template(&td->rpc);
                            break; // get new template
                        }
                    }
                }

                // Update template time field (prevent stale timestamps)
                pthread_mutex_lock(&g_template_mutex);
                if (g_template_valid) {
                    local_tmpl.curtime = g_template.curtime;
                }
                pthread_mutex_unlock(&g_template_mutex);
            }

            // Advance nonce by thread stride
            nonce += (uint32_t)g_thread_count;

            // Nonce exhausted — increment extranonce2 and rebuild coinbase
            if (nonce < (uint32_t)td->thread_id) {
                extra_nonce2++;
                break; // rebuild coinbase
            }
        }

        // Duty cycle: pause if configured
        if (g_config.duty_cycle_on > 0 && g_config.duty_cycle_off > 0) {
            sleep(g_config.duty_cycle_off);
        }
    }

    LOGI("[thread %d] stopped - %llu hashes", td->thread_id, (unsigned long long)hashes);
    free(td);
    return NULL;
}

// ── Public API ────────────────────────────────────────────────────────────────

int miner_start(const miner_config_t *config, const miner_callbacks_t *callbacks) {
    if (g_running) {
        LOGW("[miner] already running");
        return -1;
    }
    if (!config || strlen(config->address) == 0) {
        LOGE("[miner] no mining address set");
        return -1;
    }

    memcpy(&g_config, config, sizeof(miner_config_t));
    if (callbacks) memcpy(&g_callbacks, callbacks, sizeof(miner_callbacks_t));
    else           memset(&g_callbacks, 0, sizeof(miner_callbacks_t));

    atomic_store(&g_total_hashes, 0);
    atomic_store(&g_blocks_found, 0);
    g_template_valid = 0;
    g_running = 1;

    // Determine thread count
    int threads = config->threads;
    if (threads <= 0) threads = 4;  // safe default for Moto Edge
    if (threads > MAX_THREADS) threads = MAX_THREADS;
    g_thread_count = threads;

    // Fetch initial template before spawning threads
    rpc_config_t rpc = {0};
    strncpy(rpc.host, config->host, 63);
    rpc.port = config->port;
    strncpy(rpc.user, config->user, 63);
    strncpy(rpc.pass, config->pass, 63);

    if (refresh_template(&rpc) != 0) {
        LOGE("[miner] failed to get initial block template — aborting");
        g_running = 0;
        return -1;
    }

    LOGI("[miner] starting %d threads for address %s", threads, config->address);

    for (int i = 0; i < threads; i++) {
        thread_data_t *td = (thread_data_t*)calloc(1, sizeof(thread_data_t));
        td->thread_id = i;
        memcpy(&td->rpc, &rpc, sizeof(rpc_config_t));
        strncpy(td->address, config->address, 127);

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
    for (int i = 0; i < g_thread_count; i++) {
        pthread_join(g_threads[i], NULL);
    }
    g_thread_count = 0;
    LOGI("[miner] all threads stopped");
}

void miner_get_stats(miner_stats_t *stats) {
    pthread_mutex_lock(&g_stats_mutex);
    stats->total_hashes   = atomic_load(&g_total_hashes);
    stats->blocks_found   = atomic_load(&g_blocks_found);
    stats->running        = g_running;
    stats->thread_count   = g_thread_count;
    stats->hashrate       = 0;  // calculated by threads via callback
    pthread_mutex_unlock(&g_stats_mutex);
}

int miner_is_running(void) {
    return g_running;
}

void miner_set_threads(int threads) {
    if (!g_running) return;
    miner_stop();
    g_config.threads = threads;
    miner_start(&g_config, &g_callbacks);
}