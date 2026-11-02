# 第三方代码与素材

项目自有代码采用 GNU General Public License 第 3 版，仅限该版本（`GPL-3.0-only`），全文见 [LICENSE](LICENSE)。第三方代码、依赖、字体及其他素材保留原有版权声明和许可，项目许可证不会替换这些许可。

- `core/zju/lib/xuezai/rollcall.ts` 的雷达签到流程、校区参考点坐标和球面距离拟合（100 位 Decimal 的 Gauss-Newton 三边测量）移植自 [5dbwat4/ZJU-live-better](https://github.com/5dbwat4/ZJU-live-better) 的 `courses.zju/autosign.js`，拟合部分由 5dbwat4 在提交 `466e2bd`（2025-12-10）加入，版权归该仓库的各位贡献者。上游以 GNU GPL 第 3 版发布：仓库附 GPL v3 全文，源文件本身不带许可标注。这段代码先进入本项目作者自用、未公开的整理版 `ZJU-Course-Autosign`（`src/core.js`，从上游 `9f3fec5` 改写），再经 zju skill 于 2026-11-01 引入本项目，按 `GPL-3.0-only` 分发；相对上游的改动写在该文件开头的注释里。
- 微信数据库格式相关来源及 MIT 许可全文见 [core/wechat/THIRD_PARTY_NOTICES.txt](core/wechat/THIRD_PARTY_NOTICES.txt)、[core/weread/THIRD_PARTY_NOTICES.txt](core/weread/THIRD_PARTY_NOTICES.txt) 和 [plans/dingtalk-wechat/THIRD_PARTY_NOTICES.txt](plans/dingtalk-wechat/THIRD_PARTY_NOTICES.txt)。
- 宣传片工程使用的 GSAP 保留其 Standard License，见 [video/vendor/GSAP-LICENSE.txt](video/vendor/GSAP-LICENSE.txt) 及同目录的完整条款；它不按本项目的 GPL 重新授权。
- 宣传片字体使用 SIL Open Font License 1.1，版权和许可见 [video/assets/fonts/LICENSES.md](video/assets/fonts/LICENSES.md) 与同目录的 `OFL.txt`。朗读工具字体的来源见 [core/learn/tools/tts/fonts/README.md](core/learn/tools/tts/fonts/README.md)。
- npm 安装的 DeepSeek Harness、Electron、FFmpeg 等组件沿用各包附带的许可证。`ffmpeg-static` 标注为 `GPL-3.0-or-later`；随包提供的 FFmpeg 二进制另附其构建和许可说明。
- macOS 版的液态玻璃效果使用 `electron-liquid-glass`（Meridius Labs，MIT），随 Mac 安装包分发其预编译的原生模块；许可全文在包内的 `LICENSE`。
- 随包的独立 Node.js 24.19.0 运行时通过 `node-win-x64`（Windows）、`node-bin-darwin-arm64` 和 `node-darwin-x64`（macOS 的 Apple 芯片和 Intel）提供。Node.js 及内含第三方组件的完整声明来自 [上游 v24.19.0 LICENSE](https://github.com/nodejs/node/blob/v24.19.0/LICENSE)，保存在 [build/licenses/NODE-LICENSE.txt](build/licenses/NODE-LICENSE.txt)，随源码与安装包保留。

分发修改版或安装包时，须保留适用的第三方声明，并按 GPL 和各组件许可证履行相应的源码提供及分发义务。上面是仓库内明确保留的来源索引，不替代依赖包各自的完整许可文本。
