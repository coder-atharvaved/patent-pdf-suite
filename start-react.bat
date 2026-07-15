@echo off
cd /d "%~dp0"
set "NPM=%ProgramFiles%\nodejs\npm.cmd"
if not exist "%NPM%" (
  echo Node.js LTS was not found. Install Node.js, then run this file again.
  pause
  exit /b 1
)
set "PATH=%ProgramFiles%\nodejs;%PATH%"
call "%NPM%" run dev
if errorlevel 1 pause
