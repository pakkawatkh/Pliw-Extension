#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
EXT_DIR="${REPO_DIR}/pliw-scroll"
MANIFEST="${EXT_DIR}/manifest.json"

VERSION=$(python3 -c "import json; print(json.load(open('${MANIFEST}'))['version'])")
if [ -z "${VERSION}" ]; then
  echo "❌ Failed to read version from ${MANIFEST}"
  exit 1
fi

PLIW_OUT_DIR="$(cd "${REPO_DIR}/.." && pwd)/pliw-app/pliw-scroll"
ZIP_NAME="pliw-scroll-v${VERSION}.zip"
ZIP_PATH="${PLIW_OUT_DIR}/${ZIP_NAME}"

if [ ! -d "${PLIW_OUT_DIR}" ]; then
  echo "❌ Target directory not found: ${PLIW_OUT_DIR}"
  exit 1
fi

echo "🗜️ Packaging pliw-scroll v${VERSION}..."
rm -f "${PLIW_OUT_DIR}"/pliw-scroll-v*.zip

(
  cd "${EXT_DIR}"
  zip -r "${ZIP_PATH}" \
    manifest.json popup icons scripts preview README.md \
    -x "*.DS_Store" "*__MACOSX*"
)

echo "🎨 Syncing extension icons to ${PLIW_OUT_DIR}/assets..."
mkdir -p "${PLIW_OUT_DIR}/assets"
cp -f "${EXT_DIR}/icons"/icon*.png "${PLIW_OUT_DIR}/assets/"

echo "✅ Packaged: ${ZIP_PATH}"
ls -lh "${ZIP_PATH}"
