#!/usr/bin/env bash
# Package the Neutralinojs build into a macOS .app bundle and a .dmg.
# Run `pnpm build` (neu build --release) first so dist/sky-striker exists.
set -euo pipefail

APP_NAME="Sky Striker"
BUNDLE_ID="js.neutralino.sample"
VERSION="1.0.0"
BIN="sky-striker-mac_universal"   # universal = Intel + Apple Silicon

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist/sky-striker"
OUT="$ROOT/dist/mac"
APP="$OUT/$APP_NAME.app"

[ -f "$DIST/$BIN" ] || { echo "ERROR: $DIST/$BIN 없음. 먼저 'pnpm build' 실행해."; exit 1; }
[ -f "$DIST/resources.neu" ] || { echo "ERROR: resources.neu 없음. 먼저 'pnpm build' 실행해."; exit 1; }

rm -rf "$OUT"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

# --- executable + resources ---
cp "$DIST/$BIN" "$APP/Contents/MacOS/sky-striker"
chmod +x "$APP/Contents/MacOS/sky-striker"
cp "$DIST/resources.neu" "$APP/Contents/MacOS/resources.neu"
# neutralino.config.json은 실행 시 참조되므로 함께 포함
cp "$ROOT/neutralino.config.json" "$APP/Contents/MacOS/neutralino.config.json"

# --- icon (.icns) ---
ICONSET="$OUT/icon.iconset"
mkdir -p "$ICONSET"
SRC="$ROOT/resources/icons/appIcon.png"
for size in 16 32 64 128 256 512 1024; do
  sips -z "$size" "$size" "$SRC" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
done
# @2x 네이밍 (iconutil 규격)
cp "$ICONSET/icon_32x32.png"   "$ICONSET/icon_16x16@2x.png"
cp "$ICONSET/icon_64x64.png"   "$ICONSET/icon_32x32@2x.png"
cp "$ICONSET/icon_256x256.png" "$ICONSET/icon_128x128@2x.png"
cp "$ICONSET/icon_512x512.png" "$ICONSET/icon_256x256@2x.png"
cp "$ICONSET/icon_1024x1024.png" "$ICONSET/icon_512x512@2x.png"
rm -f "$ICONSET/icon_64x64.png" "$ICONSET/icon_1024x1024.png"
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/icon.icns"
rm -rf "$ICONSET"

# --- Info.plist ---
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>$APP_NAME</string>
  <key>CFBundleDisplayName</key><string>$APP_NAME</string>
  <key>CFBundleExecutable</key><string>sky-striker</string>
  <key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>10.13</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

# --- ad-hoc 서명 (미서명 시 실행 거부 회피용) ---
codesign --force --deep --sign - "$APP" 2>/dev/null || echo "WARN: codesign 실패(무시 가능)"

# --- .dmg ---
DMG="$OUT/$APP_NAME-$VERSION.dmg"
hdiutil create -volname "$APP_NAME" -srcfolder "$APP" -ov -format UDZO "$DMG" >/dev/null

echo "생성 완료:"
echo "  APP: $APP"
echo "  DMG: $DMG"
