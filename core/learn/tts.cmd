@echo off
rem Usage: tts <command> <args>
rem   voice-over : app | serve | synth | say | bench
rem   voice lab  : unpack | dialogue | pick | harvest | voice | similar | trial
rem Runs tools\tts\<command>.py (or tools\tts\voicelab\<command>.py) with IndexTTS's own virtual environment.
rem This file stays ASCII-only: cmd.exe misparses UTF-8 text under code page 936.
setlocal
set PYTHONUTF8=1
if "%~1"=="" goto usage
set "SCRIPT=%~dp0tools\tts\%~1.py"
if not exist "%SCRIPT%" set "SCRIPT=%~dp0tools\tts\voicelab\%~1.py"
if not exist "%SCRIPT%" goto usage
shift
"%~dp0tools\index-tts\.venv\Scripts\python.exe" "%SCRIPT%" %1 %2 %3 %4 %5 %6 %7 %8 %9
exit /b %ERRORLEVEL%

:usage
echo Usage: tts ^<command^> ^<args^>
echo   voice-over : app ^| serve ^| synth ^| say ^| bench
echo   voice lab  : unpack ^| dialogue ^| pick ^| harvest ^| voice ^| similar ^| trial
exit /b 2
