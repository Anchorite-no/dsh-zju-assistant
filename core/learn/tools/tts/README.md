# 讲解配音：千问 Qwen3-TTS

此目录从 Learning `1e7f1c5` 同步，桌面端在此基础上管理选装和播放。模型为 `Qwen3-TTS-12Hz-1.7B-Base`，运行库为 `faster-qwen3-tts==0.5.4`。默认不安装、不下载模型、不占用显存。

## 安装与使用

在「插件 → 课程讲解 → 讲解配音」先检测环境，再点「安装配音」。建议 RTX 5060 级别、8 GB 显存及以上；不会按型号硬拦截，实际检查 NVIDIA 驱动、BF16 能力、显存、系统内存和磁盘空间。当前安装器支持 Windows x64。

安装自动准备独立 Python 3.11、PyTorch 2.8.0/cu128、锁定的 TTS 依赖和约 4.54 GB 模型；不依赖系统 Python、uv 或 npm，不改系统 PATH。预计下载约 8 GB，安装位置预留 25 GB。安装器和模型文件均校验 SHA-256；模型清单在 `model.json`，依赖版本在 `requirements.txt`。下载或安装失败不写完成标记，重新安装会复用校验通过的模型文件。

安装后添加一段本人有权使用的中文 WAV 参考音频（建议 5–15 秒，最多 20 MB），填写其中的原话，再开启「播放时配音」。从学习页打开讲解时使用朗读器；关闭播放窗口或关闭配音开关即停止服务。音频保存在本机，不上传给模型服务。

每次启动重新检查空闲显存和系统提交内存。至少需要 5.5 GB 空闲显存和 20 GB 提交内存余量；不足时报告原因，不硬加载。未安装、未启用配音时仍使用原来的画面和字幕播放器。

## 数据位置

- `%APPDATA%\CampusAgent\tools\qwen-tts`：独立 Python、虚拟环境、模型和安装缓存；插件卸载删除这一目录。
- `%APPDATA%\CampusAgent\tts\voices`：用户导入的参考音色；卸载运行环境时保留。
- `%APPDATA%\CampusAgent\tts\out`：生成的音频、字幕和加载耗时记录；卸载运行环境时保留。
- 「文档」中的 `CampusAgent\讲解\dist`：成片；不随配音卸载删除。

自定义应用数据目录时以上路径跟随变化。安装目录只放代码，所有运行数据都在用户目录中。独立 Learning 的私人音色、模型、字体和学习资料不随应用分发。

## 实现

- `ui/profile/tts.mjs`：环境检测、设置、音色、进程启停和生命周期。
- `ui/profile/tts-install.mjs`：独立运行环境及模型安装；使用现有 Node 分段下载器。
- `desktop_host.py`：Electron 朗读器使用的私有本机服务。随机端口、启动令牌和 HttpOnly Cookie，不继承独立版的跨站通配访问。
- `engine.py`、`phrases.py`、`serve.py`、`app.html`：新版 Learning 的合成、连续语段、缓存、字幕时间轴和播放实现。
- `desktop/film.cjs`：打开播放窗口，关闭窗口时释放服务。

模型仅在用户开启配音并打开讲解时加载。朗读器使用 Electron，不需要 pywebview。旧 IndexTTS 启动脚本已移除。

## 配音语言和译文

默认中文，`LESSON.dub` 为 `zh`。中文字幕有 `tts` 时读 `tts`，否则读字幕；公式、负数和缩写用清楚的中文读法。中文读法只影响声音，不改画面字幕。

用户明确要求其他语言时才制作 `dub.<语言>.json`，按字幕编号写每句译文。当前插件导入的是中文参考音色，其他语言还需适合该语言的参考音色；不能将翻译完成等同于配音验收。

动画使用句子时间和 `V.at(编号, '句中几个字')`，配音到达后按实际时长重排。语段缓存区分模型、音色、原话和文本，换音色或改稿时重新合成相应内容。

## 验证

`node core/learn/tools/tts/test_reader.mjs` 验证连续播放、跳转、暂停和语段边界。`node --test ui/profile/tts.test.mjs` 验证选装、硬件限制、文件校验和卸载边界。

已有独立 Python 环境时可运行 `python -B -m unittest discover -s core/learn/tools/tts -p "test_*.py"`。这些测试使用合成的参考音频、模拟模型和本机测试服务，不下载或加载 GPU 模型。它们不代替实际安装和真实语音效果验收。
