/**
 * miner.h — CapStash NDK miner public API
 * v2.0
 *
 * Place at: android/app/src/main/cpp/miner.h
 */

#ifndef CAPSTASH_MINER_H
#define CAPSTASH_MINER_H

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

// ── Config passed from React Native / JNI ────────────────────────────────────
typedef struct {
    char host[64];          // Qt node IP or Tailscale IP
    int  port;              // RPC port (e.g. 8332)
    char user[64];          // RPC username
    char pass[64];          // RPC password
    char address[128];      // mining reward address (bech32 cap1... or legacy C...)
    int  threads;           // number of mining threads (0 = auto, use nproc - 1)
    int  duty_cycle_on;     // mine duration in seconds per cycle (0 = no duty cycle)
    int  duty_cycle_off;    // rest duration in seconds per cycle
} miner_config_t;

// ── Live stats readable from JNI at any time ──────────────────────────────────
typedef struct {
    double   hashrate;          // current H/s (rolling 5s average)
    uint64_t total_hashes;      // total hashes since start
    uint32_t blocks_found;      // valid blocks submitted
    uint32_t shares_submitted;  // total shares submitted (pool mode future)
    double   best_diff;         // best difficulty share found so far
    int      running;           // 1 = mining active, 0 = stopped
    char     last_block[65];    // hex of last found block hash
    int      thread_count;      // actual threads running
} miner_stats_t;

// ── Callbacks fired from mining threads → JNI bridge ──────────────────────────
typedef void (*miner_hashrate_cb)(double hashrate, void *userdata);
typedef void (*miner_block_cb)(uint32_t height, const char *block_hash, void *userdata);
typedef void (*miner_error_cb)(const char *message, void *userdata);
typedef void (*miner_template_cb)(uint32_t height, uint32_t difficulty, void *userdata);

typedef struct {
    miner_hashrate_cb  on_hashrate;    // called every ~2 seconds
    miner_block_cb     on_block;       // called when a valid block is found
    miner_error_cb     on_error;       // called on RPC errors
    miner_template_cb  on_template;    // called when block template updates
    void              *userdata;       // passed back to all callbacks
} miner_callbacks_t;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * miner_start — begin mining
 * Spawns worker threads, fetches first block template, begins nonce iteration.
 * Non-blocking — returns immediately, mining runs on background threads.
 *
 * @config:    node + mining configuration
 * @callbacks: callback functions for events (can be NULL)
 * Returns 0 on success, -1 if already running or config invalid
 */
int miner_start(const miner_config_t *config, const miner_callbacks_t *callbacks);

/**
 * miner_stop — stop all mining threads
 * Blocks until all threads have exited cleanly.
 */
void miner_stop(void);

/**
 * miner_get_stats — read current stats (thread-safe)
 * @stats: output struct to fill
 */
void miner_get_stats(miner_stats_t *stats);

/**
 * miner_is_running — returns 1 if mining, 0 if stopped
 */
int miner_is_running(void);

/**
 * miner_set_threads — change thread count while running
 * Restarts internal thread pool with new count
 */
void miner_set_threads(int threads);

#ifdef __cplusplus
}
#endif

#endif /* CAPSTASH_MINER_H */