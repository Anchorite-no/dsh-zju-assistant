#!/bin/sh
# Double-click in Finder to open the app. Same as running "npm start" in this folder (macOS counterpart of start.cmd).
cd "$(dirname "$0")" || exit 1
exec npm start
