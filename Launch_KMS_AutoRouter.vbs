Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\bruno\Documents\Workspace\kms_auto_router"
WshShell.Run "cmd /c npm start", 0, False
