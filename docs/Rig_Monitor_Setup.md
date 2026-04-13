# ⛏ RIG MONITOR — Setup Guide
*Watch your mining rigs from anywhere. Local network or Tailscale.*

The CapStash Wallet can monitor remote mining rigs running the CapStash CLI miner.
You can connect to rigs on your local network or over Tailscale from anywhere in the wasteland.

---

## What You Need

- A mining rig running the CapStash CLI miner (Windows or Linux)
- Your phone and rig on the same WiFi (local) OR connected via Tailscale (remote)
- The rig's IP address

---

## STEP 1 — Find Your Rig's IP Address

### Local Network

Windows — open Command Prompt and run:
  ipconfig
Look for IPv4 Address. It will start with 192.168.x.x

Linux — run:
  ip addr show | grep "inet "
Look for the address starting with 192.168.x.x

### Over Tailscale (remote access from anywhere)

If you want to monitor your rig from outside your home network,
install Tailscale on the rig first. See the Drifter Setup Guide for
full Tailscale installation instructions.

Once Tailscale is installed on the rig, get its Tailscale IP:

Windows:
  tailscale ip -4

Linux:
  tailscale ip -4

This gives you a 100.x.x.x address that works from anywhere.

---

## STEP 2 — Set Up the Stats Server on Your Rig

The wallet needs a small stats server running on your rig.
This is a simple script that reads your miner output and serves
the hashrate data so the wallet app can display it.

---

### Linux Rigs

Step 1 — Create the stats script

Open a terminal on your rig and run:
  nano ~/capstash-stats.sh

Paste in exactly the following — then press Ctrl+O to save and Ctrl+X to exit:

  #!/bin/bash
  LOG_FILE="$HOME/capstash-miner.log"
  PORT=8080
  while true; do
      HASHRATE=$(tail -20 "$LOG_FILE" 2>/dev/null | grep -oP '[0-9.]+ [KMG]?H/s' | tail -1)
      ACCEPTED=$(grep -c "accepted" "$LOG_FILE" 2>/dev/null || echo 0)
      REJECTED=$(grep -c "rejected" "$LOG_FILE" 2>/dev/null || echo 0)
      RESPONSE="{\"hashrate\":\"${HASHRATE:-0 H/s}\",\"accepted\":${ACCEPTED},\"rejected\":${REJECTED}}"
      echo -e "HTTP/1.1 200 OK\nContent-Type: application/json\nAccess-Control-Allow-Origin: *\n\n${RESPONSE}" | nc -l -p $PORT -q 1
  done

Step 2 — Make it executable:
  chmod +x ~/capstash-stats.sh

Step 3 — Start it alongside your miner:
  ~/capstash-stats.sh &

Step 4 — Make it start automatically on boot (optional):
  crontab -e
  Add this line at the bottom:
  @reboot ~/capstash-stats.sh &

---

### Windows Rigs

Full Windows support is coming in a future update.
For now you can use Windows Subsystem for Linux (WSL) and follow
the Linux instructions above inside WSL.

---

## STEP 3 — Add Your Rig in the Wallet App

1. Open the CapStash Wallet app
2. Go to the P.B.G. tab (the miner screen)
3. Tap ADD RIG
4. Enter your rig details:
   - NAME        — anything you like, example: Basement Rig or 4070 Beast
   - IP ADDRESS  — local IP (192.168.x.x) or Tailscale IP (100.x.x.x)
   - PORT        — 8080
5. Tap SAVE

The wallet will check your rig every 30 seconds and show:
  - Current hashrate
  - Accepted shares
  - Rejected shares

---

## Local Network vs Tailscale — Which Should I Use?

Local network (192.168.x.x):
  - Only works when your phone is connected to your home WiFi
  - Faster response time
  - No extra setup needed beyond the stats script

Tailscale (100.x.x.x):
  - Works from anywhere — home, work, on the road
  - Requires Tailscale installed on both your phone and your rig
  - Slightly more setup but much more useful

You can add the same rig twice with both IPs if you want —
one for home use and one for remote access.

---

## Troubleshooting

Rig shows offline:
  - Make sure the stats script is running on the rig
  - Check the IP address is correct
  - For Tailscale — confirm both devices show Connected in the Tailscale app

Hashrate shows 0 H/s:
  - Check that your miner is running and writing to the log file
  - The default log path in the script is ~/capstash-miner.log
  - If your miner logs somewhere else, update LOG_FILE in the script

Cannot connect on local network:
  - Make sure your phone is on the same WiFi as the rig
  - Check that port 8080 is not blocked by your router or firewall

---

Stack caps. Survive. ☢
