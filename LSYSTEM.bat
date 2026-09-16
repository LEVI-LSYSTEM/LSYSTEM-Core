@echo off
REM ============================================================
REM  LSYSTEM Core - Local launcher
REM  Запускает http-server и открывает Microsoft Edge
REM ============================================================

setlocal
cd /d "%~dp0"

set PORT=8080
set URL=http://localhost:%PORT%

echo.
echo ============================================================
echo   LSYSTEM Core - Local launch
echo ============================================================
echo.
echo   Project:  %CD%
echo   Port:     %PORT%
echo   Browser:  Microsoft Edge
echo.
echo ============================================================
echo.

REM ===== Проверка Node.js =====
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js не найден в PATH.
    echo         Установи с https://nodejs.org/ ^(LTS^)
    echo.
    pause
    exit /b 1
)

REM ===== Проверка npx =====
where npx >nul 2>nul
if errorlevel 1 (
    echo [ERROR] npx не найден. Переустанови Node.js.
    echo.
    pause
    exit /b 1
)

REM ===== Проверка Edge =====
set EDGE_PATH=
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "EDGE_PATH=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"      set "EDGE_PATH=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if exist "%LocalAppData%\Microsoft\Edge\Application\msedge.exe"      set "EDGE_PATH=%LocalAppData%\Microsoft\Edge\Application\msedge.exe"

if "%EDGE_PATH%"=="" (
    echo [WARN] Microsoft Edge не найден в стандартных путях.
    echo        Открою URL в браузере по умолчанию.
)

REM ===== Открытие Edge с задержкой (ждём сервер) =====
echo [1/3] Запускаю локальный сервер...
start "" /b cmd /c "timeout /t 2 /nobreak >nul & if not "%EDGE_PATH%"=="" ( start "" "%EDGE_PATH%" --new-window "%URL%" ) else ( start "" "%URL%" )"

REM ===== Запуск сервера (передний план) =====
echo [2/3] Сервер слушает: %URL%
echo [3/3] Закрой это окно, чтобы остановить сервер.
echo.
echo ------------------------------------------------------------
echo   Ctrl+C  - остановить сервер
echo   Окно    - можно свернуть, сервер продолжит работать
echo ------------------------------------------------------------
echo.

npx --yes http-server . -p %PORT% -c-1 --cors

REM ===== Если сервер упал =====
echo.
echo [SERVER STOPPED]
pause
endlocal