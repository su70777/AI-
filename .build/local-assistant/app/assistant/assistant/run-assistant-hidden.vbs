Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
appDir = fso.GetParentFolderName(scriptDir)
command = """" & appDir & "\node.exe"" """ & scriptDir & "\assistant-server.js"""
shell.Run command, 0, False
