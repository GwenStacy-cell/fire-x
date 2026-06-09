# ☢️ Nuker Bot

A Discord bot with a full **server wipe** command built with **discord.js v14**.

## What it does

The `/nuke` slash command wipes a Discord server by:
- 🪝 Deleting all webhooks
- 📢 Deleting all channels
- 🎭 Deleting all roles (except `@everyone` and roles above the bot)
- 😀 Deleting all emojis
- 👢 Kicking (or 🔨 banning) all non-bot members

All actions run in parallel for maximum speed. A confirmation button prevents accidental use.

---

## Setup

### 1. Create a Discord Application & Bot
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application → go to **Bot** tab → click **Add Bot**
3. Enable the following **Privileged Gateway Intents**:
   - ✅ Server Members Intent
   - ✅ Message Content Intent
4. Copy your **Bot Token**

### 2. Get IDs
- **CLIENT_ID**: Your app's Application ID (General Information tab)
- **GUILD_ID**: Right-click your server in Discord → *Copy Server ID* (requires Developer Mode)

### 3. Configure `.env`

Edit the `.env` file in the project root:

```
BOT_TOKEN=your_bot_token_here
CLIENT_ID=your_client_id_here
GUILD_ID=your_guild_id_here
```

### 4. Invite the Bot

Invite the bot with **Administrator** permissions using this URL (replace `CLIENT_ID`):

```
https://discord.com/api/oauth2/authorize?client_id=CLIENT_ID&permissions=8&scope=bot%20applications.commands
```

### 5. Install dependencies

```bash
npm install
```

### 6. Deploy slash commands

```bash
npm run deploy
```

### 7. Start the bot

```bash
npm start
```

---

## Usage

In any channel in your server, type `/nuke`.

| Option | Type | Default | Description |
|---|---|---|---|
| `ban_members` | Boolean | `false` | Ban all members instead of kicking |

The bot will show a confirmation prompt before taking any action.

---

## ⚠️ Disclaimer

This tool is for educational purposes and for use **only on servers you own or have explicit permission to wipe**. Misuse violates [Discord's Terms of Service](https://discord.com/terms).
