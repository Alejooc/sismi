@echo off
setlocal

set "VSDEVCMD=%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSDEVCMD%" if exist "%VSWHERE%" (
  for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -find Common7\Tools\VsDevCmd.bat`) do set "VSDEVCMD=%%i"
)
if not exist "%VSDEVCMD%" (
  echo No se encontro Visual Studio con herramientas C++ instalado.
  exit /b 1
)

call "%VSDEVCMD%" -arch=x64 >nul
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

if /I "%1"=="build" (
  call npx tauri build
) else (
  call npx tauri dev
)
