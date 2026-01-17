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
const moddedVersionSelect = document.getElementById('modded-version');
const resourcepackSearchInput = document.getElementById('resourcepack-search');
const resourcepackSearchButton = document.getElementById('resourcepack-search-btn');
const resourcepacksList = document.getElementById('resourcepacks-list');
const loadMoreResourcepacksButton = document.getElementById('load-more-resourcepacks');
const installedResourcepacksList = document.getElementById('installed-resourcepacks');
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
const memoryLimitInput = document.getElementById('memory-limit');
const memoryLimitValue = document.getElementById('memory-limit-value');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');

const USERNAME_STORAGE_KEY = 'minecraftLauncher.username';
const VERSION_STORAGE_KEY = 'minecraftLauncher.selectedVersion';
const PRERELEASES_STORAGE_KEY = 'minecraftLauncher.showPrereleases';
const SHOW_LOGS_STORAGE_KEY = 'minecraftLauncher.showLogs';
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

modSearchInput.disabled = true;
modSearchButton.disabled = true;
loadMoreButton.classList.add('hidden');
loadMoreResourcepacksButton.classList.add('hidden');

function formatLoaderName(loader) {
  if (!loader) return '';
  if (loader === 'neoforge') return 'NeoForge';
  return `${loader.charAt(0).toUpperCase()}${loader.slice(1)}`;
}

function log(message) {
  if (!logsEnabled) return;
  const timestamp = new Date().toLocaleTimeString();
  logs.textContent += `[${timestamp}] ${message}\n`;
  logs.scrollTop = logs.scrollHeight;
}

function setProgress(stage, current, total) {
  if (!total || total === 0) {
    progressBar.style.width = '0%';
    progressText.textContent = stage || 'Idle';
    return;
  }
  const percent = Math.floor((current / total) * 100);
  progressBar.style.width = `${percent}%`;
  progressText.textContent = `${stage} (${current}/${total})`;
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
    if (mod.icon_url) {
      log(`Downloading icon for ${mod.title}...`);
    }
    const item = document.createElement('div');
    item.className = 'mod-item';
    const isInstalled = installedSet.has(mod.project_id);
    item.innerHTML = `
      <img class="mod-icon" src="${mod.icon_url || ''}" alt="${mod.title}" />
      <div class="mod-meta">
        <h3>${mod.title}</h3>
        <p>${mod.description || ''}</p>
        <div class="mod-author">${mod.author || 'Unknown author'}</div>
      </div>
      <div class="mod-actions">
        <button 
          data-project-id="${mod.project_id}"
          data-title="${mod.title}"
          data-icon-url="${mod.icon_url || ''}"
          data-author="${mod.author || 'Unknown author'}"
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
    const item = document.createElement('div');
    item.className = 'resourcepack-item';
    
    // Check if already installed - get installed resource packs from the sidebar
    const installedResourcepacks = Array.from(installedResourcepacksList.querySelectorAll('[data-installed-id]')).map(el => el.dataset.installedId);
    const isInstalled = installedResourcepacks.includes(pack.project_id);
    
    item.innerHTML = `
      <img class="resourcepack-icon" src="${pack.icon_url || ''}" alt="${pack.title}" />
      <div class="resourcepack-meta">
        <h3>${pack.title}</h3>
        <p>${pack.description || ''}</p>
      </div>
      <div class="mod-actions">
        <button 
          data-project-id="${pack.project_id}" 
          data-title="${pack.title}" 
          data-icon-url="${pack.icon_url || ''}"
          data-author="${pack.author || ''}"
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
    
    const facets = [
      ['project_type:resourcepack'],
      [`versions:${mcVersion}`]
    ];
    const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query || '')}&limit=25&offset=${offset}&index=relevance&facets=${encodeURIComponent(JSON.stringify(facets))}`;
    const response = await window.minecraftLauncher.fetchJson(url);
    return response;
  } catch (error) {
    log(`Failed to fetch resource packs: ${error.message}`);
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
  setProgress(data.stage, data.current, data.total);
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
      if (version.isCustom) {
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
  const username = usernameInput.value.trim() || 'Player';
  window.localStorage.setItem(USERNAME_STORAGE_KEY, username);
  const version = versionSelect.value;
  if (!version) {
    log('Please select a version.');
    return;
  }

  try {
    log(`Preparing ${version}...`);
    if (!currentVersionInfo?.isModded) {
      await window.minecraftLauncher.downloadVersion(version);
    }
    log('Launching game...');
    const javaPath = javaSelect.value || '';
    const memoryGb = Number(memoryLimitInput?.value || 4);
    await window.minecraftLauncher.launchGame({ version, username, javaPath, memoryGb });
  } catch (error) {
    log(`Error: ${error.message}`);
  }
});

tabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setActiveTab(button.dataset.tab);
    if (button.dataset.tab === 'resourcepacks') {
      loadInitialResourcepacks();
      loadInstalledResourcepacks();
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

memoryLimitInput?.addEventListener('input', () => {
  const memoryGb = Number(memoryLimitInput.value || 4);
  memoryLimitValue.textContent = `${memoryGb} GB`;
  window.localStorage.setItem(MEMORY_LIMIT_STORAGE_KEY, String(memoryGb));
});

versionSelect.addEventListener('change', () => {
  if (versionSelect.value) {
    window.localStorage.setItem(VERSION_STORAGE_KEY, versionSelect.value);
  }
  refreshVersionInfo();
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
  const button = event.target.closest('button[data-project-id]');
  if (!button || button.disabled) return;
  if (!currentVersionInfo?.isModded) {
    log('Select a modded version first.');
    return;
  }
  const projectId = button.dataset.projectId;
  const title = button.dataset.title || button.closest('.mod-item')?.querySelector('h3')?.textContent || projectId;
  const author = button.dataset.author || button.closest('.mod-item')?.querySelector('.mod-author')?.textContent || 'Unknown author';
  const iconUrl = button.dataset.iconUrl || button.closest('.mod-item')?.querySelector('img')?.getAttribute('src') || '';
  
  try {
    button.disabled = true;
    button.textContent = 'Installing...';
    
    await window.minecraftLauncher.installMod({
      projectId,
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
  const button = event.target.closest('button[data-project-id]');
  if (!button || button.disabled) return;
  if (!currentVersionInfo?.id) {
    log('Select a version first.');
    return;
  }
  const projectId = button.dataset.projectId;
  const title = button.dataset.title || button.closest('.resourcepack-item')?.querySelector('h3')?.textContent || projectId;
  const author = button.dataset.author || '';
  const iconUrl = button.dataset.iconUrl || button.closest('.resourcepack-item')?.querySelector('img')?.getAttribute('src') || '';
  const baseVersion = currentVersionInfo.baseVersion || currentVersionInfo.id;
  
  try {
    button.disabled = true;
    button.textContent = 'Installing...';
    
    await window.minecraftLauncher.installResourcepack({
      projectId,
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

loadVersions();
loadJava();
refreshVersionInfo();
loadModdedVersions();
