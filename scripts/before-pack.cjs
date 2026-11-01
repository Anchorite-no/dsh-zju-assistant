const { checkRuntimeDependencies } = require('./runtime-deps.cjs')
module.exports = context => {
  // Node, FFmpeg and native addons are installed for the build machine.
  const arch = { 1: 'x64', 3: 'arm64' }[context.arch]
  if (context.electronPlatformName !== process.platform || arch !== process.arch) {
    throw new Error('请在目标系统和架构上安装依赖并打包；不支持交叉打包。')
  }
  checkRuntimeDependencies(context.packager.projectDir)
}
