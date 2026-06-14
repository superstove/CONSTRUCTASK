@echo off
REM ConstructAsk backend — same as: cd backend ^&^& python -m uvicorn main:app --reload
REM Uses the real database from backend\.env (Supabase). KEEP THIS WINDOW OPEN.
cd /d "%~dp0backend"
python -m uvicorn main:app --reload
echo.
echo Backend stopped (exit code %ERRORLEVEL%). Press any key to close.
pause >nul
