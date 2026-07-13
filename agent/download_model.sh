#!/usr/bin/env bash
# Télécharge le modèle YAMNet (TFLite) et sa table de classes AudioSet
# dans agent/models/. À lancer une fois avant le premier démarrage.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p models

echo "→ Téléchargement de yamnet.tflite (Kaggle Models, ~3 Mo)…"
curl -fL --retry 3 -o models/yamnet.tar.gz \
  "https://www.kaggle.com/api/v1/models/google/yamnet/tfLite/classification-tflite/1/download"
tar -xzf models/yamnet.tar.gz -C models
mv models/1.tflite models/yamnet.tflite
rm models/yamnet.tar.gz

echo "→ Téléchargement de yamnet_class_map.csv…"
curl -fL --retry 3 -o models/yamnet_class_map.csv \
  "https://raw.githubusercontent.com/tensorflow/models/master/research/audioset/yamnet/yamnet_class_map.csv"

echo "✓ Modèle prêt dans agent/models/"
ls -lh models/
