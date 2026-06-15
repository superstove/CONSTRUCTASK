@echo off
REM Construct Ask frontend — same as: cd frontend ^&^& npm run dev
REM KEEP THIS WINDOW OPEN.
cd /d "%~dp0frontend"
call npm run dev
echo.
echo Frontend stopped (exit code %ERRORLEVEL%). Press any key to close.
pause >nul
