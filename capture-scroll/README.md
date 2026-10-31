# 📸 Capture Scroll (Chromium Extension)

> Full-page scrolling screenshot extension for **Google Chrome**, **Brave Browser**, and **Microsoft Edge**.  
> Features automated scroll stitching, sticky header prevention, and a dedicated **Studio Editor** with an interactive **Crop Tool**, one-click **Clipboard Copy** (`⌘V`), and PNG download.

---

## 🌟 Key Features

1. **Full-Page Automated Capture**:
   - Auto-scrolls through the entire document height.
   - Stitches all captured viewports on a physical high-DPI HTML5 canvas (crisp on Retina 2x displays).
   - Automatically hides and restores sticky/fixed navigation bars so headers don't repeat on intermediate slices.
   - Scrollbar tracks are hidden during capture to ensure clean screenshots.

2. **Interactive Preview Studio**:
   - ✂️ **Crop Tool**: Drag handles across 8 directions to frame any section with live pixel dimensions.
   - 📋 **One-Click Clipboard Copy**: Directly writes the PNG Blob to your system clipboard (`⌘V` into Slack, Figma, Notion, Notes).
   - 💾 **PNG Download**: Instant high-res download with sanitized title and timestamp.
   - 🔍 **Zoom & Inspection**: Fit to width, 100% actual size, and manual zoom controls.

3. **Chromium Universal Compatibility**:
   - Built on **Manifest V3**.
   - No external npm dependencies or bundlers needed.
   - Fast, secure, and offline ready.

---

## 💻 How to Install & Use (Developer Mode)

### Step 1: Open Extensions Page in your Browser
- **Google Chrome**: navigate to `chrome://extensions/`
- **Brave Browser**: navigate to `brave://extensions/`
- **Microsoft Edge**: navigate to `edge://extensions/`

### Step 2: Enable Developer Mode
- Toggle the **Developer mode** switch in the top-right corner.

### Step 3: Load Unpacked
1. Click **Load unpacked** (โหลดส่วนขยายที่คลายการบีบอัดแล้ว).
2. Select the directory:
   ```text
   /Users/pakkawat/Documents/my-tools/tiffy-extension/capture-scroll
   ```
3. The extension icon will appear in your browser toolbar!

### Step 4: Capture & Edit
1. Open any long web page (e.g. GitHub repository, news article, or documentation).
2. Click the **Capture Scroll** icon (or press shortcut `Command + Shift + S`).
3. Click **"Capture Entire Page"**.
4. The page scrolls automatically, then opens the **Preview Studio** tab where you can Crop, Copy, or Download!

---

© 2026 Pakkawat.k • Tiffy App Suite
