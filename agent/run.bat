@echo off
REM Fallback Windows : lance l'agent UBUNTU en boucle (redemarrage auto en cas de crash).
REM Pour un demarrage automatique au boot :
REM   Planificateur de taches -> Creer une tache -> Declencheur "Au demarrage"
REM   -> Action "Demarrer un programme" -> ce fichier run.bat
REM   -> cocher "Executer meme si l'utilisateur n'est pas connecte".
REM Prerequis : python 3.11+, ffmpeg dans le PATH, pip install -r requirements.txt
REM (sur Windows, remplacer tflite-runtime par tensorflow si necessaire).

cd /d "%~dp0"
set PYTHON=python
if exist venv\Scripts\python.exe set PYTHON=venv\Scripts\python.exe
:loop
%PYTHON% main.py
echo Agent arrete (code %errorlevel%), redemarrage dans 5 s...
timeout /t 5 /nobreak >nul
goto loop
