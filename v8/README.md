# یاور مصاحبه – نسخهٔ ۸

با هر push که چیزی داخل `v8/` را تغییر دهد، ورک‌فلو «Build Android APK (v8)» (در `.github/workflows/build-apk-v8.yml`)
اجرا می‌شود و فایل `yavar-interview-v8.apk` در بخش Releases قرار می‌گیرد. می‌توان آن را از تب Actions هم دستی اجرا کرد.

لوگو به‌صورت متنی در `assets-b64/logo.b64` است؛ `scripts/prepare-assets.py` آن را به PNG و آیکون‌ها/اسپلش تبدیل می‌کند.

اجرای محلی: `npm install && npm run prepare-assets && npm run dev`
