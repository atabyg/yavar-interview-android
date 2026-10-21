#!/usr/bin/env bash
# Face-ID patch (runs after patch-v13.sh through the `capacitor:sync:after` hook; idempotent):
# camera permission for the in-app front camera. Camera frames never leave the phone and the permission is only
# used by the Face-ID screen. Version numbers are deliberately left to patch-v13.sh.
set -euo pipefail
MANIFEST=android/app/src/main/AndroidManifest.xml

grep -q 'android.permission.CAMERA' "$MANIFEST" || sed -i '/<manifest /a\    <uses-permission android:name="android.permission.CAMERA" />' "$MANIFEST"
grep -q 'android.hardware.camera"' "$MANIFEST" || sed -i '/<manifest /a\    <uses-feature android:name="android.hardware.camera" android:required="false" />' "$MANIFEST"
grep -q 'android.hardware.camera.front' "$MANIFEST" || sed -i '/<manifest /a\    <uses-feature android:name="android.hardware.camera.front" android:required="false" />' "$MANIFEST"
grep -q 'android.permission.CAMERA' "$MANIFEST" || { echo "::error::CAMERA permission missing"; exit 1; }
echo "Face-ID patch complete (camera permission)."
