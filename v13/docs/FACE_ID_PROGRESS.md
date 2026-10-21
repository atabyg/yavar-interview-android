# Face-ID progress (branch `feature/version-13-face-id`)

Resume file: if a run is interrupted, continue from the first unchecked item. Git history is the source of truth.

- [x] Branch created from `feature/version-13` (v13 itself untouched)
- [x] `src/face-math.js`: letterbox, YuNet decode + NMS, 5-point alignment (Umeyama), pose/fit/stability/blur checks. 17 local Node 22 tests pass
- [x] `src/face-id.js`: multi-template matching, ambiguous detection, number choice, AES-GCM encrypted store, `YFV1` portable vector, QR + checksum
- [ ] `src/face-engine.js`: ONNX Runtime Web loader, YuNet (detector) + SFace (embedder)
- [ ] `components/FaceScan.jsx` automatic flow + `Record.jsx` wiring (items, current number, name fill-in)
- [ ] `scripts/fetch-face-models.sh` (pinned URLs + SHA-256), `scripts/prepare-face-assets.mjs`, `package.json`
- [ ] `patch-faceid.sh`: CAMERA permission, versionCode 14 / 13.1.0
- [ ] Workflow `build-apk-v13-face-id.yml` (posts result and log tail to the PR)
- [ ] Pull request, run the Action, fix failures
- [ ] Real-phone tuning (Redmi 8): `MATCH_THRESHOLD`, `faceFit` ratios, blur/brightness limits

## Models (both Apache-2.0 via OpenCV Zoo; fetched in CI, never committed)
- `face_detection_yunet_2023mar.onnx` 640x640 BGR 0-255, 12 outputs (`cls/obj/bbox/kps` x strides 8/16/32), 5 landmarks
- `face_recognition_sface_2021dec.onnx` 112x112 RGB 0-255, output 128-d `fc1`, L2-normalised by the caller
