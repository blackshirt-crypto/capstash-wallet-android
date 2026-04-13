# ☢ DRIFTER MODE — Setup Guide
*Connect your phone wallet to your home node. No chain download. No heavy lifting.*

Drifter mode lets your phone talk to a CapStash node running on your home PC or server.
Your phone is the remote control. Your PC does all the heavy work.

---

## What You Need

- A PC running the CapStash Qt wallet or daemon (Windows or Linux)
- An Android phone with the CapStash Wallet app installed
- A free Tailscale account — https://tailscale.com

---

## STEP 1 — Install Tailscale on Your PC

Tailscale creates a secure private tunnel between your phone and your PC.

### Windows
1. Go to https://tailscale.com/download and download the Windows installer
2. Run the installer and sign in with a Google, Microsoft, or GitHub account
3. Open Command Prompt and run:
   tailscale ip -4
4. Write down the 100.x.x.x address — you will need it later

### Linux
1. Run these commands:
   curl -fsSL https://tailscale.com/install.sh | sh
   sudo tailscale up
2. Get your Tailscale IP:
   tailscale ip -4
3. Write down the 100.x.x.x address — you will need it later

---

## STEP 2 — Install Tailscale on Your Phone

1. Install Tailscale from the Google Play Store
2. Sign in with the SAME account you used on your PC
3. In the Tailscale app, confirm your PC shows as Connected

---

## STEP 3 — Configure Your CapStash Node

You need to tell your node to accept connections from your phone.

### Find your config file

Windows:
  C:\Users\YourName\AppData\Roaming\CapStash\CapStash.conf

Linux:
  ~/.CapStash/CapStash.conf

### Add these lines to your config file

Open the file in any text editor and add the following.
If some lines already exist, update them to match.

  server=1
  rpcuser=yourusername
  rpcpassword=yourpassword
  rpcport=8332
  rpcallowip=127.0.0.1
  rpcallowip=100.64.0.0/10
  rpcbind=0.0.0.0
  listen=1

IMPORTANT: Replace yourusername and yourpassword with your own values.
Keep these private. Anyone with these credentials can access your wallet.

### Restart your node
Close and reopen the Qt wallet, or restart the daemon.
The new settings will not take effect until you restart.

---

## STEP 4 — Connect the Wallet App

1. Open the CapStash Wallet app
2. On the mode select screen, choose DRIFTER
3. Tap the ☢ icon in the top right corner to open Setup
4. Tap NODE CONNECTION to expand it
5. Fill in your details:
   - IP ADDRESS  — your PC Tailscale IP (100.x.x.x)
   - PORT        — 8332
   - USERNAME    — same as rpcuser in your config file
   - PASSWORD    — same as rpcpassword in your config file
6. Tap TEST CONNECTION
7. If it says CONNECTION OK — tap SAVE CONFIG
8. Close setup. Your wallet will now show your balance and blocks.

---

## Troubleshooting

Connection failed or timeout:
  - Make sure Tailscale is active on BOTH your phone and your PC
  - Confirm your node is running
  - Double check the IP address using: tailscale ip -4

Auth failed:
  - Your username or password does not match the config file
  - Check for extra spaces before or after the values in the config

Node not responding after config change:
  - You must fully restart your CapStash node after editing the config file

---

Stack caps. Survive. ☢
