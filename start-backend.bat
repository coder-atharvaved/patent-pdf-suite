@echo off
cd /d "%~dp0"
echo Starting PDF backend on http://127.0.0.1:5000 ...
python -m pip install -r requirements.txt
python pdf_server.py
