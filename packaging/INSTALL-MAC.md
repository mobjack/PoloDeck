# Install PoloDeck on macOS

This guide is for coaches and volunteers. You do **not** need Docker, Node.js, or PostgreSQL.

**Supported for v1:** Apple Silicon Macs (M1 / M2 / M3 / M4). Intel Mac support may follow later.

For Ubuntu/Debian, see [INSTALL-LINUX.md](INSTALL-LINUX.md).  
Developers using Docker should follow [../setup/SETUP-LINUX-MAC.md](../setup/SETUP-LINUX-MAC.md) instead.

---

## What you get

- PoloDeck runs in the background and starts automatically after reboot
- A **PoloDeck** app in Applications that opens your browser
- The scoring interface at [http://127.0.0.1:8080](http://127.0.0.1:8080)

---

## 1. Download

Get the macOS installer from the PoloDeck release you were given, for example:

- `PoloDeck-<version>-arm64.pkg`

Also keep the matching `.sha256` file if one was provided, so you can confirm the download is complete.

---

## 2. Install

1. Double-click the `.pkg` file.
2. Follow the installer prompts. You will need an **administrator** password.
3. When installation finishes, PoloDeck Core starts automatically in the background.

### If macOS blocks the installer (unsigned builds)

Prototype packages may not be Apple-notarized yet. If Gatekeeper shows a warning:

1. Open **System Settings → Privacy & Security**.
2. Find the message about PoloDeck being blocked.
3. Choose **Open Anyway**, then confirm.

Or Control-click the `.pkg` → **Open** → **Open**.

---

## 3. Open PoloDeck

1. Open **PoloDeck** from Applications (or Spotlight).
2. Your default browser should open to PoloDeck.
3. If you see a “unavailable” message, wait a few seconds and try again — the service may still be starting.

You can also visit [http://127.0.0.1:8080](http://127.0.0.1:8080) directly.

---

## 4. First-time setup (browser)

On the first launch, complete the short setup wizard:

1. Create an **administrator** username and password.
2. Name this PoloDeck (for example, your school or pool).
3. Choose who can connect:
   - **This computer only** — only browsers on this Mac
   - **Allow scoreboards and controllers on this network** — phones, tablets, and Raspberry Pi scoreboards on the same Wi‑Fi
4. **Save the recovery code** shown at the end. You need it if you forget the administrator password (PoloDeck does not email resets).

After setup, sign in and use PoloDeck as usual in the browser.

---

## 5. Connect scoreboards (optional)

If you chose network access during setup:

1. Note the address shown in setup (or ask your network for this Mac’s Wi‑Fi IP), for example `http://192.168.1.10:8080`.
2. On each Raspberry Pi (on the same Wi‑Fi), run:

```bash
curl -fsSL 'http://192.168.1.10:8080/kb' | sudo bash
```

Replace `192.168.1.10` with your Mac’s address.  
Then assign each Pi under **Kiosks** in the main PoloDeck app. Full Pi steps: [../pi/README.md](../pi/README.md).

---

## Everyday use

| Action | How |
|--------|-----|
| Open PoloDeck | Click **PoloDeck** in Applications, or bookmark `http://127.0.0.1:8080` |
| After reboot | Core starts by itself; open the PoloDeck app or your bookmark |
| Sign out | Use the sign-out control in the main app header |

You should not need Terminal for normal use.

---

## Update

1. Download the newer `.pkg`.
2. Run the installer over the existing installation.
3. Your games and settings are kept. Open PoloDeck again when the installer finishes.

---

## Uninstall

From a Terminal (administrator):

```bash
# Remove the app; keep game data
sudo bash /path/to/PoloDeck-repo/packaging/macos/uninstall.sh

# Or remove everything including game data
sudo bash /path/to/PoloDeck-repo/packaging/macos/uninstall.sh --purge
```

If you only have the installed package (no repo copy), stop the service and remove the app:

```bash
sudo launchctl bootout system/com.polodeck.core 2>/dev/null || true
sudo rm -f /Library/LaunchDaemons/com.polodeck.core.plist
sudo rm -rf "/Applications/PoloDeck.app"
# Game data (optional to delete):
# sudo rm -rf "/Library/Application Support/PoloDeck" "/Library/Logs/PoloDeck"
```

By default, uninstall **keeps** game data under `/Library/Application Support/PoloDeck`.

---

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| Browser says PoloDeck is unavailable | Wait 10–20 seconds after install or reboot, then open PoloDeck again |
| Scoreboards cannot connect | Re-run setup access as “on this network”, confirm Mac and Pis share the same Wi‑Fi, use port **8080** |
| Forgot administrator password | On the sign-in page, use **Forgot password?** with your saved recovery code |
| Need logs | Look in `/Library/Logs/PoloDeck/` |

---

## Where files live (reference)

| Item | Location |
|------|----------|
| Application / runtime | `/Library/Application Support/PoloDeck` |
| Logs | `/Library/Logs/PoloDeck` |
| Background service | `/Library/LaunchDaemons/com.polodeck.core.plist` |
| Launcher | `/Applications/PoloDeck.app` |

Building packages from source: [README.md](README.md).
