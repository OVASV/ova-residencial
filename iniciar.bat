@echo off
REM Levanta backend (3010) y frontend (5180) en ventanas separadas.
echo Iniciando OVA Residencial...

start "OVA Backend"  cmd /k "cd /d %~dp0backend && npm run dev"
start "OVA Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo Esperando a que levanten los servicios...
timeout /t 8 /nobreak >nul
start http://localhost:5180/

echo.
echo Backend:  http://localhost:3010/api/v1/health
echo Frontend: http://localhost:5180
echo.
echo NO cierres las dos ventanas negras (Backend y Frontend) mientras
echo uses el sistema. Para apagarlo, cierra esas dos ventanas.
