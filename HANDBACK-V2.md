# Wreck Garage v2 Proposal — Handback Report

This handback documents the complete **v2 proposal** implemented in `c:\Users\OBEC\Desktop\Logic-Misfit\wreck-garage-v2\`.
The original v1 prototype in `c:\Users\OBEC\Desktop\Logic-Misfit\wreck-garage-proto\` remains **100% untouched** and independently runnable.

---

## 1. Uploadable Deliverable & Size Breakdown

- **Uploadable Zip:** `c:\Users\OBEC\Desktop\Logic-Misfit\wreck-garage-v2\wreck-garage-v2.zip`
- **Built App Folder:** `c:\Users\OBEC\Desktop\Logic-Misfit\wreck-garage-v2\dist\`
- **Local Dev Server:** `http://localhost:8081/` (v1 is on `http://localhost:8080/`)

| Metric | Measured Result | Limit / Target | Status |
| :--- | :--- | :--- | :--- |
| Total Zip Size | **1,309,476 bytes (1.25 MiB)** | `<= 15.00 MiB` SHOULD / `<= 30.00 MiB` MUST | PASS |
| JS Bundle (`Three.js` + `MeshoptDecoder` + game) | **607.4 KB** (uncompressed) | Local bundle, zero CDN URLs | PASS |
| Playgama Bridge SDK (`vendor/playgama-bridge.js`) | **300.2 KB** | Synchronous first in `<head>` | PASS |
| 21 CC0 `meshopt` GLB Models | **757.6 KB** total | Shared `colormap` + `EXT_meshopt_compression` | PASS |
| 9 CC0 MP3 Audio Files | **552.3 KB** total | Non-silent Playgama `3.3.1` compliant | PASS |
| HTML / CSS / Config JSON | **10.8 KB** | `index.html` at zip root, bridge config present | PASS |
| File Count / Max Single File | **35 files** / **622,019 B (0.59 MiB)** | `<= 8000` files / `<= 30 MiB` per file | PASS |
| Draw Calls per Frame | **21–22 draw calls** | Target `<= 25` for Mali-G52 GPU | PASS |

---

## 2. Key Architectural Upgrades in v2

### A. Dr. Parking / Arcade Dynamic Chase Camera
- **The Problem in v1:** Camera was fixed at a high 42° world-Z locked angle (`Y=16.5m, Z=+18.5m`), making cars look like tiny remote-controlled boxes and forcing players to drive blindly toward the viewer when steering south.
- **The v2 Overhaul:** Implemented an over-the-shoulder arcade chase camera inspired by *Dr. Parking*:
  - **Yaw-Tracking:** `smoothYaw` continuously tracks the vehicle's heading with shortest-angle angular interpolation (`diff = p.yaw - smoothYaw; smoothYaw += diff * dt * 5.2`).
  - **Arcade Perspective:** Positioned behind the vehicle (`camDist = 6.2m–7.4m`) at a low height (`camHeight = 3.0m–3.8m`) with forward look-ahead target (`lookAhead = 3.0m–3.8m`).
  - **Dynamic Speed FOV Kick:** Camera FOV expands from `54°/46°` base up to `62°/54°` proportionally with vehicle speed (`speedRatio * 8.0°`), delivering immediate velocity sensation.
  - **Impact Recoil Shake:** Translates collision impulse directly into camera displacement.

### B. Supersonic Carlton Forrester Dual-Axis Transformation (*Tall Man Run* Principle)
- **The Problem in v1:** Vehicle visual progression was limited to adding minor armor plates and swapping to a tractor at Tier 4, with a uniform `1.055x` scale.
- **The v2 Overhaul:** Applied Carlton Forrester's dual-axis scaling formula:
  - **Simultaneous Width & Height Scaling:**
    - Tier 1 (Rust-Bucket): `1.0x` width, `1.0x` height, `1.0x` length.
    - Tier 2 (Patched Up): `1.18x` width, `1.12x` height, `1.08x` length + front plow + rock sliders.
    - Tier 3 (Sporty Armor): `1.36x` width, `1.24x` height, `1.18x` length + roof spoiler + side bumpers.
    - Tier 4 (Muscle War Rig): `1.58x` width, `1.38x` height, `1.30x` length + heavy cow-catcher ram barrier.
    - Tier 5 (Bulldozer-Class): `1.88x` width, `1.62x` height, `1.45x` length + tractor shovel bulldozer chassis.
  - **Matching Smash Radius:** Physical smash radius scales in tandem (`2.0m -> 3.5m`), giving players immediate visual and mechanical confirmation of their growing power.

### C. Danielle Cohen Linear Challenge vs. Exponential Rewards (Combo Multiplier)
- **The Problem in v1:** Scoring was flat-rate (`parts * 10 * tier.partMult`). There was no risk/reward loop to encourage aggressive, continuous smashing.
- **The v2 Overhaul:**
  - **Combo Multiplier Ladder:** Smashes within a 2.8s window build combos:
    - 1–2 hits: `1x`
    - 3–5 hits: `2x` (DOUBLE WRECK!)
    - 6–9 hits: `3x` (MEGA SMASH!)
    - 10–14 hits: `5x` (SUPER CRUSH!)
    - 15+ hits: `10x` (UNSTOPPABLE RAMPAGE!)
  - **Exponential Scoring:** `scoreAdded = Math.round(partsAdded * 10 * tier.partMult * comboMultiplier)`.
  - **Rising SFX Pitch:** Impact SFX playback rate climbs smoothly (`pitch = 1.0 + comboCount * 0.035`, capped at `1.45`), creating euphoric auditory escalation.
  - **CC0 Fanfare Jingle:** Hitting milestone multiplier tiers triggers `combo_fanfare.mp3`.
  - **Animated HUD Combo Pill:** Fiery glowing pill with animated countdown depletion bar and pulsing rampage state.

### D. Crash & Tumble Physics for Smashed Props
- **The Problem in v1:** Smashed fences, dumpsters, and parked cars instantly vanished into thin air, leaving only small debris shards.
- **The v2 Overhaul:**
  - Added a `tumblingProps` physics simulation pool.
  - Smashed props are launched with impact velocity (`p.speed * 1.15`), upward arc (`vy = 4.8m/s`), and high angular roll velocities (`vrx, vry, vrz`).
  - Realistic asphalt restitution bounce (`restitution = 0.40`) and ground friction (`vx, vz *= 0.82`).
  - **Zero Draw Call Cost:** Tumbling props share the standing props' existing `InstancedMesh` buffer slots, adding **0 additional draw calls**.

### E. Hardware Optimization for Redmi 15C (Mali-G52 MP2 GPU)
- `renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))` prevents fill-rate bottlenecks on 720p/1080p budget mobile GPUs.
- Frame loop allocations locked at **0 bytes/frame** (all vectors, dummies, and matrices reused).
- Dynamic engine rev pitch audio hooked to vehicle throttle.

---

## 3. Verification Test Results (`npm run verify`)

All static, packager, and Playwright headless browser tests passed with 0 errors:
- `PASS latin_only_filenames`
- `PASS first_head_script_bridge_sync`
- `PASS bridge_sdk_file_exists`
- `PASS bridge_config_exists`
- `PASS no_localStorage`
- `PASS no_sessionStorage`
- `PASS no_indexedDB`
- `PASS no_cookie`
- `PASS no_ytgame`
- `PASS no_escape_key`
- `PASS no_oscillator_audio`
- `PASS no_external_urls`
- `PASS symbol_initialize`
- `PASS symbol_game_ready`
- `PASS symbol_showInterstitial`
- `PASS symbol_webglcontextlost`
- `PASS symbol_audio_state`
- `PASS symbol_pause_state`
- `PASS symbol_wreck_best`
- `PASS real_bridge_boot_no_errors` (`errors=0`)
- `PASS zero_external_network_requests` (`extReqs=0`)
- `PASS real_bridge_40_props_spawned` (`activeProps=40, drawCalls=21`)
- `PASS portrait_390x844_viewport_fit`
- `PASS portrait_drag_moves_truck`
- `PASS portrait_smashes_earn_score` (`score=392 parts=18`)
- `PASS end_screen_no_loss_copy`
- `PASS bridge_lifecycle_order` (`initialize -> storage.get -> game_ready -> storage.set -> showInterstitial`)
- `PASS draw_calls_under_budget` (`calls=22`, limit `<= 25`)
- `PASS landscape_844x390_viewport_fit`
- `PASS square_640x640_viewport_fit`
- `PASS desktop_1280x720_viewport_fit`
- `PASS desktop_wasd_moves_truck`

---

## 4. How to Test v1 vs v2 Side-by-Side

Both builds are currently active and running concurrently:
- **v1 Prototype (Top-Down RTS Angle):** `http://localhost:8080/`
- **v2 Proposal (Dr. Parking Chase Angle + Combos + Tumble Physics):** `http://localhost:8081/`

To test on your mobile device (e.g., Redmi 15C):
1. Connect your phone to the same Wi-Fi network as this PC.
2. Open Chrome on your phone to `http://<YOUR_PC_IP>:8081/?perf=1`.
3. Check the real-time green HUD telemetry overlay (`FPS`, `JS ms`, `Calls=21-22`, `Tris`, `Heap`).
