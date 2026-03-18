/**
 * miner.c — CapStash NDK mining loop
 * v2.1
 *
 * Place at: android/app/src/main/cpp/miner.c
 *
 * Fixes from v2.0:
 *   1. Merkle root now uses SHA256d (not Whirlpool) — correct for txid/merkle
 *   2. Coinbase output decodes real bech32/base58check address — spendable rewards
 *   3. Block submission wired in — rpc_submitblock called on valid PoW
 *   4. Full block serialization implemented
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
} thread_data_t;

// ── Address decode helpers ────────────────────────────────────────────────────

// Bech32 charset
static const char BECH32_CHARSET[] = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

// Decode bech32 address (cap1...) into 20-byte witness program
// Returns 1 on success, 0 on failure
static int decode_bech32(const char *addr, uint8_t *out_hash160) {
    char lower[128];
    int  addr_len = (int)strlen(addr);
    if (addr_len < 8 || addr_len > 90) return 0;

    // Lowercase copy
    for (int i = 0; i < addr_len; i++)
        lower[i] = (addr[i] >= 'A' && addr[i] <= 'Z')
                   ? addr[i] + 32 : addr[i];
    lower[addr_len] = '\0';

    // Find separator '1'
    int sep = -1;
    for (int i = addr_len - 1; i >= 0; i--) {
        if (lower[i] == '1') { sep = i; break; }
    }
    if (sep < 1) return 0;

    // Decode 5-bit groups after separator (skip last 6 = checksum)
    int data_len = addr_len - sep - 1 - 6;
    if (data_len < 1) return 0;

    uint8_t data[64];
    for (int i = 0; i < data_len; i++) {
        const char *p = strchr(BECH32_CHARSET, lower[sep + 1 + i]);
        if (!p) return 0;
        data[i] = (uint8_t)(p - BECH32_CHARSET);
    }

    // data[0] = witness version (must be 0 for P2WPKH)
    if (data[0] != 0) return 0;

    // Convert 5-bit groups to 8-bit bytes (skip version byte)
    uint8_t bytes[32];
    int     byte_count = 0;
    int     acc        = 0;
    int     bits       = 0;

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

// Base58 alphabet
static const char BASE58_ALPHA[] =
    "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// Decode base58check address (C...) into 20-byte hash160
// Returns 1 on success, 0 on failure
static int decode_base58check(const char *addr, uint8_t *out_hash160) {
    int addr_len = (int)strlen(addr);
    if (addr_len < 25 || addr_len > 35) return 0;

    // Decode base58 to bytes using big integer arithmetic
    uint8_t decoded[64];
    memset(decoded, 0, sizeof(decoded));
    int decoded_len = 25;  // version(1) + hash160(20) + checksum(4)

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

    // decoded[0]     = version byte (0x1C = 28 for CapStash 'C' addresses)
    // decoded[1..20] = hash160
    // decoded[21..24]= checksum (first 4 bytes of SHA256d of version+hash160)
    // Verify checksum
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

// ── Build output scriptPubKey from mining address ─────────────────────────────
// Returns script length, or -1 on failure
// out_script must be at least 25 bytes
static int build_output_script(const char *address, uint8_t *out_script) {
    uint8_t hash160[20];

    if (strncmp(address, "cap1", 4) == 0) {
        // Bech32 → P2WPKH: OP_0 <20-byte-hash>  (22 bytes)
        if (!decode_bech32(address, hash160)) {
            LOGE("[miner] bech32 decode failed for %s", address);
            return -1;
        }
        out_script[0] = 0x00;   // OP_0 (witness version)
        out_script[1] = 0x14;   // PUSH 20 bytes
        memcpy(out_script + 2, hash160, 20);
        return 22;

    } else if (address[0] == 'C') {
        // Base58Check → P2PKH: OP_DUP OP_HASH160 <20-byte-hash> OP_EQUALVERIFY OP_CHECKSIG (25 bytes)
        if (!decode_base58check(address, hash160)) {
            LOGE("[miner] base58check decode failed for %s", address);
            return -1;
        }
        out_script[0] = 0x76;   // OP_DUP
        out_script[1] = 0xa9;   // OP_HASH160
        out_script[2] = 0x14;   // PUSH 20 bytes
        memcpy(out_script + 3, hash160, 20);
        out_script[23] = 0x88;  // OP_EQUALVERIFY
        out_script[24] = 0xac;  // OP_CHECKSIG
        return 25;

    } else {
        LOGE("[miner] unrecognized address format: %s", address);
        return -1;
    }
}

// ── Coinbase transaction builder ──────────────────────────────────────────────
static int build_coinbase(const block_template_t *tmpl,
                           int extra_nonce1,
                           uint64_t extra_nonce2,
                           const char *address,
                           uint8_t *out, size_t out_size) {
    uint8_t *p = out;

    // Version: 1
    write_le32(p, 0, 1); p += 4;

    // vin count: 1
    *p++ = 0x01;

    // Prevout: all-zero hash + 0xffffffff index
    memset(p, 0x00, 32); p += 32;
    write_le32(p, 0, 0xffffffff); p += 4;

    // ScriptSig: BIP34 height + extranonces
    uint8_t scriptsig[64];
    uint8_t *sp = scriptsig;

    // BIP34 height push (little-endian, minimal encoding)
    uint32_t h = tmpl->height;
    if (h == 0) {
        *sp++ = 0x01; *sp++ = 0x00;
    } else if (h < 0x80) {
        *sp++ = 0x01; *sp++ = (uint8_t)h;
    } else if (h < 0x8000) {
        *sp++ = 0x02;
        *sp++ =  h        & 0xff;
        *sp++ = (h >>  8) & 0xff;
    } else if (h < 0x800000) {
        *sp++ = 0x03;
        *sp++ =  h        & 0xff;
        *sp++ = (h >>  8) & 0xff;
        *sp++ = (h >> 16) & 0xff;
    } else {
        *sp++ = 0x04;
        *sp++ =  h        & 0xff;
        *sp++ = (h >>  8) & 0xff;
        *sp++ = (h >> 16) & 0xff;
        *sp++ = (h >> 24) & 0xff;
    }

    // extra_nonce1 = thread_id (4 bytes LE)
    *sp++ = 0x04;
    write_le32(sp, 0, (uint32_t)extra_nonce1); sp += 4;

    // extra_nonce2 low (4 bytes LE)
    *sp++ = 0x04;
    write_le32(sp, 0, (uint32_t)(extra_nonce2 & 0xffffffff)); sp += 4;

    // extra_nonce2 high (4 bytes LE)
    *sp++ = 0x04;
    write_le32(sp, 0, (uint32_t)((extra_nonce2 >> 32) & 0xffffffff)); sp += 4;

    int ss_len = (int)(sp - scriptsig);
    *p++ = (uint8_t)ss_len;
    memcpy(p, scriptsig, ss_len); p += ss_len;

    // Sequence: 0xffffffff
    write_le32(p, 0, 0xffffffff); p += 4;

    // vout count: 1
    *p++ = 0x01;

    // Value: coinbase reward (8 bytes LE)
    uint64_t val = (uint64_t)tmpl->coinbase_value;
    for (int i = 0; i < 8; i++)
        *p++ = (val >> (i * 8)) & 0xff;

    // Output script from real mining address
    uint8_t out_script[25];
    int script_len = build_output_script(address, out_script);
    if (script_len < 0) {
        // Address decode failed — refuse to build an unspendable coinbase
        LOGE("[miner] build_coinbase: address decode failed, aborting");
        return -1;
    }
    *p++ = (uint8_t)script_len;
    memcpy(p, out_script, script_len); p += script_len;

    // Locktime: 0
    write_le32(p, 0, 0); p += 4;

    return (int)(p - out);
}

// ── Txid computation: SHA256d of raw transaction bytes ────────────────────────
// Result is in internal byte order (little-endian / reversed from display)
static void compute_txid(const uint8_t *tx, int tx_len, uint8_t *txid) {
    sha256d(tx, (size_t)tx_len, txid);
}

// ── Merkle root from single coinbase txid ────────────────────────────────────
// Solo mining with empty mempool: merkle root = coinbase txid
// If transactions exist, build full merkle tree
static void compute_merkle_root(const uint8_t *coinbase_txid,
                                  uint8_t *merkle_root) {
    // For now: solo mining, empty mempool → merkle root = coinbase txid
    memcpy(merkle_root, coinbase_txid, 32);
}

// ── Block header builder ──────────────────────────────────────────────────────
static void build_header(const block_template_t *tmpl,
                          const uint8_t *merkle_root,
                          uint32_t nonce,
                          uint8_t *header) {
    // Bytes 0-3: version (LE)
    write_le32(header, 0, tmpl->version);

    // Bytes 4-35: prev block hash (reverse byte order for internal repr)
    uint8_t prev[32];
    hex_to_bytes(tmpl->prev_hash_hex, prev, 32);
    for (int i = 0; i < 32; i++) header[4 + i] = prev[31 - i];

    // Bytes 36-67: merkle root (already in internal byte order)
    memcpy(header + 36, merkle_root, 32);

    // Bytes 68-71: time (LE)
    write_le32(header, 68, tmpl->curtime);

    // Bytes 72-75: bits (LE)
    write_le32(header, 72, tmpl->bits);

    // Bytes 76-79: nonce (LE)
    write_le32(header, 76, nonce);
}

// ── Full block serialization ──────────────────────────────────────────────────
// Returns serialized block as hex string
// out_hex must be large enough: 80*2 + varint + coinbase*2 + null = ~512+ chars
static int serialize_block(const uint8_t *header,
                             const uint8_t *coinbase_tx, int cb_len,
                             char *out_hex, size_t out_hex_size) {
    // Block = header(80) + varint(tx_count) + coinbase_tx
    // With empty mempool: tx_count = 1

    uint8_t block_raw[80 + 1 + 512];  // header + varint(1) + coinbase
    uint8_t *p = block_raw;

    // Header
    memcpy(p, header, 80); p += 80;

    // Tx count varint: 1 (single coinbase)
    *p++ = 0x01;

    // Coinbase tx
    if (cb_len > 512) {
        LOGE("[miner] coinbase too large: %d bytes", cb_len);
        return -1;
    }
    memcpy(p, coinbase_tx, cb_len); p += cb_len;

    int total_len = (int)(p - block_raw);

    // Convert to hex
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
    uint8_t  target[32];
    uint8_t  coinbase[512];
    uint8_t  coinbase_txid[32];
    uint8_t  merkle_root[32];
    uint64_t extra_nonce2 = 0;
    uint32_t nonce;
    uint64_t hashes       = 0;
    char     tip_local[65] = {0};
    char     tip_check[65];
    int      cb_len;

    block_template_t local_tmpl;
    time_t   hashrate_t0 = time(NULL);
    uint64_t hashrate_h0 = 0;

    LOGI("[thread %d] started", td->thread_id);

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

        // Parse target from hex
        hex_to_bytes(local_tmpl.target_hex, target, 32);

        // Build coinbase with this thread's extranonce
        cb_len = build_coinbase(&local_tmpl, td->thread_id, extra_nonce2,
                                td->address, coinbase, sizeof(coinbase));
        if (cb_len < 0) {
            // Address decode failed — notify and stop
            if (g_callbacks.on_error)
                g_callbacks.on_error("Address decode failed — check mining address",
                                      g_callbacks.userdata);
            g_running = 0;
            break;
        }

        // Coinbase txid = SHA256d of raw coinbase tx (internal byte order)
        compute_txid(coinbase, cb_len, coinbase_txid);

        // Merkle root = coinbase txid (solo, empty mempool)
        compute_merkle_root(coinbase_txid, merkle_root);

        // ── Nonce loop ────────────────────────────────────────────────────────
        nonce = (uint32_t)td->thread_id;

        while (g_running) {
            build_header(&local_tmpl, merkle_root, nonce, header);
            capstash_hash(header, hash);
            hashes++;

            if (capstash_hash_meets_target(hash, target)) {
                char hash_hex[65];
                bytes_to_hex(hash, 32, hash_hex);
                LOGI("[thread %d] ★ BLOCK FOUND! height=%u nonce=%u hash=%s",
                     td->thread_id, local_tmpl.height, nonce, hash_hex);

                // Serialize full block
                char block_hex[2048];
                int block_len = serialize_block(header, coinbase, cb_len,
                                                block_hex, sizeof(block_hex));
                if (block_len > 0) {
                    int submit_result = rpc_submitblock(&td->rpc, block_hex);
                    if (submit_result == 0) {
                        LOGI("[thread %d] Block submitted and accepted!", td->thread_id);
                    } else {
                        LOGW("[thread %d] Block submission rejected", td->thread_id);
                    }
                } else {
                    LOGE("[thread %d] Block serialization failed", td->thread_id);
                }

                atomic_fetch_add(&g_blocks_found, 1);
                if (g_callbacks.on_block)
                    g_callbacks.on_block(local_tmpl.height, hash_hex,
                                          g_callbacks.userdata);

                // Force fresh template after solution
                g_template_valid = 0;
                break;
            }

            // Batch update atomic counter
            if (hashes % HASH_BATCH == 0)
                atomic_fetch_add(&g_total_hashes, HASH_BATCH);

            // Maintenance window
            if (hashes % MAINTENANCE_EVERY == 0) {

                // Hashrate calculation
                time_t   now     = time(NULL);
                double   elapsed = difftime(now, hashrate_t0);
                if (elapsed >= HASHRATE_WINDOW_SEC) {
                    double hr = (double)(hashes - hashrate_h0) / elapsed;
                    td->last_hashrate = hr;
                    if (td->thread_id == 0 && g_callbacks.on_hashrate)
                        g_callbacks.on_hashrate(hr * g_thread_count,
                                                 g_callbacks.userdata);
                    hashrate_t0 = now;
                    hashrate_h0 = hashes;
                }

                // Check for new block from network (thread 0 only)
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

                // Update timestamp from shared template
                pthread_mutex_lock(&g_template_mutex);
                if (g_template_valid)
                    local_tmpl.curtime = g_template.curtime;
                pthread_mutex_unlock(&g_template_mutex);
            }

            // Stride by thread count
            nonce += (uint32_t)g_thread_count;

            // Nonce space exhausted — increment extra_nonce2, rebuild coinbase
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
    if (g_running) {
        LOGW("[miner] already running");
        return -1;
    }
    if (!config || strlen(config->address) == 0) {
        LOGE("[miner] no mining address configured");
        return -1;
    }

    // Validate address format before starting threads
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
    stats->total_hashes  = atomic_load(&g_total_hashes);
    stats->blocks_found  = atomic_load(&g_blocks_found);
    stats->running       = g_running;
    stats->thread_count  = g_thread_count;
    stats->hashrate      = 0;
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