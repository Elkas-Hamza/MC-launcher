# MC-launcher

[![Version](https://img.shields.io/badge/version-v1.0.0-blue)](https://github.com/Elkas-Hamza/MC-launcher)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A lightweight, user-friendly free Minecraft launcher to manage installations, versions, mods, and player profiles. MC-launcher aims to provide a fast, reliable, and extensible launcher experience for single-player and modded Minecraft.

## Features

- Manage multiple Minecraft installations and profiles
- Download and launch official Minecraft versions
- Support for mod loaders (Forge, Fabric) — configurable
- Simple UI for creating and switching profiles
- Automatic updates for game files and launcher
- Extensible plugin/mod system (planned)

## Table of Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Usage](#usage)
- [Development (build from source)](#development-build-from-source)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgements](#acknowledgements)
- [Contact](#contact)

## Requirements

List the runtime and development prerequisites here. Example common requirements:

- Java 17+ (for a Java-based launcher) — download: [Adoptium](https://adoptium.net/)
- Recommended: 4 GB free disk space for game files

## Installation

Important: The recommended and supported way to install MC-launcher is via the GitHub Releases page. Prebuilt binaries and installers for supported platforms are published there.

1. Visit the Releases page:
   - https://github.com/Elkas-Hamza/MC-launcher/releases

2. Download the asset that matches your platform (file names and asset types may vary by release):
   - Windows: `MC-launcher-setup-x.y.z.exe` or `MC-launcher-x.y.z.zip` — run the installer or extract and run the executable.

4. Run the launcher:
   - On Windows: double-click the installer or executable.

Notes:
- Releases are the easiest way to get updates and are the distribution method for end users. Check the Releases page for change logs and installation assets.
- If you prefer building from source or contributing, see the "Development (build from source)" section below.

## Quick Start

1. Install the required runtime (Java).
2. Open MC-launcher.
3. Create a new profile in the launcher UI and choose a Minecraft version.
4. Click "Download" to fetch game assets and then "Play" to start Minecraft.

## Usage

- Create and name profiles (e.g., "Vanilla 1.20", "Modded Forge 1.12.2")
- Add JVM arguments if needed (`-Xmx2G`, etc.)
- Use the "Mod Manager" (if implemented) to install/uninstall mods per profile
- Check logs in the UI

## Development (build from source)

If you want to build or run the project yourself (for development or testing), follow these steps after cloning the repository.

Clone the repository:

```bash
git clone https://github.com/Elkas-Hamza/MC-launcher.git
cd MC-launcher
```

Build and run — example commands (adjust to your project's tooling):



Node / Electron 
```bash
npm install
npm run start
# or for packaging
npm run build
```

## Contributing

Contributions are welcome! Please:

1. Open an issue to discuss major changes or feature requests.
2. Follow the branching model: feature branches off `main`.
3. Keep commits small and focused; reference issues in PRs.
4. Ensure tests pass on your branch and CI (if any).

Include a CONTRIBUTING.md if you have repository-specific guidelines.

## Security & EULA

- This project may download official Minecraft assets. You are responsible for complying with Mojang's terms and the Minecraft EULA: https://account.mojang.com/documents/minecraft_eula
- Never include credentials or personal tokens in configs or PRs.
- Report security issues privately via GitHub Security Advisories.

## Roadmap

Planned milestones:
- [ ] Plugin API for third-party extensions
- [ ] Add support for mac and linux
- [ ] Cross-platform installer packages

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details. Replace with your preferred license if different.

## Acknowledgements

- Minecraft and Mojang for the original game
- Open-source libraries and projects used (Forge, Fabric, LWJGL, Electron)

## Contact

Maintainer: Elkas-Hamza  
Repo: https://github.com/Elkas-Hamza/MC-launcher

If you'd like, tell me which packaging formats you plan to publish in Releases (installer, AppImage, JAR, etc.) and I will update the Installation section with exact file names and example commands for each platform, plus an optional sample release checklist.
