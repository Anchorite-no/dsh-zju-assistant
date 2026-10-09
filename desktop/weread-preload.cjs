const { contextBridge, ipcRenderer } = require('electron')
// The only exposed capability is delivery of the current Tencent verification result.
contextBridge.exposeInMainWorld('campusWereadVerification', {
  complete: result => ipcRenderer.invoke('campus:weread-proof', {
    taskId: result?.taskId, ret: result?.ret, ticket: result?.ticket, randstr: result?.randstr,
  }),
})
