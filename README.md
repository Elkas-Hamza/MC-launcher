# 🎮 MClauncher - First Release

## What's New
- Initial release of MClauncher - A lightweight offline Minecraft launcher built with Electron

### Features
- **Version Management**
  - Download and install any Minecraft version
  - Separate game directories for each version
  
- **Complete Game Support**
  - Full asset and library downloading
  - Native library extraction
  - Automatic Java detection
  - Launch game with proper configurations

- **Modding & Customization**
  - Dedicated mods folder for each version
  - Resource packs management
  - Independent game saves per version

- **Clean Interface**
  - No default menu bar (clean UI)
  - Simple and intuitive design
  - Real-time download progress
  - Detailed logging

### Installation
1. Download `MClauncher-Setup-0.1.0.exe` from the releases
2. Run the installer and follow the setup wizard
3. Launch MClauncher from your desktop or Start Menu
4. Select a Minecraft version and click install
5. Once installed, click "Launch Game" to play

### Requirements
- **OS:** Windows 10/11 (x64)
- **Java:** Automatic detection (Java 8+ recommended)
- **Disk Space:** Varies by Minecraft version (~500MB - 2GB)
- **Internet:** Required for initial version downloads

### Known Issues
- First launch may show GPU cache warnings (harmless, can be ignored)
- Java auto-detection may fail on some systems (manual path can be set)

### Technical Details
- Built with Electron 30.5.1
- Unsigned executable (Windows may show SmartScreen warning - click "More info" → "Run anyway")
- Portable game data stored in user AppData

---
**Version:** 0.1.0  
**Build Date:** January 17, 2026  
**License:** MIT
