# Face-ID progress (branch `feature/version-13-face-id`)

Resume file: if a run is interrupted, continue from the first unchecked item. Git history is the source of truth.

- [x] Branch created from `feature/version-13` (v13 itself untouched)
- [x] `src/face-math.js`: letterbox, YuNet decode + NMS, 5-point alignment (Umeyama), pose/fit/stability/blur checks. 17 local Node 22 tests pass
- [x] `src/face-id.js`: multi-template matching, ambiguous detection, number choice, AES-GCM encrypted store, `YFV1` portable vector, QR + checksum
- [x] `src/face-engine.js`: ONNX Runtime Web loader, YuNet (detector) + SFace (embedder)
- [x] `components/FaceScan.jsx` automatic flow + `Record.jsx` wiring (items, typed number, name fill-in)
- [x] Build scripts: models downloaded with pinned URLs + SHA-256, ORT files copied into `public/ort`, `patch-faceid.sh` adds the CAMERA permission
- [x] Workflow `.github/workflows/build-apk-v13-face-id.yml` activated by the user (this integration cannot write that folder); it writes the result to branch `ci-status` (`face-id-latest.md`)
- [x] **CI build passes** (latest verified run 39746558715): tests, Vite build, models + ORT inside the APK, CAMERA permission, versionCode 13, signature verified, 16 KB ELF alignment. APK about 80 MB
- [x] Real models verified in Node: YuNet output names/lengths and SFace 128-d output match what the code expects
- [x] **Real Chrome smoke test on a public-domain face photo** (`scripts/browser-smoke.mjs`, non-blocking): ORT + models load through `face-engine.js`; detector box IoU vs OpenCV 0.955, landmark error 3.9 % of face width, embedding cosine vs OpenCV reference 0.952, portrait-frame mapping IoU 0.915
- [x] Calibration from that test: brightness 41..140 is safe, 203 is not -> `MAX_BRIGHT` 185; blur above ~1.5 px -> sharpness below ~20 (`MIN_SHARP` 20 rejects it); `SHOTS` 4 and `STABLE_FRAMES` 3 for speed on low-end phones
- [x] Full review pass: Record.jsx diff vs original v13 is only the intended lines; licences checked (YuNet MIT, SFace Apache-2.0, OpenCV Zoo Apache-2.0); `allowBackup` is false in `patch-android.sh`; no CSP in `index.html`; quality hints stay visible; camera-loss handling; Android back button closes the scan; safe-area padding
- [ ] Pull request (the create form was shown to the user but not submitted)
- [ ] Real-phone test on the Redmi 8: Android System WebView must support WebAssembly SIMD; check scan time, `MATCH_THRESHOLD` (0.5), `faceFit` ratios, Capacitor serving `.mjs` / `.wasm`
- [ ] QR image is shown only on the scan result screen; it is not printed into the PDF/DOCX forms (the case number is)
- [ ] No per-case face deletion in the UI (only "delete all face data"); deleting an interview does not remove its face template
- [ ] No liveness detection yet (a printed photo or a screen can fool the scan)
- [ ] Stable signing secrets are absent in the repository (debug signing, new key on every CI run), so installing a newer build over an older one fails until the old app is uninstalled (export data first)

## Models (fetched at build time, never committed)
- `face_detection_yunet_2023mar.onnx` (MIT) 640x640 BGR 0-255, 12 outputs (`cls/obj/bbox/kps` x strides 8/16/32), 5 landmarks
- `face_recognition_sface_2021dec.onnx` (Apache-2.0) 112x112 RGB 0-255, output 128-d `fc1`, L2-normalised by the caller
- SHA-256 values come from a third-party mirror's table and were re-checked; the build fails if the downloaded bytes differ
