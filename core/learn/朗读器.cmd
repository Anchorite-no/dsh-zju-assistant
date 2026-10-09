@echo off
rem One-click entry for the reader app (tools\tts\app.py).
rem Double-click to open it; or drop a lesson HTML onto this file to open that lesson directly.
rem It runs under pythonw, so there is no console window. The log goes to a file under out\ (keep_log in app.py);
rem if the app cannot start it says so in a message box. To watch the log live in a terminal, run "tts app".
rem This file stays ASCII-only: cmd.exe misparses UTF-8 text under code page 936.
set PYTHONUTF8=1
start "" "%~dp0tools\index-tts\.venv\Scripts\pythonw.exe" "%~dp0tools\tts\app.py" %*
