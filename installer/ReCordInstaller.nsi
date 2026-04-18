!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "WinMessages.nsh"

!define MIN_WIN_BUILD 10240
!define WIN11_BUILD 22000

!ifndef PRODUCT_NAME
  !define PRODUCT_NAME "ReCord"
!endif

!ifndef PRODUCT_VERSION
  !define PRODUCT_VERSION "0.0.0"
!endif

!ifndef SOURCE_DIR
  !define SOURCE_DIR "dist\\release\\ReCord-Installer-Bundle"
!endif

!ifndef OUT_FILE
  !define OUT_FILE "dist\\release\\ReCordSetup.exe"
!endif

Name "${PRODUCT_NAME} Installer ${PRODUCT_VERSION}"
OutFile "${OUT_FILE}"
InstallDir "$LOCALAPPDATA\\ReCord"
InstallDirRegKey HKCU "Software\\ReCord" "InstallDir"
RequestExecutionLevel user
Unicode true

!ifdef APP_ICON
  Icon "${APP_ICON}"
  UninstallIcon "${APP_ICON}"
  !define MUI_ICON "${APP_ICON}"
  !define MUI_UNICON "${APP_ICON}"
!endif

!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Welcome to ReCord Setup"
!define MUI_WELCOMEPAGE_TEXT "A modern ReCord installer for Windows 10 and Windows 11.$\r$\n$\r$\nPick an action, choose Discord targets, and patch in one flow."
!define MUI_FINISHPAGE_TITLE "ReCord Setup Complete"
!define MUI_FINISHPAGE_TEXT "ReCord files were installed successfully. Use the selected action to patch Discord now if enabled."

Var RunActionNow
Var OpenFolderAfter
Var RunActionNowState
Var OpenFolderAfterState

Var Dialog
Var LabelTitle
Var LabelDesc
Var WindowsInfoLabel

Var OpInstall
Var OpRepair
Var OpUninstall

Var BranchAuto
Var BranchStable
Var BranchPtb
Var BranchCanary
Var UseCustomLocation
Var CustomLocation
Var BrowseButton

Var ActionFlag
Var CustomLocationText
Var OsBuildNumber
Var IsWin11
Var PayloadDir

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_COMPONENTS
Page Custom OptionsPageCreate OptionsPageLeave
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

Section "Core Files (required)" SEC_CORE
  SectionIn RO
  SetOutPath "$INSTDIR"
  File /r "${SOURCE_DIR}\\*"

  WriteRegStr HKCU "Software\\ReCord" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ReCord" "DisplayName" "ReCord"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ReCord" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ReCord" "Publisher" "Rloxx"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ReCord" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ReCord" "UninstallString" '"$INSTDIR\\Uninstall.exe"'
  WriteUninstaller "$INSTDIR\\Uninstall.exe"
SectionEnd

Section "Desktop Shortcut" SEC_DESKTOP
  CreateShortcut "$DESKTOP\\ReCord Installer.lnk" "$INSTDIR\\Install-ReCord.cmd"
SectionEnd

Section "Start Menu Shortcuts" SEC_START
  CreateDirectory "$SMPROGRAMS\\ReCord"
  CreateShortcut "$SMPROGRAMS\\ReCord\\Install ReCord.lnk" "$INSTDIR\\Install-ReCord.cmd"
  CreateShortcut "$SMPROGRAMS\\ReCord\\Repair ReCord.lnk" "$INSTDIR\\Repair-ReCord.cmd"
  CreateShortcut "$SMPROGRAMS\\ReCord\\Uninstall ReCord Patch.lnk" "$INSTDIR\\Uninstall-ReCord.cmd"
  CreateShortcut "$SMPROGRAMS\\ReCord\\Uninstall ReCord Setup.lnk" "$INSTDIR\\Uninstall.exe"
  CreateShortcut "$SMPROGRAMS\\ReCord\\ReCord Folder.lnk" "$WINDIR\\explorer.exe" "$INSTDIR"
SectionEnd

Function ApplyDarkStyle
  ; Keep styling minimal for native readability and reliable click targets.
  SetCtlColors $LabelTitle "2E3A4A" "FFFFFF"
  SetCtlColors $LabelDesc "4A5565" "FFFFFF"
  SetCtlColors $WindowsInfoLabel "1E7A34" "FFFFFF"
FunctionEnd

Function ToggleCustomLocationControls
  ${NSD_GetState} $UseCustomLocation $0
  ${If} $0 == ${BST_CHECKED}
    EnableWindow $CustomLocation 1
    EnableWindow $BrowseButton 1
  ${Else}
    EnableWindow $CustomLocation 0
    EnableWindow $BrowseButton 0
  ${EndIf}
FunctionEnd

Function BrowseForLocation
  nsDialogs::SelectFolderDialog "Select Discord folder" "$LOCALAPPDATA"
  Pop $0
  ${If} $0 != error
    ${NSD_SetText} $CustomLocation $0
  ${EndIf}
FunctionEnd

Function OptionsPageCreate
  nsDialogs::Create 1018
  Pop $Dialog
  ${If} $Dialog == error
    Abort
  ${EndIf}

  ; Header
  ${NSD_CreateLabel} 0 0u 100% 12u "Choose how ReCord should patch Discord"
  Pop $LabelTitle
  ${NSD_CreateLabel} 0 12u 100% 10u "Pick one action, then select targets below."
  Pop $LabelDesc

  ; Action group
  ${NSD_CreateGroupBox} 0 24u 100% 42u "Action"
  Pop $0

  ${NSD_CreateRadioButton} 8u 36u 90% 10u "Install ReCord"
  Pop $OpInstall
  ${NSD_SetState} $OpInstall ${BST_CHECKED}

  ${NSD_CreateRadioButton} 8u 47u 90% 10u "Repair existing ReCord patch"
  Pop $OpRepair

  ${NSD_CreateRadioButton} 8u 58u 90% 10u "Remove ReCord patch"
  Pop $OpUninstall

  ; Target group
  ${NSD_CreateGroupBox} 0 70u 100% 64u "Discord targets"
  Pop $0

  ${NSD_CreateCheckbox} 8u 82u 22% 10u "Auto"
  Pop $BranchAuto
  ${NSD_SetState} $BranchAuto ${BST_CHECKED}

  ${NSD_CreateCheckbox} 31% 82u 22% 10u "Stable"
  Pop $BranchStable
  ${If} ${FileExists} "$LOCALAPPDATA\\Discord\\*"
    ${NSD_SetState} $BranchStable ${BST_CHECKED}
  ${EndIf}

  ${NSD_CreateCheckbox} 54% 82u 18% 10u "PTB"
  Pop $BranchPtb
  ${If} ${FileExists} "$LOCALAPPDATA\\DiscordPTB\\*"
    ${NSD_SetState} $BranchPtb ${BST_CHECKED}
  ${EndIf}

  ${NSD_CreateCheckbox} 74% 82u 22% 10u "Canary"
  Pop $BranchCanary
  ${If} ${FileExists} "$LOCALAPPDATA\\DiscordCanary\\*"
    ${NSD_SetState} $BranchCanary ${BST_CHECKED}
  ${EndIf}

  ${NSD_CreateCheckbox} 8u 95u 90% 10u "Use custom Discord location"
  Pop $UseCustomLocation
  ${NSD_OnClick} $UseCustomLocation ToggleCustomLocationControls

  ${NSD_CreateText} 8u 106u 70% 12u "$LOCALAPPDATA\\Discord"
  Pop $CustomLocation

  ${NSD_CreateButton} 80% 106u 18% 12u "Browse"
  Pop $BrowseButton
  ${NSD_OnClick} $BrowseButton BrowseForLocation

  ; Post-install options
  ${NSD_CreateGroupBox} 0 136u 100% 30u "After setup"
  Pop $0

  ${NSD_CreateCheckbox} 8u 147u 90% 10u "Run selected action now"
  Pop $RunActionNow
  ${NSD_SetState} $RunActionNow ${BST_CHECKED}

  ${NSD_CreateCheckbox} 8u 157u 90% 10u "Open install folder after setup"
  Pop $OpenFolderAfter

  ; OS info footer on custom page
  ${If} $IsWin11 == 1
    ${NSD_CreateLabel} 0 171u 100% 10u "Detected: Windows 11 (fully supported)"
  ${Else}
    ${NSD_CreateLabel} 0 171u 100% 10u "Detected: Windows 10 (fully supported)"
  ${EndIf}
  Pop $WindowsInfoLabel

  Call ToggleCustomLocationControls
  Call ApplyDarkStyle

  nsDialogs::Show
FunctionEnd

Function OptionsPageLeave
  ${NSD_GetState} $RunActionNow $RunActionNowState
  ${NSD_GetState} $OpenFolderAfter $OpenFolderAfterState
  ${NSD_GetText} $CustomLocation $CustomLocationText
FunctionEnd

Function RunActionForBranch
  Exch $0
  ${If} $ActionFlag == "-install"
    ExecWait '"$INSTDIR\\ReCordInstallerCli.exe" -install -branch $0' $1
  ${ElseIf} $ActionFlag == "-repair"
    ExecWait '"$INSTDIR\\ReCordInstallerCli.exe" -repair -branch $0' $1
  ${Else}
    ExecWait '"$INSTDIR\\ReCordInstallerCli.exe" -uninstall -branch $0' $1
  ${EndIf}
FunctionEnd

Function RunActionForCustomLocation
  ${If} $ActionFlag == "-install"
    ExecWait '"$INSTDIR\\ReCordInstallerCli.exe" -install -location "$CustomLocationText"' $1
  ${ElseIf} $ActionFlag == "-repair"
    ExecWait '"$INSTDIR\\ReCordInstallerCli.exe" -repair -location "$CustomLocationText"' $1
  ${Else}
    ExecWait '"$INSTDIR\\ReCordInstallerCli.exe" -uninstall -location "$CustomLocationText"' $1
  ${EndIf}
FunctionEnd

Function .onInstSuccess
  ${If} $OpenFolderAfterState == ${BST_CHECKED}
    ExecShell "open" "$INSTDIR"
  ${EndIf}

  ${If} $RunActionNowState != ${BST_CHECKED}
    Return
  ${EndIf}

  StrCpy $PayloadDir "$INSTDIR\\record-app"
  IfFileExists "$PayloadDir\\*.*" +2 0
    StrCpy $PayloadDir "$INSTDIR\\app"

  System::Call 'Kernel32::SetEnvironmentVariable(t, t) i("RECORD_USER_DATA_DIR", "$PayloadDir")'
  System::Call 'Kernel32::SetEnvironmentVariable(t, t) i("RECORD_DEV_INSTALL", "1")'
  System::Call 'Kernel32::SetEnvironmentVariable(t, t) i("RECORD_FORCE_BRAND", "1")'
  ; Backward-compat environment names expected by upstream installer binaries.
  System::Call 'Kernel32::SetEnvironmentVariable(t, t) i("VENCORD_USER_DATA_DIR", "$PayloadDir")'
  System::Call 'Kernel32::SetEnvironmentVariable(t, t) i("VENCORD_DEV_INSTALL", "1")'

  ${NSD_GetState} $OpInstall $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $ActionFlag "-install"
  ${Else}
    ${NSD_GetState} $OpRepair $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $ActionFlag "-repair"
    ${Else}
      StrCpy $ActionFlag "-uninstall"
    ${EndIf}
  ${EndIf}

  ${NSD_GetState} $BranchAuto $0
  ${If} $0 == ${BST_CHECKED}
    Push "auto"
    Call RunActionForBranch
  ${EndIf}

  ${NSD_GetState} $BranchStable $0
  ${If} $0 == ${BST_CHECKED}
    Push "stable"
    Call RunActionForBranch
  ${EndIf}

  ${NSD_GetState} $BranchPtb $0
  ${If} $0 == ${BST_CHECKED}
    Push "ptb"
    Call RunActionForBranch
  ${EndIf}

  ${NSD_GetState} $BranchCanary $0
  ${If} $0 == ${BST_CHECKED}
    Push "canary"
    Call RunActionForBranch
  ${EndIf}

  ${NSD_GetState} $UseCustomLocation $0
  ${If} $0 == ${BST_CHECKED}
    ${If} $CustomLocationText != ""
      Call RunActionForCustomLocation
    ${EndIf}
  ${EndIf}
FunctionEnd

Function .onInit
  ReadRegStr $OsBuildNumber HKLM "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion" "CurrentBuildNumber"
  ${If} $OsBuildNumber == ""
    StrCpy $OsBuildNumber "0"
  ${EndIf}

  IntCmp $OsBuildNumber ${MIN_WIN_BUILD} +3 0 +3
    MessageBox MB_ICONSTOP "ReCord Setup requires Windows 10 or newer. Current build: $OsBuildNumber"
    Abort

  StrCpy $IsWin11 0
  IntCmp $OsBuildNumber ${WIN11_BUILD} 0 +2 +2
    StrCpy $IsWin11 1
FunctionEnd

Section "Uninstall"
  Delete "$DESKTOP\\ReCord Installer.lnk"
  Delete "$SMPROGRAMS\\ReCord\\Install ReCord.lnk"
  Delete "$SMPROGRAMS\\ReCord\\Repair ReCord.lnk"
  Delete "$SMPROGRAMS\\ReCord\\Uninstall ReCord Patch.lnk"
  Delete "$SMPROGRAMS\\ReCord\\Uninstall ReCord Setup.lnk"
  Delete "$SMPROGRAMS\\ReCord\\ReCord Folder.lnk"
  RMDir "$SMPROGRAMS\\ReCord"

  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\\ReCord"
  DeleteRegKey HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ReCord"
SectionEnd
