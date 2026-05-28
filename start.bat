@echo off
echo Starting KMS Auto-Router...

:: Start the API Server in the background
start "KMS Backend" cmd /c "node server.js"

:: Start the React Frontend Desktop App
cd frontend
start "KMS Dashboard" cmd /c "npm run dev"

echo KMS Auto-Router is now operational.
echo 1. Backend Server running at http://localhost:4000
echo 2. Frontend Dashboard running at http://localhost:5173
echo.
echo Please load the Chrome extension from: %cd%\..\extension
pause
