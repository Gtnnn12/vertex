Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$out = "E:\vertex-clean\packages\desktop\dist-electron\installer-screens"
New-Item -ItemType Directory -Force $out | Out-Null

function Shot($name) {
  Start-Sleep -Milliseconds 600
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
  $bmp.Save("$out\$name.png", [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Host "captured: $name"
}

function Click($x, $y) {
  Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); [DllImport("user32.dll")] public static extern void mouse_event(int f, int dx, int dy, int d, int e);' -Name U32 -Namespace Win
  [Win.U32]::SetCursorPos($x, $y)
  Start-Sleep -Milliseconds 200
  [Win.U32]::mouse_event(2, 0, 0, 0, 0)  # down
  [Win.U32]::mouse_event(4, 0, 0, 0, 0)  # up
  Start-Sleep -Milliseconds 400
}

$installer = "E:\vertex-clean\packages\desktop\dist-electron\VERTEX-1.0.0-x64.exe"
Start-Process $installer
Start-Sleep -Seconds 5

Shot "01-installer-start"

# The NSIS assisted flow with displayLanguageSelector opens the language
# dialog first. Buttons are big; use Tab/Enter navigation as primary and
# screenshots as proof at each stage.
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")   # accept language / next
Start-Sleep -Seconds 2
Shot "02-language-or-welcome"

[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")   # welcome -> next
Start-Sleep -Seconds 2
Shot "03-license"

[System.Windows.Forms.SendKeys]::SendWait("a")          # select all license text (confirms render)
Start-Sleep -Milliseconds 300
[System.Windows.Forms.SendKeys]::SendWait("{TAB}")
Start-Sleep -Milliseconds 200
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")   # accept + next
Start-Sleep -Seconds 2
Shot "04-destination"

[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")   # destination -> install
Start-Sleep -Seconds 2
Shot "05-progress"
Start-Sleep -Seconds 6
Shot "05b-progress-late"

Start-Sleep -Seconds 4
Shot "06-finish"

# Finish: leave "run VERTEX" checked? Uncheck first via key, then close.
[System.Windows.Forms.SendKeys]::SendWait("{TAB}")
[System.Windows.Forms.SendKeys]::SendWait(" ")
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
Start-Sleep -Seconds 3
Shot "07-after-finish"

Write-Host "installer flow captured to $out"
