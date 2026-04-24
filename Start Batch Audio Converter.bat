@echo off
setlocal

cd /d "%~dp0"

set "PORT=8080"
set "URL=http://localhost:%PORT%/"

where py >nul 2>nul
if %errorlevel%==0 (
    start "" "%URL%"
    py -m http.server %PORT%
    goto :eof
)

where python >nul 2>nul
if %errorlevel%==0 (
    start "" "%URL%"
    python -m http.server %PORT%
    goto :eof
)

echo.
echo Python was not found on this computer.
echo.
echo Please install Python from python.org
echo and during setup check:
echo   Add Python to PATH
echo.
echo Then double-click this file again.
echo.
pause
