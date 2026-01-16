# Minecraft Offline Launcher

Offline Minecraft launcher built with Electron, Node.js, and vanilla HTML/CSS/JS.

## Features

- Fetches Mojang version manifest
- Downloads client, libraries, asset indexes, and assets
- Offline launch (no Microsoft/Mojang authentication)
- Logs progress and status in the UI
- Mods tab with Modrinth search and per-profile mod folders

## Setup

1. Install dependencies:
   - `npm install`

2. Start the app:
   - `npm start`

## Java detection

The launcher automatically detects installed Java runtimes and lets you select one in the UI. The latest detected version is selected by default. If Java is not found, open app/main.js and set `MANUAL_JAVA_PATH` to a full path to your Java executable.

## Data location

Minecraft data is stored under the Electron user data directory in a `.minecraft` folder. The launcher passes that folder as `--gameDir` and uses it for assets and libraries.

## Mods

Use the Mods tab to create modded profiles (Fabric/Forge/Quilt/NeoForge). Each profile is created under `.minecraft/versions/<customName>/` with its own mods folder at `.minecraft/mods/<customName>/`.
