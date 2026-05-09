# PoloDeck Pi kiosk

Shell artifacts live in [`kiosk/`](kiosk/). Before building the `web-app` Docker image, `npm run build` runs `sync-kiosk` so those files are copied into `web-app/public/kiosk/` and are available at `http://<server>:8080/kiosk/`.

## Install on a Raspberry Pi (from the deck server)

1. Use the **LAN IP or hostname** of the machine running Docker (not `localhost`) so URLs embedded in the installer work on the Pi.

2. On the Pi (Pi OS Lite, Bookworm or later):

   ```bash
   curl -fsSL 'http://<LAN-IP>:3000/kb' | sudo bash
   ```

   Optional query parameters:

   - `host` — if the `Host` header would be wrong (e.g. curling via port-forward), set explicit LAN host: `?host=192.168.1.10`
   - `kiosk` — `setup` (default), `board`, `clock`, or `timer`
   - `gameId` — with `kiosk=board|clock|timer`, opens that game’s display URL; without `gameId`, Chromium opens `/kiosk` in the web app.
   - `aptProxy` — Apt-Cacher NG base URL passed to the Pi before `apt-get`, e.g. `?aptProxy=http://192.168.1.10:3142`. When present, overrides `POLODECK_PI_APT_PROXY` from the deck server `setup/.env`.

3. **APT cache (optional):** If you run [Apt-Cacher NG](https://hub.docker.com/r/sameersbn/apt-cacher-ng) (or compatible) on your LAN, the installer uses it only for its own `apt-get` step (`Acquire::http::Proxy` / `Acquire::https::Proxy`), then removes that snippet so the Pi keeps using normal mirrors afterward—useful for lab installs without pinning Pis to the cache forever.

   - Set `POLODECK_PI_APT_PROXY` during `./setup/setup.sh` (deck machine), add `?aptProxy=…` to `/kb`, export `POLODECK_APT_PROXY` on the Pi before running the script, pass `--apt-proxy URL` to `bootstrap-kiosk.sh`, or use the interactive prompts (they read from `/dev/tty`, so **`curl … | sudo bash` still prompts** when you have a real terminal—SSH or console).
   - Typical URL: `http://<cache-host>:3142`.

4. Reboot if the kiosk service does not start cleanly the first time. If `tty7` is busy, stop the getty on that VT or adjust the unit in `pi/kiosk/polodeck-kiosk.service`.

   The installer configures Xorg for Raspberry Pi DRM (`modesetting` + `kmsdev`) and disables `getty@tty1` so kiosk boot is reliable on Bookworm-era images.

## WiFi (optional)

After install, `polodeck-wifi` is in `/usr/local/bin/`:

```bash
sudo polodeck-wifi list
sudo polodeck-wifi connect "YourSSID" "your-password"
sudo polodeck-wifi set-hostname pool-deck-1
```

## Verify without a full install

Open in any browser: `http://<LAN-IP>:8080/kiosk/setup-screen.html` — you should see the static setup screen.
