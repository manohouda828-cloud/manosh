@echo off
REM ============================================================
REM  manosh.exe - one-click Windows build
REM  Produces dist\Manosh-Setup.exe (the installer)
REM ============================================================
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js was not found. Install the LTS version from https://nodejs.org then run this again.
  pause & exit /b 1
)

echo [1/3] Installing dependencies (Electron + electron-builder)...
call npm install
if errorlevel 1 ( echo [!] npm install failed & pause & exit /b 1 )

echo [2/3] Running self-test...
call npm test
if errorlevel 1 ( echo [!] self-test failed & pause & exit /b 1 )

echo [3/3] Building the installer...
call npm run dist
if errorlevel 1 (
  echo.
  echo [!] Build failed. If you saw "Cannot create symbolic link", turn on
  echo     Windows Settings ^> System ^> For developers ^> Developer Mode
  echo     (or run this script as Administrator^) and try again.
  pause & exit /b 1
)

echo.
echo Done! Installer: %cd%\dist\Manosh-Setup.exe
start "" "%cd%\dist"
pause
