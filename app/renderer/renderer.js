const versionSelect = document.getElementById('version');
const usernameInput = document.getElementById('username');
const javaSelect = document.getElementById('java');
const playButton = document.getElementById('play');
const moddedVersionSettingsButton = document.getElementById('modded-version-settings');
function updateVersionSettingsButton() {
  const isModded = Boolean(currentVersionInfo?.isModded);
  moddedVersionSettingsButton.disabled = !isModded;
  moddedVersionSettingsButton.title = isModded
    ? `Settings for ${currentVersionInfo.id}`
    : 'Select a modded version to edit settings';
}
const tabButtons = document.querySelectorAll('.tab-button');
const tabPlay = document.getElementById('tab-play');
const tabMods = document.getElementById('tab-mods');
const tabConfig = document.getElementById('tab-config');
const createModdedButton = document.getElementById('create-modded');
const modsInfo = document.getElementById('mods-info');
const modSearchInput = document.getElementById('mod-search');
const modSearchButton = document.getElementById('mod-search-btn');
const modsList = document.getElementById('mods-list');
const loadMoreButton = document.getElementById('load-more-mods');
const installedModsList = document.getElementById('installed-mods');
const scanModsFolderButton = document.getElementById('scan-mods-folder');
const moddedVersionSelect = document.getElementById('modded-version');
const resourcepackSearchInput = document.getElementById('resourcepack-search');
const resourcepackSearchButton = document.getElementById('resourcepack-search-btn');
const resourcepacksList = document.getElementById('resourcepacks-list');
const loadMoreResourcepacksButton = document.getElementById('load-more-resourcepacks');
const installedResourcepacksList = document.getElementById('installed-resourcepacks');
const shaderSearchInput = document.getElementById('shader-search');
const shaderSearchButton = document.getElementById('shader-search-btn');
const shadersList = document.getElementById('shaders-list');
const loadMoreShadersButton = document.getElementById('load-more-shaders');
const installedShadersList = document.getElementById('installed-shaders');
const modpackSearchInput = document.getElementById('modpack-search');
const modpackSearchButton = document.getElementById('modpack-search-btn');
const modpacksList = document.getElementById('modpacks-list');
const loadMoreModpacksButton = document.getElementById('load-more-modpacks');
const installedModpacksList = document.getElementById('installed-modpacks');
const importModpackButton = document.getElementById('import-modpack');
const modal = document.getElementById('modal');
const moddedSettingsModal = document.getElementById('modded-settings-modal');
const moddedNameInput = document.getElementById('modded-name');
const moddedBaseSelect = document.getElementById('modded-base');
const moddedLoaderSelect = document.getElementById('modded-loader');
const createModdedConfirm = document.getElementById('create-modded-confirm');
const createModdedCancel = document.getElementById('create-modded-cancel');
const moddedSettingsTitle = document.getElementById('modded-settings-title');
const moddedSettingsVersion = document.getElementById('modded-settings-version');
const moddedSettingsLoader = document.getElementById('modded-settings-loader');
const moddedRenameInput = document.getElementById('modded-rename');
const moddedRenameConfirm = document.getElementById('modded-rename-confirm');
const moddedOpenFolder = document.getElementById('modded-open-folder');
const moddedDelete = document.getElementById('modded-delete');
const moddedSettingsClose = document.getElementById('modded-settings-close');
const logs = document.getElementById('logs');
const prereleasesToggle = document.getElementById('show-prereleases');
const showLogsToggle = document.getElementById('show-logs');
const skipPreparationToggle = document.getElementById('skip-preparation');
const memoryLimitInput = document.getElementById('memory-limit');
const memoryLimitValue = document.getElementById('memory-limit-value');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const refreshInstalledVersionsBtn = document.getElementById('refresh-installed-versions');
const installedVersionsSelect = document.getElementById('installed-versions-select');
const fixVersionBtn = document.getElementById('fix-version-btn');
const deleteVersionBtn = document.getElementById('delete-version-btn');

const USERNAME_STORAGE_KEY = 'minecraftLauncher.username';
const VERSION_STORAGE_KEY = 'minecraftLauncher.selectedVersion';
const PRERELEASES_STORAGE_KEY = 'minecraftLauncher.showPrereleases';
const SHOW_LOGS_STORAGE_KEY = 'minecraftLauncher.showLogs';
const SKIP_PREPARATION_STORAGE_KEY = 'minecraftLauncher.skipPreparation';
const MEMORY_LIMIT_STORAGE_KEY = 'minecraftLauncher.memoryLimitGb';
let cachedReleaseVersions = [];
let currentVersionInfo = null;
let installedMods = [];
let availableModdedVersions = [];
let logsEnabled = true;
let activeTab = 'play';
let currentModsOffset = 0;
let currentModsQuery = '';
let hasMoreMods = false;
let currentResourcepacksOffset = 0;
let currentResourcepacksQuery = '';
let hasMoreResourcepacks = false;
let currentShadersOffset = 0;
let currentShadersQuery = '';
let hasMoreShaders = false;
let currentModpacksOffset = 0;
let currentModpacksQuery = '';
let hasMoreModpacks = false;
let installedModpacks = [];

modSearchInput.disabled = true;
modSearchButton.disabled = true;
loadMoreButton.classList.add('hidden');
loadMoreResourcepacksButton.classList.add('hidden');
loadMoreShadersButton.classList.add('hidden');

function formatLoaderName(loader) {
  if (!loader) return '';
  if (loader === 'neoforge') return 'NeoForge';
  return `${loader.charAt(0).toUpperCase()}${loader.slice(1)}`;
}

// Simple and safe markdown to HTML converter
function markdownToHtml(markdown) {
  if (!markdown) return '';
  
  let html = markdown
    // Escape HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    
    // Headers (must come before other processing)
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    
    // Images
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />')
    
    // Line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  
  // Wrap in paragraphs
  html = '<p>' + html + '</p>';
  
  // Handle code blocks (basic support)
  html = html.replace(/```([^`]+)```/g, '<pre><code>$1</code></pre>');
  
  // Handle lists
  html = html.replace(/<p>- (.+?)<\/p>/g, '<ul><li>$1</li></ul>');
  html = html.replace(/<\/ul><br><ul>/g, '');
  
  // Handle blockquotes
  html = html.replace(/<p>&gt; (.+?)<\/p>/g, '<blockquote>$1</blockquote>');
  
  return html;
}

function log(message) {
  if (!logsEnabled) return;
  const timestamp = new Date().toLocaleTimeString();
  logs.textContent += `[${timestamp}] ${message}\n`;
  logs.scrollTop = logs.scrollHeight;
}

function setProgress(stage, current, total, downloadStats = null) {
  if (!total || total === 0 || stage === 'Cancelled') {
    progressBar.style.width = '0%';
    progressText.textContent = 'Idle';
    return;
  }
  const percent = Math.floor((current / total) * 100);
  progressBar.style.width = `${percent}%`;
  
  let progressMsg = `${stage} (${current}/${total})`;
  
  // Add download stats if available
  if (downloadStats) {
    const { downloadedMB, totalMB, speedMBps } = downloadStats;
    if (totalMB !== '?') {
      progressMsg += ` - ${downloadedMB}/${totalMB} MB @ ${speedMBps} MB/s`;
    } else {
      progressMsg += ` - ${downloadedMB} MB @ ${speedMBps} MB/s`;
    }
  }
  
  progressText.textContent = progressMsg;
}

function setActiveTab(tab) {
  activeTab = tab;
  tabButtons.forEach((button) => {
    button.classList.remove('active');
  });
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

  document.querySelectorAll('.tab-content').forEach((content) => {
    content.classList.remove('active');
  });
  document.getElementById(`tab-${tab}`).classList.add('active');
  updateLogsVisibility();
}

function updateLogsVisibility() {
  logs.style.display = logsEnabled && activeTab === 'play' ? 'block' : 'none';
}

function getFilteredVersions(allVersions) {
  if (!Array.isArray(allVersions)) return [];
  const showPrereleases = prereleasesToggle?.checked;
  return allVersions.filter((version) => {
    if (version.isCustom || version.isInstalled) return true;
    if (showPrereleases) return true;
    return version.type === 'release';
  });
}


function openModal() {
  modal.classList.remove('hidden');
  moddedNameInput.value = '';
}

function closeModal() {
  modal.classList.add('hidden');
}

async function openModdedSettings(version) {
  if (!version) return;
  moddedSettingsModal.dataset.versionId = version.id;
  moddedSettingsTitle.textContent = `${version.id}`;
  moddedRenameInput.value = version.id;
  moddedSettingsVersion.textContent = 'Loading...';
  moddedSettingsLoader.textContent = 'Loading...';
  moddedSettingsModal.classList.remove('hidden');
  try {
    const info = await window.minecraftLauncher.getVersionInfo(version.id);
    moddedSettingsVersion.textContent = info?.baseVersion || 'Unknown';
    moddedSettingsLoader.textContent = info?.loader ? formatLoaderName(info.loader) : 'Unknown';
  } catch (error) {
    moddedSettingsVersion.textContent = 'Unknown';
    moddedSettingsLoader.textContent = 'Unknown';
  }
}

function closeModdedSettings() {
  moddedSettingsModal.classList.add('hidden');
  delete moddedSettingsModal.dataset.versionId;
}

function renderModsList(mods = [], append = false) {
  if (!append) {
    modsList.innerHTML = '';
  }
  if (!mods.length && !append) {
    modsList.innerHTML = '<div class="mods-info">No mods found.</div>';
    loadMoreButton.classList.add('hidden');
    return;
  }

  const installedSet = new Set((installedMods || []).map((mod) => mod.projectId));

  mods.forEach((mod) => {
    const modId = mod.id || mod.project_id;
    const modTitle = mod.name || mod.title;
    const modIcon = mod.logo?.url || mod.icon_url || '';
    const modDesc = mod.summary || mod.description || '';
    const modAuthor = (mod.authors && mod.authors[0]?.name) || mod.author || 'Unknown author';
    
    const item = document.createElement('div');
    item.className = 'mod-item';
    item.dataset.projectId = modId;
    item.dataset.contentType = 'mod';
    const isInstalled = installedSet.has(modId);
    item.innerHTML = `
      <img class="mod-icon" src="${modIcon}" alt="${modTitle}" />
      <div class="mod-meta">
        <h3>${modTitle}</h3>
        <p>${modDesc}</p>
        <div class="mod-author">${modAuthor}</div>
      </div>
      <div class="mod-actions">
        <button 
          data-mod-id="${modId}"
          data-title="${modTitle}"
          data-icon-url="${modIcon}"
          data-author="${modAuthor}"
          ${isInstalled ? 'class="secondary" disabled' : ''}>
          ${isInstalled ? 'Installed' : 'Install'}
        </button>
      </div>
    `;
    modsList.appendChild(item);
  });
}

function renderInstalledMods(mods = []) {
  installedModsList.innerHTML = '';
  if (!mods.length) {
    installedModsList.innerHTML = '<div class="mods-info">No installed mods.</div>';
    return;
  }

  mods.forEach((mod) => {
    if (mod.iconUrl) {
      log(`Downloading icon for ${mod.title}...`);
    }
    const item = document.createElement('div');
    item.className = 'installed-mod-item';
    item.innerHTML = `
      <img src="${mod.iconUrl || ''}" alt="${mod.title}" />
      <div>${mod.title}</div>
      <button data-installed-id="${mod.projectId}">Delete</button>
    `;
    installedModsList.appendChild(item);
  });
}

function renderInstalledResourcepacks(resourcepacks = []) {
  installedResourcepacksList.innerHTML = '';
  if (!resourcepacks.length) {
    installedResourcepacksList.innerHTML = '<div class="resourcepacks-info">No installed resource packs.</div>';
    return;
  }

  resourcepacks.forEach((pack) => {
    const item = document.createElement('div');
    item.className = 'installed-resourcepack-item';
    item.innerHTML = `
      <img src="${pack.iconUrl || ''}" alt="${pack.title}" />
      <div>${pack.title}</div>
      <button data-installed-id="${pack.projectId}">Delete</button>
    `;
    installedResourcepacksList.appendChild(item);
  });
}

function renderInstalledShaders(shaders = []) {
  installedShadersList.innerHTML = '';
  if (!shaders.length) {
    installedShadersList.innerHTML = '<div class="resourcepacks-info">No installed shaders.</div>';
    return;
  }

  shaders.forEach((pack) => {
    const item = document.createElement('div');
    item.className = 'installed-resourcepack-item';
    item.innerHTML = `
      <img src="${pack.iconUrl || ''}" alt="${pack.title}" />
      <div>${pack.title}</div>
      <button data-installed-id="${pack.projectId}">Delete</button>
    `;
    installedShadersList.appendChild(item);
  });
}

async function loadInstalledMods() {
  if (!currentVersionInfo?.isModded) {
    installedMods = [];
    renderInstalledMods([]);
    return;
  }
  try {
    installedMods = await window.minecraftLauncher.listInstalledMods(currentVersionInfo.id);
    renderInstalledMods(installedMods);
  } catch (error) {
    log(`Failed to load installed mods: ${error.message}`);
  }
}

async function loadInstalledResourcepacks() {
  if (!currentVersionInfo?.id) {
    renderInstalledResourcepacks([]);
    return;
  }
  try {
    const resourcepacks = await window.minecraftLauncher.listInstalledResourcepacks(currentVersionInfo.id);
    renderInstalledResourcepacks(resourcepacks);
  } catch (error) {
    log(`Failed to load installed resource packs: ${error.message}`);
  }
}

async function loadInstalledShaders() {
  if (!currentVersionInfo?.id) {
    renderInstalledShaders([]);
    return;
  }
  try {
    const packs = await window.minecraftLauncher.listInstalledShaders(currentVersionInfo.id);
    renderInstalledShaders(packs || []);
  } catch (error) {
    log(`Failed to load installed shaders: ${error.message}`);
  }
}

async function loadInstalledVersionsList() {
  if (!installedVersionsSelect) return;
  installedVersionsSelect.innerHTML = '';
  try {
    const versions = await window.minecraftLauncher.fetchInstalledVersions();
    if (!versions || !versions.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No installed versions';
      installedVersionsSelect.appendChild(opt);
      installedVersionsSelect.disabled = true;
      return;
    }

    installedVersionsSelect.disabled = false;
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '-- Select version --';
    installedVersionsSelect.appendChild(placeholder);

    versions.forEach((ver) => {
      const opt = document.createElement('option');
      opt.value = ver;
      opt.textContent = ver;
      installedVersionsSelect.appendChild(opt);
    });
  } catch (error) {
    log(`Failed to fetch installed versions: ${error.message}`);
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = `Error: ${error.message}`;
    installedVersionsSelect.appendChild(opt);
    installedVersionsSelect.disabled = true;
  }
}

fixVersionBtn?.addEventListener('click', async () => {
  const versionId = installedVersionsSelect?.value;
  if (!versionId) return log('Select a version to fix');
  fixVersionBtn.disabled = true;
  log(`Repairing ${versionId}...`);
  try {
    await window.minecraftLauncher.fixVersion(versionId);
    log(`Repair complete: ${versionId}`);
  } catch (err) {
    log(`Failed to repair ${versionId}: ${err.message}`);
  } finally {
    fixVersionBtn.disabled = false;
  }
});

deleteVersionBtn?.addEventListener('click', async () => {
  const versionId = installedVersionsSelect?.value;
  if (!versionId) return log('Select a version to delete');
  if (!confirm(`Delete version ${versionId}? This will remove its folder.`)) return;
  deleteVersionBtn.disabled = true;
  try {
    const res = await window.minecraftLauncher.deleteVersion(versionId);
    if (res?.deleted) {
      log(`Deleted version: ${versionId}`);
      await loadVersions();
      await loadInstalledVersionsList();
    } else {
      log(`Nothing deleted for ${versionId}`);
    }
  } catch (err) {
    log(`Failed to delete ${versionId}: ${err.message}`);
  } finally {
    deleteVersionBtn.disabled = false;
  }
});

refreshInstalledVersionsBtn?.addEventListener('click', async () => {
  await loadInstalledVersionsList();
});

async function fetchMods(query = '', offset = 0) {
  if (!currentVersionInfo?.isModded) return;
  const mcVersion = currentVersionInfo.baseVersion;
  const loader = currentVersionInfo.loader;
  try {
    const response = await window.minecraftLauncher.searchModrinth({
      query,
      mcVersion,
      loader,
      offset,
      limit: 25
    });
    return response;
  } catch (error) {
    log(`Failed to fetch mods: ${error.message}`);
    return null;
  }
}

async function loadInitialMods() {
  if (!currentVersionInfo?.isModded) return;
  currentModsOffset = 0;
  currentModsQuery = '';
  log(`Loading popular mods for ${formatLoaderName(currentVersionInfo.loader)} ${currentVersionInfo.baseVersion}...`);
  const response = await fetchMods('', 0);
  if (response) {
    renderModsList(response.hits || [], false);
    hasMoreMods = (response.hits || []).length >= 25;
    loadMoreButton.classList.toggle('hidden', !hasMoreMods);
  }
}

function renderResourcepacksList(resourcepacks = [], append = false) {
  if (!append) {
    resourcepacksList.innerHTML = '';
  }
  if (!resourcepacks.length && !append) {
    resourcepacksList.innerHTML = '<div class="resourcepacks-info"><p>No resource packs found.</p></div>';
    loadMoreResourcepacksButton.classList.add('hidden');
    return;
  }

  resourcepacks.forEach((pack) => {
    const packId = pack.id || pack.project_id;
    const packTitle = pack.name || pack.title;
    const packIcon = pack.logo?.url || pack.icon_url || '';
    const packDesc = pack.summary || pack.description || '';
    const packAuthor = (pack.authors && pack.authors[0]?.name) || pack.author || '';
    
    const item = document.createElement('div');
    item.className = 'resourcepack-item';
    
    // Check if already installed - get installed resource packs from the sidebar
    const installedResourcepacks = Array.from(installedResourcepacksList.querySelectorAll('[data-installed-id]')).map(el => el.dataset.installedId);
    const isInstalled = installedResourcepacks.includes(packId);
    
    item.innerHTML = `
      <img class="resourcepack-icon" src="${packIcon}" alt="${packTitle}" />
      <div class="resourcepack-meta">
        <h3>${packTitle}</h3>
        <p>${packDesc}</p>
      </div>
      <div class="mod-actions">
        <button 
          data-mod-id="${packId}" 
          data-title="${packTitle}" 
          data-icon-url="${packIcon}"
          data-author="${packAuthor}"
          ${isInstalled ? 'class="secondary" disabled' : ''}>
          ${isInstalled ? 'Installed' : 'Install'}
        </button>
      </div>
    `;
    resourcepacksList.appendChild(item);
  });
}

async function fetchResourcepacks(query = '', offset = 0) {
  try {
    // Get the selected version and extract base version if it's modded
    const selectedVersionId = versionSelect.value || '1.20';
    let mcVersion = selectedVersionId;
    
    // If it's a modded version, use the base version instead
    if (currentVersionInfo?.isModded && currentVersionInfo?.baseVersion) {
      mcVersion = currentVersionInfo.baseVersion;
    }
    
    const response = await window.minecraftLauncher.searchResourcepacks({
      query,
      mcVersion,
      offset,
      limit: 25
    });
    return response;
  } catch (error) {
    log(`Failed to fetch resource packs: ${error.message}`);
    return null;
  }
}

async function fetchShaders(query = '', offset = 0) {
  // Determine mcVersion and loader. Fall back to the selected version if currentVersionInfo is not ready.
  const selectedVersionFallback = versionSelect.value || window.localStorage.getItem(VERSION_STORAGE_KEY) || null;
  const mcVersion = currentVersionInfo?.baseVersion || currentVersionInfo?.id || selectedVersionFallback;
  // Always use no loader filter for shaders (Modrinth "any" behavior)
  const loader = null;

  if (!mcVersion) {
    log('No version selected for shader search. Select a version and try again.');
    return null;
  }

  log(`Searching shaders for Minecraft ${mcVersion} (loader: any)`);

  try {
    const response = await window.minecraftLauncher.searchModrinthShaders({
      query,
      mcVersion,
      loader,
      offset,
      limit: 25
    });
    return response;
  } catch (error) {
    // If Modrinth is having issues, show friendly retry message
    if (error && error.message && /502|503/.test(error.message)) {
      log('Service unavailable, retrying...');
      try {
        await new Promise((res) => setTimeout(res, 1000));
        const retryResponse = await window.minecraftLauncher.searchModrinthShaders({ query, mcVersion, loader: null, offset, limit: 25 });
        return retryResponse;
      } catch (e) {
        log(`Failed to fetch shaders: ${e.message}`);
        return null;
      }
    }
    log(`Failed to fetch shaders: ${error.message}`);
    return null;
  }
}

async function loadInitialResourcepacks() {
  currentResourcepacksOffset = 0;
  currentResourcepacksQuery = '';
  log('Loading popular resource packs...');
  const response = await fetchResourcepacks('', 0);
  if (response) {
    renderResourcepacksList(response.hits || [], false);
    hasMoreResourcepacks = (response.hits || []).length >= 25;
    loadMoreResourcepacksButton.classList.toggle('hidden', !hasMoreResourcepacks);
  }
}

async function loadInitialShaders() {
  currentShadersOffset = 0;
  currentShadersQuery = '';
  log('Loading popular shaders...');
  const response = await fetchShaders('', 0);
  if (response) {
    renderShadersList(response.hits || [], false);
    hasMoreShaders = (response.hits || []).length >= 25;
    loadMoreShadersButton.classList.toggle('hidden', !hasMoreShaders);
  }
}

function renderShadersList(shaders = [], append = false) {
  if (!append) shadersList.innerHTML = '';
  if (!shaders.length && !append) {
    shadersList.innerHTML = '<div class="resourcepacks-info"><p>No shaders found.</p></div>';
    loadMoreShadersButton.classList.add('hidden');
    return;
  }

  const installedSet = new Set(Array.from(installedShadersList.querySelectorAll('[data-installed-id]')).map(el => el.dataset.installedId));

  shaders.forEach((s) => {
    const shaderId = s.id || s.project_id;
    const shaderTitle = s.name || s.title;
    const shaderIcon = s.logo?.url || s.icon_url || '';
    const shaderDesc = s.summary || s.description || '';
    
    const item = document.createElement('div');
    item.className = 'resourcepack-item';
    const isInstalled = installedSet.has(shaderId);
    item.innerHTML = `
      <img class="resourcepack-icon" src="${shaderIcon}" alt="${shaderTitle}" />
      <div class="resourcepack-meta">
        <h3>${shaderTitle}</h3>
        <p>${shaderDesc}</p>
      </div>
      <div class="mod-actions">
        <button data-mod-id="${shaderId}" data-title="${shaderTitle}" data-icon-url="${shaderIcon}" ${isInstalled ? 'class="secondary" disabled' : ''}>
          ${isInstalled ? 'Installed' : 'Install'}
        </button>
      </div>
    `;
    shadersList.appendChild(item);
  });
}

async function refreshVersionInfo() {
  const versionId = versionSelect.value;
  if (!versionId) return;
  try {
    currentVersionInfo = await window.minecraftLauncher.getVersionInfo(versionId);
    updateVersionSettingsButton();
    if (currentVersionInfo.isModded) {
      const loaderName = formatLoaderName(currentVersionInfo.loader);
      modsInfo.textContent = `Managing mods for ${currentVersionInfo.id} (${loaderName} ${currentVersionInfo.baseVersion})`;
      modSearchInput.disabled = false;
      modSearchButton.disabled = false;
      moddedVersionSelect.disabled = false;
      if (moddedVersionSelect.value !== currentVersionInfo.id) {
        moddedVersionSelect.value = currentVersionInfo.id;
      }
      await loadInstalledMods();
      await loadInitialMods();
    } else {
      modsInfo.textContent = 'Select a modded version to manage mods.';
      modSearchInput.disabled = true;
      modSearchButton.disabled = true;
      modsList.innerHTML = '';
      installedModsList.innerHTML = '';
      installedMods = [];
      loadMoreButton.classList.add('hidden');
      moddedVersionSelect.disabled = availableModdedVersions.length === 0;
      setActiveTab('play');
    }
  } catch (error) {
    log(`Failed to read version info: ${error.message}`);
  }
}

async function loadModdedVersions() {
  try {
    const allVersions = await window.minecraftLauncher.fetchAllVersions();
    availableModdedVersions = (allVersions || []).filter((version) => version.isCustom);
    moddedVersionSelect.innerHTML = '';
    
    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = 'Select a version';
    moddedVersionSelect.appendChild(placeholderOption);
    
    if (availableModdedVersions.length === 0) {
      moddedVersionSelect.disabled = true;
      return;
    }

    moddedVersionSelect.disabled = false;
    availableModdedVersions.forEach((version) => {
      const option = document.createElement('option');
      option.value = version.id;
      option.textContent = version.id;
      moddedVersionSelect.appendChild(option);
    });
  } catch (error) {
    log(`Failed to fetch modded versions: ${error.message}`);
  }
}

window.minecraftLauncher.onLog(log);
window.minecraftLauncher.onProgress((data) => {
  if (!data) return;
  setProgress(data.stage, data.current, data.total, data.downloadStats);
});

const savedUsername = window.localStorage.getItem(USERNAME_STORAGE_KEY);
if (savedUsername) {
  usernameInput.value = savedUsername;
}

const storedShowPrereleases = window.localStorage.getItem(PRERELEASES_STORAGE_KEY);
if (prereleasesToggle) {
  prereleasesToggle.checked = storedShowPrereleases === 'true';
}

const storedShowLogs = window.localStorage.getItem(SHOW_LOGS_STORAGE_KEY);
if (showLogsToggle) {
  logsEnabled = storedShowLogs !== 'false';
  showLogsToggle.checked = logsEnabled;
  updateLogsVisibility();
}

const storedSkipPreparation = window.localStorage.getItem(SKIP_PREPARATION_STORAGE_KEY);
if (skipPreparationToggle) {
  skipPreparationToggle.checked = storedSkipPreparation === 'true';
}

const storedMemoryLimit = window.localStorage.getItem(MEMORY_LIMIT_STORAGE_KEY);
if (memoryLimitInput) {
  const memoryGb = storedMemoryLimit ? Number(storedMemoryLimit) : 4;
  memoryLimitInput.value = String(memoryGb);
  memoryLimitValue.textContent = `${memoryGb} GB`;
}

async function loadVersions() {
  log('Fetching versions...');
  try {
    const allVersions = await window.minecraftLauncher.fetchAllVersions();
    cachedReleaseVersions = (allVersions || []).filter((version) => version.type === 'release');
    const storedVersion = window.localStorage.getItem(VERSION_STORAGE_KEY);
    const previousSelection = storedVersion || versionSelect.value;
    const filteredVersions = getFilteredVersions(allVersions || []);
    versionSelect.innerHTML = '';
    filteredVersions.forEach((version) => {
      const option = document.createElement('option');
      option.value = version.id;
      if (version.isModpack) {
        const loaderText = version.loader ? formatLoaderName(version.loader) : 'Vanilla';
        option.textContent = `${version.id} (${loaderText})`;
      } else if (version.isCustom) {
        const loaderText = version.loader ? formatLoaderName(version.loader) : 'Custom';
        option.textContent = `${version.id} (${loaderText})`;
      } else if (version.isInstalled) {
        option.textContent = `${version.id} (installed)`;
      } else {
        option.textContent = version.id;
      }
      versionSelect.appendChild(option);
    });

    if (previousSelection) {
      const hasOption = Array.from(versionSelect.options).some((option) => option.value === previousSelection);
      if (hasOption) {
        versionSelect.value = previousSelection;
      }
    }

    moddedBaseSelect.innerHTML = '';
    const baseVersions = (allVersions || []).filter((version) => {
      if (version.isCustom) return false;
      if (prereleasesToggle?.checked) return true;
      return version.type === 'release';
    });
    baseVersions.forEach((version) => {
      const option = document.createElement('option');
      option.value = version.id;
      option.textContent = version.id;
      moddedBaseSelect.appendChild(option);
    });

    log('Versions loaded.');
    await refreshVersionInfo();
    updateVersionSettingsButton();
  } catch (error) {
    log(`Failed to fetch versions: ${error.message}`);
  }
}

async function loadJava() {
  log('Fetching Java runtimes...');
  try {
    const runtimes = await window.minecraftLauncher.fetchJava();
    javaSelect.innerHTML = '';
    if (!runtimes || runtimes.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No Java found';
      javaSelect.appendChild(option);
      log('No Java runtimes detected.');
      return;
    }

    runtimes.forEach((runtime, index) => {
      const option = document.createElement('option');
      option.value = runtime.path;
      option.textContent = `Java ${runtime.major} - ${runtime.path}`;
      if (index === 0) option.selected = true;
      javaSelect.appendChild(option);
    });
    log(`Detected ${runtimes.length} Java runtime(s).`);
  } catch (error) {
    log(`Failed to fetch Java runtimes: ${error.message}`);
  }
}

playButton.addEventListener('click', async () => {
  // If already preparing, cancel it
  if (playButton.textContent === 'Stop') {
    await window.minecraftLauncher.cancelPreparation();
    playButton.textContent = 'Play';
    return;
  }

  const username = usernameInput.value.trim() || 'Player';
  window.localStorage.setItem(USERNAME_STORAGE_KEY, username);
  const version = versionSelect.value;
  if (!version) {
    log('Please select a version.');
    return;
  }

  try {
    playButton.textContent = 'Stop';
    const skipPreparation = skipPreparationToggle?.checked || false;
    log(`Starting ${version}${skipPreparation ? ' (skip preparation)' : ''}...`);
    const javaPath = javaSelect.value || '';
    const memoryGb = Number(memoryLimitInput?.value || 4);
    await window.minecraftLauncher.launchGame({ version, username, javaPath, memoryGb, skipPreparation });
    playButton.textContent = 'Play';
  } catch (error) {
    log(`Error: ${error.message}`);
    playButton.textContent = 'Play';
  }
});

tabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setActiveTab(button.dataset.tab);
    if (button.dataset.tab === 'modpacks') {
      loadInstalledModpacks();
      loadInitialModpacks();
    }
    if (button.dataset.tab === 'resourcepacks') {
      loadInitialResourcepacks();
      loadInstalledResourcepacks();
    }
    if (button.dataset.tab === 'shaders') {
      (async () => { await loadInstalledShaders(); await loadInitialShaders(); })();
    }
    if (button.dataset.tab === 'config') {
      (async () => { await loadInstalledVersionsList(); })();
    }
  });
});

prereleasesToggle?.addEventListener('change', async () => {
  window.localStorage.setItem(PRERELEASES_STORAGE_KEY, String(prereleasesToggle.checked));
  await loadVersions();
});

showLogsToggle?.addEventListener('change', () => {
  logsEnabled = Boolean(showLogsToggle.checked);
  window.localStorage.setItem(SHOW_LOGS_STORAGE_KEY, String(logsEnabled));
  updateLogsVisibility();
});

skipPreparationToggle?.addEventListener('change', () => {
  window.localStorage.setItem(SKIP_PREPARATION_STORAGE_KEY, String(skipPreparationToggle.checked));
});

memoryLimitInput?.addEventListener('input', () => {
  const memoryGb = Number(memoryLimitInput.value || 4);
  memoryLimitValue.textContent = `${memoryGb} GB`;
  window.localStorage.setItem(MEMORY_LIMIT_STORAGE_KEY, String(memoryGb));
});

versionSelect.addEventListener('change', () => {
  if (versionSelect.value) {
    window.localStorage.setItem(VERSION_STORAGE_KEY, versionSelect.value);
  }
  (async () => {
    await refreshVersionInfo();
    await loadInstalledShaders();
    if (activeTab === 'shaders') {
      await loadInitialShaders();
    }
  })();
});

moddedVersionSettingsButton.addEventListener('click', () => {
  if (!currentVersionInfo?.isModded) return;
  openModdedSettings({ id: currentVersionInfo.id });
});


createModdedButton.addEventListener('click', () => {
  openModal();
});

createModdedCancel.addEventListener('click', () => {
  closeModal();
});

moddedSettingsClose.addEventListener('click', () => {
  closeModdedSettings();
});

moddedOpenFolder.addEventListener('click', async () => {
  const versionId = moddedSettingsModal.dataset.versionId;
  if (!versionId) return;
  try {
    await window.minecraftLauncher.openVersionFolder({ versionId });
  } catch (error) {
    log(`Failed to open folder: ${error.message}`);
  }
});

moddedRenameConfirm.addEventListener('click', async () => {
  const oldId = moddedSettingsModal.dataset.versionId;
  const newId = moddedRenameInput.value.trim();
  if (!oldId || !newId) return;
  if (oldId === newId) {
    closeModdedSettings();
    return;
  }
  try {
    await window.minecraftLauncher.renameModdedVersion({ oldId, newId });
    await loadVersions();
    await loadModdedVersions();
    versionSelect.value = newId;
    moddedVersionSelect.value = newId;
    await refreshVersionInfo();
    closeModdedSettings();
  } catch (error) {
    log(`Failed to rename modded version: ${error.message}`);
  }
});

moddedDelete.addEventListener('click', async () => {
  const versionId = moddedSettingsModal.dataset.versionId;
  if (!versionId) return;
  const confirmed = window.confirm(`Delete modded version "${versionId}"?`);
  if (!confirmed) return;
  try {
    await window.minecraftLauncher.deleteModdedVersion({ versionId });
    await loadVersions();
    await loadModdedVersions();
    setActiveTab('play');
    await refreshVersionInfo();
    closeModdedSettings();
  } catch (error) {
    log(`Failed to delete modded version: ${error.message}`);
  }
});

createModdedConfirm.addEventListener('click', async () => {
  const customName = moddedNameInput.value.trim();
  const baseVersion = moddedBaseSelect.value;
  const loader = moddedLoaderSelect.value;
  if (!customName) {
    log('Custom version name is required.');
    return;
  }
  try {
    log(`Creating ${formatLoaderName(loader)} profile...`);
    const result = await window.minecraftLauncher.createModdedVersion({
      customName,
      baseVersion,
      loader
    });
    await loadVersions();
    await loadModdedVersions();
    versionSelect.value = result.id;
    await refreshVersionInfo();
    moddedVersionSelect.value = result.id;
    setActiveTab('mods');
    closeModal();
  } catch (error) {
    log(`Failed to create modded version: ${error.message}`);
  }
});

modSearchButton.addEventListener('click', async () => {
  if (!currentVersionInfo?.isModded) {
    log('Select a modded version first.');
    return;
  }
  const query = modSearchInput.value.trim();
  currentModsQuery = query;
  currentModsOffset = 0;
  log(`Searching mods: "${query || 'all'}"...`);
  const response = await fetchMods(query, 0);
  if (response) {
    renderModsList(response.hits || [], false);
    hasMoreMods = (response.hits || []).length >= 25;
    loadMoreButton.classList.toggle('hidden', !hasMoreMods);
  }
});

scanModsFolderButton.addEventListener('click', async () => {
  if (!currentVersionInfo?.isModded) {
    log('Select a modded version first.');
    return;
  }
  
  const profileName = currentVersionInfo.id;
  log('Scanning mods folder...');
  
  try {
    const result = await window.minecraftLauncher.scanModsFolder(profileName);
    log(`Scan complete: ${result.scanned} files scanned, ${result.added} mods added`);
    await loadInstalledMods();
  } catch (error) {
    log(`Error scanning mods folder: ${error.message}`);
  }
});

loadMoreButton.addEventListener('click', async () => {
  if (!currentVersionInfo?.isModded) return;
  currentModsOffset += 25;
  log(`Loading more mods (offset ${currentModsOffset})...`);
  const response = await fetchMods(currentModsQuery, currentModsOffset);
  if (response) {
    renderModsList(response.hits || [], true);
    hasMoreMods = (response.hits || []).length >= 25;
    loadMoreButton.classList.toggle('hidden', !hasMoreMods);
  }
});

resourcepackSearchButton.addEventListener('click', async () => {
  const query = resourcepackSearchInput.value.trim();
  currentResourcepacksQuery = query;
  currentResourcepacksOffset = 0;
  log(`Searching resource packs: "${query || 'all'}"...`);
  const response = await fetchResourcepacks(query, 0);
  if (response) {
    renderResourcepacksList(response.hits || [], false);
    hasMoreResourcepacks = (response.hits || []).length >= 25;
    loadMoreResourcepacksButton.classList.toggle('hidden', !hasMoreResourcepacks);
  }
});

shaderSearchButton.addEventListener('click', async () => {
  const query = shaderSearchInput.value.trim();
  currentShadersQuery = query;
  currentShadersOffset = 0;
  log(`Searching shaders: "${query || 'all'}"...`);
  const response = await fetchShaders(query, 0);
  if (response) {
    renderShadersList(response.hits || [], false);
    hasMoreShaders = (response.hits || []).length >= 25;
    loadMoreShadersButton.classList.toggle('hidden', !hasMoreShaders);
  }
});

loadMoreShadersButton.addEventListener('click', async () => {
  currentShadersOffset += 25;
  log(`Loading more shaders (offset ${currentShadersOffset})...`);
  const response = await fetchShaders(currentShadersQuery, currentShadersOffset);
  if (response) {
    renderShadersList(response.hits || [], true);
    hasMoreShaders = (response.hits || []).length >= 25;
    loadMoreShadersButton.classList.toggle('hidden', !hasMoreShaders);
  }
});

loadMoreResourcepacksButton.addEventListener('click', async () => {
  currentResourcepacksOffset += 25;
  log(`Loading more resource packs (offset ${currentResourcepacksOffset})...`);
  const response = await fetchResourcepacks(currentResourcepacksQuery, currentResourcepacksOffset);
  if (response) {
    renderResourcepacksList(response.hits || [], true);
    hasMoreResourcepacks = (response.hits || []).length >= 25;
    loadMoreResourcepacksButton.classList.toggle('hidden', !hasMoreResourcepacks);
  }
});

modsList.addEventListener('click', async (event) => {
  // Check if clicking on item itself (not button)
  const item = event.target.closest('.mod-item');
  if (item && !event.target.closest('button')) {
    const projectId = item.dataset.projectId;
    if (projectId) {
      await openDetailsView(projectId, 'mod');
      return;
    }
  }
  
  const button = event.target.closest('button[data-mod-id]');
  if (!button || button.disabled) return;
  if (!currentVersionInfo?.isModded) {
    log('Select a modded version first.');
    return;
  }
  const modId = button.dataset.modId;
  const title = button.dataset.title || button.closest('.mod-item')?.querySelector('h3')?.textContent || modId;
  const author = button.dataset.author || button.closest('.mod-item')?.querySelector('.mod-author')?.textContent || 'Unknown author';
  const iconUrl = button.dataset.iconUrl || button.closest('.mod-item')?.querySelector('img')?.getAttribute('src') || '';
  
  try {
    button.disabled = true;
    button.textContent = 'Installing...';
    
    await window.minecraftLauncher.installMod({
      modId,
      mcVersion: currentVersionInfo.baseVersion,
      loader: currentVersionInfo.loader,
      profileName: currentVersionInfo.id,
      title,
      iconUrl,
      author
    });
    
    button.textContent = 'Installed';
    button.classList.add('secondary');
    await loadInstalledMods();
  } catch (error) {
    log(`Failed to install mod: ${error.message}`);
    button.disabled = false;
    button.textContent = 'Install';
  }
});

shadersList.addEventListener('click', async (event) => {
  // Check if clicking on item itself (not button)
  const item = event.target.closest('.resourcepack-item, .shader-item');
  if (item && !event.target.closest('button')) {
    const button = item.querySelector('button[data-mod-id]');
    if (button) {
      const modId = button.dataset.modId;
      if (modId) {
        await openDetailsView(modId, 'shader');
        return;
      }
    }
  }
  
  const button = event.target.closest('button[data-mod-id]');
  if (!button || button.disabled) return;
  if (!currentVersionInfo?.id) {
    log('Select a version first.');
    return;
  }
  const modId = button.dataset.modId;
  const title = button.dataset.title || button.closest('.resourcepack-item')?.querySelector('h3')?.textContent || modId;
  const author = button.dataset.author || '';
  const iconUrl = button.dataset.iconUrl || button.closest('.resourcepack-item')?.querySelector('img')?.getAttribute('src') || '';
  const baseVersion = currentVersionInfo.baseVersion || currentVersionInfo.id;

  try {
    button.disabled = true;
    button.textContent = 'Installing...';

    await window.minecraftLauncher.installShader({
      modId,
      mcVersion: baseVersion,
      profileName: currentVersionInfo.id,
      title,
      iconUrl,
      author,
      loader: currentVersionInfo.loader
    });

    button.textContent = 'Installed';
    button.classList.add('secondary');
    await loadInstalledShaders();
  } catch (error) {
    log(`Failed to install shader: ${error.message}`);
    button.disabled = false;
    button.textContent = 'Install';
  }
});

installedShadersList.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-installed-id]');
  if (!button || !currentVersionInfo?.id) return;
  const projectId = button.dataset.installedId;
  try {
    button.disabled = true;
    button.textContent = 'Deleting...';

    await window.minecraftLauncher.removeShader({
      projectId,
      profileName: currentVersionInfo.id
    });
    await loadInstalledShaders();
    // Re-render the shaders list to update button states
    await fetchShaders(currentShadersQuery, currentShadersOffset).then((resp) => {
      if (resp) renderShadersList(resp.hits || [], false);
    }).catch(() => {});
  } catch (error) {
    log(`Failed to remove shader: ${error.message}`);
    button.disabled = false;
    button.textContent = 'Delete';
  }
});

installedModsList.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-installed-id]');
  if (!button || !currentVersionInfo?.isModded) return;
  const projectId = button.dataset.installedId;
  try {
    button.disabled = true;
    button.textContent = 'Deleting...';
    
    await window.minecraftLauncher.removeMod({
      projectId,
      profileName: currentVersionInfo.id
    });
    await loadInstalledMods();
    
    // Re-render the mods list to update button states
    await loadInitialMods();
  } catch (error) {
    log(`Failed to remove mod: ${error.message}`);
    button.disabled = false;
    button.textContent = 'Delete';
  }
});

installedResourcepacksList.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-installed-id]');
  if (!button || !currentVersionInfo?.id) return;
  const projectId = button.dataset.installedId;
  try {
    button.disabled = true;
    button.textContent = 'Deleting...';
    
    await window.minecraftLauncher.removeResourcepack({
      projectId,
      profileName: currentVersionInfo.id
    });
    await loadInstalledResourcepacks();
    
    // Re-render the resource packs list to update button states
    await loadInitialResourcepacks();
  } catch (error) {
    log(`Failed to remove resource pack: ${error.message}`);
    button.disabled = false;
    button.textContent = 'Delete';
  }
});

moddedVersionSelect.addEventListener('change', async () => {
  const versionId = moddedVersionSelect.value;
  if (!versionId) return;
  versionSelect.value = versionId;
  versionSelect.dispatchEvent(new Event('change'));
  await refreshVersionInfo();
  if (currentVersionInfo?.isModded) {
    await loadInstalledMods();
  }
});

resourcepacksList.addEventListener('click', async (event) => {
  // Check if clicking on item itself (not button)
  const item = event.target.closest('.resourcepack-item');
  if (item && !event.target.closest('button')) {
    const button = item.querySelector('button[data-mod-id]');
    if (button) {
      const modId = button.dataset.modId;
      if (modId) {
        await openDetailsView(modId, 'resourcepack');
        return;
      }
    }
  }
  
  const button = event.target.closest('button[data-mod-id]');
  if (!button || button.disabled) return;
  if (!currentVersionInfo?.id) {
    log('Select a version first.');
    return;
  }
  const modId = button.dataset.modId;
  const title = button.dataset.title || button.closest('.resourcepack-item')?.querySelector('h3')?.textContent || modId;
  const author = button.dataset.author || '';
  const iconUrl = button.dataset.iconUrl || button.closest('.resourcepack-item')?.querySelector('img')?.getAttribute('src') || '';
  const baseVersion = currentVersionInfo.baseVersion || currentVersionInfo.id;
  
  try {
    button.disabled = true;
    button.textContent = 'Installing...';
    
    await window.minecraftLauncher.installResourcepack({
      modId,
      mcVersion: baseVersion,
      profileName: currentVersionInfo.id,
      title,
      iconUrl,
      author
    });
    
    button.textContent = 'Installed';
    button.classList.add('secondary');
    await loadInstalledResourcepacks();
  } catch (error) {
    log(`Failed to install resource pack: ${error.message}`);
    button.disabled = false;
    button.textContent = 'Install';
  }
});

// =============================
// Modpacks Tab
// =============================

async function loadInstalledModpacks() {
  try {
    installedModpacks = await window.minecraftLauncher.listModpacks();
    renderInstalledModpacks();
  } catch (error) {
    log(`Failed to load installed modpacks: ${error.message}`);
  }
}

function renderInstalledModpacks() {
  installedModpacksList.innerHTML = '';
  
  if (installedModpacks.length === 0) {
    installedModpacksList.innerHTML = '<p style="color: #999; font-size: 13px; padding: 8px;">No modpacks installed</p>';
    return;
  }
  
  installedModpacks.forEach(modpack => {
    const item = document.createElement('div');
    item.className = 'installed-modpack';
    
    const loaderText = modpack.loaderType 
      ? `${formatLoaderName(modpack.loaderType)}`.trim()
      : 'Vanilla';
    
    item.innerHTML = `
      <div class="installed-modpack-header">
        <div class="installed-modpack-icon" style="background: linear-gradient(135deg, #3ea6ff, #2d7fc9);"></div>
        <div class="installed-modpack-info">
          <div class="installed-modpack-name" title="${modpack.modpackName || modpack.name}">${modpack.modpackName || modpack.name}</div>
          <div class="installed-modpack-version">${modpack.minecraftVersion} · ${loaderText}</div>
        </div>
      </div>
      <div class="installed-modpack-actions">
        <button class="play-modpack" data-instance="${modpack.versionId}">Play</button>
        <button class="secondary open-modpack-folder" data-instance="${modpack.versionId}">Folder</button>
        <button class="secondary delete-modpack" data-instance="${modpack.versionId}">Delete</button>
      </div>
    `;
    
    installedModpacksList.appendChild(item);
  });
}

async function searchModpacks(query, offset = 0) {
  try {
    const result = await window.minecraftLauncher.searchModpacks({ query, offset });
    return result;
  } catch (error) {
    log(`Modpack search failed: ${error.message}`);
    throw error;
  }
}

function renderModpacks(hits, append = false) {
  if (!append) {
    modpacksList.innerHTML = '';
  }
  
  if (hits.length === 0 && !append) {
    modpacksList.innerHTML = '<p style="color: #999; padding: 16px;">No modpacks found. Try a different search.</p>';
    return;
  }
  
  hits.forEach(modpack => {
    const item = document.createElement('div');
    item.className = 'modpack-item';
    const modpackId = modpack.id || modpack.project_id;
    const modpackTitle = modpack.name || modpack.title;
    const modpackSlug = modpack.slug || modpackTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    
    item.dataset.projectId = modpackId;
    item.dataset.contentType = 'modpack';
    
    const iconUrl = modpack.logo?.url || modpack.icon_url || modpack.gallery?.[0]?.url || '';
    const author = (modpack.authors && modpack.authors[0]?.name) || modpack.author || 'Unknown';
    const downloads = modpack.downloadCount || modpack.downloads || 0;
    const description = modpack.summary || modpack.description || 'No description available';
    
    // Check if installed by matching slug to versionId (since we use slug as custom name)
    const isInstalled = installedModpacks.some(mp => mp.versionId === modpackSlug || mp.name === modpackSlug);
    
    item.innerHTML = `
      <img class="modpack-icon" src="${iconUrl || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'64\' height=\'64\'%3E%3Crect width=\'64\' height=\'64\' fill=\'%23333\'/%3E%3C/svg%3E'}" alt="${modpackTitle}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'64\\' height=\\'64\\'%3E%3Crect width=\\'64\\' height=\\'64\\' fill=\\'%23333\\'/%3E%3C/svg%3E'">
      <div class="modpack-info">
        <div class="modpack-name">${modpackTitle}</div>
        <div class="modpack-meta">by ${author} · ${downloads.toLocaleString()} downloads</div>
        <div class="modpack-description">${description}</div>
      </div>
      <div class="modpack-actions">
        <button 
          class="install-modpack ${isInstalled ? 'secondary' : ''}" 
          data-mod-id="${modpackId}" 
          data-slug="${modpackSlug}"
          ${isInstalled ? 'disabled' : ''}>
          ${isInstalled ? 'Installed' : 'Install'}
        </button>
      </div>
    `;
    
    modpacksList.appendChild(item);
  });
}

async function loadInitialModpacks() {
  currentModpacksOffset = 0;
  currentModpacksQuery = modpackSearchInput.value.trim() || 'featured';
  
  try {
    modpackSearchButton.disabled = true;
    modpackSearchButton.textContent = 'Searching...';
    
    const result = await searchModpacks(currentModpacksQuery, 0);
    renderModpacks(result.hits, false);
    
    hasMoreModpacks = result.hits.length >= 20;
    loadMoreModpacksButton.classList.toggle('hidden', !hasMoreModpacks);
    
    currentModpacksOffset = 20;
  } catch (error) {
    modpacksList.innerHTML = `<p style="color: #f44; padding: 16px;">Error: ${error.message}</p>`;
  } finally {
    modpackSearchButton.disabled = false;
    modpackSearchButton.textContent = 'Search';
  }
}

async function loadMoreModpacksHandler() {
  try {
    loadMoreModpacksButton.disabled = true;
    loadMoreModpacksButton.textContent = 'Loading...';
    
    const result = await searchModpacks(currentModpacksQuery, currentModpacksOffset);
    renderModpacks(result.hits, true);
    
    hasMoreModpacks = result.hits.length >= 20;
    loadMoreModpacksButton.classList.toggle('hidden', !hasMoreModpacks);
    
    currentModpacksOffset += 20;
  } catch (error) {
    log(`Failed to load more modpacks: ${error.message}`);
  } finally {
    loadMoreModpacksButton.disabled = false;
    loadMoreModpacksButton.textContent = 'Load More';
  }
}

modpackSearchButton.addEventListener('click', loadInitialModpacks);
modpackSearchInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') loadInitialModpacks();
});
loadMoreModpacksButton.addEventListener('click', loadMoreModpacksHandler);

// Install modpack
modpacksList.addEventListener('click', async (event) => {
  // Check if clicking on item itself (not button)
  const item = event.target.closest('.modpack-item');
  if (item && !event.target.closest('button')) {
    const projectId = item.dataset.projectId;
    if (projectId) {
      await openDetailsView(projectId, 'modpack');
      return;
    }
  }
  
  const button = event.target.closest('.install-modpack');
  if (!button || button.disabled) return;
  
  const modId = button.dataset.modId;
  const slug = button.dataset.slug;
  
  try {
    button.disabled = true;
    button.textContent = 'Installing...';
    
    await window.minecraftLauncher.installModpack({ projectId: modId, projectSlug: slug });
    
    button.textContent = 'Installed';
    button.classList.add('secondary');
    
    await loadInstalledModpacks();
    log(`Modpack installed: ${slug}`);
  } catch (error) {
    log(`Failed to install modpack: ${error.message}`);
    button.disabled = false;
    button.textContent = 'Install';
    alert(`Installation failed: ${error.message}`);
  }
});

// Play modpack
installedModpacksList.addEventListener('click', async (event) => {
  const playButton = event.target.closest('.play-modpack');
  if (playButton && !playButton.disabled) {
    const versionId = playButton.dataset.instance;
    
    try {
      playButton.disabled = true;
      playButton.textContent = 'Launching...';
      
      const result = await window.minecraftLauncher.launchModpack(versionId);
      
      // Now launch the game with the returned version
      if (result.versionId) {
        const username = usernameInput.value.trim() || 'Player';
        const memoryGb = parseInt(memoryLimitInput.value) || 4;
        
        await window.minecraftLauncher.launchGame({
          version: result.versionId,
          username,
          memoryGb
        });
        
        log(`Launched modpack: ${versionId}`);
      }
    } catch (error) {
      log(`Failed to launch modpack: ${error.message}`);
      alert(`Launch failed: ${error.message}`);
    } finally {
      playButton.disabled = false;
      playButton.textContent = 'Play';
    }
  }
  
  const folderButton = event.target.closest('.open-modpack-folder');
  if (folderButton && !folderButton.disabled) {
    const versionId = folderButton.dataset.instance;
    
    try {
      await window.minecraftLauncher.openModpackFolder(versionId);
    } catch (error) {
      log(`Failed to open folder: ${error.message}`);
    }
  }
  
  const deleteButton = event.target.closest('.delete-modpack');
  if (deleteButton && !deleteButton.disabled) {
    const versionId = deleteButton.dataset.instance;
    
    if (!confirm(`Delete modpack "${versionId}"? This will remove all files.`)) {
      return;
    }
    
    try {
      deleteButton.disabled = true;
      deleteButton.textContent = 'Deleting...';
      
      await window.minecraftLauncher.deleteModpack(versionId);
      
      await loadInstalledModpacks();
      // Re-render the search results to update install states
      await loadInitialModpacks();
      
      log(`Deleted modpack: ${instanceName}`);
    } catch (error) {
      log(`Failed to delete modpack: ${error.message}`);
      alert(`Deletion failed: ${error.message}`);
      deleteButton.disabled = false;
      deleteButton.textContent = 'Delete';
    }
  }
});

// Import modpack from .mrpack file
importModpackButton.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.mrpack';
  
  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      importModpackButton.disabled = true;
      importModpackButton.textContent = 'Importing...';
      
      await window.minecraftLauncher.importModpack(file.path);
      
      await loadInstalledModpacks();
      log(`Imported modpack: ${file.name}`);
      
      alert('Modpack imported successfully!');
    } catch (error) {
      log(`Failed to import modpack: ${error.message}`);
      alert(`Import failed: ${error.message}`);
    } finally {
      importModpackButton.disabled = false;
      importModpackButton.textContent = 'Import .mrpack';
    }
  });
  
  input.click();
});

loadVersions();
loadJava();
refreshVersionInfo();
loadModdedVersions();

// Listen for preparation state changes
window.minecraftLauncher.onPreparationState((isActive) => {
  playButton.textContent = isActive ? 'Stop' : 'Play';
});
// =============================
// Details View System
// =============================

const detailsModal = document.getElementById('details-modal');
const detailsClose = document.getElementById('details-close');
const detailsIcon = document.getElementById('details-icon');
const detailsTitle = document.getElementById('details-title');
const detailsMeta = document.getElementById('details-meta');
const detailsTags = document.getElementById('details-tags');
const detailsActionBtn = document.getElementById('details-action-btn');
const detailsDownloads = document.getElementById('details-downloads');
const detailsUpdated = document.getElementById('details-updated');
const detailsAuthor = document.getElementById('details-author');
const detailsVersions = document.getElementById('details-versions');
const detailsLoaders = document.getElementById('details-loaders');
const detailsDescriptionContent = document.getElementById('details-description-content');
const detailsGallery = document.getElementById('details-gallery');

const galleryViewer = document.getElementById('gallery-viewer');
const galleryClose = document.getElementById('gallery-close');
const galleryPrev = document.getElementById('gallery-prev');
const galleryNext = document.getElementById('gallery-next');
const galleryImage = document.getElementById('gallery-image');
const galleryCounter = document.getElementById('gallery-counter');

let currentProjectDetails = null;
let currentGalleryImages = [];
let currentGalleryIndex = 0;

async function openDetailsView(projectId, contentType = 'mod') {
  try {
    detailsModal.classList.remove('hidden');
    
    // Show loading state
    detailsTitle.textContent = 'Loading...';
    detailsDescriptionContent.innerHTML = '<p style="color: #999;">Loading details...</p>';
    detailsGallery.innerHTML = '<div class="details-gallery-empty">Loading...</div>';
    
    // Fetch project details
    const project = await window.minecraftLauncher.getProjectDetails(projectId);
    const versions = await window.minecraftLauncher.getProjectVersions(projectId);
    
    currentProjectDetails = { project, versions, contentType };
    
    // Populate header - handle both Modrinth and CurseForge formats
    const projectIcon = project.logo?.url || project.icon_url || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'96\' height=\'96\'%3E%3Crect width=\'96\' height=\'96\' fill=\'%23333\'/%3E%3C/svg%3E';
    const projectTitle = project.name || project.title || project.slug;
    const projectAuthor = (project.authors && project.authors[0]?.name) || project.team || 'Unknown';
    const projectDownloads = project.downloadCount || project.downloads || 0;
    const projectUpdated = project.dateModified || project.updated || project.dateCreated;
    const projectDescription = project.summary || project.body || project.description || 'No description available.';
    
    detailsIcon.src = projectIcon;
    detailsIcon.onerror = () => {
      detailsIcon.src = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'96\' height=\'96\'%3E%3Crect width=\'96\' height=\'96\' fill=\'%23333\'/%3E%3C/svg%3E';
    };
    
    detailsTitle.textContent = projectTitle;
    detailsMeta.textContent = project.client_side || project.server_side ? 
      `${project.client_side ? 'Client' : ''}${project.client_side && project.server_side ? ' & ' : ''}${project.server_side ? 'Server' : ''}` : 
      contentType.charAt(0).toUpperCase() + contentType.slice(1);
    
    // Tags - handle both formats
    detailsTags.innerHTML = '';
    const categories = project.categories || [];
    if (categories.length > 0) {
      categories.slice(0, 5).forEach(cat => {
        const tag = document.createElement('span');
        tag.className = 'details-tag';
        tag.textContent = typeof cat === 'string' ? cat : cat.name || cat.slug || '';
        detailsTags.appendChild(tag);
      });
    }
    
    // Action button
    updateDetailsActionButton();
    
    // Info rows
    detailsDownloads.textContent = projectDownloads.toLocaleString();
    detailsUpdated.textContent = projectUpdated ? new Date(projectUpdated).toLocaleDateString() : 'Unknown';
    detailsAuthor.textContent = projectAuthor;
    detailsVersions.textContent = `${versions.length || 0} version${versions.length !== 1 ? 's' : ''}`;
    
    // Get loaders from versions - handle CurseForge format
    const versionsArray = versions.data || versions || [];
    const loaders = [...new Set(versionsArray.flatMap(v => v.loaders || []))];
    detailsLoaders.textContent = loaders.length > 0 ? loaders.join(', ') : 'Any';
    
    // Description (render markdown)
    detailsDescriptionContent.innerHTML = markdownToHtml(projectDescription);
    
    // Gallery - handle screenshots
    currentGalleryImages = project.screenshots || project.gallery || [];
    renderGallery();
    
  } catch (error) {
    log(`Failed to load details: ${error.message}`);
    detailsDescriptionContent.innerHTML = `<p style="color: #f44;">Error loading details: ${error.message}</p>`;
    
    if (error.message.includes('502') || error.message.includes('503')) {
      detailsDescriptionContent.innerHTML = '<p style="color: #f44;">CurseForge API is temporarily unavailable. Please try again later.</p>';
    }
  }
}

function closeDetailsView() {
  detailsModal.classList.add('hidden');
  currentProjectDetails = null;
}

function updateDetailsActionButton() {
  if (!currentProjectDetails) return;
  
  const { project, contentType } = currentProjectDetails;
  const projectId = project.id || project.slug;
  
  // Check if already installed
  let isInstalled = false;
  
  if (contentType === 'modpack') {
    isInstalled = installedModpacks.some(mp => mp.name === project.slug);
  } else if (contentType === 'mod' && currentVersionInfo?.isModded) {
    isInstalled = installedMods.some(mod => mod.projectId === projectId);
  }
  // Add similar checks for resourcepacks and shaders
  
  if (isInstalled) {
    detailsActionBtn.textContent = 'Installed';
    detailsActionBtn.className = 'details-install-btn secondary';
    detailsActionBtn.disabled = true;
  } else {
    detailsActionBtn.textContent = 'Install';
    detailsActionBtn.className = 'details-install-btn';
    detailsActionBtn.disabled = false;
  }
}

function renderGallery() {
  if (!currentGalleryImages || currentGalleryImages.length === 0) {
    detailsGallery.innerHTML = '<div class="details-gallery-empty">No screenshots available</div>';
    return;
  }
  
  detailsGallery.innerHTML = '';
  
  currentGalleryImages.forEach((image, index) => {
    const img = document.createElement('img');
    img.className = 'details-gallery-item';
    // Handle both CurseForge (thumbnailUrl, url) and Modrinth (url) formats
    img.src = image.thumbnailUrl || image.url;
    img.alt = image.title || image.description || `Screenshot ${index + 1}`;
    img.loading = 'lazy';
    
    img.onerror = () => {
      img.src = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'300\' height=\'169\'%3E%3Crect width=\'300\' height=\'169\' fill=\'%231e1e1e\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' fill=\'%23999\' text-anchor=\'middle\' dy=\'.3em\' font-family=\'Arial\' font-size=\'14\'%3EImage failed to load%3C/text%3E%3C/svg%3E';
    };
    
    img.addEventListener('click', () => openGalleryViewer(index));
    
    detailsGallery.appendChild(img);
  });
}

function openGalleryViewer(index) {
  if (!currentGalleryImages || currentGalleryImages.length === 0) return;
  
  currentGalleryIndex = index;
  updateGalleryViewer();
  galleryViewer.classList.remove('hidden');
}

function closeGalleryViewer() {
  galleryViewer.classList.add('hidden');
}

function updateGalleryViewer() {
  if (!currentGalleryImages || currentGalleryImages.length === 0) return;
  
  const image = currentGalleryImages[currentGalleryIndex];
  galleryImage.src = image.url;
  galleryImage.alt = image.title || `Screenshot ${currentGalleryIndex + 1}`;
  galleryCounter.textContent = `${currentGalleryIndex + 1} / ${currentGalleryImages.length}`;
}

function galleryPrevImage() {
  if (!currentGalleryImages || currentGalleryImages.length === 0) return;
  currentGalleryIndex = (currentGalleryIndex - 1 + currentGalleryImages.length) % currentGalleryImages.length;
  updateGalleryViewer();
}

function galleryNextImage() {
  if (!currentGalleryImages || currentGalleryImages.length === 0) return;
  currentGalleryIndex = (currentGalleryIndex + 1) % currentGalleryImages.length;
  updateGalleryViewer();
}

// Details modal event listeners
detailsClose.addEventListener('click', closeDetailsView);
detailsModal.addEventListener('click', (e) => {
  if (e.target === detailsModal) closeDetailsView();
});

detailsActionBtn.addEventListener('click', async () => {
  if (!currentProjectDetails || detailsActionBtn.disabled) return;
  
  const { project, contentType } = currentProjectDetails;
  const projectId = project.id || project.slug;
  
  try {
    detailsActionBtn.disabled = true;
    detailsActionBtn.textContent = 'Installing...';
    
    if (contentType === 'modpack') {
      await window.minecraftLauncher.installModpack({ 
        projectId, 
        projectSlug: project.slug 
      });
      await loadInstalledModpacks();
      log(`Modpack installed: ${project.title}`);
    } else if (contentType === 'mod') {
      if (!currentVersionInfo?.id) {
        alert('Please select a modded version first');
        detailsActionBtn.disabled = false;
        detailsActionBtn.textContent = 'Install';
        return;
      }
      
      await window.minecraftLauncher.installMod({
        projectId,
        mcVersion: currentVersionInfo.baseVersion || currentVersionInfo.id,
        profileName: currentVersionInfo.id,
        title: project.title,
        iconUrl: project.icon_url,
        author: project.team
      });
      await loadInstalledMods();
      log(`Mod installed: ${project.title}`);
    } else if (contentType === 'resourcepack') {
      if (!currentVersionInfo?.id) {
        alert('Please select a version first');
        detailsActionBtn.disabled = false;
        detailsActionBtn.textContent = 'Install';
        return;
      }
      
      await window.minecraftLauncher.installResourcepack({
        projectId,
        mcVersion: currentVersionInfo.baseVersion || currentVersionInfo.id,
        profileName: currentVersionInfo.id,
        title: project.title,
        iconUrl: project.icon_url,
        author: project.team
      });
      await loadInstalledResourcepacks();
      log(`Resource pack installed: ${project.title}`);
    } else if (contentType === 'shader') {
      if (!currentVersionInfo?.id) {
        alert('Please select a version first');
        detailsActionBtn.disabled = false;
        detailsActionBtn.textContent = 'Install';
        return;
      }
      
      await window.minecraftLauncher.installShader({
        projectId,
        mcVersion: currentVersionInfo.baseVersion || currentVersionInfo.id,
        profileName: currentVersionInfo.id,
        title: project.title,
        iconUrl: project.icon_url,
        author: project.team
      });
      await loadInstalledShaders();
      log(`Shader installed: ${project.title}`);
    }
    
    detailsActionBtn.textContent = 'Installed';
    detailsActionBtn.className = 'details-install-btn secondary';
    
  } catch (error) {
    log(`Failed to install: ${error.message}`);
    alert(`Installation failed: ${error.message}`);
    detailsActionBtn.disabled = false;
    detailsActionBtn.textContent = 'Install';
  }
});

// Gallery viewer event listeners
galleryClose.addEventListener('click', closeGalleryViewer);
galleryViewer.addEventListener('click', (e) => {
  if (e.target === galleryViewer) closeGalleryViewer();
});
galleryPrev.addEventListener('click', galleryPrevImage);
galleryNext.addEventListener('click', galleryNextImage);

// Keyboard navigation for gallery
document.addEventListener('keydown', (e) => {
  if (!galleryViewer.classList.contains('hidden')) {
    if (e.key === 'Escape') closeGalleryViewer();
    if (e.key === 'ArrowLeft') galleryPrevImage();
    if (e.key === 'ArrowRight') galleryNextImage();
  } else if (!detailsModal.classList.contains('hidden')) {
    if (e.key === 'Escape') closeDetailsView();
  }
});