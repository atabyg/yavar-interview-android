# Face-ID (branch feature/version-13-face-id)

Branched from `feature/version-13`; v13 itself is untouched.

## How it works
1. Before recording, the user taps «شناسهٔ چهره» and the front camera opens (offline, no account, no limit).
2. 5 frames are embedded by a bundled on-device model.
3. Embedding is compared with enrolled faces (cosine similarity):
   - match -> the SAME stored 6-digit case number is returned every time;
   - no match -> a new non-repeating case number is issued and the face enrolled.
4. A QR (`YAVAR:<case>:<checksum>`) is shown; the number fills the case-number field used in forms.

## Honest limits
- A face cannot be turned into an identical code on every scan (lighting/angle/noise). Matching with a threshold is the only reliable method; rare false rejects/accepts are possible. Tune `MATCH_THRESHOLD` on the real phone (Redmi 8).
- ChatGPT's age check does not produce IDs; this feature only reuses the camera-guided idea.
- Faces are biometric data of vulnerable clients: only a numeric vector is stored locally, never the photo; get informed consent; `forgetFace()` / `forgetAllFaces()` delete it.
- NOT YET DONE: the model file `v13/assets/models/face-embed.onnx` (MobileFaceNet/ArcFace-mobile, 112x112) must be added, plus dependencies `onnxruntime-web` and `qrcode` in package.json and wasm files copied into assets. Not built or run on a device yet.
- Photo-scan of a printed picture is not implemented (and printed photos are weaker/spoofable).
