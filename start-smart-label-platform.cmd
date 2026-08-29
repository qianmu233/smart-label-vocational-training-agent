@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Smart Label Vocational Training Agent v1.0.0
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-smart-label-platform.ps1"
endlocal
