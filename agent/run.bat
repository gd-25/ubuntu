@echo off
REM Agent UBUNTU : boucle avec redemarrage auto, logs dans agent.log.
REM Lance au boot par la tache planifiee "UbuntuAgent" (schtasks).
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
set PYTHON=python
if exist venv\Scripts\python.exe set PYTHON=venv\Scripts\python.exe
:loop
echo [%date% %time%] demarrage de l'agent >> agent.log
%PYTHON% main.py >> agent.log 2>&1
echo [%date% %time%] agent arrete (code %errorlevel%), redemarrage dans 5 s >> agent.log
timeout /t 5 /nobreak >nul
goto loop
