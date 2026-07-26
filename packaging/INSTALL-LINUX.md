# Install PoloDeck on Linux

This guide is for coaches and volunteers. You do **not** need Docker, Node.js, or PostgreSQL.

**Supported for v1:** Ubuntu **22.04** or **24.04** LTS, **amd64** (64-bit Intel/AMD PCs and laptops).

For macOS, see [INSTALL-MAC.md](INSTALL-MAC.md).  
Developers using Docker should follow [../setup/SETUP-LINUX-MAC.md](../setup/SETUP-LINUX-MAC.md) instead.

---

## What you get

- PoloDeck runs as a system service and starts automatically after reboot
- A **PoloDeck** entry in your applications menu that opens your browser
- The scoring interface at [http://127.0.0.1:8080](http://127.0.0.1:8080)

---

## 1. Download

Get the Debian package from the PoloDeck release you were given, for example:

- `polodeck_<version>_amd64.deb`

Also keep the matching `.sha256` file if one was provided.

---

## 2. Install

### Using the graphical installer

1. Double-click the `.deb` file (Ubuntu Software / GDebi, depending on your desktop).
2. Choose **Install** and enter your password when asked.
3. When installation finishes, PoloDeck Core starts automatically.

### Using the terminal

```bash
sudo apt install ./polodeck_<version>_amd64.deb
```

Run that command from the folder where you downloaded the file.  
`apt install` is preferred over `dpkg -i` because it can pull any system dependencies the package declares.

---

## 3. Open PoloDeck

1. Open **PoloDeck** from your applications menu (or run `polodeck` from a terminal).
2. Your default browser should open to PoloDeck.
3. If you see an “unavailable” message, wait a few seconds and try again — the service may still be starting.

You can also visit [http://127.0.0.1:8080](http://127.0.0.1:8080) directly.

---

## 4. First-time setup (browser)

On the first launch, complete the short setup wizard:

1. Create an **administrator** username and password.
2. Name this PoloDeck (for example, your school or pool).
3. Choose who can connect:
   - **This computer only** — only browsers on this computer
   - **Allow scoreboards and controllers on this network** — phones, tablets, and Raspberry Pi scoreboards on the same Wi‑Fi
4. **Save the recovery code** shown at the end. You need it if you forget the administrator password (PoloDeck does not email resets).

After setup, sign in and use PoloDeck as usual in the browser.

If you allow network access and scoreboards still cannot connect, restart the service once so the new network setting is applied:

```bash
sudo systemctl restart polodeck
```

---

## 5. Connect scoreboards (optional)

If you chose network access during setup:

1. Note the address shown in setup (this computer’s Wi‑Fi/LAN IP), for example `http://192.168.1.10:8080`.
2. On each Raspberry Pi (on the same Wi‑Fi), run:

```bash
curl -fsSL 'http://192.168.1.10:8080/kb' | sudo bash
```

Replace `192.168.1.10` with your Linux computer’s address.  
Then assign each Pi under **Kiosks** in the main PoloDeck app. Full Pi steps: [../pi/README.md](../pi/README.md).

---

## Everyday use

| Action | How |
|--------|-----|
| Open PoloDeck | Applications menu → **PoloDeck**, or bookmark `http://127.0.0.1:8080` |
| After reboot | Core starts by itself; open PoloDeck or your bookmark |
| Sign out | Use the sign-out control in the main app header |
| Check service | `systemctl status polodeck` |

You should not need the terminal for normal scoring.

---

## Update

1. Download the newer `.deb`.
2. Install it the same way as the first install (`apt install ./polodeck_….deb`).
3. Your games and settings under `/var/lib/polodeck` are kept.

---

## Uninstall

Remove the application but **keep** game data:

```bash
sudo apt remove polodeck
```

Remove the application **and** game data / config:

```bash
sudo apt purge polodeck
```

After `remove`, data remains under `/var/lib/polodeck` until you purge or delete it yourself.

---

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| Browser says PoloDeck is unavailable | `sudo systemctl status polodeck` and `sudo systemctl status polodeck-db`; wait a few seconds after boot |
| Scoreboards cannot connect | Confirm “on this network” in setup, same Wi‑Fi, port **8080**, then `sudo systemctl restart polodeck` |
| Forgot administrator password | On the sign-in page, use **Forgot password?** with your saved recovery code |
| View logs | `journalctl -u polodeck -e` and `journalctl -u polodeck-db -e` |
| Port already in use | Another program is using port 8080; stop that program or contact whoever set up the machine |

---

## Where files live (reference)

| Item | Location |
|------|----------|
| Application / runtime | `/opt/polodeck` |
| Config | `/etc/polodeck` |
| Database and backups | `/var/lib/polodeck` |
| Logs | `/var/log/polodeck` and the system journal |
| Services | `polodeck-db.service`, `polodeck.service` |

Building packages from source: [README.md](README.md).
