@echo off
REM ============================================================
REM  ConstructAsk — one-click starter
REM  Opens TWO windows (backend + frontend). KEEP BOTH OPEN.
REM  Closing a window stops that part of the app.
REM ============================================================

echo Starting ConstructAsk backend...
start "ConstructAsk BACKEND - KEEP OPEN" "%~dp0run-backend.bat"

echo Starting ConstructAsk frontend...
start "ConstructAsk FRONTEND - KEEP OPEN" "%~dp0run-frontend.bat"

echo Waiting 8 seconds for servers to boot...
timeout /t 8 /nobreak >nul

echo Opening the app in your browser...
start http://localhost:5173

echo.
echo ============================================================
echo  ConstructAsk is starting.
echo  TWO windows opened - DO NOT CLOSE THEM while using the app.
echo  App URL: http://localhost:5173
echo ============================================================
pause
