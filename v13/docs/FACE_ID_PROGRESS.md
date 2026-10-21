# Face-ID progress (branch `feature/version-13-face-id`)

Resume file: if a run is interrupted, continue from the first unchecked item. Git history is the source of truth.

- [x] Branch created from `feature/version-13` (v13 itself untouched)
- [x] `src/face-math.js`: letterbox, YuNet decode + NMS, 5-point alignment (Umeyama), pose/fit/stability/blur checks. 17 local Node 22 tests pass
- [x] `src/face-id.js`: multi-template matching, ambiguous detection, number choice, AES-GCM encrypted store, `YFV1` portable vector, QR + checksum
- [x] `src/face-engine.js`: ONNX Runtime Web loader, YuNet (detector) + SFace (embedder); syntax-checked
- [x] `components/FaceScan.jsx` automatic flow (syntax-checked) + `Record.jsx` wiring (items, typed number, name fill-in)
- [x] `scripts/fetch-face-models.sh` (pinned URLs + SHA-256), `scripts/prepare-face-assets.mjs`, `scripts/verify-face-models.mjs`, `package.json` (build downloads models; `capacitor:sync:after` also runs `patch-faceid.sh`)
- [x] `patch-faceid.sh`: CAMERA permission only (version numbers untouched so the existing v13 workflow checks still pass)
- [x] Optional workflow stored at `docs/ci/build-apk-v13-face-id.yml` (this integration cannot write `.github/workflows`: HTTP 403 on both tree and contents APIs)
- [ ] A person must run the build: either activate the optional workflow (move it to `.github/workflows/`) or run `Build Android APK (v13 bootstrap)` manually on this branch; then read the result (the optional workflow writes `ci-status` / `face-id-latest.md`)
- [ ] Pull request (the create form was shown to the user but not submitted)
- [ ] Real-phone tuning (Redmi 8): `MATCH_THRESHOLD`, `faceFit` ratios, blur/brightness limits
- [ ] No liveness detection yet (a printed photo or a screen can fool the scan)

## Models (both Apache-2.0 via OpenCV Zoo; fetched at build time, never committed)
- `face_detection_yunet_2023mar.onnx` 640x640 BGR 0-255, 12 outputs (`cls/obj/bbox/kps` x strides 8/16/32), 5 landmarks
- `face_recognition_sface_2021dec.onnx` 112x112 RGB 0-255, output 128-d `fc1`, L2-normalised by the caller
- SHA-256 values come from a third-party mirror's table; the build fails if the downloaded bytes differ
