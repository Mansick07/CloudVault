Set WshShell = CreateObject("WScript.Shell")

' 1. Start the server silently
' This runs the server in the background so you never see a black box
WshShell.Run "cmd /c npx -y http-server -p 8080", 0, False

' 2. Wait 2 seconds for it to start
WScript.Sleep 2000

' 3. Open your browser
WshShell.Run "http://localhost:8080/login.html"
