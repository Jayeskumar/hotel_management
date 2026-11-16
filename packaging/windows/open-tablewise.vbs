' Opens TableWise in a chrome-less Microsoft Edge window (falls back to the default browser).
' Optional argument: a page path, e.g. "kitchen".
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
port = "8080"
If fso.FileExists(dir & "\port.txt") Then
  Set f = fso.OpenTextFile(dir & "\port.txt")
  If Not f.AtEndOfStream Then port = Trim(f.ReadLine)
  f.Close
End If
page = ""
If WScript.Arguments.Count > 0 Then page = WScript.Arguments(0)
url = "http://localhost:" & port & "/" & page
On Error Resume Next
sh.Run "msedge --app=" & url, 1, False
If Err.Number <> 0 Then
  Err.Clear
  sh.Run url, 1, False
End If
