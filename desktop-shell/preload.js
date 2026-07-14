const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('agentStudioDesktop', {
  platform: process.platform,
  desktopShell: true,
});
