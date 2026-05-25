# PoloDeck Pi kiosk

Once you have the server docker images up and running, you can then start building the raspberry pi. Follow the below steps to build the Pi 5.

## Raspberry Pi Kiosk Setup

1. Use the Raspberry Pi Imager software to create your disk image for the Pi5 kiosk. See [Raspberry Pi Imager](https://www.raspberrypi.com/software/). Use the Imager software with the following options:

   * Device - "Raspberry Pi 5"
   * OS - Raspberry Pi OS (Other) -> Raspberry Pi OS Lite (64-bit)
   * Hostname - This can be of your choosing. Use different names for each Pi5.
   * Storage - Select the microSD card you wish to image
   * Customization
     * Localization - Choose your region and city for timezone information
     * User - by default the app uses 'deckuser'.
     * WiFi - Use a WiFi configuration to build your Pi5. You can change this. See the WiFi section below.
     * Remote access - for testing and troubleshooting purposes enable SSH, it is up to you on the authentication mechanism.
     * Raspberry Pi Connect - leave off

2. Write your configuration to the disk and then when completed you can move your microSD card to the Pi5.

3. Once the Pi5 is up and running login with the user/password you created above either through the terminal or through ssh.

4. On the Pi5 (Pi OS Lite, Bookworm or later), run the installer below. The deck server remembers each Pi’s display role; the **live game** is chosen on the game day page, then you **Activate** each Pi under **Manage kiosks** in the main app—not in the `curl` URL.

   **Scoreboard, shot clock, and timer** (replace `192.168.1.10` with your deck LAN IP):

   ```bash
   curl -fsSL 'http://192.168.1.10:3000/kb' | sudo bash
   ```

   The installer asks what type of kiosk you are building (scoreboard, shot clock, or timer). Choose **Shot clock** to configure portrait mode (`display_rotate` in boot `config.txt` plus an X11 fallback); that takes effect after reboot. Set the live game on the game day page, then assign each Pi’s role under **Manage kiosks**.

   You will be prompted for the deckuser password to install the required packages.

   ```bash
   [sudo] password for deckuser: ***********
   ```

   You will then be prompted for kiosk type and an HTTP proxy for Apt-Cacher. If the cache runs on the deck machine (default port **3142**), press **Enter** or **y** to use `http://<deck-ip>:3142` derived from your `curl` URL. Press **n** to skip. See section 5 below for more details.

   After install the Pi opens the managed kiosk page and checks in with the server. On the Pi you’ll see **Waiting for assignment** and an 8-character **Device ID**. In PoloDeck on the deck machine, open **Kiosks** (monitor icon in the header), find that device ID, set **Role** to Scoreboard / Shot clock / Timer, pick the **Game**, and save. The Pi updates automatically; you do not reinstall or change the `curl` command when you switch games or roles.

5. **APT cache (optional):** If you run [Apt-Cacher NG](https://hub.docker.com/r/sameersbn/apt-cacher-ng) (or compatible) on your LAN, the installer uses it only for its own `apt-get` step (`Acquire::http::Proxy` / `Acquire::https::Proxy`), then removes that snippet so the Pi keeps using normal mirrors afterward—useful for lab installs without pinning Pis to the cache forever.

   * Set `POLODECK_PI_APT_PROXY` during `./setup/setup.sh` (deck machine), add `?aptProxy=…` to `/kb`, export `POLODECK_APT_PROXY` on the Pi before running the script, pass `--apt-proxy URL` to `bootstrap-kiosk.sh`, or use the interactive prompts (they read from `/dev/tty`, so **`curl … | sudo bash` still prompts** when you have a real terminal—SSH or console).
   * Non-interactive shot clock: `export POLODECK_KIOSK_TYPE=shot_clock` before the script, or pass `--kiosk-type shot_clock` to `bootstrap-kiosk.sh`.
   * Typical URL: `http://<cache-host>:3142`.

6. Reboot if the kiosk service does not start cleanly the first time. If `tty7` is busy, stop the getty on that VT or adjust the unit in `pi/kiosk/polodeck-kiosk.service`.

   The installer configures Xorg for Raspberry Pi DRM (`modesetting` + `kmsdev`). `getty@tty1` is disabled when `polodeck-kiosk` starts (after reboot), not during install, so the console stays usable until then.

## WiFi (optional)

After install, `polodeck-wifi` is in `/usr/local/bin/`:

```bash
sudo polodeck-wifi list
sudo polodeck-wifi connect "YourSSID" "your-password"
sudo polodeck-wifi set-hostname pool-deck-1
```

## Verify without a full install

Open in any browser: `http://<LAN-IP>:8080/kiosk/setup-screen.html` — you should see the static setup screen.

### Kiosk already installed — point at managed mode

If a Pi was registered via the old setup page (it may open a fixed `/kiosk/g/.../shot-clock` URL), update its start URL once over SSH:

```bash
echo 'http://<LAN-IP>:8080/kiosk/managed' | sudo tee /etc/polodeck-kiosk/url
sudo reboot
```

After a **deck server restart**, run `./setup/setup.sh migrate` from the repo, ensure `POLODECK_BIND_ADDRESS=0.0.0.0` in `setup/.env`, and rebuild containers. Pis recover automatically if they load `/kiosk/managed` (or any legacy kiosk URL, which now redirects there).
