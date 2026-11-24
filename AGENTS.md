# AGENTS.md — Tiffy Extension Development & Release Guide

> Repository-level playbook for AI coding agents working on **tiffy-extension** (`https://github.com/pakkawatkh/tiffy-extension`). Follow these rules and release steps consistently in every session.

---

## 1. Project Overview

- **Repository:** `tiffy-extension` — Chromium **Manifest V3** browser extensions (Chrome, Brave, Edge)
- **Tech Stack:** Vanilla JavaScript (ES6+), HTML5, CSS3, OffscreenCanvas, IndexedDB, Chrome Extensions MV3 APIs
- **License:** Open Source — MIT License
- **Release Portal:** `../Tiffy-App/` → Live at `https://pakkawatkh.github.io/Tiffy-App/`

### Extensions in This Repo
1. **`tiffy-scroll/` — Tiffy Scroll**
   - Full-page scrolling screenshot with sticky-header suppression, delta stitching, 8-handle Crop Studio, and one-click clipboard copy.
   - Portal: `../Tiffy-App/tiffy-scroll/` (`https://pakkawatkh.github.io/Tiffy-App/tiffy-scroll/`)
2. **`tiffy-geo/` — Tiffy Geo**
   - Browser GPS geolocation simulator (Manifest V3 MAIN world injection) with interactive map picker, search, favorites, GPS jitter, and live N/S/E/W controls.
   - Portal: `../Tiffy-App/tiffy-geo/` (`https://pakkawatkh.github.io/Tiffy-App/tiffy-geo/`)

---

## 2. Mandatory Rules

1. **100% Offline & Privacy-First:** No external analytics, telemetry, or remote code execution (Manifest V3 compliant).
2. **Bilingual UI (`th` & `en`):** Support Thai (`th`) and English (`en`) in extension UIs when adding new controls or pages.
3. **Clean ZIP Packaging:** Exclude `.DS_Store`, `.git`, and temporary files when creating release `.zip` archives.
4. **Keep Portal Links Current:** Always point external links to `https://pakkawatkh.github.io/Tiffy-App/` (capital `Tiffy-App`).

---

## 3. Standard End-to-End Release Workflow

Never stop after editing extension code. Complete every step below in one pass:

1. **Bump `"version"`** in `<ext-name>/manifest.json` (e.g., `tiffy-scroll/manifest.json` or `tiffy-geo/manifest.json`).
2. **Package the `.zip` archive** directly into `../Tiffy-App/<ext-name>/`:
   ```bash
   zip -r ../Tiffy-App/<ext-name>/<ext-name>-vX.Y.Z.zip <ext-name> -x "*.DS_Store" "*__MACOSX*"
   ```
   Remove the previous version `.zip` in `../Tiffy-App/<ext-name>/` if superseded.
3. **Update Release Portal (`../Tiffy-App`):**
   - Update version, download filename, and exact ZIP size (KB) in `../Tiffy-App/index.html`, `../Tiffy-App/<ext-name>/index.html`, `../Tiffy-App/README.md`, and `./README.md`.
   - Follow `../Tiffy-App/AGENTS.md` (100% English, minimal copy, no keyboard shortcuts in descriptions).
4. **Commit & push both repositories:**
   ```bash
   git add -A && git commit -m "chore(<ext-name>): release vX.Y.Z - <summary>" && git push origin main
   cd ../Tiffy-App && git add -A && git commit -m "chore(release): <Ext Name> vX.Y.Z" && git push origin main
   ```
