# 安装程序里我们自己加的部分（package.json 的 build.nsis.include）。
# electron-builder 的安装程序是照它自己的模板拼出来的（node_modules/app-builder-lib/templates/nsis），
# 模板在几个位置留了名字固定的宏给项目插东西，这里用到三个：
#   customWelcomePage         最前面，可以加一页
#   customPageAfterChangeDir  选完安装位置之后、开始装之前，可以加一页
#   customInstall             文件装完、快捷方式建好之后
# 这个文件比模板先读进来，模板里的变量和函数这时还没有，所以代码都写在宏里，等模板插到那个位置时才展开。
# 文字两种语言各写一份（2052 简体中文，1033 英文），和安装程序带的语言（build.nsis.installerLanguages）一一对应：
# 哪边多出一种，打包都会因为那种语言缺文字而失败（NSIS 的警告在这里当错误算）。系统是中文的显示中文，别的显示英文。

!include LogicLib.nsh
!include nsDialogs.nsh
!include FileFunc.nsh

LangString campusTasksTitle 2052 "选择附加任务"
LangString campusTasksTitle 1033 "Select Additional Tasks"
LangString campusTasksSubtitle 2052 "确认安装位置，选择要不要在桌面上放快捷方式。"
LangString campusTasksSubtitle 1033 "Confirm the install location and choose whether to add a desktop shortcut."
LangString campusInstallTo 2052 "$(^NameDA) 将安装到下面这个文件夹。要换位置，请单击 [上一步]。"
LangString campusInstallTo 1033 "$(^NameDA) will be installed in the folder below. To change it, click Back."
LangString campusDesktopShortcut 2052 "创建桌面快捷方式(&D)"
LangString campusDesktopShortcut 1033 "Create a &desktop shortcut"
LangString campusNoWrite 2052 "这个位置写不进文件：$\r$\n$INSTDIR$\r$\n$\r$\n请单击 [上一步] 换一个位置。"
LangString campusNoWrite 1033 "Setup cannot write to this location:$\r$\n$INSTDIR$\r$\n$\r$\nClick Back and choose another folder."

# 安装位置的路径最长能有多少个字符。打包时 scripts/after-pack.cjs 按成品里最深的文件算好（installDirRoom），放在环境变量里，
# 这里编译时读进来。没有这个环境变量时（拿现成的文件夹直接打安装程序，不经过 after-pack）不查长度：
# 那时下面这一行读到的是「$%CAMPUS_INSTALL_DIR_MAX%」这串字本身，里面还带着变量名，靠这一点认出来。
!define CAMPUS_DIR_MAX "$%CAMPUS_INSTALL_DIR_MAX%"
!searchreplace CAMPUS_DIR_MAX_BARE "${CAMPUS_DIR_MAX}" "CAMPUS_INSTALL_DIR_MAX" ""
!if "${CAMPUS_DIR_MAX_BARE}" == "${CAMPUS_DIR_MAX}"
  !define CAMPUS_CHECK_DIR_LENGTH
!endif
LangString campusTooLong 2052 "安装位置的路径太长（最多 ${CAMPUS_DIR_MAX} 个字符，现在有 $0 个）：$\r$\n$INSTDIR$\r$\n$\r$\n请单击 [上一步] 换一个层数少一些的位置。"
LangString campusTooLong 1033 "The install location is too long (at most ${CAMPUS_DIR_MAX} characters, this one has $0):$\r$\n$INSTDIR$\r$\n$\r$\nClick Back and choose a shorter path."

# 选位置时可以直接选盘符（「D:\」）。NSIS 默认不让，[下一步] 是灰的，也不说为什么；
# 放开以后也不会真装到根上：下面的 campusSettleDir 会在后面补上以应用名命名的文件夹（D:\CampusAgent）。
AllowRootDirInstall true

# 最前面放一页欢迎页，模板自己不带。应用自己更新时不出。
!macro customWelcomePage
  !insertmacro skipPageIfUpdated
  !insertmacro MUI_PAGE_WELCOME
!macroend

# 选完位置以后的一页：写明最后装到哪个文件夹，问要不要桌面快捷方式。
!macro customPageAfterChangeDir
  Var campusDesktopBox
  Var campusDesktop

  # 模板原本在开始装之前用 instFilesPre 定安装位置，换成下面的 campusSettleDir（它里面还会用到 instFilesPre）。
  !ifdef MUI_PAGE_CUSTOMFUNCTION_PRE
    !undef MUI_PAGE_CUSTOMFUNCTION_PRE
  !endif

  # 定下最后装到哪个文件夹（$INSTDIR）。连着走几遍结果不变：这一页每次出来走一遍，开始装之前再走一遍。
  # 卸载和升级都会把安装文件夹整个删掉，所以应用要有一个只属于它自己的文件夹。
  Function campusSettleDir
    # 选的是盘符根目录时末尾带反斜杠（「D:\」），去掉
    StrCpy $0 $INSTDIR 1 -1
    ${If} $0 == "\"
      StrCpy $INSTDIR $INSTDIR -1
    ${EndIf}

    # 这个文件夹里已经装着本应用（程序和卸载程序都在）：原地装，不然重装会在自己里面再套一层。
    # 盘符根目录（「D:」）不算，里面有什么都不往根上装。
    StrLen $0 $INSTDIR
    ${If} $0 > 2
    ${AndIf} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    ${AndIf} ${FileExists} "$INSTDIR\${UNINSTALL_FILENAME}"
      Return
    ${EndIf}

    ${DirState} "$INSTDIR" $0
    ${If} $0 == 1
      # 文件夹里有别的东西：装进它下面以应用名命名的子文件夹
      StrCpy $INSTDIR "$INSTDIR\${APP_FILENAME}"
    ${Else}
      # 空的或者还没有：模板的规矩，路径里不带应用名就在后面补一层
      Call instFilesPre
    ${EndIf}
  FunctionEnd

  Function campusTasksShow
    # 应用自己更新时不问
    ${If} ${isUpdated}
      Abort
    ${EndIf}
    Call campusSettleDir

    !insertmacro MUI_HEADER_TEXT "$(campusTasksTitle)" "$(campusTasksSubtitle)"
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 20u "$(campusInstallTo)"
    Pop $0
    # 只读的输入框：路径太长时能左右拖着看，也能复制
    ${NSD_CreateText} 0 24u 100% 13u "$INSTDIR"
    Pop $0
    SendMessage $0 ${EM_SETREADONLY} 1 0

    ${NSD_CreateCheckbox} 0 52u 100% 12u "$(campusDesktopShortcut)"
    Pop $campusDesktopBox
    ${If} $campusDesktop != ${BST_UNCHECKED}
      ${NSD_Check} $campusDesktopBox
    ${EndIf}

    nsDialogs::Show
  FunctionEnd

  Function campusTasksLeave
    ${NSD_GetState} $campusDesktopBox $campusDesktop

    # 位置太深的话，应用里路径最长的那些文件解不出来，装到一半报「Failed to decompress files」。
    !ifdef CAMPUS_CHECK_DIR_LENGTH
      StrLen $0 $INSTDIR
      ${If} $0 > ${CAMPUS_DIR_MAX}
        MessageBox MB_OK|MB_ICONEXCLAMATION "$(campusTooLong)"
        Abort
      ${EndIf}
    !endif

    # 开始装之前先看这个位置写不写得进去（只读的盘、连管理员也没有权限的文件夹）。不看的话要等解压失败才知道，
    # 那时旧版本已经卸掉了。往上找到第一个已经有的文件夹，在里面建一个空文件试一下。
    StrCpy $1 $INSTDIR
    ${DoUntil} ${FileExists} "$1\*.*"
      ${GetParent} "$1" $2
      ${If} $2 == ""
        ${ExitDo}
      ${EndIf}
      StrCpy $1 $2
    ${Loop}
    ClearErrors
    FileOpen $0 "$1\campus-agent-write-test.tmp" w
    ${If} ${Errors}
      MessageBox MB_OK|MB_ICONEXCLAMATION "$(campusNoWrite)"
      Abort
    ${EndIf}
    FileClose $0
    Delete "$1\campus-agent-write-test.tmp"
  FunctionEnd

  Page custom campusTasksShow campusTasksLeave
  !define MUI_PAGE_CUSTOMFUNCTION_PRE campusSettleDir
!macroend

# 模板这时已经把桌面快捷方式建好了；上一页没勾就拿掉。静默安装（应用自己更新）没有出过那一页，不动。
!macro customInstall
  ${IfNot} ${Silent}
  ${AndIf} $campusDesktop == ${BST_UNCHECKED}
    WinShell::UninstShortcut "$newDesktopLink"
    Delete "$newDesktopLink"
    System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
  ${EndIf}
!macroend
