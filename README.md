# CapStash Wallet — Wallet of the Wasteland

![Version](https://img.shields.io/badge/version-1.1.0-green)
![Platform](https://img.shields.io/badge/platform-Android-green)
![Network](https://img.shields.io/badge/network-CapStash%20Mainnet-orange)

> *Stack caps. Survive.*

The official Android wallet for the CapStash (CAP) network. Built for the wasteland — rugged, self-sovereign, and mobile-first.

---

## ⚠ COMMUNITY BETA — PLEASE READ

This is a **public beta release** open to the CapStash community for testing.

- ✅ Feel free to install, explore, and test all features
- ✅ Test wallet creation, seed phrase generation, and restore
- ✅ Test Drifter mode with your home node via Tailscale
- ⚠ **We strongly caution against storing significant CAP balances** until multiple community testers have validated the wallet across different devices
- 🐛 Found a bug? Open a GitHub issue or report it in Discord

Your testing helps make this wallet battle-hardened for the wasteland. Every report counts.

---

## 📱 Download

Grab the latest APK from the [Releases](../../releases) page and install it directly on your Android device.

> **Note:** You will need to enable "Install from unknown sources" in your Android settings since this is not distributed via the Play Store.

---

## 🗺 Two Modes — Choose Your Path

### ☢ DRIFTER MODE
*For survivors with a home node already running.*

Drifter mode connects your phone wallet to an existing CapStash Qt node running on your home network or PC. All blockchain data stays on your node — your phone is a remote control.

- Requires a running CapStash node (Qt wallet or daemon)
- Connects via **Tailscale VPN** for secure remote access
- No blockchain download on your phone
- Lightweight and fast

> Full Tailscale setup guide and node configuration details will be provided in an upcoming release. Stay tuned in Discord.

---

### ☢ WANDERER MODE
*For survivors who carry everything with them.*

Wanderer mode runs a **full CapStash node directly on your Android device**. No home node required — completely self-contained.

- Downloads and syncs the full CapStash blockchain on-device
- Generates a **BIP39 seed phrase** on first launch — write it down!
- Your seed phrase can restore your wallet on any device
- Includes integrated CPU miner
- Requires more storage and battery than Drifter mode

---

## 🔑 Seed Phrase — Your Most Important Backup

When setting up Wanderer mode for the first time, the wallet generates a **12-word BIP39 seed phrase**.

- **Write down all 12 words in order and store them safely**
- This is the only way to recover your wallet if you lose your device
- The wallet will verify you wrote it down before continuing
- Nobody can recover your seed phrase for you — not us, not anyone

> Already have a seed phrase? Use the **[ ALREADY HAVE A SEED PHRASE? RESTORE ]** option on the setup screen to restore your existing wallet.

---

## ⛏ Built-in Miner

Both modes include access to the **P.B.G. (Portable Blockchain Generator)** — the integrated CPU miner. Mine CAP directly from your phone and monitor your hashrate in real time.

---

## 🌐 Network Info

| Property | Value |
|----------|-------|
| Coin | CapStash (CAP) |
| Algorithm | Whirlpool-512 XOR/256 |
| Block Reward | 1 CAP |
| Block Time | 60 seconds |
| Network | Mainnet |

---

## 📢 Community

Join the CapStash community on Discord to share feedback, report bugs, and connect with other survivors.

*Details in the Discord announcement.*

---

## 📋 Changelog

### v1.1.0
- BIP39 seed phrase generation on first Wanderer launch
- BIP32 HD key derivation — seed phrase now deterministically controls wallet
- Seed phrase restore flow — recover your wallet on any device
- Legacy wallet support for full key import compatibility
- Address identity toggle — switch between wasteland name and raw address
- IP address hide/show in setup menu
- Wanderer wallet persistence fix across mode switches

### v1.0.0 — DRIFTER
- Drifter mode — remote Qt node control via Tailscale
- Integrated CPU miner
- Block explorer
- Network monitor
- Solo mining screen

---

*Wallet of the Wasteland · Stack caps. Survive.*
