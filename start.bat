@echo off
echo ====================================================
echo   KAIZEN REPORTING - Demarrage de l'application
echo ====================================================
echo.

REM Demarrer PostgreSQL via Docker
echo [1/3] Demarrage de la base de donnees PostgreSQL...
docker compose up -d
timeout /t 3 /nobreak > nul

REM Demarrer le serveur backend
echo [2/3] Demarrage du serveur API (port 4000)...
start "Kaizen API" cmd /k "cd /d "%~dp0server" && npm run dev"

timeout /t 2 /nobreak > nul

REM Demarrer le frontend
echo [3/3] Demarrage du frontend (port 5173)...
start "Kaizen Frontend" cmd /k "cd /d "%~dp0client" && npm run dev"

echo.
echo ====================================================
echo   Application demarree !
echo   - API:      http://localhost:4000
echo   - Frontend: http://localhost:5173
echo   - Login:    admin@kaizen-bs.com / Admin@2026!
echo ====================================================
echo.
pause
