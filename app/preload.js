const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('minecraftLauncher', {
  fetchVersions: () => ipcRenderer.invoke('fetch-versions'),
  fetchInstalledVersions: () => ipcRenderer.invoke('fetch-installed-versions'),
  fetchAllVersions: () => ipcRenderer.invoke('fetch-all-versions'),
  fetchJava: () => ipcRenderer.invoke('fetch-java'),
  getVersionInfo: (versionId) => ipcRenderer.invoke('get-version-info', versionId),
  createModdedVersion: (payload) => ipcRenderer.invoke('create-modded-version', payload),
  searchModrinth: (payload) => ipcRenderer.invoke('search-modrinth', payload),
  installMod: (payload) => ipcRenderer.invoke('install-mod', payload),
  listInstalledMods: (profileName) => ipcRenderer.invoke('list-installed-mods', profileName),
  removeMod: (payload) => ipcRenderer.invoke('remove-mod', payload),
  downloadVersion: (version) => ipcRenderer.invoke('download-version', version),
  launchGame: (payload) => ipcRenderer.invoke('launch-game', payload),
  onLog: (callback) => ipcRenderer.on('log', (_event, message) => callback(message)),
  onProgress: (callback) => ipcRenderer.on('progress', (_event, data) => callback(data))
});
