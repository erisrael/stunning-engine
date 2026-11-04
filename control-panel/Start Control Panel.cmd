@echo off
rem Starts the Myseed Content Manager control panel (this folder only, port 8765,
rem http://content-manager.localhost:8765) in the background and opens it in your browser.
rem You can close this window afterwards; the panel and its jobs keep running.
cd /d "%~dp0.."
python "%~dp0control_panel.py" start
if errorlevel 1 pause
