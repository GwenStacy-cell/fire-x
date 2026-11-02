# 🛡️ Medusa Prime - Hyper-Defense Discord Moderation & Protections Bot

Welcome to **Medusa Prime**, a powerful, state-of-the-art moderation, Anti-Nuke, and anti-raid bot built with modern **Node.js** and **discord.js v14**. This bot combines rich visual layouts (advanced themed embeds) with highly robust security mechanics to isolate threats, mitigate spammers, block rogue administrators, restore server backups, and protect your server's integrity.

---

## ✨ Features

### 🛡️ Active Anti-Nuke Self-Healing Shield
- **Unauthorized Mutations Blocked**: Real-time monitoring of channel deletions, role deletions, channel creations, role creations, vanity URL changes, and role permission grants.
- **Dynamic Restorations & Rollbacks**:
  - **Deleted Channel Recovery**: Re-creates deleted channels instantly with identical name, type, parent category, position, topic, and permission overwrites!
  - **Deleted Role Recovery**: Re-creates deleted roles instantly with original colors, hoist state, permissions, and position!
  - **Vanity URL Recovery**: Instantly restores custom server vanity URLs to their original codes.
  - **Role Grant Rollback**: Instantly removes unauthorized role assignments, and **strips all roles** from the administrator who granted them.
  - **Creation Rollback**: Instantly deletes unauthorized channels/roles.
- **Server Owner DM Complaints**: Sends a direct complaint message to the **Server Owner** (`guild.ownerId`) detailing the violator's ID, the violation type, the enforced punishment (Ban/Kick/Quarantine), and the rollback success status.
- **Immediate Ban Enforcements**: By default, server destruction actions result in an **immediate ban** (configurable via the Buttons Panel).

### 🎙️ Stateful Voice Channel Isolation
- **Active Dragging**: When a user is quarantined, if they are currently connected to voice, the bot caches their `voiceChannelId` and drags/moves them into the designated **Quarantine VC**.
- **VC Position Restoration**: Once unquarantined, if the user is connected, the bot automatically moves them back to their previous voice channel.
- **Visual VC Setup**: Easily bind your server's Quarantine VC using `!setup quarantinevc <Voice_Channel_Name>`.

### 🎛️ Interactive Button-Based Console
- **`!antinuke config`**: Opens a beautiful, interactive embed panel. Administrators can click visual button switches to toggle active protections dynamically and cycle Anti-Nuke punishments between `BAN`, `KICK`, and `QUARANTINE`.
- **`!antinuke enable all` / `disable all`**: Flips all security systems instantly.

### ⚡ Smart AutoMod Filters
- **Prefix-less Ping**: Simply typing `ping` (case-insensitive, no prefix) returns a bold Latency and API speed report (e.g. "**45ms**" / "**52ms**").
- **Profanity Swear Filter**: Automatically deletes messages matching your custom blacklist phrases. Issues warnings and quarantines users exceeding limits.
- **Active Channel Alerts**: All warnings, spam purges, and AutoMod restrictions are posted directly in the channel/VC text chat where the violation occurred.

---

## 🛠️ Step-by-Step Installation Guide

### Step 1: Install Node.js
1. Download and install Node.js (LTS version) from [https://nodejs.org](https://nodejs.org).
2. Verify the installation:
   ```bash
   node -v
   npm -v
   ```

### Step 2: Set Up the Developer Portal
1. Go to the **[Discord Developer Portal](https://discord.com/developers/applications)**, create a new application, and click **Bot** on the left.
2. Turn **ON** these three toggles:
   - ✅ **Presence Intent**
   - ✅ **Server Members Intent**
   - ✅ **Message Content Intent**
3. Reset Token, copy it, and keep it safe!

### Step 3: Configure Settings
1. Open the project folder and edit **`.env`** in a text editor:
   ```env
   DISCORD_TOKEN=YOUR_BOT_TOKEN_HERE
   DEFAULT_PREFIX=!
   ```

### Step 4: Install, Deploy Commands & Start!
1. Open your terminal in the bot's folder and run:
   ```bash
   npm install
   npm run deploy
   npm start
   ```

---

## 🎛️ Command Manual Reference

### 🔨 Moderation & Administration

| Command | Syntax | Description | Required Permissions |
| :--- | :--- | :--- | :--- |
| **`help`** | `!help` or `/help` | Displays the graphical help interface. | None |
| **`ping`** | `ping` or `!ping` | Latency speed connection check (Prefix-less supported). | None |
| **`say`** | `!say <#channel> <message>` | Let the bot send a raw text message. | Manage Messages |
| **`announce`** | `!announce <#ch> <title> \| <msg>`| Sends a highly styled announcement card embed. | Manage Messages |
| **`warn`** | `!warn <user> <reason>` | Issues a warning in active chat. DM alert. | Moderate Members |
| **`warnings`**| `!warnings <user>` | Lists user warning history. | Moderate Members |
| **`clearwarns`**| `!clearwarns <user>` | Clears warning database records. | Moderate Members |
| **`timeout`** | `!timeout <user> <dur> [reason]`| Places native Discord timeout (e.g. `10m`, `1d`). | Moderate Members |
| **`kick`** | `!kick <user> [reason]` | Kicks user from guild. | Kick Members |
| **`ban`** | `!ban <user> [reason]` | Bans user permanently. | Ban Members |
| **`createrole`**| `!createrole <name> [color]` | Creates a server role with specified name and color. | Manage Roles |
| **`deleterole`**| `!deleterole <@role>` | Safely deletes a role. | Manage Roles |

### 🛡️ Server Security & Configuration

| Command | Syntax | Description | Required Permissions |
| :--- | :--- | :--- | :--- |
| **`quarantine`**| `!quarantine <user> [reason]`| Isolates user in quarantine channel & VC. | Moderate Members |
| **`unquarantine`**| `!unquarantine <user>` | Restores original user roles & previous VC. | Moderate Members |
| **`muteall`** | `!muteall [text\|voice]` | Locks writing or mutes voice members. | Mute/Manage Channels |
| **`unmuteall`**| `!unmuteall [text\|voice]` | Unlocks writing or restores voice channels. | Mute/Manage Channels |
| **`lockdown`** | `!lockdown [on\|off]` | Restricts channel writing for `@everyone`. | Manage Channels |
| **`raidmode`** | `!raidmode [on\|off]` | Quarantines all newly joining accounts. | Administrator |
| **`whitelist`**| `!whitelist <add\|remove\|list> [user]`| Manages whitelisted admins (immune to nuke/spam/etc.) | Administrator |
| **`blacklist`**| `!blacklist <add\|remove\|list> [phrase]`| Manages filtered words (deletes and warns instantly). | Moderate Members |
| **`autonick`** | `!autonick <on\|off> [prefix] [suffix]`| Manages join nickname formatting. | Manage Nicknames |
| **`dm`** | `!dm <on\|off\|status>` | Toggles server-wide Athena mention & tag DM notifications. | Manage Guild / Extra Owner |
| **`config`** | `!config <setting> <value>` | Toggle: `antinuke`, `antispam`, `antiinvite`, `maxwarnings`. | Administrator |
| **`setup`** | `!setup [logchannel] [quarantinevc]`| Configures logs channel & Quarantine Voice Channel. | Administrator |
| **`antinuke`** | `!antinuke <enable all\|disable all\|config>`| Toggles all shields, or opens buttons console! | Administrator |
| **`sethomevc`** | `!sethomevc [channel]` | Set Bot Home VC (forces bot to join and stay connected to it). | Bot/Server Owner |
| **`setguildavatar`**| `!setguildavatar <url\|attached image>`| Set the bot's custom server-specific avatar. | Bot/Server Owner |
| **`setguildbanner`**| `!setguildbanner <url\|attached image>`| Set the bot's custom server-specific banner. | Bot/Server Owner |

---

## 📁 Technical Architecture
The bot saves data locally in `data/db.json`. Here is how database files are structured:
- `guilds`: Saves customized text channel logging targets, prefixes, autonick rules, word blacklists, whitelists, and toggles.
- `warnings`: Stores warning reasons, warner IDs, and timestamps.
- `quarantines`: Caches isolated users' original roles and voice channels.

*All system configurations are self-healing. If `#security-logs` or the `#quarantine-zone` channels are missing, the bot creates them automatically when needed!*
