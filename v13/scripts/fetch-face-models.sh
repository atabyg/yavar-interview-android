#!/usr/bin/env bash
# Downloads the two Face-ID ONNX models (OpenCV Zoo, Apache-2.0) into public/models and verifies SHA-256.
# Upstream URLs are pinned to commits; a mirror is only a fallback and is accepted ONLY if the hash matches.
set -euo pipefail
cd "$(dirname "$0")/.."
DEST=public/models
mkdir -p "$DEST"

fetch() { # name sha256 url...
  local name="$1" sha="$2"; shift 2
  local out="$DEST/$name"
  if [[ -s "$out" ]] && [[ "$(sha256sum "$out" | awk '{print $1}')" == "$sha" ]]; then echo "ok (cached): $name"; return 0; fi
  local url got size
  for url in "$@"; do
    echo "downloading $name from $url"
    if curl -fL --retry 4 --retry-delay 2 --connect-timeout 30 --max-time 600 "$url" -o "$out.tmp"; then
      got="$(sha256sum "$out.tmp" | awk '{print $1}')"; size="$(stat -c %s "$out.tmp")"
      if [[ "$got" == "$sha" ]]; then mv "$out.tmp" "$out"; echo "verified: $name ($size bytes, sha256 $got)"; return 0; fi
      echo "::warning::checksum mismatch for $name from $url (got $got, $size bytes)"
    fi
    rm -f "$out.tmp"
  done
  echo "::error::could not obtain a verified copy of $name"
  return 1
}

fetch face_detection_yunet_2023mar.onnx 8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4 \
  "https://github.com/opencv/opencv_zoo/raw/b6e370b10f641879a87890d44e42173077154a05/models/face_detection_yunet/face_detection_yunet_2023mar.onnx" \
  "https://github.com/opencv/opencv_zoo/raw/0d619617a8e9a389150d8c76e417451a19468150/models/face_detection_yunet/face_detection_yunet_2023mar.onnx" \
  "https://huggingface.co/priyanshsen21/foundyou-models/resolve/main/face_detection_yunet_2023mar.onnx"

fetch face_recognition_sface_2021dec.onnx 0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79 \
  "https://github.com/opencv/opencv_zoo/raw/fd2da740ebc6d0fe489d86cb55133148978cd82e/models/face_recognition_sface/face_recognition_sface_2021dec.onnx" \
  "https://media.githubusercontent.com/media/opencv/opencv_zoo/47534e27c9851bb1128ccc0102f1145e27f23f98/models/face_recognition_sface/face_recognition_sface_2021dec.onnx" \
  "https://huggingface.co/priyanshsen21/foundyou-models/resolve/main/face_recognition_sface_2021dec.onnx"

ls -l "$DEST"
