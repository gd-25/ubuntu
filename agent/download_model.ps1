# Télécharge le modèle YAMNet (TFLite) et sa table de classes AudioSet
# dans agent\models\. À lancer une fois avant le premier démarrage.
# Usage :  powershell -ExecutionPolicy Bypass -File download_model.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
New-Item -ItemType Directory -Force -Path models | Out-Null

Write-Host "-> Telechargement de yamnet.tflite (Kaggle Models, ~3 Mo)..."
Invoke-WebRequest -Uri "https://www.kaggle.com/api/v1/models/google/yamnet/tfLite/classification-tflite/1/download" `
  -OutFile models\yamnet.tar.gz
tar -xzf models\yamnet.tar.gz -C models
Move-Item -Force models\1.tflite models\yamnet.tflite
Remove-Item models\yamnet.tar.gz

Write-Host "-> Telechargement de yamnet_class_map.csv..."
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/tensorflow/models/master/research/audioset/yamnet/yamnet_class_map.csv" `
  -OutFile models\yamnet_class_map.csv

Write-Host "OK - Modele pret dans agent\models\"
Get-ChildItem models
