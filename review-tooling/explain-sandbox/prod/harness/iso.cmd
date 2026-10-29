@echo off
rem Enforced-isolation entry: empty Windows PATH, then env -i inside the private MSYS root (its /usr/bin holds coreutils and stubs only).
set PATH=
"%~dp0usr\bin\env.exe" -i PATH=/usr/bin HOME=/tmp "%~dp0usr\bin\bash.exe" --noprofile --norc %*
exit /b %ERRORLEVEL%
