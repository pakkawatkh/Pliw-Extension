# AGENTS.md — Pliw Extension Development & Release Guide

> Repository-level playbook for AI coding agents working on **pliw-extension** (`https://github.com/pakkawatkh/pliw-extension`). Follow these rules and release steps consistently in every session.

---

## 1. Project Overview

- **Repository:** `pliw-extension` — Chromium **Manifest V3** browser extensions (Chrome, Brave, Edge)
- **Tech Stack:** Vanilla JavaScript (ES6+), HTML5, CSS3, OffscreenCanvas, IndexedDB, Chrome Extensions MV3 APIs
- **License:** Open Source — MIT License
- **Release Portal:** `../../` → Live at `https://pakkawatkh.github.io/Pliw-App/`

### Extensions in This Repo
1. **`pliw-scroll/` — Pliw Scroll**
   - Full-page scrolling screenshot with sticky-header suppression, delta stitching, 8-handle Crop Studio, and one-click clipboard copy.
   - Portal: `../../pliw-scroll/` (`https://pakkawatkh.github.io/Pliw-App/pliw-scroll/`)
2. **`pliw-geo/` — Pliw Geo**
   - Browser GPS geolocation simulator (Manifest V3 MAIN world injection) with interactive map picker, search, favorites, GPS jitter, and live N/S/E/W controls.
   - Portal: `../../pliw-geo/` (`https://pakkawatkh.github.io/Pliw-App/pliw-geo/`)

---

## 2. Mandatory Rules

1. **100% Offline & Privacy-First:** No external analytics, telemetry, or remote code execution (Manifest V3 compliant).
2. **Bilingual UI (`th` & `en`):** Support Thai (`th`) and English (`en`) in extension UIs when adding new controls or pages.
3. **Clean ZIP Packaging:** Exclude `.DS_Store`, `.git`, and temporary files when creating release `.zip` archives.
4. **Keep Portal Links Current:** Always point external links to `https://pakkawatkh.github.io/Pliw-App/` (capital `Pliw-App`).

---

## 3. Standard End-to-End Release Workflow

Never stop after editing extension code. Complete every step below in one pass:

1. **Bump `"version"`** in `<ext-name>/manifest.json` (e.g., `pliw-scroll/manifest.json` or `pliw-geo/manifest.json`).
2. **Package the `.zip` archive** directly into `../../<ext-name>/`:
   ```bash
   zip -r ../../<ext-name>/<ext-name>-vX.Y.Z.zip <ext-name> -x "*.DS_Store" "*__MACOSX*"
   ```
   Remove the previous version `.zip` in `../../<ext-name>/` if superseded.
3. **Update Release Portal (`../..`):**
   - Update version, download filename, and exact ZIP size (KB) in `../../index.html`, `../../<ext-name>/index.html`, `../../README.md`, and `./README.md`.
   - Follow `../../AGENTS.md` (100% English, minimal copy, no keyboard shortcuts in descriptions).
4. **Commit & push both repositories:**
   ```bash
   git add -A && git commit -m "chore(<ext-name>): release vX.Y.Z - <summary>" && git push origin main
   cd ../.. && git add -A && git commit -m "chore(release): <Ext Name> vX.Y.Z" && git push origin main
   ```
