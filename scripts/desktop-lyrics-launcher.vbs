Option Explicit

Dim shell, fso, scriptDir, powershellPath, scriptPath, command
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
powershellPath = "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
scriptPath = fso.BuildPath(scriptDir, "desktop-lyrics.ps1")
command = """" & powershellPath & """ -NoProfile -STA -ExecutionPolicy Bypass -File """ & scriptPath & """"

shell.Run command, 0, False
