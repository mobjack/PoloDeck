# PoloDeck local TLS roadmap

## Goals

- No certificate warnings for coaches on the Core host and managed Pi appliances
- No manual PKI vocabulary in the coach UI
- Offline operation (no public ACME / Let’s Encrypt dependency for pool Wi‑Fi)

## Phases

### Phase A — HTTP on trusted LAN (current prototype)

Native and Docker Core speak **HTTP**. Appropriate for an isolated pool access point used only for scoring.

### Phase B — Local CA on Core + trust on managed clients

1. Installer generates a private CA and a host certificate for the Core LAN name/IP.
2. macOS/Linux installers add the CA to the **system** trust store on the Core machine.
3. Pi bootstrap (`/kb`) installs the same CA into the Pi Chromium/OS trust store.
4. Core serves HTTPS on 8080 (or 443 later).

**Limitation:** Phones and laptops that are not MDM-managed will still show warnings unless the user installs the CA (or the school pushes it).

### Phase C — School-provided certificates (optional)

Advanced operators may drop school PEM files into the config directory. Not required for v1.

### Phase D — Appliance mutual TLS

After B: Pis present a client certificate issued by the Core CA; Core rejects anonymous appliance admin surfaces. Display pages may remain cookie-free.

## Honest constraints

Fully warning-free HTTPS for **arbitrary BYOD** browsers without Internet or MDM is not generally solvable. Prefer baking trust into PoloDeck-managed Pis and documenting phone access over trusted HTTP or MDM-distributed CA.
