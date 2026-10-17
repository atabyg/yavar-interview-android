# یاور مصاحبه – نسخهٔ ۸

ساخت APK: با هر push روی این پوشه، ورک‌فلو «Build Android APK (v8)» (فایل `.github/workflows/build-apk-v8.yml`) اجرا می‌شود
و `yavar-interview-v8.apk` در بخش Releases قرار می‌گیرد. لوگو به‌صورت `assets/logo.b64` ذخیره شده و آیکون‌ها هنگام ساخت تولید می‌شوند.

اجرای محلی: `base64 -d assets/logo.b64 > src/assets/logo.png && npm install && npm run dev`
