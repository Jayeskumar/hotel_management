@echo off
rem TableWise support commands. Run from an Administrator command prompt:
rem   tablewise info
rem   tablewise backup
rem   tablewise restore "C:\path\to\backup.dump"
rem   tablewise reset-password owner@example.com NewPassword123
setlocal
set "TW=%~dp0"
if "%TABLEWISE_DATA%"=="" set "TABLEWISE_DATA=%ProgramData%\TableWise"
"%TW%node\node.exe" "%TW%app\server.mjs" %*
