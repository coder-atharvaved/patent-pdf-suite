@echo off
cd /d "%~dp0"
echo Restarting Patent PDF Suite...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":5000" ^| findstr "LISTENING"') do taskkill /F /PID %%P >nul 2>&1
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /F /PID %%P >nul 2>&1
timeout /t 1 /nobreak >nul
netstat -ano | findstr /R /C:":5000 .*LISTENING" >nul
if not errorlevel 1 (
  echo ERROR: Port 5000 is still being used by an old backend process.
  echo Close the old Patent PDF Suite terminal or end that Python process in Task Manager, then run this file again.
  pause
  exit /b 1
)
netstat -ano | findstr /R /C:":5173 .*LISTENING" >nul
if not errorlevel 1 (
  echo ERROR: Port 5173 is still being used by an old frontend process.
  echo Close the old Patent PDF Suite terminal or end that Node process in Task Manager, then run this file again.
  pause
  exit /b 1
)
start "Patent PDF Backend" cmd /k call "%~dp0start-backend.bat"
timeout /t 2 /nobreak >nul
call "%~dp0start-react.bat"
