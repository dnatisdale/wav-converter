Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
batFile = folder & "\Start Batch Audio Converter.bat"
command = "cmd /c """ & batFile & """"
shell.Run command, 0, False
