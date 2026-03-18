# CapStash Wallet — Native NDK Miner
# v2.1 — added sha256.c for txid/merkle root computation
#
# Place this file at:
# android/app/src/main/cpp/CMakeLists.txt

cmake_minimum_required(VERSION 3.22.1)
project(capstash_miner VERSION 2.1.0 LANGUAGES C CXX)

# ── C/C++ standards ───────────────────────────────────────────────────────────
set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ── ARM64 optimizations ───────────────────────────────────────────────────────
if(ANDROID_ABI STREQUAL "arm64-v8a")
    set(CMAKE_C_FLAGS   "${CMAKE_C_FLAGS}   -O3 -march=armv8-a+crypto -mfpu=neon")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -O3 -march=armv8-a+crypto -mfpu=neon")
    message(STATUS "[CapStash] ARM64 NEON + crypto extensions enabled")
elseif(ANDROID_ABI STREQUAL "x86_64")
    set(CMAKE_C_FLAGS   "${CMAKE_C_FLAGS}   -O3 -msse4.2")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -O3 -msse4.2")
    message(STATUS "[CapStash] x86_64 SSE4.2 enabled (emulator build)")
endif()

# ── Source files ──────────────────────────────────────────────────────────────
add_library(
    capstash_miner
    SHARED

    # Whirlpool-512 PoW hash engine
    whirlpool.c

    # SHA-256 / SHA-256d — used for txid and merkle root (NOT for PoW)
    sha256.c

    # Minimal HTTP RPC client (getblocktemplate / submitblock / getbestblockhash)
    rpc.c

    # Mining loop — nonce iteration, header construction, thread management
    miner.c

    # JNI entry points — React Native bridge
    jni_bridge.c
)

# ── Include dirs ──────────────────────────────────────────────────────────────
target_include_directories(capstash_miner PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
)

# ── Android system libraries ──────────────────────────────────────────────────
find_library(log-lib log)
find_library(android-lib android)

target_link_libraries(capstash_miner
    ${log-lib}
    ${android-lib}
)

# ── Build info ────────────────────────────────────────────────────────────────
message(STATUS "[CapStash] NDK ABI:     ${ANDROID_ABI}")
message(STATUS "[CapStash] NDK version: ${ANDROID_NDK_REVISION}")
message(STATUS "[CapStash] Build type:  ${CMAKE_BUILD_TYPE}")