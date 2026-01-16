const versionSelect = document.getElementById('version');
const usernameInput = document.getElementById('username');
const javaSelect = document.getElementById('java');
const playButton = document.getElementById('play');
const tabButtons = document.querySelectorAll('.tab-button');
const tabPlay = document.getElementById('tab-play');
const tabMods = document.getElementById('tab-mods');
const tabConfig = document.getElementById('tab-config');
const createModdedButton = document.getElementById('create-modded');
const modsInfo = document.getElementById('mods-info');
const modSearchInput = document.getElementById('mod-search');
const modSearchButton = document.getElementById('mod-search-btn');
const modsList = document.getElementById('mods-list');
const installedModsList = document.getElementById('installed-mods');
const moddedVersionSelect = document.getElementById('modded-version');
const modal = document.getElementById('modal');
const moddedNameInput = document.getElementById('modded-name');
const moddedBaseSelect = document.getElementById('modded-base');
const moddedLoaderSelect = document.getElementById('modded-loader');
const createModdedConfirm = document.getElementById('create-modded-confirm');
const createModdedCancel = document.getElementById('create-modded-cancel');
const logs = document.getElementById('logs');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');

const USERNAME_STORAGE_KEY = 'minecraftLauncher.username';
let cachedReleaseVersions = [];
let currentVersionInfo = null;
let installedMods = [];
let availableModdedVersions = [];

modSearchInput.disabled = true;
modSearchButton.disabled = true;

function formatLoaderName(loader) {
  if (!loader) return '';
  if (loader === 'neoforge') return 'NeoForge';
  return `${loader.charAt(0).toUpperCase()}${loader.slice(1)}`;
}

function log(message) {
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
  tabButtons.forEach((button) => {
    button.classList.remove('active');
  });
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

  document.querySelectorAll('.tab-content').forEach((content) => {
    content.classList.remove('active');
  });
  document.getElementById(`tab-${tab}`).classList.add('active');
  logs.style.display = tab === 'play' ? 'block' : 'none';
}

function openModal() {
  modal.classList.remove('hidden');
  moddedNameInput.value = '';
}

function closeModal() {
  modal.classList.add('hidden');
}

function renderModsList(mods = []) {
  modsList.innerHTML = '';
  if (!mods.length) {
    modsList.innerHTML = '<div class="mods-info">No mods found.</div>';
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
        <button data-project-id="${mod.project_id}" data-action="${isInstalled ? 'delete' : 'install'}">
          ${isInstalled ? 'Delete' : 'Install'}
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

async function refreshVersionInfo() {
  const versionId = versionSelect.value;
  if (!versionId) return;
  try {
    currentVersionInfo = await window.minecraftLauncher.getVersionInfo(versionId);
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
    } else {
      modsInfo.textContent = 'Select a modded version to manage mods.';
      modSearchInput.disabled = true;
      modSearchButton.disabled = true;
      modsList.innerHTML = '';
      installedModsList.innerHTML = '';
      installedMods = [];
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
    if (availableModdedVersions.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No modded versions';
      moddedVersionSelect.appendChild(option);
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

async function loadVersions() {
  log('Fetching versions...');
  try {
    const allVersions = await window.minecraftLauncher.fetchAllVersions();
    cachedReleaseVersions = (allVersions || []).filter((version) => version.type === 'release');
    const previousSelection = versionSelect.value;
    versionSelect.innerHTML = '';
    (allVersions || []).forEach((version) => {
      const option = document.createElement('option');
      option.value = version.id;
      if (version.isCustom) {
        option.textContent = `${version.id} (custom)`;
      } else if (version.isInstalled) {
        option.textContent = `${version.id} (installed)`;
      } else {
        option.textContent = version.id;
      }
      versionSelect.appendChild(option);
    });

    if (previousSelection) {
      versionSelect.value = previousSelection;
    }

    moddedBaseSelect.innerHTML = '';
    cachedReleaseVersions.forEach((version) => {
      const option = document.createElement('option');
      option.value = version.id;
      option.textContent = version.id;
      moddedBaseSelect.appendChild(option);
    });

    log('Versions loaded.');
    await refreshVersionInfo();
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
    await window.minecraftLauncher.launchGame({ version, username, javaPath });
  } catch (error) {
    log(`Error: ${error.message}`);
  }
});

tabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setActiveTab(button.dataset.tab);
  });
});

versionSelect.addEventListener('change', () => {
  refreshVersionInfo();
});

createModdedButton.addEventListener('click', () => {
  openModal();
});

createModdedCancel.addEventListener('click', () => {
  closeModal();
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
  const mcVersion = currentVersionInfo.baseVersion;
  const loader = currentVersionInfo.loader;
  try {
    log(`Fetching mods for ${formatLoaderName(loader)} ${mcVersion}...`);
    const response = await window.minecraftLauncher.searchModrinth({
      query,
      mcVersion,
      loader
    });
    renderModsList(response.hits || []);
  } catch (error) {
    log(`Failed to fetch mods: ${error.message}`);
  }
});

modsList.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-project-id]');
  if (!button) return;
  if (!currentVersionInfo?.isModded) {
    log('Select a modded version first.');
    return;
  }
  const projectId = button.dataset.projectId;
  const action = button.dataset.action;
  try {
    if (action === 'delete') {
      await window.minecraftLauncher.removeMod({
        projectId,
        profileName: currentVersionInfo.id
      });
    } else {
      const title = button.closest('.mod-item')?.querySelector('h3')?.textContent || projectId;
      const author = button.closest('.mod-item')?.querySelector('.mod-author')?.textContent || 'Unknown author';
      const iconUrl = button.closest('.mod-item')?.querySelector('img')?.getAttribute('src') || '';
      await window.minecraftLauncher.installMod({
        projectId,
        mcVersion: currentVersionInfo.baseVersion,
        loader: currentVersionInfo.loader,
        profileName: currentVersionInfo.id,
        title,
        iconUrl,
        author
      });
    }
    await loadInstalledMods();
    const query = modSearchInput.value.trim();
    if (query) {
      const response = await window.minecraftLauncher.searchModrinth({
        query,
        mcVersion: currentVersionInfo.baseVersion,
        loader: currentVersionInfo.loader
      });
      renderModsList(response.hits || []);
    }
  } catch (error) {
    log(`Failed to update mod: ${error.message}`);
  }
});

installedModsList.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-installed-id]');
  if (!button || !currentVersionInfo?.isModded) return;
  const projectId = button.dataset.installedId;
  try {
    await window.minecraftLauncher.removeMod({
      projectId,
      profileName: currentVersionInfo.id
    });
    await loadInstalledMods();
    const query = modSearchInput.value.trim();
    if (query) {
      const response = await window.minecraftLauncher.searchModrinth({
        query,
        mcVersion: currentVersionInfo.baseVersion,
        loader: currentVersionInfo.loader
      });
      renderModsList(response.hits || []);
    }
  } catch (error) {
    log(`Failed to remove mod: ${error.message}`);
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

loadVersions();
loadJava();
refreshVersionInfo();
loadModdedVersions();
