const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { spawn, spawnSync } = require('child_process');
const AdmZip = require('adm-zip');

const MANUAL_JAVA_PATH = '';
const MANIFEST_URL = 'https://launchermeta.mojang.com/mc/game/version_manifest.json';

let mainWindow;
let cachedManifest = null;

const minecraftDir = path.join(app.getPath('userData'), '.minecraft');
const versionsDir = path.join(minecraftDir, 'versions');
const librariesDir = path.join(minecraftDir, 'libraries');
const assetsDir = path.join(minecraftDir, 'assets');
const nativesBaseDir = path.join(minecraftDir, 'natives');
const MODS_METADATA_FILE = '.launcher-mods.json';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
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

function reportProgress(stage, current, total) {
  if (mainWindow) {
    mainWindow.webContents.send('progress', { stage, current, total });
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getVersionPaths(versionId) {
  const versionDir = path.join(versionsDir, versionId);
  return {
    versionDir,
    librariesDir: path.join(versionDir, 'libraries'),
    assetsDir: path.join(versionDir, 'assets'),
    assetsIndexesDir: path.join(versionDir, 'assets', 'indexes'),
    assetsObjectsDir: path.join(versionDir, 'assets', 'objects'),
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
  ensureDir(paths.assetsDir);
  ensureDir(paths.assetsIndexesDir);
  ensureDir(paths.assetsObjectsDir);
  ensureDir(paths.librariesDir);
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
  const manifest = await getManifest();
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
      baseVersion
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
  const libraries = [];
  let mainClass;
  let assetIndex;
  let jarId;
  let currentId = versionId;
  let currentJson = loadVersionJson(currentId);

  while (currentJson) {
    if (Array.isArray(currentJson.libraries)) {
      libraries.push(...currentJson.libraries);
    }
    if (!mainClass && currentJson.mainClass) {
      mainClass = currentJson.mainClass;
    }
    if (!assetIndex && currentJson.assetIndex) {
      assetIndex = currentJson.assetIndex;
    }

    if (!jarId) {
      const candidateJarId = currentJson.jar || currentId;
      const candidateJarPath = path.join(versionsDir, candidateJarId, `${candidateJarId}.jar`);
      if (fs.existsSync(candidateJarPath)) {
        jarId = candidateJarId;
      }
    }

    if (!currentJson.inheritsFrom) break;
    currentId = currentJson.inheritsFrom;
    currentJson = loadVersionJson(currentId);
  }

  return {
    libraries,
    mainClass,
    assetIndex,
    jarId: jarId || versionId
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

function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(destination)) {
      return resolve(false);
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
      res.pipe(fileStream);
      fileStream.on('finish', () => fileStream.close(() => resolve(true)));
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

function buildLibraryPath(library, targetLibrariesDir) {
  const librariesRoot = targetLibrariesDir || librariesDir;
  if (library.downloads?.artifact?.path) {
    return path.join(librariesRoot, library.downloads.artifact.path);
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
    const artifact = library.downloads?.artifact;
    if (artifact && artifact.path) {
      artifacts.push({
        url: artifact.url,
        path: path.join(targetLibrariesDir, artifact.path)
      });
    } else if (library.name) {
      const artifactPath = buildMavenArtifactPath(library.name);
      if (artifactPath) {
        const baseUrl = library.url || 'https://libraries.minecraft.net/';
        const url = `${baseUrl.replace(/\/$/, '')}/${artifactPath}`;
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
        extract: library.extract
      });
    }
  }

  let completed = 0;
  const total = artifacts.length + natives.length;
  reportProgress('Downloading libraries', completed, total);

  for (const item of artifacts) {
    await downloadFile(item.url, item.path);
    completed += 1;
    reportProgress('Downloading libraries', completed, total);
  }

  ensureDir(targetNativesDir);
  for (const item of natives) {
    await downloadFile(item.url, item.path);
    const exclude = item.extract?.exclude || [];
    await extractNativeJar(item.path, targetNativesDir, exclude);
    completed += 1;
    reportProgress('Downloading libraries', completed, total);
  }
}

async function downloadAssets(assetIndex, targetAssetsDir, targetAssetsIndexesDir, targetAssetsObjectsDir) {
  if (!assetIndex?.url) return;

  log('Downloading asset index...');
  const assetIndexJson = await fetchJson(assetIndex.url);

  ensureDir(targetAssetsIndexesDir);

  const assetsIndexPath = path.join(targetAssetsIndexesDir, `${assetIndex.id}.json`);

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
      const index = currentIndex;
      currentIndex += 1;
      const object = entries[index];
      const hash = object.hash;
      const subDir = hash.substring(0, 2);
      const objectPath = path.join(targetAssetsObjectsDir, subDir, hash);
      const url = `https://resources.download.minecraft.net/${subDir}/${hash}`;
      await downloadFile(url, objectPath);
      completed += 1;
      reportProgress('Downloading assets', completed, total);
    }
  }

  ensureDir(targetAssetsObjectsDir);
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

function formatLoaderName(loader) {
  if (!loader) return '';
  if (loader === 'neoforge') return 'NeoForge';
  return `${loader.charAt(0).toUpperCase()}${loader.slice(1)}`;
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
  await downloadFile(clientJar.url, clientJarPath);
  reportProgress('Downloading client', 1, 1);

  log('Downloading libraries...');
  await downloadLibraries(versionJson.libraries, versionId, paths.librariesDir, paths.nativesDir);

  log('Downloading assets...');
  await downloadAssets(versionJson.assetIndex, paths.assetsDir, paths.assetsIndexesDir, paths.assetsObjectsDir);

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
  const metadata = await fetchText('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml');
  const versions = Array.from(metadata.matchAll(/<version>([^<]+)<\/version>/g)).map((match) => match[1]);
  const matching = versions.filter((version) => version.startsWith(`${baseVersion}-`));
  return matching.length > 0 ? matching[matching.length - 1] : null;
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
  return profileJson;
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
  if (loader === 'fabric') {
    profileJson = await getFabricProfile(baseVersion);
  } else if (loader === 'quilt') {
    profileJson = await getQuiltProfile(baseVersion);
  } else if (loader === 'forge' || loader === 'neoforge') {
    profileJson = await createForgeProfile(baseVersion, loader);
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
    baseVersion
  };

  const paths = ensureVersionRuntimeLayout(customName, true);
  const versionJsonPath = path.join(versionDir, `${customName}.json`);
  fs.writeFileSync(versionJsonPath, JSON.stringify(profileJson, null, 2));

  const baseJarPath = path.join(versionsDir, baseVersion, `${baseVersion}.jar`);
  const targetJarPath = path.join(versionDir, `${customName}.jar`);
  if (fs.existsSync(baseJarPath) && !fs.existsSync(targetJarPath)) {
    fs.copyFileSync(baseJarPath, targetJarPath);
  }

  log('Downloading libraries...');
  const resolved = resolveVersionChain(customName);
  await downloadLibraries(resolved.libraries, customName, paths.librariesDir, paths.nativesDir);

  log('Modded profile created.');
  return { id: customName, loader, baseVersion };
}

async function searchModrinthMods({ query, mcVersion, loader }) {
  const facets = [
    ['project_type:mod'],
    [`versions:${mcVersion}`],
    [`categories:${loader}`],
    ['client_side:required', 'client_side:optional']
  ];
  const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query || '')}&limit=20&index=relevance&facets=${encodeURIComponent(JSON.stringify(facets))}`;
  return fetchJson(url);
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
  await downloadFile(file.url, destination);
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

ipcMain.handle('fetch-versions', async () => {
  const manifest = await getManifest();
  return manifest.versions.filter((version) => version.type === 'release');
});

ipcMain.handle('fetch-installed-versions', async () => {
  return listInstalledVersions();
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

ipcMain.handle('create-modded-version', async (_event, payload) => {
  const { customName, baseVersion, loader } = payload;
  if (!customName || !baseVersion || !loader) {
    throw new Error('Missing required fields for modded version');
  }
  return createModdedProfile({ customName, baseVersion, loader });
});

ipcMain.handle('search-modrinth', async (_event, payload) => {
  const { query, mcVersion, loader } = payload;
  return searchModrinthMods({ query, mcVersion, loader });
});

ipcMain.handle('install-mod', async (_event, payload) => {
  return installModrinthMod(payload);
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

ipcMain.handle('download-version', async (_event, versionId) => {
  await downloadVersionInternal(versionId);
  return { versionId };
});

ipcMain.handle('launch-game', async (_event, payload) => {
  const versionId = payload.version;
  const username = payload.username || 'Player';
  const javaPathOverride = payload.javaPath;

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

  if (Array.isArray(resolved.libraries) && resolved.libraries.length > 0) {
    log('Ensuring libraries...');
    await downloadLibraries(resolved.libraries, versionId, paths.librariesDir, paths.nativesDir);
  }

  if (resolved.assetIndex?.url) {
    log('Ensuring assets...');
    await downloadAssets(resolved.assetIndex, paths.assetsDir, paths.assetsIndexesDir, paths.assetsObjectsDir);
  }

  const classpathEntries = [];

  for (const library of resolved.libraries.filter(isLibraryAllowed)) {
    const libPath = buildLibraryPath(library, paths.librariesDir);
    if (libPath && fs.existsSync(libPath)) {
      classpathEntries.push(libPath);
    }
  }

  const versionJarPath = path.join(versionsDir, resolved.jarId, `${resolved.jarId}.jar`);
  if (!fs.existsSync(versionJarPath)) {
    throw new Error('Base game jar not found. Please download the base version first.');
  }

  classpathEntries.push(versionJarPath);

  const classpathSeparator = process.platform === 'win32' ? ';' : ':';
  const classpath = classpathEntries.join(classpathSeparator);

  const nativesDir = paths.nativesDir;

  const meta = getLauncherMetadata(versionJson);
  const modsDir = meta?.modded ? paths.modsDir : null;

  const args = [
    '-Xmx2G',
    '-Xms1G',
    `-Djava.library.path=${nativesDir}`,
    ...(modsDir && meta?.loader === 'fabric' ? [`-Dfabric.modPath=${modsDir}`] : []),
    ...(modsDir && meta?.loader === 'quilt' ? [`-Dquilt.modPath=${modsDir}`] : []),
    ...(modsDir && (meta?.loader === 'forge' || meta?.loader === 'neoforge')
      ? [`-Dfml.modsFolder=${modsDir}`]
      : []),
    '-cp',
    classpath,
    resolved.mainClass || 'net.minecraft.client.main.Main',
    '--username',
    username,
    '--version',
    versionId,
    '--gameDir',
    paths.versionDir,
    '--assetsDir',
    paths.assetsDir,
    '--assetIndex',
    resolved.assetIndex?.id || versionId,
    '--uuid',
    '00000000-0000-0000-0000-000000000000',
    '--accessToken',
    '0',
    '--userType',
    'legacy'
  ];

  log('Launching game...');

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
});
