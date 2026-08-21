@echo off
setlocal

set "VSDEVCMD=%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"
if not exist "%VSDEVCMD%" (
  echo No se encontro Visual Studio Build Tools con C++ instalado.
  exit /b 1
)

call "%VSDEVCMD%" -arch=x64 >nul
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

if /I "%1"=="build" (
  call npx tauri build
) else (
  call npx tauri dev
)
