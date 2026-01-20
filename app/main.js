const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const dns = require('dns');
const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const lzma = require('lzma');

app.disableHardwareAcceleration();

const MANUAL_JAVA_PATH = '';
const MANIFEST_URL = 'https://launchermeta.mojang.com/mc/game/version_manifest.json';

let mainWindow;
let cachedManifest = null;
let isPreparingGame = false;
let cancelPreparation = false;
let currentDownloadStats = null;

const minecraftDir = path.join(app.getPath('appData'), '.minecraft');
const versionsDir = path.join(minecraftDir, 'versions');
const librariesDir = path.join(minecraftDir, 'libraries');
const assetsDir = path.join(minecraftDir, 'assets');
const assetIndexesDir = path.join(assetsDir, 'indexes');
const assetsObjectsDir = path.join(assetsDir, 'objects');
const nativesBaseDir = path.join(minecraftDir, 'natives');
const MODS_METADATA_FILE = '.launcher-mods.json';
const RESOURCEPACKS_METADATA_FILE = '.launcher-resourcepacks.json';
const SHADERPACKS_METADATA_FILE = '.launcher-shaderpacks.json';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.setMenuBarVisibility(false);
  mainWindow.removeMenu();
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function log(message) {
  if (mainWindow) {
    mainWindow.webContents.send('log', message);
  }
}

function reportProgress(stage, current, total, downloadStats = null) {
  if (mainWindow) {
    mainWindow.webContents.send('progress', { stage, current, total, downloadStats });
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getVersionPaths(versionId) {
  const versionDir = path.join(versionsDir, versionId);
  return {
    versionDir,
    librariesDir,
    assetsDir,
    assetsIndexesDir: assetIndexesDir,
    assetsObjectsDir,
    nativesDir: path.join(versionDir, 'natives'),
    downloadsDir: path.join(versionDir, 'downloads'),
    configDir: path.join(versionDir, 'config'),
    dataDir: path.join(versionDir, 'data'),
    logsDir: path.join(versionDir, 'logs'),
    resourcepacksDir: path.join(versionDir, 'resourcepacks'),
    savesDir: path.join(versionDir, 'saves'),
    screenshotsDir: path.join(versionDir, 'screenshots'),
    serverResourcePacksDir: path.join(versionDir, 'server-resource-packs'),
    shaderpacksDir: path.join(versionDir, 'shaderpacks'),
    modsDir: path.join(versionDir, 'mods'),
    metadataPath: path.join(versionDir, 'launcher-metadata.json')
  };
}

function ensureVersionRuntimeLayout(versionId, isModded) {
  const paths = getVersionPaths(versionId);
  ensureDir(paths.versionDir);
  ensureDir(paths.downloadsDir);
  ensureDir(paths.configDir);
  ensureDir(paths.dataDir);
  ensureDir(paths.logsDir);
  ensureDir(paths.resourcepacksDir);
  ensureDir(paths.savesDir);
  ensureDir(paths.screenshotsDir);
  ensureDir(paths.serverResourcePacksDir);
  ensureDir(paths.shaderpacksDir);
  ensureDir(paths.nativesDir);
  if (isModded) {
    ensureDir(paths.modsDir);
  }
  const optionsPath = path.join(paths.versionDir, 'options.txt');
  const serversPath = path.join(paths.versionDir, 'servers.dat');
  const historyPath = path.join(paths.versionDir, 'command_history.txt');
  if (!fs.existsSync(optionsPath)) fs.writeFileSync(optionsPath, '');
  if (!fs.existsSync(serversPath)) fs.writeFileSync(serversPath, '');
  if (!fs.existsSync(historyPath)) fs.writeFileSync(historyPath, '');
  if (!fs.existsSync(paths.metadataPath)) {
    fs.writeFileSync(paths.metadataPath, JSON.stringify({
      versionId,
      isModded,
      createdAt: new Date().toISOString()
    }, null, 2));
  }
  return paths;
}

function listInstalledVersions() {
  if (!fs.existsSync(versionsDir)) return [];
  const entries = fs.readdirSync(versionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => {
      const jsonPath = path.join(versionsDir, name, `${name}.json`);
      return fs.existsSync(jsonPath);
    });
  return entries;
}

async function listAllVersionsSorted() {
  let manifest;
  try {
    manifest = await getManifestWithRetry({ attempts: 3, baseDelayMs: 200 });
  } catch (error) {
    const online = await hasInternetConnection();
    if (online) throw error;
    log('Offline detected. Using installed versions only.');
    const installedOnly = listInstalledVersions();
    const combinedOffline = installedOnly.map((versionId) => {
      const json = loadVersionJson(versionId);
      const meta = getLauncherMetadata(json);
      const baseVersion = meta?.baseVersion || json?.inheritsFrom || null;
      return {
        id: versionId,
        type: json?.type || 'custom',
        releaseTime: json?.releaseTime || json?.time || null,
        isInstalled: true,
        isCustom: Boolean(baseVersion),
        baseVersion
      };
    });
    combinedOffline.sort((a, b) => {
      const aTime = a.releaseTime ? Date.parse(a.releaseTime) : 0;
      const bTime = b.releaseTime ? Date.parse(b.releaseTime) : 0;
      if (aTime !== bTime) return bTime - aTime;
      return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
    });
    return combinedOffline;
  }

  const releases = manifest.versions || [];
  const installed = new Set(listInstalledVersions());
  const releaseMap = new Map(releases.map((version) => [version.id, version]));

  const combined = [];

  releases.forEach((version) => {
    combined.push({
      id: version.id,
      type: version.type,
      releaseTime: version.releaseTime || version.time || null,
      isInstalled: installed.has(version.id),
      isCustom: false,
      baseVersion: null
    });
  });

  installed.forEach((versionId) => {
    if (releaseMap.has(versionId)) return;
    const json = loadVersionJson(versionId);
    const meta = getLauncherMetadata(json);
    const baseVersion = meta?.baseVersion || json?.inheritsFrom || null;
    const baseRelease = baseVersion ? releaseMap.get(baseVersion) : null;
    combined.push({
      id: versionId,
      type: 'custom',
      releaseTime: baseRelease?.releaseTime || null,
      isInstalled: true,
      isCustom: true,
      baseVersion,
      loader: meta?.loader || null
    });
  });

  combined.sort((a, b) => {
    const aTime = a.releaseTime ? Date.parse(a.releaseTime) : 0;
    const bTime = b.releaseTime ? Date.parse(b.releaseTime) : 0;
    if (aTime !== bTime) return bTime - aTime;
    return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
  });

  return combined;
}

function loadVersionJson(versionId) {
  const versionJsonPath = path.join(versionsDir, versionId, `${versionId}.json`);
  if (!fs.existsSync(versionJsonPath)) return null;
  return JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'));
}

function resolveVersionChain(versionId) {
  const chain = [];
  let currentId = versionId;
  let currentJson = loadVersionJson(currentId);

  while (currentJson) {
    chain.push({ id: currentId, json: currentJson });
    if (!currentJson.inheritsFrom) break;
    currentId = currentJson.inheritsFrom;
    currentJson = loadVersionJson(currentId);
  }

  chain.reverse();

  const libraries = [];
  const gameArguments = [];
  const jvmArguments = [];
  const jarIds = [];
  let mainClass;
  let assetIndex;

  for (const { id, json } of chain) {
    if (Array.isArray(json.libraries)) {
      libraries.push(...json.libraries);
    }
    if (json.mainClass) {
      mainClass = json.mainClass;
    }
    if (json.assetIndex) {
      assetIndex = json.assetIndex;
    }

    if (json.arguments) {
      if (Array.isArray(json.arguments.game)) {
        gameArguments.push(...json.arguments.game);
      }
      if (Array.isArray(json.arguments.jvm)) {
        jvmArguments.push(...json.arguments.jvm);
      }
    }

    const candidateJarId = json.jar || id;
    const candidateJarPath = path.join(versionsDir, candidateJarId, `${candidateJarId}.jar`);
    const jarExists = fs.existsSync(candidateJarPath);
    
    if (jarExists) {
      jarIds.push(candidateJarId);
    }
  }

  return {
    libraries,
    mainClass,
    assetIndex,
    jarIds: jarIds.length > 0 ? jarIds : [versionId],
    gameArguments,
    jvmArguments
  };
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(fetchJson(res.headers.location));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Failed to fetch ${url} (${res.statusCode})`));
        }
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on('error', reject);
  });
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(fetchText(res.headers.location));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Failed to fetch ${url} (${res.statusCode})`));
        }
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => resolve(data));
      })
      .on('error', reject);
  });
}

function getModsDir(profileName) {
  return getVersionPaths(profileName).modsDir;
}

function loadModsMetadata(profileName) {
  const modsDir = getModsDir(profileName);
  const metadataPath = path.join(modsDir, MODS_METADATA_FILE);
  if (!fs.existsSync(metadataPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) || {};
  } catch (error) {
    return {};
  }
}

function saveModsMetadata(profileName, metadata) {
  const modsDir = getModsDir(profileName);
  ensureDir(modsDir);
  const metadataPath = path.join(modsDir, MODS_METADATA_FILE);
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
}

function listInstalledMods(profileName) {
  const modsDir = getModsDir(profileName);
  ensureDir(modsDir);
  const metadata = loadModsMetadata(profileName);
  const result = [];
  let changed = false;

  Object.entries(metadata).forEach(([projectId, info]) => {
    if (!info?.file) return;
    const filePath = path.join(modsDir, info.file);
    if (!fs.existsSync(filePath)) {
      delete metadata[projectId];
      changed = true;
      return;
    }
    result.push({
      projectId,
      title: info.title,
      iconUrl: info.iconUrl,
      author: info.author,
      file: info.file
    });
  });

  if (changed) {
    saveModsMetadata(profileName, metadata);
  }

  return result;
}

function getResourcepacksDir(profileName) {
  return getVersionPaths(profileName).resourcepacksDir;
}

function loadResourcepacksMetadata(profileName) {
  const resourcepacksDir = getResourcepacksDir(profileName);
  const metadataPath = path.join(resourcepacksDir, RESOURCEPACKS_METADATA_FILE);
  if (!fs.existsSync(metadataPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) || {};
  } catch (error) {
    return {};
  }
}

function saveResourcepacksMetadata(profileName, metadata) {
  const resourcepacksDir = getResourcepacksDir(profileName);
  ensureDir(resourcepacksDir);
  const metadataPath = path.join(resourcepacksDir, RESOURCEPACKS_METADATA_FILE);
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
}

function getShaderpacksDir(profileName) {
  return getVersionPaths(profileName).shaderpacksDir;
}

function loadShaderpacksMetadata(profileName) {
  const shaderpacksDir = getShaderpacksDir(profileName);
  const metadataPath = path.join(shaderpacksDir, SHADERPACKS_METADATA_FILE);
  if (!fs.existsSync(metadataPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) || {};
  } catch (error) {
    return {};
  }
}

function saveShaderpacksMetadata(profileName, metadata) {
  const shaderpacksDir = getShaderpacksDir(profileName);
  ensureDir(shaderpacksDir);
  const metadataPath = path.join(shaderpacksDir, SHADERPACKS_METADATA_FILE);
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
}

function listInstalledShaderpacks(profileName) {
  const shaderpacksDir = getShaderpacksDir(profileName);
  ensureDir(shaderpacksDir);
  const metadata = loadShaderpacksMetadata(profileName);
  const result = [];
  let changed = false;

  Object.entries(metadata).forEach(([projectId, info]) => {
    if (!info?.file) return;
    const filePath = path.join(shaderpacksDir, info.file);
    if (!fs.existsSync(filePath)) {
      delete metadata[projectId];
      changed = true;
      return;
    }
    result.push({
      projectId,
      title: info.title,
      iconUrl: info.iconUrl,
      author: info.author,
      file: info.file
    });
  });

  if (changed) {
    saveShaderpacksMetadata(profileName, metadata);
  }

  return result;
}

function listInstalledResourcepacks(profileName) {
  const resourcepacksDir = getResourcepacksDir(profileName);
  ensureDir(resourcepacksDir);
  const metadata = loadResourcepacksMetadata(profileName);
  const result = [];
  let changed = false;

  Object.entries(metadata).forEach(([projectId, info]) => {
    if (!info?.file) return;
    const filePath = path.join(resourcepacksDir, info.file);
    if (!fs.existsSync(filePath)) {
      delete metadata[projectId];
      changed = true;
      return;
    }
    result.push({
      projectId,
      title: info.title,
      iconUrl: info.iconUrl,
      author: info.author,
      file: info.file
    });
  });

  if (changed) {
    saveResourcepacksMetadata(profileName, metadata);
  }

  return result;
}

function computeSha1(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha1');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function verifyFile(filePath, options = {}) {
  if (!fs.existsSync(filePath)) return false;
  const stats = fs.statSync(filePath);
  if (options.expectedSize && stats.size !== options.expectedSize) {
    return false;
  }
  if (options.expectedSha1) {
    const sha1 = await computeSha1(filePath);
    if (sha1.toLowerCase() !== options.expectedSha1.toLowerCase()) {
      return false;
    }
  }
  return true;
}

function downloadFile(url, destination, options = {}) {
  return new Promise(async (resolve, reject) => {
    if (fs.existsSync(destination)) {
      const ok = await verifyFile(destination, options);
      if (ok) return resolve(false);
      fs.unlinkSync(destination);
    }

    ensureDir(path.dirname(destination));
    const fileStream = fs.createWriteStream(destination);

    const request = https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fileStream.close();
        fs.unlinkSync(destination);
        return resolve(downloadFile(res.headers.location, destination));
      }
      if (res.statusCode !== 200) {
        fileStream.close();
        fs.unlinkSync(destination);
        return reject(new Error(`Failed to download ${url} (${res.statusCode})`));
      }
      
      // Track download progress
      let downloadedBytes = 0;
      const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
      const startTime = Date.now();
      let lastUpdate = startTime;
      let lastDownloadedBytes = 0;
      
      res.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        const now = Date.now();
        const timeDiff = (now - lastUpdate) / 1000; // seconds
        
        // Update speed every 500ms
        if (timeDiff >= 0.5) {
          const bytesDiff = downloadedBytes - lastDownloadedBytes;
          const speed = bytesDiff / timeDiff; // bytes per second
          const downloadedMB = (downloadedBytes / (1024 * 1024)).toFixed(2);
          const totalMB = totalBytes > 0 ? (totalBytes / (1024 * 1024)).toFixed(2) : '?';
          const speedMBps = (speed / (1024 * 1024)).toFixed(2);
          
          if (options.onProgress) {
            options.onProgress({
              downloadedMB,
              totalMB,
              speedMBps,
              downloadedBytes,
              totalBytes
            });
          }
          
          lastUpdate = now;
          lastDownloadedBytes = downloadedBytes;
        }
      });
      
      res.pipe(fileStream);
      fileStream.on('finish', async () => {
        fileStream.close(async () => {
          const ok = await verifyFile(destination, options);
          if (!ok) {
            if (fs.existsSync(destination)) fs.unlinkSync(destination);
            return reject(new Error(`Downloaded file failed verification: ${destination}`));
          }
          resolve(true);
        });
      });
    });

    request.on('error', (error) => {
      fileStream.close();
      if (fs.existsSync(destination)) fs.unlinkSync(destination);
      reject(error);
    });
  });
}

function getPlatformKey() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'osx';
  return 'linux';
}

function getNativeClassifier() {
  if (process.platform === 'win32') return 'natives-windows';
  if (process.platform === 'darwin') return 'natives-osx';
  return 'natives-linux';
}

function isLibraryAllowed(library) {
  if (!library.rules) return true;
  let allowed = false;
  for (const rule of library.rules) {
    const ruleApplies = !rule.os || rule.os.name === getPlatformKey();
    if (ruleApplies) {
      allowed = rule.action === 'allow';
    }
  }
  return allowed;
}

async function getManifest() {
  if (!cachedManifest) {
    log('Fetching versions...');
    cachedManifest = await fetchJson(MANIFEST_URL);
  }
  return cachedManifest;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getManifestWithRetry({ attempts = 3, baseDelayMs = 200 } = {}) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await getManifest();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        log(`Failed to fetch manifest. Retrying immediately...`);
        await delay(baseDelayMs);
      }
    }
  }
  throw lastError;
}

async function hasInternetConnection(timeoutMs = 2000) {
  const check = dns.promises
    .resolve('cloudflare.com')
    .then(() => true)
    .catch(() => false);
  const timeout = new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs));
  return Promise.race([check, timeout]);
}

function isForgeLikeLibrary(libraryName) {
  if (!libraryName) return false;
  return libraryName.startsWith('net.minecraftforge:forge:')
    || libraryName.startsWith('net.neoforged:neoforge:');
}

function buildLibraryPath(library, targetLibrariesDir) {
  const librariesRoot = targetLibrariesDir || librariesDir;
  if (library.downloads?.artifact?.path) {
    const artifactPath = library.downloads.artifact.path;
    if (artifactPath.endsWith('-client.jar') && isForgeLikeLibrary(library.name)) {
      return null;
    }
    return path.join(librariesRoot, artifactPath);
  }
  if (!library.name) return null;
  const artifactPath = buildMavenArtifactPath(library.name);
  return artifactPath ? path.join(librariesRoot, artifactPath) : null;
}

function buildNativePath(library, classifier) {
  if (!library.downloads || !library.downloads.classifiers) return null;
  const native = library.downloads.classifiers[classifier];
  if (!native) return null;
  return path.join(librariesDir, native.path);
}

function buildMavenArtifactPath(coordinates) {
  const parts = coordinates.split(':');
  if (parts.length < 3) return null;
  const [groupId, artifactId, version] = parts;
  const classifier = parts[3];
  const basePath = `${groupId.replace(/\./g, '/')}/${artifactId}/${version}`;
  const fileName = classifier
    ? `${artifactId}-${version}-${classifier}.jar`
    : `${artifactId}-${version}.jar`;
  return `${basePath}/${fileName}`;
}

async function extractNativeJar(jarPath, targetDir, excludes = []) {
  ensureDir(targetDir);
  const zip = new AdmZip(jarPath);
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    if (excludes.some((exclude) => entry.entryName.startsWith(exclude))) continue;
    zip.extractEntryTo(entry, targetDir, false, true);
  }
}

async function downloadLibraries(libraries, versionId, targetLibrariesDir, targetNativesDir) {
  const librariesList = Array.isArray(libraries) ? libraries : [];
  const allowedLibraries = librariesList.filter(isLibraryAllowed);
  const artifacts = [];
  const natives = [];
  const nativeClassifier = getNativeClassifier();

  for (const library of allowedLibraries) {
    if (cancelPreparation) {
      throw new Error('Download cancelled');
    }
    
    const artifact = library.downloads?.artifact;
    if (artifact && artifact.path) {
      let artifactPath = artifact.path;

      if (artifactPath.endsWith('-client.jar')) {
        if (isForgeLikeLibrary(library.name)) {
          continue;
        }
        artifactPath = artifactPath.replace('-client.jar', '.jar');
      }

      if (isForgeLikeLibrary(library.name)) {
        const mavenPath = buildMavenArtifactPath(library.name);
        if (mavenPath) {
          artifactPath = mavenPath;
        }
      }

      let artifactUrl = (typeof artifact.url === 'string' && artifact.url.trim().length > 0)
        ? artifact.url.trim()
        : `https://libraries.minecraft.net/${artifactPath}`;

      if (artifact.url && artifact.url.endsWith('-client.jar')) {
        artifactUrl = `https://libraries.minecraft.net/${artifactPath}`;
      }
        artifacts.push({
          url: artifactUrl,
        path: path.join(targetLibrariesDir, artifactPath),
          sha1: artifact.sha1,
          size: artifact.size
        });
    } else if (library.name) {
      const artifactPath = buildMavenArtifactPath(library.name);
      if (artifactPath) {
        const rawBaseUrl = (typeof library.url === 'string' && library.url.trim().length > 0)
          ? library.url.trim()
          : 'https://libraries.minecraft.net/';
        const url = `${rawBaseUrl.replace(/\/$/, '')}/${artifactPath}`;
        artifacts.push({
          url,
          path: path.join(targetLibrariesDir, artifactPath)
        });
      }
    }

    const native = library.downloads?.classifiers?.[nativeClassifier];
    if (native && native.path) {
      natives.push({
        url: native.url,
        path: path.join(targetLibrariesDir, native.path),
        extract: library.extract,
        sha1: native.sha1,
        size: native.size
      });
    }
  }

  let completed = 0;
  const total = artifacts.length + natives.length;
  reportProgress('Downloading libraries', completed, total);

  for (const item of artifacts) {
    if (cancelPreparation) {
      throw new Error('Download cancelled');
    }
    await downloadFile(item.url, item.path, { 
      expectedSha1: item.sha1, 
      expectedSize: item.size,
      onProgress: (stats) => {
        currentDownloadStats = stats;
        reportProgress('Downloading libraries', completed, total, stats);
      }
    });
    currentDownloadStats = null;
    completed += 1;
    reportProgress('Downloading libraries', completed, total);
  }

  ensureDir(targetNativesDir);
  for (const item of natives) {
    if (cancelPreparation) {
      throw new Error('Download cancelled');
    }
    await downloadFile(item.url, item.path, { 
      expectedSha1: item.sha1, 
      expectedSize: item.size,
      onProgress: (stats) => {
        currentDownloadStats = stats;
        reportProgress('Downloading libraries', completed, total, stats);
      }
    });
    currentDownloadStats = null;
    const exclude = item.extract?.exclude || [];
    await extractNativeJar(item.path, targetNativesDir, exclude);
    completed += 1;
    reportProgress('Downloading libraries', completed, total);
  }
}

async function downloadAssets(assetIndex) {
  if (!assetIndex?.url) return;

  log('Downloading asset index...');
  const assetIndexJson = await fetchJson(assetIndex.url);

  ensureDir(assetIndexesDir);

  const assetsIndexPath = path.join(assetIndexesDir, `${assetIndex.id}.json`);

  fs.writeFileSync(assetsIndexPath, JSON.stringify(assetIndexJson, null, 2));

  const objects = assetIndexJson.objects || {};
  const entries = Object.values(objects);
  let completed = 0;
  const total = entries.length;

  reportProgress('Downloading assets', completed, total);

  const concurrency = 8;
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < entries.length) {
      if (cancelPreparation) {
        throw new Error('Download cancelled');
      }
      
      const index = currentIndex;
      currentIndex += 1;
      const object = entries[index];
      const hash = object.hash;
      const subDir = hash.substring(0, 2);
      const objectPath = path.join(assetsObjectsDir, subDir, hash);
      const url = `https://resources.download.minecraft.net/${subDir}/${hash}`;
      await downloadFile(url, objectPath, { 
        expectedSha1: hash, 
        expectedSize: object.size,
        onProgress: (stats) => {
          currentDownloadStats = stats;
          reportProgress('Downloading assets', completed, total, stats);
        }
      });
      currentDownloadStats = null;
      completed += 1;
      reportProgress('Downloading assets', completed, total);
    }
  }

  ensureDir(assetsObjectsDir);
  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
}

function parseJavaVersion(output) {
  if (!output) return null;
  const match = output.match(/version\s+"([0-9]+)(?:\.([0-9]+))?(?:\.([0-9_]+))?.*"/i);
  if (!match) return null;
  const major = parseInt(match[1], 10);
  return Number.isNaN(major) ? null : major;
}

function getJavaInfo(javaPath) {
  try {
    const result = spawnSync(javaPath, ['-version'], { encoding: 'utf-8' });
    const output = `${result.stderr || ''}\n${result.stdout || ''}`;
    const major = parseJavaVersion(output);
    if (!major) return null;
    return { path: javaPath, major, raw: output.trim() };
  } catch (error) {
    return null;
  }
}

function dedupeJavaEntries(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    if (!entry || !entry.path) return false;
    const key = path.normalize(entry.path).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function collectJavaInstallations() {
  const candidates = [];

  if (MANUAL_JAVA_PATH && fs.existsSync(MANUAL_JAVA_PATH)) {
    candidates.push(MANUAL_JAVA_PATH);
  }

  const javaHome = process.env.JAVA_HOME;
  if (javaHome) {
    candidates.push(path.join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'));
  }

  if (process.platform === 'win32') {
    const programFiles = process.env['ProgramFiles'];
    const programFilesX86 = process.env['ProgramFiles(x86)'];
    const roots = [programFiles, programFilesX86].filter(Boolean);
    const vendors = ['Java', 'Eclipse Adoptium', 'Adoptium', 'Amazon Corretto', 'Microsoft', 'Zulu'];
    for (const root of roots) {
      for (const vendor of vendors) {
        const vendorPath = path.join(root, vendor);
        if (fs.existsSync(vendorPath)) {
          const installs = fs.readdirSync(vendorPath, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => path.join(vendorPath, entry.name, 'bin', 'java.exe'));
          candidates.push(...installs);
        }
      }
    }
  } else if (process.platform === 'darwin') {
    const macRoot = '/Library/Java/JavaVirtualMachines';
    if (fs.existsSync(macRoot)) {
      const installs = fs.readdirSync(macRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(macRoot, entry.name, 'Contents', 'Home', 'bin', 'java'));
      candidates.push(...installs);
    }
  } else {
    const linuxCandidates = [
      '/usr/bin/java',
      '/usr/local/bin/java'
    ];
    candidates.push(...linuxCandidates);
  }

  candidates.push('java');

  const entries = candidates
    .map((candidate) => getJavaInfo(candidate))
    .filter(Boolean);

  const deduped = dedupeJavaEntries(entries);
  deduped.sort((a, b) => b.major - a.major);
  return deduped;
}

function getPreferredJava(javaPath) {
  if (javaPath && fs.existsSync(javaPath)) {
    const info = getJavaInfo(javaPath);
    if (info) return info.path;
  }
  const installs = collectJavaInstallations();
  if (installs.length > 0) return installs[0].path;
  return null;
}

function getLauncherMetadata(versionJson) {
  if (versionJson?.launcher && typeof versionJson.launcher === 'object') {
    return versionJson.launcher;
  }
  return null;
}

function applyMemoryLimit(jvmArgs, memoryGb) {
  if (!memoryGb || Number.isNaN(memoryGb)) return;
  const memoryValue = Math.max(1, Math.floor(memoryGb));
  const filtered = jvmArgs.filter((arg) => !arg.startsWith('-Xmx') && !arg.startsWith('-Xms'));
  const minValue = Math.max(1, Math.min(2, Math.floor(memoryValue / 2) || 1));
  filtered.push(`-Xmx${memoryValue}G`, `-Xms${minValue}G`);
  jvmArgs.length = 0;
  jvmArgs.push(...filtered);
}

function assertValidClientJar(clientJarPath) {
  if (!fs.existsSync(clientJarPath)) {
    throw new Error(`Minecraft client JAR not found at ${clientJarPath}. Please ensure the vanilla version is properly installed.`);
  }
  try {
    const zip = new AdmZip(clientJarPath);
    const entry = zip.getEntry('net/minecraft/client/Minecraft.class');
    if (!entry) {
      throw new Error('Minecraft.class is missing');
    }
  } catch (error) {
    const message = error?.message || 'Unknown error';
    throw new Error(`Invalid Minecraft client JAR at ${clientJarPath}: ${message}`);
  }
}

function decompressLzma(buffer) {
  return new Promise((resolve, reject) => {
    lzma.decompress(buffer, (result, error) => {
      if (error) return reject(error);
      if (Buffer.isBuffer(result)) return resolve(result);
      if (result instanceof Uint8Array) return resolve(Buffer.from(result));
      if (typeof result === 'string') return resolve(Buffer.from(result, 'binary'));
      return resolve(Buffer.from(result));
    });
  });
}

function extractInstallerFile(installerPath, entryName, targetPath) {
  if (!installerPath || !fs.existsSync(installerPath)) return false;
  const zip = new AdmZip(installerPath);
  const entry = zip.getEntry(entryName);
  if (!entry) return false;
  const buffer = zip.readFile(entry);
  if (!buffer) return false;
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, buffer);
  return true;
}

async function buildForgeClientJarFromInstaller({ baseVersion, installerPath, targetPath, workDir }) {
  if (!installerPath || !fs.existsSync(installerPath)) {
    throw new Error('Forge installer not found. Cannot build client.jar.');
  }

  const javaExecutable = getPreferredJava();
  if (!javaExecutable) {
    throw new Error('Java not found. Cannot build Forge client.jar.');
  }

  ensureDir(workDir);

  const installProfile = extractInstallProfileFromInstaller(installerPath);
  const libsForTools = installProfile.libraries || [];
  const toolNativesDir = path.join(workDir, 'natives');

  await downloadLibraries(libsForTools, baseVersion, librariesDir, toolNativesDir);

  const libraryMap = new Map();
  for (const lib of libsForTools) {
    if (lib?.name) {
      const libPath = buildLibraryPath(lib, librariesDir);
      if (libPath) libraryMap.set(lib.name, libPath);
    }
  }

  const resolveLibraryPath = (name) => {
    if (libraryMap.has(name)) return libraryMap.get(name);
    const artifactPath = buildMavenArtifactPath(name);
    return artifactPath ? path.join(librariesDir, artifactPath) : null;
  };

  const clientLzmaPath = path.join(workDir, 'client.lzma');
  extractInstallerFile(installerPath, 'data/client.lzma', clientLzmaPath);

  const baseJarPath = path.join(versionsDir, baseVersion, `${baseVersion}.jar`);
  if (!fs.existsSync(baseJarPath)) {
    throw new Error(`Base version JAR not found at ${baseJarPath}.`);
  }

  const mojmapsPath = path.join(workDir, 'mojmaps.tsrg');
  const mcOffPath = path.join(workDir, 'minecraft_official.jar');
  const patchedPath = path.join(workDir, 'minecraft_patched.jar');

  const processors = Array.isArray(installProfile.processors) ? installProfile.processors : [];

  const replaceVars = (value, side) => {
    if (typeof value !== 'string') return value;
    return value
      .replaceAll('{SIDE}', side)
      .replaceAll('{MINECRAFT_JAR}', baseJarPath)
      .replaceAll('{MOJMAPS}', mojmapsPath)
      .replaceAll('{MC_OFF}', mcOffPath)
      .replaceAll('{BINPATCH}', clientLzmaPath)
      .replaceAll('{PATCHED}', patchedPath)
      .replaceAll('{INSTALLER}', installerPath)
      .replaceAll('{ROOT}', minecraftDir)
      .replaceAll('{MINECRAFT_VERSION}', baseVersion);
  };

  const runProcessor = async (processor, side) => {
    const jarPath = resolveLibraryPath(processor.jar);
    if (!jarPath) {
      throw new Error(`Processor jar not found: ${processor.jar}`);
    }
    const classpath = (processor.classpath || [])
      .map((name) => resolveLibraryPath(name))
      .filter(Boolean);
    const args = (processor.args || []).map((arg) => replaceVars(arg, side));
    await runJavaTool({ javaExecutable, jarPath, classpathEntries: classpath, args });
  };

  for (const processor of processors) {
    const sides = processor.sides || ['client', 'server'];
    if (!sides.includes('client')) continue;
    await runProcessor(processor, 'client');
  }

  const candidatePaths = [patchedPath, mcOffPath];
  const selected = candidatePaths.find((candidate) => fs.existsSync(candidate));
  if (!selected) {
    throw new Error('Forge client processing failed: no client jar output found.');
  }

  log(`Using client jar output: ${selected}`);
  fs.copyFileSync(selected, targetPath);
  assertValidClientJar(targetPath);
}

async function ensureClientJarFromBase({ baseVersion, targetPath, installerPath }) {
  const baseJarPath = path.join(versionsDir, baseVersion, `${baseVersion}.jar`);

  if (installerPath && fs.existsSync(installerPath)) {
    const workDir = path.join(path.dirname(targetPath), 'forge-cache');
    await buildForgeClientJarFromInstaller({
      baseVersion,
      installerPath,
      targetPath,
      workDir
    });
    return;
  }

  if (fs.existsSync(baseJarPath)) {
    assertValidClientJar(baseJarPath);
    log(`Copying vanilla client JAR to modded instance...`);
    fs.copyFileSync(baseJarPath, targetPath);
    assertValidClientJar(targetPath);
    return;
  }

  throw new Error(
    `Unable to build a valid Minecraft client JAR for ${baseVersion}. ` +
      'The vanilla jar is missing or invalid and the Forge installer is not available.'
  );
}

function resolveArguments(argumentsList, variables) {
  const resolved = [];

  for (const arg of argumentsList) {
    if (typeof arg === 'string') {
      resolved.push(replaceVariables(arg, variables));
    } else if (typeof arg === 'object' && arg.rules && arg.value) {
      if (evaluateRules(arg.rules)) {
        const values = Array.isArray(arg.value) ? arg.value : [arg.value];
        resolved.push(...values.map(v => replaceVariables(v, variables)));
      }
    }
  }

  return resolved;
}

function replaceVariables(str, variables) {
  return str.replace(/\$\{([^}]+)\}/g, (match, key) => {
    return variables[key] !== undefined ? variables[key] : match;
  });
}

function evaluateRules(rules) {
  for (const rule of rules) {
    const action = rule.action || 'allow';
    let matches = true;

    if (rule.os) {
      const osName = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux';
      if (rule.os.name && rule.os.name !== osName) {
        matches = false;
      }
    }

    if (rule.features) {
      matches = false;
    }

    if (action === 'allow' && matches) {
      return true;
    }
    if (action === 'disallow' && matches) {
      return false;
    }
  }

  return false;
}

function formatLoaderName(loader) {
  if (!loader) return '';
  if (loader === 'neoforge') return 'NeoForge';
  return `${loader.charAt(0).toUpperCase()}${loader.slice(1)}`;
}

function extractForgeVersionFromLibraries(libraries = []) {
  if (!Array.isArray(libraries)) return null;
  const forgeLib = libraries.find((lib) => typeof lib?.name === 'string' && lib.name.startsWith('net.minecraftforge:forge:'));
  if (forgeLib) {
    const parts = forgeLib.name.split(':');
    return parts[2] || null;
  }
  const neoforgeLib = libraries.find((lib) => typeof lib?.name === 'string' && lib.name.startsWith('net.neoforged:neoforge:'));
  if (neoforgeLib) {
    const parts = neoforgeLib.name.split(':');
    return parts[2] || null;
  }
  return null;
}

function extractMcVersionFromForgeVersion(forgeVersion) {
  if (!forgeVersion) return null;
  const dashIndex = forgeVersion.indexOf('-');
  return dashIndex === -1 ? null : forgeVersion.slice(0, dashIndex);
}

function extractForgeBuildFromForgeVersion(forgeVersion) {
  if (!forgeVersion) return null;
  const dashIndex = forgeVersion.indexOf('-');
  return dashIndex === -1 ? null : forgeVersion.slice(dashIndex + 1);
}

function extractMcpVersionFromLibraries(libraries = [], mcVersion) {
  if (!Array.isArray(libraries)) return null;
  const mcpLib = libraries.find((lib) => typeof lib?.name === 'string' && lib.name.startsWith('de.oceanlabs.mcp:mcp_config:'));
  if (!mcpLib) return null;
  const parts = mcpLib.name.split(':');
  const version = parts[2] || null;
  if (!version) return null;
  if (mcVersion && version.startsWith(`${mcVersion}-`)) {
    return version.slice(mcVersion.length + 1);
  }
  const dashIndex = version.indexOf('-');
  return dashIndex === -1 ? version : version.slice(dashIndex + 1);
}

function renameModdedVersion(oldId, newId) {
  if (!oldId || !newId) {
    throw new Error('Missing version id(s) for rename.');
  }
  if (oldId === newId) {
    return { id: newId };
  }

  const oldDir = path.join(versionsDir, oldId);
  const newDir = path.join(versionsDir, newId);
  if (!fs.existsSync(oldDir)) {
    throw new Error(`Version ${oldId} not found.`);
  }
  if (fs.existsSync(newDir)) {
    throw new Error(`Version ${newId} already exists.`);
  }

  const versionJson = loadVersionJson(oldId);
  if (!versionJson || !getLauncherMetadata(versionJson)?.modded) {
    throw new Error('Only modded versions can be renamed.');
  }

  fs.renameSync(oldDir, newDir);

  const oldJsonPath = path.join(newDir, `${oldId}.json`);
  const newJsonPath = path.join(newDir, `${newId}.json`);
  versionJson.id = newId;
  versionJson.jar = newId;
  fs.writeFileSync(newJsonPath, JSON.stringify(versionJson, null, 2));
  if (fs.existsSync(oldJsonPath)) {
    fs.unlinkSync(oldJsonPath);
  }

  const oldJarPath = path.join(newDir, `${oldId}.jar`);
  const newJarPath = path.join(newDir, `${newId}.jar`);
  if (fs.existsSync(oldJarPath)) {
    fs.renameSync(oldJarPath, newJarPath);
  }

  return { id: newId };
}

function deleteModdedVersion(versionId) {
  if (!versionId) {
    throw new Error('Missing version id for delete.');
  }
  const versionJson = loadVersionJson(versionId);
  if (!versionJson || !getLauncherMetadata(versionJson)?.modded) {
    throw new Error('Only modded versions can be deleted.');
  }
  const versionDir = path.join(versionsDir, versionId);
  if (fs.existsSync(versionDir)) {
    fs.rmSync(versionDir, { recursive: true, force: true });
  }
  return true;
}

function openVersionFolder(versionId) {
  if (!versionId) {
    throw new Error('Missing version id for open.');
  }
  const versionDir = path.join(versionsDir, versionId);
  if (!fs.existsSync(versionDir)) {
    throw new Error(`Version ${versionId} not found.`);
  }
  return shell.openPath(versionDir);
}

async function ensureBaseVersionDownloaded(versionId) {
  const versionDir = path.join(versionsDir, versionId);
  const versionJsonPath = path.join(versionDir, `${versionId}.json`);
  const versionJarPath = path.join(versionDir, `${versionId}.jar`);
  if (fs.existsSync(versionJsonPath) && fs.existsSync(versionJarPath)) {
    return;
  }
  await downloadVersionInternal(versionId);
}

async function downloadVersionInternal(versionId) {
  ensureDir(minecraftDir);
  ensureDir(versionsDir);

  log(`Downloading ${versionId}...`);

  const manifest = await getManifest();
  const entry = manifest.versions.find((version) => version.id === versionId);
  if (!entry) throw new Error(`Version ${versionId} not found`);

  const versionJson = await fetchJson(entry.url);
  const paths = ensureVersionRuntimeLayout(versionId, false);
  const versionDir = paths.versionDir;

  const versionJsonPath = path.join(versionDir, `${versionId}.json`);
  fs.writeFileSync(versionJsonPath, JSON.stringify(versionJson, null, 2));

  const clientJar = versionJson.downloads?.client;
  if (!clientJar?.url) throw new Error('Client jar not found in version json');

  const clientJarPath = path.join(versionDir, `${versionId}.jar`);
  reportProgress('Downloading client', 0, 1);
  await downloadFile(clientJar.url, clientJarPath, {
    expectedSha1: clientJar.sha1,
    expectedSize: clientJar.size,
    onProgress: (stats) => {
      currentDownloadStats = stats;
      reportProgress('Downloading client', 0, 1, stats);
    }
  });
  currentDownloadStats = null;
  reportProgress('Downloading client', 1, 1);

  log('Downloading libraries...');
  await downloadLibraries(versionJson.libraries, versionId, librariesDir, paths.nativesDir);

  log('Downloading assets...');
  await downloadAssets(versionJson.assetIndex);

  log('Download complete.');
}

async function getFabricProfile(baseVersion) {
  const loaderVersions = await fetchJson(`https://meta.fabricmc.net/v2/versions/loader/${baseVersion}`);
  if (!Array.isArray(loaderVersions) || loaderVersions.length === 0) {
    throw new Error(`Fabric does not support Minecraft ${baseVersion}`);
  }
  const entry = loaderVersions[0];
  const loader = entry?.loader?.version || entry?.version;
  let installer = entry?.installer?.version || null;
  if (!installer) {
    const installerVersions = await fetchJson('https://meta.fabricmc.net/v2/versions/installer');
    installer = installerVersions[0]?.version || null;
  }
  if (!loader) {
    throw new Error('Failed to resolve Fabric loader version');
  }
  if (!installer) {
    throw new Error('Failed to resolve Fabric installer version');
  }
  try {
    const url = `https://meta.fabricmc.net/v2/versions/loader/${baseVersion}/${loader}/${installer}/profile/json`;
    return await fetchJson(url);
  } catch (error) {
    const fallbackUrl = `https://meta.fabricmc.net/v2/versions/loader/${baseVersion}/${loader}/profile/json`;
    return fetchJson(fallbackUrl);
  }
}

async function getQuiltProfile(baseVersion) {
  const loaderVersions = await fetchJson(`https://meta.quiltmc.org/v3/versions/loader/${baseVersion}`);
  if (!Array.isArray(loaderVersions) || loaderVersions.length === 0) {
    throw new Error(`Quilt does not support Minecraft ${baseVersion}`);
  }
  const entry = loaderVersions[0];
  const loader = entry?.loader?.version || entry?.version;
  let installer = entry?.installer?.version || null;
  if (!installer) {
    const installerVersions = await fetchJson('https://meta.quiltmc.org/v3/versions/installer');
    installer = installerVersions[0]?.version || null;
  }
  if (!loader) {
    throw new Error('Failed to resolve Quilt loader version');
  }
  if (!installer) {
    throw new Error('Failed to resolve Quilt installer version');
  }
  try {
    const url = `https://meta.quiltmc.org/v3/versions/loader/${baseVersion}/${loader}/${installer}/profile/json`;
    return await fetchJson(url);
  } catch (error) {
    const fallbackUrl = `https://meta.quiltmc.org/v3/versions/loader/${baseVersion}/${loader}/profile/json`;
    return fetchJson(fallbackUrl);
  }
}

async function getForgeVersionForMc(baseVersion) {
  const promotions = await fetchJson('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
  const promos = promotions?.promos || {};
  const recommendedKey = `${baseVersion}-recommended`;
  const latestKey = `${baseVersion}-latest`;
  const forgeVersion = promos[recommendedKey] || promos[latestKey];
  if (!forgeVersion) return null;
  return `${baseVersion}-${forgeVersion}`;
}

async function getNeoForgeVersionForMc(baseVersion) {
  const metadata = await fetchText('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml');
  const versions = Array.from(metadata.matchAll(/<version>([^<]+)<\/version>/g)).map((match) => match[1]);
  const matching = versions.filter((version) => version.startsWith(`${baseVersion}-`));
  return matching.length > 0 ? matching[matching.length - 1] : versions[versions.length - 1];
}

async function extractVersionJsonFromInstaller(installerPath) {
  const zip = new AdmZip(installerPath);
  const entry = zip.getEntries().find((item) => item.entryName.endsWith('version.json'));
  if (!entry) {
    throw new Error('version.json not found in installer');
  }
  const content = zip.readAsText(entry);
  return JSON.parse(content);
}

function extractForgeJarFromInstaller(installerPath, loaderType, version, targetJarPath) {
  const zip = new AdmZip(installerPath);
  const prefix = loaderType === 'neoforge' ? 'neoforge' : 'forge';
  const jarNames = [
    `${prefix}-${version}.jar`,
    `${prefix}-${version}-universal.jar`,
    `${prefix}-${version}-client.jar`
  ];

  const entries = zip.getEntries();
  let selected = null;
  for (const name of jarNames) {
    selected = entries.find((entry) => entry.entryName.endsWith(name));
    if (selected) break;
  }

  if (!selected) return false;

  const buffer = zip.readFile(selected);
  if (!buffer) return false;
  ensureDir(path.dirname(targetJarPath));
  fs.writeFileSync(targetJarPath, buffer);
  return true;
}

function extractInstallProfileFromInstaller(installerPath) {
  const zip = new AdmZip(installerPath);
  const entry = zip.getEntry('install_profile.json');
  if (!entry) {
    throw new Error('install_profile.json not found in installer');
  }
  const content = zip.readAsText(entry);
  return JSON.parse(content);
}

function getJarMainClass(jarPath) {
  const zip = new AdmZip(jarPath);
  const entry = zip.getEntry('META-INF/MANIFEST.MF');
  if (!entry) return null;
  const content = zip.readAsText(entry);
  const lines = content.split(/\r?\n/);
  const mainLine = lines.find((line) => line.toLowerCase().startsWith('main-class:'));
  if (!mainLine) return null;
  return mainLine.split(':').slice(1).join(':').trim();
}

function runJavaTool({ javaExecutable, jarPath, classpathEntries = [], args = [] }) {
  return new Promise((resolve, reject) => {
    const mainClass = getJarMainClass(jarPath);
    if (!mainClass) {
      return reject(new Error(`Main-Class not found in ${jarPath}`));
    }
    const classpathSeparator = process.platform === 'win32' ? ';' : ':';
    const classpath = [jarPath, ...classpathEntries].join(classpathSeparator);
    const child = spawn(javaExecutable, ['-cp', classpath, mainClass, ...args], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('error', (error) => {
      reject(error);
    });
    
    child.on('close', (code) => {
      if (code !== 0) {
        if (stderr) {
          log(`Forge processor error: ${stderr.trim()}`);
        }
        reject(new Error(`Java tool failed (${jarPath}) with exit code ${code}.`));
      } else {
        resolve();
      }
    });
  });
}

async function createForgeProfile(baseVersion, loaderType) {
  const version = loaderType === 'neoforge'
    ? await getNeoForgeVersionForMc(baseVersion)
    : await getForgeVersionForMc(baseVersion);

  if (!version) {
    throw new Error(`No ${loaderType} versions found for ${baseVersion}`);
  }

  const installerUrl = loaderType === 'neoforge'
    ? `https://maven.neoforged.net/releases/net/neoforged/neoforge/${version}/neoforge-${version}-installer.jar`
    : `https://maven.minecraftforge.net/net/minecraftforge/forge/${version}/forge-${version}-installer.jar`;

  const installerPath = path.join(minecraftDir, `${loaderType}-${version}-installer.jar`);
  log(`Downloading ${loaderType} installer...`);
  await downloadFile(installerUrl, installerPath);
  const profileJson = await extractVersionJsonFromInstaller(installerPath);
  return { profileJson, installerPath, version };
}

async function ensureForgeInstaller({ loaderType, forgeVersion }) {
  if (!loaderType || !forgeVersion) return null;
  const installerPath = path.join(minecraftDir, `${loaderType}-${forgeVersion}-installer.jar`);
  if (fs.existsSync(installerPath)) return installerPath;

  const installerUrl = loaderType === 'neoforge'
    ? `https://maven.neoforged.net/releases/net/neoforged/neoforge/${forgeVersion}/neoforge-${forgeVersion}-installer.jar`
    : `https://maven.minecraftforge.net/net/minecraftforge/forge/${forgeVersion}/forge-${forgeVersion}-installer.jar`;

  log(`Downloading ${loaderType} installer...`);
  await downloadFile(installerUrl, installerPath);
  return installerPath;
}

async function createModdedProfile({ customName, baseVersion, loader }) {
  const versionDir = path.join(versionsDir, customName);
  if (fs.existsSync(versionDir)) {
    throw new Error(`Version ${customName} already exists`);
  }

  const manifest = await getManifest();
  const exists = manifest.versions.some((version) => version.id === baseVersion);
  if (!exists) {
    throw new Error(`Base version ${baseVersion} not found in manifest`);
  }

  await ensureBaseVersionDownloaded(baseVersion);

  log(`Creating ${formatLoaderName(loader)} profile...`);

  let profileJson;
  let forgeInstaller = null;
  if (loader === 'fabric') {
    profileJson = await getFabricProfile(baseVersion);
  } else if (loader === 'quilt') {
    profileJson = await getQuiltProfile(baseVersion);
  } else if (loader === 'forge' || loader === 'neoforge') {
    forgeInstaller = await createForgeProfile(baseVersion, loader);
    profileJson = forgeInstaller.profileJson;
  } else {
    throw new Error('Unsupported loader');
  }

  profileJson.id = customName;
  profileJson.inheritsFrom = baseVersion;
  profileJson.jar = customName;
  profileJson.time = new Date().toISOString();
  profileJson.releaseTime = new Date().toISOString();
  profileJson.launcher = {
    modded: true,
    loader,
    baseVersion,
    ...(forgeInstaller ? { forgeVersion: forgeInstaller.version } : {})
  };

  const paths = ensureVersionRuntimeLayout(customName, true);
  const versionJsonPath = path.join(versionDir, `${customName}.json`);
  fs.writeFileSync(versionJsonPath, JSON.stringify(profileJson, null, 2));

  const baseJarPath = path.join(versionsDir, baseVersion, `${baseVersion}.jar`);
  const targetJarPath = path.join(versionDir, `${customName}.jar`);
  if (forgeInstaller) {
    const extracted = extractForgeJarFromInstaller(
      forgeInstaller.installerPath,
      loader,
      forgeInstaller.version,
      targetJarPath
    );
    if (!extracted && fs.existsSync(baseJarPath) && !fs.existsSync(targetJarPath)) {
      fs.copyFileSync(baseJarPath, targetJarPath);
    }
  } else if (fs.existsSync(baseJarPath) && !fs.existsSync(targetJarPath)) {
    fs.copyFileSync(baseJarPath, targetJarPath);
  }

  log('Downloading libraries...');
  const resolved = resolveVersionChain(customName);
  await downloadLibraries(resolved.libraries, customName, librariesDir, paths.nativesDir);

  // For Forge/NeoForge, copy the vanilla client JAR into the modded instance
  if (loader === 'forge' || loader === 'neoforge') {
    const clientJarPath = path.join(versionDir, 'client.jar');
    await ensureClientJarFromBase({
      baseVersion,
      targetPath: clientJarPath,
      installerPath: forgeInstaller?.installerPath
    });
  }

  log('Modded profile created.');
  return { id: customName, loader, baseVersion };
}

async function searchModrinthMods({ query, mcVersion, loader, offset = 0, limit = 25 }) {
  const facets = [
    ['project_type:mod'],
    [`versions:${mcVersion}`],
    [`categories:${loader}`],
    ['client_side:required', 'client_side:optional']
  ];
  const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query || '')}&limit=${limit}&offset=${offset}&index=relevance&facets=${encodeURIComponent(JSON.stringify(facets))}`;
  return fetchJson(url);
}

async function searchModrinthShaders({ query, mcVersion, loader, offset = 0, limit = 25 }) {
  const facets = [
    ['project_type:shader'],
    [`versions:${mcVersion}`]
  ];

  const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query || '')}&limit=${limit}&offset=${offset}&index=relevance&facets=${encodeURIComponent(JSON.stringify(facets))}`;

  // Retry on 502/503 a few times
  const attempts = 3;
  let delay = 300;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchJson(url);
    } catch (err) {
      if (i === attempts - 1) throw err;
      if (err && err.message && /502|503/.test(err.message)) {
        await new Promise((res) => setTimeout(res, delay));
        delay *= 2;
        continue;
      }
      throw err;
    }
  }
}

async function installModrinthMod({ projectId, mcVersion, loader, profileName, title, iconUrl, author }) {
  const versionsUrl = `https://api.modrinth.com/v2/project/${projectId}/version?loaders=${encodeURIComponent(JSON.stringify([loader]))}&game_versions=${encodeURIComponent(JSON.stringify([mcVersion]))}`;
  const versions = await fetchJson(versionsUrl);
  if (!versions || versions.length === 0) {
    throw new Error('No compatible mod version found');
  }

  const version = versions[0];
  const file = version.files?.[0];
  if (!file?.url) {
    throw new Error('No downloadable file found for mod');
  }

  const modsDir = getModsDir(profileName);
  ensureDir(modsDir);

  const destination = path.join(modsDir, file.filename);
  log(`Installing mod: ${title || version.name || projectId}...`);
  await downloadFile(file.url, destination, {
    expectedSha1: file.hashes?.sha1 || null,
    expectedSize: file.size || null,
    onProgress: (stats) => {
      currentDownloadStats = stats;
      reportProgress(`Installing ${title || version.name || projectId}`, 0, 1, stats);
    }
  });
  currentDownloadStats = null;
  const metadata = loadModsMetadata(profileName);
  metadata[projectId] = {
    title: title || version.name || projectId,
    iconUrl: iconUrl || null,
    author: author || null,
    file: file.filename
  };
  saveModsMetadata(profileName, metadata);
  log(`Installed mod: ${title || version.name || projectId}`);
  return { file: destination };
}

async function installModrinthResourcepack({ projectId, mcVersion, profileName, title, iconUrl, author }) {
  const versionsUrl = `https://api.modrinth.com/v2/project/${projectId}/version?game_versions=${encodeURIComponent(JSON.stringify([mcVersion]))}`;
  const versions = await fetchJson(versionsUrl);
  if (!versions || versions.length === 0) {
    throw new Error('No compatible resource pack version found');
  }

  const version = versions[0];
  const file = version.files?.[0];
  if (!file?.url) {
    throw new Error('No downloadable file found for resource pack');
  }

  const resourcepacksDir = getResourcepacksDir(profileName);
  ensureDir(resourcepacksDir);

  const destination = path.join(resourcepacksDir, file.filename);
  log(`Installing resource pack: ${title || version.name || projectId}...`);
  await downloadFile(file.url, destination, {
    expectedSha1: file.hashes?.sha1 || null,
    expectedSize: file.size || null,
    onProgress: (stats) => {
      currentDownloadStats = stats;
      reportProgress(`Installing ${title || version.name || projectId}`, 0, 1, stats);
    }
  });
  currentDownloadStats = null;
  const metadata = loadResourcepacksMetadata(profileName);
  metadata[projectId] = {
    title: title || version.name || projectId,
    iconUrl: iconUrl || null,
    author: author || null,
    file: file.filename
  };
  saveResourcepacksMetadata(profileName, metadata);
  log(`Installed resource pack: ${title || version.name || projectId}`);
  return { file: destination };
}

async function installModrinthShader({ projectId, mcVersion, profileName, title, iconUrl, author }) {
  // Query versions for the project that match the mcVersion (do not filter by loader)
  const versionsUrl = `https://api.modrinth.com/v2/project/${projectId}/version?game_versions=${encodeURIComponent(JSON.stringify([mcVersion]))}`;
  const versions = await fetchJson(versionsUrl);
  if (!versions || versions.length === 0) {
    throw new Error('No compatible shader version found');
  }

  const version = versions[0];
  const file = version.files?.[0];
  if (!file?.url) {
    throw new Error('No downloadable file found for shader');
  }

  const shaderpacksDir = getShaderpacksDir(profileName);
  ensureDir(shaderpacksDir);

  const destination = path.join(shaderpacksDir, file.filename);
  log(`Installing shader: ${title || version.name || projectId}...`);

  // Attempt download with a small number of retries on network errors
  const attempts = 2;
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      await downloadFile(file.url, destination, {
        expectedSha1: file.hashes?.sha1 || null,
        expectedSize: file.size || null,
        onProgress: (stats) => {
          currentDownloadStats = stats;
          reportProgress(`Installing ${title || version.name || projectId}`, 0, 1, stats);
        }
      });
      currentDownloadStats = null;
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      // If HTTP 502/503 or network issues, retry once
      if (i === attempts - 1) throw err;
      await new Promise((res) => setTimeout(res, 500));
    }
  }

  const metadata = loadShaderpacksMetadata(profileName);
  metadata[projectId] = {
    title: title || version.name || projectId,
    iconUrl: iconUrl || null,
    author: author || null,
    file: file.filename
  };
  saveShaderpacksMetadata(profileName, metadata);
  log(`Installed shader: ${title || version.name || projectId}`);
  return { file: destination };
}

ipcMain.handle('fetch-versions', async () => {
  const manifest = await getManifest();
  return manifest.versions.filter((version) => version.type === 'release');
});

ipcMain.handle('fetch-installed-versions', async () => {
  return listInstalledVersions();
});

ipcMain.handle('fix-version', async (_event, versionId) => {
  if (!versionId) throw new Error('Missing versionId');

  const versionJson = loadVersionJson(versionId);
  // If no local json, try to download the version manifest and files
  if (!versionJson) {
    await downloadVersionInternal(versionId);
    return { fixed: true };
  }

  const meta = getLauncherMetadata(versionJson);
  // If modded, ensure base version and build client.jar
  if (meta?.modded) {
    const base = meta.baseVersion || versionJson.inheritsFrom;
    if (base) {
      await ensureBaseVersionDownloaded(base);
      const paths = ensureVersionRuntimeLayout(versionId, true);
      const clientJarPath = path.join(paths.versionDir, 'client.jar');
      await ensureClientJarFromBase({ baseVersion: base, targetPath: clientJarPath, installerPath: null });
    }
  } else {
    // For vanilla/custom non-modded, re-download missing pieces
    await downloadVersionInternal(versionId);
  }

  return { fixed: true };
});

ipcMain.handle('delete-version', async (_event, versionId) => {
  if (!versionId) throw new Error('Missing versionId');
  const versionDir = path.join(versionsDir, versionId);
  if (fs.existsSync(versionDir)) {
    fs.rmSync(versionDir, { recursive: true, force: true });
    log(`Deleted version: ${versionId}`);
    return { deleted: true };
  }
  return { deleted: false };
});

ipcMain.handle('fetch-java', async () => {
  return collectJavaInstallations();
});

ipcMain.handle('fetch-all-versions', async () => {
  return listAllVersionsSorted();
});

ipcMain.handle('get-version-info', async (_event, versionId) => {
  const versionJson = loadVersionJson(versionId);
  if (!versionJson) return { id: versionId, isModded: false };
  const meta = getLauncherMetadata(versionJson);
  return {
    id: versionId,
    isModded: Boolean(meta?.modded),
    loader: meta?.loader || null,
    baseVersion: meta?.baseVersion || null
  };
});

ipcMain.handle('rename-modded-version', async (_event, payload) => {
  const { oldId, newId } = payload || {};
  return renameModdedVersion(oldId, newId);
});

ipcMain.handle('delete-modded-version', async (_event, payload) => {
  const { versionId } = payload || {};
  return deleteModdedVersion(versionId);
});

ipcMain.handle('open-version-folder', async (_event, payload) => {
  const { versionId } = payload || {};
  return openVersionFolder(versionId);
});

ipcMain.handle('open-external', async (_event, url) => {
  shell.openExternal(url);
  return true;
});

ipcMain.handle('create-modded-version', async (_event, payload) => {
  const { customName, baseVersion, loader } = payload;
  if (!customName || !baseVersion || !loader) {
    throw new Error('Missing required fields for modded version');
  }
  return createModdedProfile({ customName, baseVersion, loader });
});

ipcMain.handle('search-modrinth', async (_event, payload) => {
  const { query, mcVersion, loader, offset, limit } = payload;
  return searchModrinthMods({ query, mcVersion, loader, offset, limit });
});

ipcMain.handle('search-modrinth-shaders', async (_event, payload) => {
  const { query, mcVersion, loader, offset, limit } = payload;
  return searchModrinthShaders({ query, mcVersion, loader, offset, limit });
});

ipcMain.handle('install-shader', async (_event, payload) => {
  return installModrinthShader(payload);
});

ipcMain.handle('list-installed-shaders', async (_event, profileName) => {
  if (!profileName) return [];
  return listInstalledShaderpacks(profileName);
});

ipcMain.handle('remove-shader', async (_event, payload) => {
  const { projectId, profileName } = payload || {};
  if (!projectId || !profileName) {
    throw new Error('Missing required fields for remove-shader');
  }

  const shaderpacksDir = getShaderpacksDir(profileName);
  const metadata = loadShaderpacksMetadata(profileName);
  const info = metadata[projectId];
  if (!info?.file) {
    throw new Error('Shader not found for removal');
  }

  const filePath = path.join(shaderpacksDir, info.file);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  delete metadata[projectId];
  saveShaderpacksMetadata(profileName, metadata);

  log(`Removed shader: ${info.title || projectId}`);
  return true;
});

ipcMain.handle('install-mod', async (_event, payload) => {
  return installModrinthMod(payload);
});

ipcMain.handle('install-resourcepack', async (_event, payload) => {
  return installModrinthResourcepack(payload);
});

ipcMain.handle('fetch-json', async (_event, url) => {
  return fetchJson(url);
});

ipcMain.handle('list-installed-mods', async (_event, profileName) => {
  if (!profileName) return [];
  return listInstalledMods(profileName);
});

ipcMain.handle('remove-mod', async (_event, payload) => {
  const { projectId, profileName } = payload || {};
  if (!projectId || !profileName) {
    throw new Error('Missing required fields for remove-mod');
  }

  const modsDir = getModsDir(profileName);
  const metadata = loadModsMetadata(profileName);
  const info = metadata[projectId];
  if (!info?.file) {
    throw new Error('Mod not found for removal');
  }

  const filePath = path.join(modsDir, info.file);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  delete metadata[projectId];
  saveModsMetadata(profileName, metadata);

  log(`Removed mod: ${info.title || projectId}`);
  return true;
});

ipcMain.handle('list-installed-resourcepacks', async (_event, profileName) => {
  if (!profileName) return [];
  return listInstalledResourcepacks(profileName);
});

ipcMain.handle('remove-resourcepack', async (_event, payload) => {
  const { projectId, profileName } = payload || {};
  if (!projectId || !profileName) {
    throw new Error('Missing required fields for remove-resourcepack');
  }

  const resourcepacksDir = getResourcepacksDir(profileName);
  const metadata = loadResourcepacksMetadata(profileName);
  const info = metadata[projectId];
  if (!info?.file) {
    throw new Error('Resource pack not found for removal');
  }

  const filePath = path.join(resourcepacksDir, info.file);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  delete metadata[projectId];
  saveResourcepacksMetadata(profileName, metadata);

  log(`Removed resource pack: ${info.title || projectId}`);
  return true;
});

ipcMain.handle('download-version', async (_event, versionId) => {
  await downloadVersionInternal(versionId);
  return { versionId };
});

ipcMain.handle('launch-game', async (_event, payload) => {
  const versionId = payload.version;
  const username = payload.username || 'Player';
  const javaPathOverride = payload.javaPath;
  const memoryGb = Number(payload.memoryGb || 0);
  const skipPreparation = payload.skipPreparation !== undefined ? Boolean(payload.skipPreparation) : true;

  isPreparingGame = true;
  cancelPreparation = false;
  mainWindow?.webContents.send('preparation-state', true);

  try {
    const javaExecutable = getPreferredJava(javaPathOverride);
    if (!javaExecutable) {
      throw new Error('Java not found. Install Java or set MANUAL_JAVA_PATH in main.js');
    }

    const versionJson = loadVersionJson(versionId);
    if (!versionJson) {
      throw new Error('Version files not found. Please download the version first.');
    }

    const isModded = Boolean(getLauncherMetadata(versionJson)?.modded);
    const paths = ensureVersionRuntimeLayout(versionId, isModded);
  const resolved = resolveVersionChain(versionId);
  
  log(`Version: ${versionId}`);
  log(`Resolved jarIds: ${resolved.jarIds.join(', ')}`);
  log(`Has inheritsFrom: ${versionJson.inheritsFrom ? 'yes (' + versionJson.inheritsFrom + ')' : 'no'}`);

  // For Forge versions, copy parent JAR into the modded version directory
  if (versionJson.inheritsFrom && isModded) {
    const parentJarId = versionJson.inheritsFrom;
    const parentJarPath = path.join(versionsDir, parentJarId, `${parentJarId}.jar`);
    const moddedClientJarPath = path.join(paths.versionDir, 'client.jar');
    
    if (fs.existsSync(parentJarPath) && !fs.existsSync(moddedClientJarPath)) {
      log(`Copying parent JAR (${parentJarId}.jar) to modded instance...`);
      fs.copyFileSync(parentJarPath, moddedClientJarPath);
    }
  }

  if (cancelPreparation) {
    throw new Error('Preparation cancelled');
  }

  if (!skipPreparation && Array.isArray(resolved.libraries) && resolved.libraries.length > 0) {
    log('Ensuring libraries...');
    await downloadLibraries(resolved.libraries, versionId, librariesDir, paths.nativesDir);
  } else if (skipPreparation && Array.isArray(resolved.libraries) && resolved.libraries.length > 0) {
    log('skipPreparation: skipping library downloads.');
  }

  if (cancelPreparation) {
    throw new Error('Preparation cancelled');
  }

  if (!skipPreparation && resolved.assetIndex?.url) {
    log('Ensuring assets...');
    await downloadAssets(resolved.assetIndex);
  } else if (skipPreparation && resolved.assetIndex?.url) {
    log('skipPreparation: skipping asset downloads.');
  }

  if (cancelPreparation) {
    throw new Error('Preparation cancelled');
  }

  const classpathEntries = [];

  for (const library of resolved.libraries.filter(isLibraryAllowed)) {
    const libPath = buildLibraryPath(library, librariesDir);
    if (libPath && fs.existsSync(libPath)) {
      classpathEntries.push(libPath);
    }
  }

  for (const jarId of resolved.jarIds) {
    const jarPath = path.join(versionsDir, jarId, `${jarId}.jar`);
    if (!fs.existsSync(jarPath)) {
      throw new Error(`Jar not found: ${jarPath}. Please download the version first.`);
    }
    log(`Adding to classpath: ${jarPath}`);
    classpathEntries.push(jarPath);
  }

  if (getLauncherMetadata(versionJson)?.loader === 'forge' || getLauncherMetadata(versionJson)?.loader === 'neoforge') {
    const clientJarPath = path.join(paths.versionDir, 'client.jar');
    if (fs.existsSync(clientJarPath)) {
      log(`Adding to classpath: ${clientJarPath}`);
      classpathEntries.push(clientJarPath);
    }
  }

  const classpathSeparator = process.platform === 'win32' ? ';' : ':';
  const classpath = classpathEntries.join(classpathSeparator);

  const nativesDir = paths.nativesDir;

  const meta = getLauncherMetadata(versionJson);
  const modsDir = meta?.modded ? paths.modsDir : null;

  const variables = {
    auth_player_name: username,
    version_name: versionId,
    game_directory: paths.versionDir,
    assets_root: paths.assetsDir,
    assets_index_name: resolved.assetIndex?.id || versionId,
    auth_uuid: '00000000-0000-0000-0000-000000000000',
    auth_access_token: '0',
    user_type: 'legacy',
    version_type: 'release',
    natives_directory: nativesDir,
    launcher_name: 'minecraft-launcher',
    launcher_version: '1.0',
    classpath_separator: classpathSeparator
  };

  const jvmArgs = [];
  
  if (resolved.jvmArguments && resolved.jvmArguments.length > 0) {
    const resolvedJvm = resolveArguments(resolved.jvmArguments, variables);
    for (const arg of resolvedJvm) {
      if (arg !== '-cp' && !arg.includes('${classpath}')) {
        jvmArgs.push(arg);
      }
    }
  } else {
    jvmArgs.push('-Xmx2G', '-Xms1G');
    jvmArgs.push(`-Djava.library.path=${nativesDir}`);
  }

  if (memoryGb) {
    applyMemoryLimit(jvmArgs, memoryGb);
  }

  if (modsDir && meta?.loader === 'fabric') {
    jvmArgs.push(`-Dfabric.modPath=${modsDir}`);
  }
  if (modsDir && meta?.loader === 'quilt') {
    jvmArgs.push(`-Dquilt.modPath=${modsDir}`);
  }
  if (modsDir && (meta?.loader === 'forge' || meta?.loader === 'neoforge')) {
    jvmArgs.push(`-Dfml.modsFolder=${modsDir}`);
  }

  const gameArgs = [];
  
  if (resolved.gameArguments && resolved.gameArguments.length > 0) {
    gameArgs.push(...resolveArguments(resolved.gameArguments, variables));
  } else {
    gameArgs.push(
      '--username', username,
      '--version', versionId,
      '--gameDir', paths.versionDir,
      '--assetsDir', paths.assetsDir,
      '--assetIndex', resolved.assetIndex?.id || versionId,
      '--uuid', '00000000-0000-0000-0000-000000000000',
      '--accessToken', '0',
      '--userType', 'legacy'
    );
  }

  // For Forge/NeoForge, add --minecraftJar argument pointing to client.jar
  if (meta?.loader === 'forge' || meta?.loader === 'neoforge') {
    const clientJarPath = path.join(paths.versionDir, 'client.jar');
    const baseVersion = meta?.baseVersion || versionJson.inheritsFrom;
    if (!baseVersion) {
      throw new Error('Forge base version is missing. Cannot resolve Minecraft client JAR.');
    }
    const forgeVersion = meta?.forgeVersion || extractForgeVersionFromLibraries(versionJson.libraries);
    const installerPath = (!skipPreparation && forgeVersion)
      ? await ensureForgeInstaller({ loaderType: meta.loader, forgeVersion })
      : null;
    await ensureClientJarFromBase({ baseVersion, targetPath: clientJarPath, installerPath });

    const mcVersion = extractMcVersionFromForgeVersion(forgeVersion) || baseVersion;
    const forgeBuild = extractForgeBuildFromForgeVersion(forgeVersion);
    const mcpVersion = extractMcpVersionFromLibraries(versionJson.libraries, mcVersion);
    const forgeGroup = meta?.loader === 'neoforge' ? 'net.neoforged' : 'net.minecraftforge';

    const ensureArgPair = (key, value) => {
      if (!value) return;
      const index = gameArgs.indexOf(key);
      if (index === -1) {
        gameArgs.push(key, value);
      }
    };

    ensureArgPair('--fml.mcVersion', mcVersion);
    ensureArgPair('--fml.forgeVersion', forgeBuild);
    ensureArgPair('--fml.forgeGroup', forgeGroup);
    ensureArgPair('--fml.mcpVersion', mcpVersion);

    gameArgs.push('--minecraftJar', clientJarPath);
  }

  const args = [
    ...jvmArgs,
    '-cp',
    classpath,
    resolved.mainClass || 'net.minecraft.client.main.Main',
    ...gameArgs
  ];

  log('Launching game...');
  log(`Full command: java ${args.join(' ')}`);

  const child = spawn(javaExecutable, args, {
    cwd: minecraftDir,
    detached: true
  });

  child.stdout.on('data', (data) => log(data.toString().trim()));
  child.stderr.on('data', (data) => log(data.toString().trim()));

  child.on('error', (error) => {
    log(`Launch error: ${error.message}`);
  });

  return true;
  } catch (error) {
    // Handle cancellation gracefully
    if (error.message === 'Download cancelled' || error.message === 'Preparation cancelled') {
      log('Preparation cancelled by user.');
      reportProgress('Cancelled', 0, 0);
      return false;
    }
    throw error;
  } finally {
    isPreparingGame = false;
    cancelPreparation = false;
    mainWindow?.webContents.send('preparation-state', false);
  }
});

ipcMain.handle('cancel-preparation', async () => {
  if (isPreparingGame) {
    cancelPreparation = true;
    log('Cancelling preparation...');
    return true;
  }
  return false;
});
