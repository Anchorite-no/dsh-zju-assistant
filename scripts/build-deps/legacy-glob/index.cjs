// electron-winstaller -> temp -> rimraf 2 uses the callback-era glob API.
// Delegate traversal and matching to patched glob rather than retaining glob 7
// internals coupled to private fields in older minimatch versions.
const current = require('glob-v14')

function options(value) {
  return { windowsPathsNoEscape: process.platform === 'win32', ...value }
}

function results(files, pattern, opts) {
  if (!files.length && opts.nonull) return [pattern]
  if (process.platform === 'win32') files = files.map(file => file.replaceAll('\\', '/'))
  return opts.nosort ? files : files.sort((a, b) => a.localeCompare(b, 'en'))
}

function glob(pattern, opts, callback) {
  if (typeof opts === 'function') { callback = opts; opts = {} }
  opts = options(opts)
  const pending = current.glob(pattern, opts).then(files => results(files, pattern, opts))
  if (callback) pending.then(files => callback(null, files), error => callback(error))
  return pending
}

glob.glob = glob
glob.sync = (pattern, opts) => {
  opts = options(opts)
  return results(current.globSync(pattern, opts), pattern, opts)
}
glob.hasMagic = (pattern, opts) => current.hasMagic(pattern, { magicalBraces: true, ...options(opts) })

module.exports = glob
