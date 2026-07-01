@echo off
REM ============================================================
REM  Inicia o front da Cranium em http://localhost:5500
REM  (ES modules exigem servidor HTTP - nao abra o index.html
REM   direto pelo navegador com file://)
REM ============================================================
cd /d "%~dp0"
echo.
echo  CRANIUM - servindo o front em http://localhost:5500
echo  Pressione CTRL+C para parar.
echo.
start "" http://localhost:5500
py -m http.server 5500
