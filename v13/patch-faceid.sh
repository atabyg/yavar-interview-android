#!/usr/bin/env bash
# Face-ID branch patch (run AFTER patch-v13.sh): camera permission for the in-app front camera + a distinct version.
# Camera frames never leave the phone; the permission is only used by the Face-ID screen.
set -euo pipefail
MANIFEST=android/app/src/main/AndroidManifest.xml
GRADLE=android/app/build.gradle

grep -q 'android.permission.CAMERA' "$MANIFEST" || sed -i '/<manifest /a\    <uses-permission android:name="android.permission.CAMERA" />' "$MANIFEST"
grep -q 'android.hardware.camera"' "$MANIFEST" || sed -i '/<manifest /a\    <uses-feature android:name="android.hardware.camera" android:required="false" />' "$MANIFEST"
grep -q 'android.hardware.camera.front' "$MANIFEST" || sed -i '/<manifest /a\    <uses-feature android:name="android.hardware.camera.front" android:required="false" />' "$MANIFEST"
grep -q 'android.permission.CAMERA' "$MANIFEST" || { echo "::error::CAMERA permission missing"; exit 1; }

sed -i -E "s/versionCode [0-9]+/versionCode 14/; s/versionName ['\"][^'\"]*['\"]/versionName \"13.1.0\"/" "$GRADLE"
grep -Eq 'versionCode 14' "$GRADLE" || { echo "::error::versionCode 14 not set"; exit 1; }
grep -Eq 'versionName "13.1.0"' "$GRADLE" || { echo "::error::versionName 13.1.0 not set"; exit 1; }
echo "Face-ID patch complete (camera permission, version 13.1.0 / 14)."
