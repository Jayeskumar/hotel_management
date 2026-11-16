; TableWise on-premise installer (NSIS 3, Unicode). Built by packaging/windows/build.mjs:
;   makensis -DVERSION=1.0.0 -DSTAGE=<staging dir> -DOUTFILE=<setup.exe> installer.nsi
Unicode true
ManifestDPIAware true
SetCompressor /SOLID lzma
RequestExecutionLevel admin

!ifndef VERSION
  !error "VERSION not defined"
!endif
!ifndef STAGE
  !error "STAGE not defined"
!endif

!define APP        "TableWise"
!define PUBLISHER  "TableWise"
!define SERVICE    "TableWise"
!define UNINSTKEY  "Software\Microsoft\Windows\CurrentVersion\Uninstall\TableWise"

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!include "WinVer.nsh"
!include "FileFunc.nsh"

Name "${APP} ${VERSION}"
OutFile "${OUTFILE}"
InstallDir "$PROGRAMFILES64\${APP}"
InstallDirRegKey HKLM "${UNINSTKEY}" "InstallLocation"
BrandingText "${APP} ${VERSION}"
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APP}"
VIAddVersionKey "CompanyName" "${PUBLISHER}"
VIAddVersionKey "FileDescription" "${APP} restaurant management — on-premise installer"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "© ${PUBLISHER}"

!define MUI_ICON "${STAGE}\tablewise.ico"
!define MUI_UNICON "${STAGE}\tablewise.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TEXT "This will install ${APP} ${VERSION} on this computer.$\r$\n$\r$\nThis PC becomes the restaurant's server: billing counters, waiter tablets and kitchen screens on the same network connect to it.$\r$\n$\r$\nIf ${APP} is already installed it will be upgraded and your data kept (a backup is taken automatically)."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Open ${APP} now"
!define MUI_FINISHPAGE_RUN_FUNCTION OpenApp
!define MUI_FINISHPAGE_SHOWREADME "$INSTDIR\README.txt"
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Show the getting-started notes"
!define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${STAGE}\EULA.txt"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Var DataDir

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "${APP} requires 64-bit Windows 10 or later."
    Abort
  ${EndIf}
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_ICONSTOP "${APP} requires Windows 10 or later."
    Abort
  ${EndIf}
  SetRegView 64
FunctionEnd

Function un.onInit
  SetRegView 64
FunctionEnd

Function OpenApp
  ExecShell "" "$SYSDIR\wscript.exe" '"$INSTDIR\open-tablewise.vbs"'
FunctionEnd

; Stop the service (if present) and wait for it, so files are not locked during an upgrade.
!macro StopService UN
Function ${UN}StopService
  nsExec::ExecToLog '"$SYSDIR\net.exe" stop ${SERVICE}'
  Pop $0
  Sleep 1000
FunctionEnd
!macroend
!insertmacro StopService ""
!insertmacro StopService "un."

Section "Install"
  SetShellVarContext all
  StrCpy $DataDir "$APPDATA\${APP}"   ; $APPDATA with 'all' context = C:\ProgramData

  DetailPrint "Stopping ${APP} (if running)…"
  Call StopService

  ; Replace program files; data in C:\ProgramData\TableWise is never touched here.
  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\node"
  RMDir /r "$INSTDIR\pgsql"
  SetOutPath "$INSTDIR"
  File /r "${STAGE}\*"

  ; Data folder readable only by SYSTEM and Administrators (it holds the database and secrets).
  CreateDirectory "$DataDir"
  nsExec::ExecToLog '"$SYSDIR\icacls.exe" "$DataDir" /inheritance:r /grant:r *S-1-5-18:(OI)(CI)F *S-1-5-32-544:(OI)(CI)F'
  Pop $0

  DetailPrint "Registering the ${APP} Windows service…"
  nsExec::ExecToLog '"$INSTDIR\service\TableWiseService.exe" install'
  Pop $0
  nsExec::ExecToLog '"$INSTDIR\service\TableWiseService.exe" refresh'
  Pop $0

  DetailPrint "Allowing devices on the local network to connect…"
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="${APP}"'
  Pop $0
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall add rule name="${APP}" dir=in action=allow program="$INSTDIR\node\node.exe" enable=yes profile=any remoteip=localsubnet'
  Pop $0

  DetailPrint "Starting ${APP} (the first start creates the database and can take a minute)…"
  nsExec::ExecToLog '"$INSTDIR\service\TableWiseService.exe" start'
  Pop $0
  nsExec::ExecToLog '"$INSTDIR\node\node.exe" "$INSTDIR\wait-ready.mjs"'
  Pop $0
  ${If} $0 != 0
    DetailPrint "${APP} is still starting; see $DataDir\logs if it does not open."
  ${EndIf}

  ; Shortcuts
  CreateDirectory "$SMPROGRAMS\${APP}"
  CreateShortCut "$SMPROGRAMS\${APP}\${APP}.lnk" "$SYSDIR\wscript.exe" '"$INSTDIR\open-tablewise.vbs"' "$INSTDIR\tablewise.ico"
  CreateShortCut "$SMPROGRAMS\${APP}\${APP} Kitchen Display.lnk" "$SYSDIR\wscript.exe" '"$INSTDIR\open-tablewise.vbs" kitchen' "$INSTDIR\tablewise.ico"
  CreateShortCut "$SMPROGRAMS\${APP}\Backups folder.lnk" "$WINDIR\explorer.exe" '"$DataDir\backups"'
  CreateShortCut "$SMPROGRAMS\${APP}\Getting started.lnk" "$INSTDIR\README.txt"
  CreateShortCut "$SMPROGRAMS\${APP}\Uninstall ${APP}.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortCut "$DESKTOP\${APP}.lnk" "$SYSDIR\wscript.exe" '"$INSTDIR\open-tablewise.vbs"' "$INSTDIR\tablewise.ico"

  ; Add/Remove Programs
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKLM "${UNINSTKEY}" "DisplayName" "${APP}"
  WriteRegStr HKLM "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "${UNINSTKEY}" "Publisher" "${PUBLISHER}"
  WriteRegStr HKLM "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\tablewise.ico"
  WriteRegStr HKLM "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKLM "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINSTKEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  WriteRegDWORD HKLM "${UNINSTKEY}" "EstimatedSize" $0
SectionEnd

Section "Uninstall"
  SetShellVarContext all
  StrCpy $DataDir "$APPDATA\${APP}"

  Call un.StopService
  nsExec::ExecToLog '"$INSTDIR\service\TableWiseService.exe" uninstall'
  Pop $0
  ; Make sure the database is not left running if the service stop timed out.
  nsExec::ExecToLog '"$INSTDIR\pgsql\bin\pg_ctl.exe" stop -D "$DataDir\pgdata" -m fast'
  Pop $0
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="${APP}"'
  Pop $0

  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\node"
  RMDir /r "$INSTDIR\pgsql"
  RMDir /r "$INSTDIR\service"
  Delete "$INSTDIR\*.*"
  RMDir "$INSTDIR"

  Delete "$DESKTOP\${APP}.lnk"
  RMDir /r "$SMPROGRAMS\${APP}"
  DeleteRegKey HKLM "${UNINSTKEY}"

  MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 \
    "Also delete ALL restaurant data (orders, menu, staff and backups) in $DataDir?$\r$\n$\r$\nChoose No to keep it for a reinstall." \
    IDNO keep
    RMDir /r "$DataDir"
  keep:
SectionEnd
