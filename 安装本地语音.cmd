@echo off
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements-whisper.txt
if errorlevel 1 exit /b 1
.venv\Scripts\python.exe scripts\whisper_local.py --prepare --model small --cache data\models
pause
