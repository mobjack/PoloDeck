# PoloDeck command list

Quick reference for **game sheet scoring commands**: enter text in the **Scoring command** field on a game’s sheet and press **Apply**. The same content is available in the web app via the **?** (command help) button on that page.

Commands are parsed case-insensitively unless noted.

---

## Quarter and break

| Input | Also accepted | What it does |
| --- | --- | --- |
| `sq` | — | **Start quarter** — If a break is **active** (`sb` already used), ends the break and advances to the next period. If a break is **pending** (after `eq`, before `sb`), skips the pending break and advances. Otherwise starts the game clock for the current period (when allowed). |
| `eq` | — | **End quarter** — Stops clocks; does **not** start the break countdown. After regulation Q4 with a tied score, the UI may prompt for overtime instead of ending the game. |
| `sb` | `startbreak` | **Start break** — Begins the break/halftime **game clock** countdown (use after `eq` when a break applies). |

---

## Game and shot clock (shortcuts)

| Input | Also accepted | What it does |
| --- | --- | --- |
| `c` | `clock` | **Toggle game clock** — Start if stopped, stop if running. |
| `r` | `reset` | **Reset shot clock** — Full shot time from game settings (same behavior as a shot reset elsewhere: if the game clock is running, the shot may resume running after reset). |

### After `eq`, before `sb` (break pending)

**`c`** and **`r`** are blocked until you run **`sb`** (or use the Timer flow to start the break). You’ll see an error telling you to start the break first.

---

## Game clock time (optional prefix)

Use at the **start** of goals, exclusions, penalties, and timeouts when you want a specific time on the log entry.

| Form | Meaning |
| --- | --- |
| `6.07` or `6:07` | 6 minutes 7 seconds |
| `6` or `6.` | 6 minutes 0 seconds |
| `.03` | 3 seconds (sub‑minute) |

If you omit the time, the **current game clock** (as on the scoreboard) is recorded for that entry.
**Important:** Typing a goal/timeout/etc. does **not** start or stop the live clocks — use **`c`** or the **Timer** page for that.

---

## Team letters (home = dark, away = light)

| Letter | Team |
| --- | --- |
| `b` or `d` | Dark (**home**) |
| `w` or `l` | Light (**away**) |

---

## Goals, exclusions, and penalties

Cap number is required. **Two word orders** are allowed; optional time goes **first**.

### Pattern A — `[time]` `team` `cap` `action`

Examples: `w13g`, `6.07w13g`, `5.53b2e`

### Pattern B — `[time]` `action` `cap` `team`

Examples: `g13w`, `6.07g13w`

| Action letter | Meaning |
| --- | --- |
| `g` | Goal |
| `e` | Exclusion |
| `p` | Penalty |

---

## Timeouts

Optional time prefix, then **`t`** (full) or **`t3`** (30 seconds), then team letter.

| Example | Meaning |
| --- | --- |
| `tw` | Light — full timeout (time = current game clock if no prefix) |
| `tb` | Dark — full timeout |
| `4.13tw` | Light — full timeout at 4:13 |
| `t3w` | Light — 30 second timeout |
| `4.13t3b` | Dark — 30 second timeout at 4:13 |

---

## Example commands

``` text
sq
eq
sb
c
r
w13g
6:50w13g
5.53b2e
g13w
tw
4.13tw
4.13t3w
```

Invalid input shows a short hint listing these patterns.

---
