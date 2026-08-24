@echo off
REM ============================================================================
REM  correr.bat — lo que ejecuta el Programador de tareas de Windows cada 6 h.
REM
REM  Por que existe (y no se llama a node directamente desde el Programador):
REM   1. RUTAS ABSOLUTAS. El Programador NO hereda la carpeta de trabajo; con
REM      rutas relativas, node no encuentra subir.js ni serviceAccount.json.
REM      Es la causa numero 1 de "funciona a mano pero programado no".
REM   2. Si node no esta en el PATH, avisa con un mensaje claro en el registro
REM      en vez de morir en silencio.
REM   3. Deja constancia en logs/ de cada arranque, aunque node falle antes de
REM      poder registrar nada por su cuenta.
REM ============================================================================

REM Carpeta donde vive este .bat (con la barra final) -> todo cuelga de aqui.
set "AQUI=%~dp0"
cd /d "%AQUI%"

REM Carpeta de registros (subir.js tambien escribe aqui).
if not exist "%AQUI%logs" mkdir "%AQUI%logs"
for /f "tokens=1-3 delims=/-. " %%a in ("%DATE%") do set "HOY=%%c-%%b"
set "LOG=%AQUI%logs\arranques.log"

REM Comprobar que node existe ANTES de intentar usarlo.
where node >nul 2>nul
if errorlevel 1 (
  echo [%DATE% %TIME%] ERROR: no se encontro 'node'. Instala Node.js ^(nodejs.org^) >> "%LOG%"
  exit /b 1
)

echo [%DATE% %TIME%] arranque >> "%LOG%"

REM La salida completa va al registro del mes; subir.js escribe ademas su
REM propio resumen y el latido que ve el panel.
node "%AQUI%subir.js" >> "%LOG%" 2>&1
set "CODIGO=%ERRORLEVEL%"

if not "%CODIGO%"=="0" (
  echo [%DATE% %TIME%] termino con error %CODIGO% >> "%LOG%"
) else (
  echo [%DATE% %TIME%] termino bien >> "%LOG%"
)

exit /b %CODIGO%
