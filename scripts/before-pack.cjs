const { checkRuntimeDependencies } = require('./runtime-deps.cjs')
module.exports = context => { checkRuntimeDependencies(context.packager.projectDir) }
