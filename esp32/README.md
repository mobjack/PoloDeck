# PoloDeck ESP32-S3 display controller

This firmware runs the physical scoreboards and shot clocks. The Docker-hosted PoloDeck server remains
authoritative; each ESP32-S3 maintains the received clock locally between
synchronizations so a short Wi-Fi interruption does not freeze the display.

## Current pre-panel milestone

- Stable device ID derived from the ESP32 eFuse MAC.
- HTTP check-in and compact display-state synchronization through protocol version 1.
- Local game/shot-clock interpolation.
- Local shot-clock horn trigger plus server horn-event handling.
- Brighter/darker buttons.
- Serial rendering preview while the exact HUB75 panel scan type and driver IC are unknown.

The HUB75 output is deliberately not selected until the panels arrive. At that point record the panel resolution,
scan rate, HUB75 pinout, driver IC, and full-brightness current before choosing the DMA driver and final GPIO map.

## Build entirely in Docker

Copy the example configuration for a local flash build:

```bash
cp esp32/include/polodeck_config.example.h esp32/include/polodeck_config.h
```

Then build without installing PlatformIO on the host. The image pins the tool version and uses `linux/amd64`
so the same toolchain runs through Docker Desktop on Windows, macOS, and Linux:

```bash
docker build --platform linux/amd64 -t polodeck-platformio esp32
docker run --rm \
  --platform linux/amd64 \
  -v "$PWD/esp32:/workspace" \
  -w /workspace \
  polodeck-platformio \
  run
```

The local configuration file is ignored by Git. Never commit pool Wi-Fi credentials.

## First hardware bring-up after panel delivery

1. Identify the panel resolution, scan rate, driver IC, and connector orientation.
2. Power one panel through a fused branch and measure peak and realistic scoreboard current.
3. Confirm stable 5 V at the panel and controller under load.
4. Add the selected ESP32-S3 HUB75 DMA driver and render one panel.
5. Chain the intended layout while powering panels in parallel, not through the ribbon/power chain.
6. Set the production brightness ceiling from measured current and thermal behavior.
