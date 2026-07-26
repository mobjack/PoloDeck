# PoloDeck local authentication (Phase 7)

## Model

- Local users in PostgreSQL (`User`, `Session`)
- Roles: `ADMINISTRATOR`, `OPERATOR`, `READ_ONLY`
- Passwords: scrypt hashes (Node `crypto`, no native addon)
- Sessions: HTTP-only cookie `polodeck_session`, server-side rows
- Recovery: one-time recovery code hash stored at first-run (no email)

## Route policy

| Surface | Auth |
|---------|------|
| `/setup`, `/api/setup/*` | Public until complete |
| `/api/auth/*` | Public |
| `/api/devices/check-in` | Public (appliances) |
| GET `/api/games/*`, capabilities, active-game | Public (kiosk displays) |
| Operator mutations + game-day admin | Session required when any user exists |
| Kiosk HTML routes | No login (plan default) |

Docker/dev without users keeps open API behavior for development.

## Future

- QR spectator tokens
- SSO / school IdP — out of scope
