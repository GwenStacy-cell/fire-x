/**
 * Comprehensive Architectural & Command Explainer Registry for Athena Prime.
 * Provides granular, in-depth architectural breakdowns, zero-day exploit analysis,
 * and under-the-hood mechanics for all modules and commands.
 */

export const ARCHITECTURE_TOPICS = {
  security: {
    id: 'security',
    label: 'Security & Exploit Defense',
    aliases: ['antinuke', 'roleexploit', 'linkedroles', 'linkedrole', 'exploit', 'defense'],
    title: 'Security & Zero-Day Exploit Defense Architecture | <a:atheNATICK:1557841381630681106>',
    description: 'Autonomous zero-day exploit mitigation, Linked Role interception, and raw API defense mechanics.',
    pages: [
      {
        pageTitle: 'Linked Role Exploit Analysis & The 60s Solution',
        content: 
`# 1. What is a "Linked Role"?
Discord has a built-in feature called **Linked Roles (Connections)**. Server administrators can set verification requirements on a role (such as having a connected Steam account with game hours, Reddit karma, YouTube, Twitter/X, GitHub, domain verification, etc.). When a member connects that account, Discord's internal system automatically grants the role to the member.

# 2. Why is this an exploit vector?
• When a moderator or bot gives someone a role, Discord logs an entry in the **Server Audit Log** (\`AuditLogEvent.MemberRoleUpdate\`) showing who gave the role.
• When Discord assigns a Linked Role, **NO AUDIT LOG ENTRY is created by an executor** (there is no moderator or bot recorded; executor is empty/null).
• **The Exploit:** If an unauthorized admin, a compromised bot, or a rogue setup configures a role with **Administrator** (or other dangerous permissions like \`Manage Server\`, \`Manage Roles\`, \`Ban Members\`, \`Manage Channels\`, etc.) as a Linked Role, any member can connect their account and self-claim Administrator permissions with zero audit log footprint.
• Standard antinuke bots that only monitor Audit Logs never see an event and fail to intervene, allowing the attacker to acquire Administrator privileges and nuke the server unnoticed.

# 3. The 60-Second Threshold Solution
As designed for Athena Prime:
• When a member receives an \`Administrator\` or dangerous role (\`guildMemberUpdate\`), check the audit logs immediately.
• If under a **60-second threshold** there is no audit log entry (or the executor is empty/self-assigned), it is identified as an unauthorized **Linked Role Exploit**.
• The bot must immediately strip the role, disarm the role's permissions, quarantine the user, and notify the Server Owner.`
      },
      {
        pageTitle: 'Real-Time Interceptor & Execution Systems',
        content:
`# Real-Time Role Interceptor (\`src/events/guildMemberUpdate.js\`)
• **Trigger:** Fires dynamically whenever any member's roles change.
• **Checks:** Scans if the user gained any dangerous permission (\`Administrator\`, \`Manage Server\`, \`Manage Roles\`, \`Manage Channels\`, \`Ban Members\`, \`Kick Members\`, \`Manage Webhooks\`, \`Mention Everyone\`, or configured Admin Tier roles).
• **Exemption Matrix:** Skips only the Server Owner, Bot Owner, and Extra Owners.
• **60-Second Audit Log Cross-Examination:**
  1. Scans audit logs for an authorized \`MemberRoleUpdate\` within the last 60 seconds.
  2. If no audit log exists, or if the executor is empty/self-assigned, or if the executor is unauthorized:
     • **Instant Role Strip:** Immediately strips the dangerous role(s) from the member via direct Discord REST API.
     • **Disarms Compromised Role:** Revokes dangerous permissions from the role so no other user can exploit it via linked connection.
     • **Quarantine Containment:** Automatically places the exploiter into Quarantine isolation.
     • **Security Log & Owner Alert:** Dispatches a high-priority alert container to the server's security channel and DMs the Server Owner directly.

# God-Tier Execution Engine
• **Raw WebSocket Wiretap:** Sub-millisecond (<1ms) event processing guarantees strikes occur before attackers can broadcast nuke payloads.
• **10ms API Polling:** Continual verification ensuring zero unlogged bypasses or gateway drops.`
      },
      {
        pageTitle: 'Invite, Onboarding & Sentinel Role Hierarchy',
        content:
`# Role-Based Invite & Onboarding Guard (\`src/events/inviteCreate.js\`, \`guildMemberAdd.js\` & \`onboardingGuard.js\`)
• **Trigger:** Real-time raw socket inspection upon invite creation, member join, and prompt audit.
• **Exploit Vectors Mitigated:** Neutralizes Discord Role-Based Invites (invites created with Admin/dangerous roles attached), Discord Onboarding & pre-linked role exploits carrying \`Administrator\`, \`Manage Server\`, \`Manage Roles\`, \`Ban Members\`, etc.
• **Zero-Day Invite Wiretap:** Instantly intercepts \`INVITE_CREATE\` packets; if an invite carries dangerous roles, Athena deletes the invite link in <1ms, disarms the role permissions, and quarantines unauthorized creators.
• **Join-Time Defense:** If a user joins holding dangerous roles from an invite link, Athena strips the roles, disarms the permissions, and quarantines the user before commands can execute.

# Persistence Sentinel Role Engine (\`src/utils/antiStrip.js\`)
• **Command:** \`!unbypassable\` / \`/unbypassable\`
• **Aliases:** \`!unb\`, \`!persistenceroles\`, \`!sentinels\`
• **Access Clearance:** Administrators, Server Owner, Extra Owners, and Bot Owners.
• **Role Hierarchy Positioning:** Establishes \`Athena Unbypassable\` and \`Athena Firewall\` directly below the bot's integration role.
• **Self-Healing Loop:** Automatically re-creates and heals sentinel roles if deleted, stripped, or tampered with by unauthorized staff.`
      },
      {
        pageTitle: 'Zero-Delay Role Stripping & Gateway Interception',
        content:
`# 0ms Pre-Emptive Dangerous Role Stripping (\`src/events/guildMemberUpdate.js\`)
• **The Race Condition:** Nuke bots that exploit dangerous role grants or linked-role connections immediately execute destructive calls within 200-400ms. If an antinuke bot waits 1000ms for audit logs, the nuke bot can delete channels or roles before punishment occurs.
• **The 0ms Solution:** When any member receives a role carrying dangerous permissions (\`Administrator\`, \`ManageRoles\`, \`ManageChannels\`, \`BanMembers\`, \`KickMembers\`), Athena immediately strips the role at **0 milliseconds** before doing any verification.
• **Instant Progressive Verification Loop:** Athena executes an immediate progressive audit loop \`[0ms, 40ms, 100ms, 250ms]\` over pre-warmed Undici TLS sockets:
  1. **Authorized Admin/Owner:** If an authorized admin granted the role, Athena immediately and safely restores it.
  2. **Unauthorized / Exploit:** If no authorized audit entry exists or the grant was unauthorized, Athena keeps the role stripped, disarms dangerous permissions from the role itself, bans rogue grantors via dual-strike, and quarantines the recipient with permanent exploit taint tracking.
• **Result:** Exactly 0 live milliseconds where an attacker holds active Administrator permissions!`
      },
      {
        pageTitle: 'Mass Rogue Role/Channel Annihilation & Direct Strike',
        content:
`# Rogue Channel & Role Annihilation Engine (\`src/utils/antinuke.js\`)
• **The Spam Nuke Vector:** Rapid nuke bots attempt to flood a guild with dozens of spam channels (e.g. \`nuked-by-xyz\`) or spam roles within 2-3 seconds.
• **Dual-Strike Instant Neutralization:**
  • Sub-1ms parallel \`rawRoleStrip\` and \`rawBan\` over pre-warmed keep-alive HTTP/1.1 sockets revokes \`Administrator\` and \`ManageChannels\` in Discord's permissions cache within 10-15ms.
  • Any subsequent REST call dispatched by the nuke bot is immediately rejected by Discord with \`403 Forbidden\`.
• **Rogue Entity Sweep Workers (\`annihilateRogueChannels\` & \`annihilateRogueRoles\`):**
  • Automatically scans live channels and roles created within the last 60 seconds against Athena's ground-truth baseline infrastructure snapshot.
  • Executes parallel batch deletions (10 concurrent requests per batch directly over Undici) to vaporize all rogue spam channels and roles in sub-second time.
• **In-Flight Gateway Interceptors (\`roleCreate.js\` & \`channelCreate.js\`):**
  • When a guild is marked actively under attack (\`isGuildUnderAttack\`), newly arriving rogue spam roles and channels are intercepted and deleted at the gateway layer in sub-5ms before any permission overwrites can be written.`
      },
      {
        pageTitle: 'Server Identity Rollback, Raid Defense & Diagnostics',
        content:
`# Server Identity & Settings Rollback Guard (\`src/events/guildUpdate.js\`)
• **Monitored Vectors:** Server Name, Icon, Banner, Vanity URL, and Verification Level.
• **Zero-Day Reclaim:** If an attacker attempts to rename the server, delete the icon/banner, or tamper with verification, Athena intercepts the event, triggers \`directStrike\` to ban the violator, and instantly restores the original identity via direct API rollback.

# Unified Server Raid Defense Matrix (\`!raidmode\`)
• **Manual Lockdown:** \`!raidmode on\` immediately locks joining operations, auto-quarantines incoming accounts, and elevates the server's verification level to **VERY HIGH (Phone Verified required)** to stop disposable token floods.
• **Safe Restoration:** \`!raidmode off\` restores original baseline verification level from database and triggers parallel mass-unquarantine.
• **Join-Velocity Anti-Raid Shield (\`!raidmode auto on\`):** Tracks incoming join velocity. If join bursts breach the configured threshold (e.g. 8 joins / 5s), Athena automatically engages Raid Mode and elevates verification level to Phone Required without human intervention required.

# Security Diagnostics & Hierarchy Health (\`!health\` / \`!audit\`)
• Real-time diagnostic audit of bot role hierarchy, permissions, persistence roles, and Undici TLS socket latency to Discord API.

# Real-Time Security Live Audit & Records (\`!security records\` / \`!security live\`)
• **Live Memory Threat Stream:** SQLite memory ledger tracking up to 100 recent neutralized hostile incursions across all attack vectors (channel deletes, role creates, admin escalations, rogue bot additions, mass kicks/bans, and rogue invites).
• **Per-Incident Forensic Profiles:** Records the neutralized vector, perpetrator snowflake ID & tag, countermeasure verdict (\`BAN_APPLIED\`, \`ROLES_STRIPPED\`, \`QUARANTINED\`), execution latency in milliseconds (\`1-3ms execution\`), and automatic rollback repair state.
• **Components V2 Interactive Telemetry:** Provides interactive pagination controls (Previous / Next), live SQLite refresh, clear history, and direct transition back to the 28-module defense matrix.`
      }
    ]
  },

  unbypassable: {
    id: 'unbypassable',
    label: 'Persistence Sentinel Roles',
    aliases: ['unb', 'sentinels', 'persistenceroles', 'persist', 'sentinel'],
    title: 'Persistence Sentinel Role Hierarchy & Self-Healing | <a:atheNATICK:1557841381630681106>',
    description: 'Top-tier administrative persistence sentinel roles and self-healing hierarchy safeguards.',
    pages: [
      {
        pageTitle: 'Sentinel Roles Architecture & Hierarchy',
        content:
`# Persistence Sentinel Role Mechanics
Discord enforces strict role hierarchy mechanics:
• A bot can only assign, strip, or modify roles that are positioned strictly **below** its highest integration role.
• If an attacker creates an elevated role above existing moderators, traditional bots become powerless.

# The Athena Sentinel Solution
• Athena automatically provisions two core sentinel roles:
  1. \`Athena Unbypassable\` - The primary administrative sentinel role.
  2. \`Athena Firewall\` - The gateway and packet-filtering sentinel role.
• **Hierarchy Positioning:** Athena positions these roles at the highest feasible position under the bot's own role.
• **Database ID Tracking:** Sentinel role IDs are immediately stored into SQLite database configuration (\`db.updateGuildConfig\`).
• **Self-Healing Daemon:**
  • If a rogue admin or unauthorized bot attempts to delete a sentinel role (\`roleDelete\`), Athena instantly intercepts the event, re-creates the role via direct REST API, and restores its position and permissions.
  • If permissions are stripped from a sentinel role (\`roleUpdate\`), Athena reinstates the required bitfields within milliseconds.`
      }
    ]
  },

  onboarding: {
    id: 'onboarding',
    label: 'Onboarding Exploit Guard',
    aliases: ['neutralizeonboarding', 'onboardingguard'],
    title: 'Discord Onboarding Vulnerability & Neutralization Engine | <a:atheNATICK:1557841381630681106>',
    description: 'Deep audit of Discord Community Onboarding prompt roles and automatic permission disarming.',
    pages: [
      {
        pageTitle: 'Onboarding Exploit Mechanics & Neutralization',
        content:
`# Discord Onboarding Exploit Vector
• Discord Community Onboarding allows servers to configure questionnaire prompts (e.g. "What is your role?").
• Options can be linked to roles that are automatically assigned when a new user selects an option.
• **The Vulnerability:** A rogue administrator or compromised account can silently attach an **Administrator** role to an Onboarding prompt option.
• When a user joins and selects that option during onboarding, Discord's backend assigns the Administrator role **without generating an Audit Log executor event**.

# Athena Neutralization Engine (\`!neutralizeonboarding\`)
• **REST Audit:** Fetches \`/guilds/{guildId}/onboarding\` via raw Discord REST API.
• **Prompt Scanning:** Iterates through every prompt and option, cross-referencing assigned role IDs.
• **Dangerous Permissions Filter:** Checks if any option's role has:
  • \`Administrator\` (0x8)
  • \`Manage Guild\` (0x20)
  • \`Manage Roles\` (0x10000000)
  • \`Ban Members\` (0x4)
  • \`Kick Members\` (0x2)
  • \`Manage Channels\` (0x10)
  • \`Manage Webhooks\` (0x20000000)
• **Proactive Neutralization:**
  1. Updates the Onboarding prompt to remove the dangerous role reference.
  2. Disarms the role itself by wiping all dangerous permissions to \`0n\`.
  3. Quarantines any unauthorized accounts found holding the role.`
      }
    ]
  },

  automod: {
    id: 'automod',
    label: 'Automod & Filter Engine',
    aliases: ['filters', 'antilink', 'wordfilter', 'wf', 'linksallow', 'links'],
    title: 'Automated Moderation & Filter Engine Architecture | <a:atheNATICK:1557841381630681106>',
    description: 'Real-time regex, punycode de-masking, invite blocking, and domain whitelist architecture.',
    pages: [
      {
        pageTitle: 'Multi-Tier Message Filtering Pipeline',
        content:
`# Automod Real-Time Inspection Pipeline
Athena's automod engine inspects every message across Discord Gateway at raw velocity:

# Tier 1: Real-Time Invite Interception (\`!antiinvite\`)
• Analyzes content using strict regular expressions detecting:
  • \`discord.gg/<code|vanity>\`
  • \`discord.com/invite/<code|vanity>\`
  • Obfuscated invite patterns and zero-width spaces.
• Instantly deletes the message (<5ms) and warns/mutes the offender.

# Tier 2: Link & Phishing Guard (\`!antilink\` & \`!linksallow\`)
• Extracts all HTTP/HTTPS links and bare domain structures.
• De-obfuscates URL punycode, markdown links \`[text](url)\`, and embedded redirectors.
• Verifies domains against the guild's approved domain whitelist (\`linksallow\`).
• If unapproved links are detected, Athena deletes the message and logs forensic details.

# Tier 3: Word Filter & Blacklist (\`!wf\` / \`!blacklist\`)
• Normalizes leetspeak, stripped punctuation, and repeated characters.
• Scans against server blacklist words configured in the database.
• Granular Role Bypass: Server owners can whitelist specific roles (\`!automod bypass add @role\`) to allow staff to share links without triggering automod.`
      }
    ]
  },

  voice: {
    id: 'voice',
    label: 'Voice Grid & Channel Drag Architecture',
    aliases: ['vcdrag', 'vcmove', 'massmove', 'massdc', 'voicegrid', 'voicecontrol'],
    title: 'Voice Grid Control & Channel Drag Architecture | <a:atheNATICK:1557841381630681106>',
    description: 'High-velocity loop dragging, mass channel evacuations, voice state severing, and anti-drag protections.',
    pages: [
      {
        pageTitle: 'Voice Drag Loops & Mass Relocation Mechanics',
        content:
`# High-Velocity Voice Dragging (\`!vcdrag\`)
• **Objective:** Disrupts, confuses, or contains rogue actors across voice channels.
• **Execution Mechanics:**
  1. Cycles the target member through all active voice channels sequentially.
  2. Runs via a managed non-blocking interval (\`activeDrags\` map) with configurable delays (default: 2s).
  3. Dispatches Discord REST \`PATCH /guilds/{id}/members/{user}\` setting successive \`channel_id\` values.
  4. Halted safely via \`!vcdragstop\`.
• **Immunity:** Automatically rejects dragging the Server Owner, Bot Owner, or Extra Owners.

# Mass Relocation & Disconnect (\`!massmove\` & \`!massdc\`)
• **Mass Move:** Atomically gathers all occupants of a source voice channel and transfers them to a destination channel with a 150ms buffer to respect Discord voice rate-limiting.
• **Mass Disconnect:** Forcibly kicks all occupants out of a voice channel by patching \`channel_id: null\`, instantly clearing raided or sound-spammed voice channels.`
      }
    ]
  },

  moderation: {
    id: 'moderation',
    label: 'Moderation & Mass Actions',
    aliases: ['mod', 'massactions', 'antiban', 'antiraid', 'modmode'],
    title: 'Zero-Trust Moderation & Mass Action Defense | <a:atheNATICK:1557841381630681106>',
    description: 'Throttled mass actions, anti-ban nuke protection, and reversible maintenance modmode.',
    pages: [
      {
        pageTitle: 'Mass Action Throttling & Rogue Admin Defense',
        content:
`# Mass Action Throttling Engine
Athena actively monitors the velocity of destructive administrative actions:
• **Mass Ban / Kick Protection:** If an authorized admin account is compromised and begins rapid-fire banning members, Athena tracks execution velocity in an in-memory sliding window.
• **Threshold Interception:** When actions exceed configured thresholds (e.g. >3 bans within 10 seconds):
  1. The actor's administrative roles are immediately revoked via direct REST API.
  2. The account is placed into complete Quarantine containment.
  3. Server-wide Emergency Panic Lockdown (\`!panic\`) is automatically triggered to freeze the server.

# Reversible Maintenance Modmode (\`!modmode\`)
• During legitimate server revamps or migrations, owners need to perform bulk edits.
• Running \`!modmode on\` temporarily suppresses restoration and anti-nuke triggers for the Server Owner while maintaining audit trail logging.
• Once maintenance is finished, \`!modmode off\` re-arms all zero-day defense interceptors immediately.`
      }
    ]
  },

  quarantine: {
    id: 'quarantine',
    label: 'Quarantine Containment',
    aliases: ['isolation', 'quarantinesystem'],
    title: 'Zero-Trust Quarantine Isolation Architecture | <a:atheNATICK:1557841381630681106>',
    description: 'Full guild channel permission overrides, role strip caching, and forensic isolation.',
    pages: [
      {
        pageTitle: 'Quarantine Setup & Containment Lifecycle',
        content:
`# Zero-Trust Quarantine Containment
Athena's quarantine system provides full cryptographic isolation of compromised accounts:

# 1. Infrastructure Provisioning (\`!quarantine setup\`)
• Automatically establishes:
  • \`Quarantine Category\` (locked from view)
  • \`Quarantined Role\` (isolated permission bitfields)
  • \`Quarantine Text Channel\` (restricted staff communication)
  • \`Quarantine Voice Channel\`
• **Database ID Binding:** Channel and role IDs are permanently bound in SQLite database.

# 2. Synchronized Guild Isolation
• When a user is quarantined:
  1. Athena iterates through 100% of guild channels, setting permission overwrites for the Quarantined role to explicitly DENY \`ViewChannel\`, \`SendMessages\`, and \`Connect\`.
  2. The offender's active roles are backed up to the database, then stripped via API.
  3. The member is granted the Quarantined role and redirected to the quarantine text channel.

# 3. Clean Release & Role Restoration
• When released via \`!quarantine release <user>\`, Athena retrieves the preserved role IDs from SQLite and restores the member's original roles cleanly.`
      }
    ]
  },

  cloudsync: {
    id: 'cloudsync',
    label: 'Cloud Backup & Manifest',
    aliases: ['backup', 'cloud', 'backupsystem'],
    title: 'Cloud Backup & Persistence Manifest Architecture | <a:atheNATICK:1557841381630681106>',
    description: 'Full guild snapshot serialization, cloud storage dispatch, and 1-click disaster recovery.',
    pages: [
      {
        pageTitle: 'Snapshot Serialization & Disaster Recovery',
        content:
`# Cloud Backup & Persistence Architecture
Athena Prime guarantees server survival even against total guild wipeouts:

# 1. State Snapshot Serialization
• Every cloud backup captures:
  • **Channels:** Position, parent category, type, topic, bitrate, slowmode.
  • **Permission Overwrites:** Complete \`allow\` and \`deny\` bitfields for every role and member.
  • **Roles:** Name, color, hoist status, position hierarchy, icon, permissions bitfield.
  • **Emojis & Stickers:** Assets downloaded and bundled into encrypted storage.
  • **Server Config:** Vanity URL, afk channel, system channel, verification level.

# 2. Cloud Channel Storage
• Snapshots are serialized into encrypted JSON and dispatched to the designated private Cloud Storage channel.
• Backups feature interactive Components V2 verification cards and persistence manifest logs.

# 3. Sub-Second Disaster Recovery
• Running \`!backup load <id>\` restores 100% of server channels, permissions, and roles in exact hierarchical sequence.`
      },
      {
        pageTitle: 'Database Cloud Sync & Host Migration Engine',
        content:
`# 1. Automated Persistent Snapshots (\`src/utils/cloudSync.js\` & \`!db\`)
• **Dual Data Storage Dispatch:** Every 20 minutes (and on boot), flushes in-memory \`db.cache\` to \`data/db.json\` and executes \`wal_checkpoint(TRUNCATE)\` on SQLite \`data/stats.db\`.
• **Complete Schema Coverage (53+ Categories):**
  • **Guild Configurations:** Prefixes, antinuke modules, thresholds, 2FA gates, autoroles, whitelists, auto-nicks.
  • **Heuristic Intelligence:** Staff velocity baselines and anomaly threat signatures from \`!learn\`.
  • **Role Authorization Matrix:** Three-tier role clearances (Admin, Mod, Staff) and global spam permits.
  • **Commerce & Themes:** Economy ledgers, role shop perks, wagers, and custom canvas rank themes (Hogwarts, Athena, Cyberpunk, Anime).
  • **Emergency Bitmasks:** Serialized channel permission bitmasks for 1-click zero-loss \`!unlockdown\` recovery.
  • **Community Data:** Tickets, XP leveling, counting streaks, giveaways, birthdays, auto-reacts, news feeds, sticky messages.

# 2. Zero-Downtime Host Migration Engine (\`checkAndAutoRestore\`)
• **Autonomous Detection:** When migrating the bot to a new VPS or cloud provider, boot-time check detects an empty database (0 guilds).
• **Instant Cloud Restoration:** Interrogates the designated Discord cloud backup channel, downloads the latest \`athena_db_*.json\` and \`stats_*.db\`, reconstructs local files, and hot-reloads memory without requiring a bot restart.
• **Forensic Manifest Diagnostics:** Posts structured breakdown cards confirming server count, security shields, and restored records directly to the backup channel.`
      }
    ]
  },

  auth: {
    id: 'auth',
    label: 'Access Control & Tiers',
    aliases: ['tiers', 'clearance', 'perms', 'tier'],
    title: 'Three-Tier Access Control & Role Authorization | <a:atheNATICK:1557841381630681106>',
    description: 'Three-tier hierarchy (Admin, Mod, Staff), database ID binding, and privilege escalation guards.',
    pages: [
      {
        pageTitle: 'Three-Tier Authorization Matrix',
        content:
`# Three-Tier Access Control System
Athena Prime separates security administration into distinct, tamper-proof tiers:

# Tier 1: Admin Tier (\`!auth admin @role\`)
• Granted access to server configuration, autoroles, verification setup, and sentinel deployment.
• Protected by the Real-Time Role Interceptor against unauthorized self-assignment.

# Tier 2: Mod Tier (\`!auth mod @role\`)
• Granted moderation execution permissions: mute, timeout, kick, warn, purge, and lock.
• Throttled by the Mass Action engine to prevent compromised mod accounts from mass-kicking members.

# Tier 3: Staff Tier (\`!auth staff @role\`)
• Granted community assistance permissions: ticket management, chat moderation, and slowmode controls.

# Database ID Enforcement
• All authorized roles are stored and verified by ID in SQLite database (\`auth_tiers\` table).
• Role name spoofing or role renaming is completely ineffective against Athena's ID-based validation.`
      }
    ]
  }
  ,
  learn: {
    id: 'learn',
    label: 'Heuristic Threat Profiling & Learn Engine',
    aliases: ['heuristics', 'ai', 'behavioral', 'ml', 'profiling', 'signature', 'signatures'],
    title: 'Adaptive Heuristic Profiling & Threat Signature Engine | <a:atheNATICK:1557841381630681106>',
    description: 'Interactive dashboard, staff velocity baselining, and rogue attack signature recording.',
    pages: [
      {
        pageTitle: 'Interactive Dashboard & Telemetry Metrics',
        content:
`# 1. Interactive Components V2 Dashboard (\`!learn\` / \`!learn status\`)
The **Learn Mode Dashboard** provides real-time oversight of Athena's adaptive behavioral intelligence:
• **Live Telemetry Status:**
  - <a:uptime:1552608831060844575> **Active (Adaptive Profiling Engaged)**: Continuous profiling is actively indexing legitimate staff action velocity.
  - <:off:1533844858983157851> **Inactive / Standby**: Threat learning is dormant while static deterministic velocity tripwires protect the guild.
• **Core Telemetry Metrics Tracked:**
  - **Threat Signatures Captured:** Rogue and anomalous attack patterns fingerprinted into SQLite storage.
  - **Baseline Staff Actions Profiled:** Aggregate legitimate staff actions indexed across channels, roles, and webhooks.
  - **Staff Accounts Indexed:** Whitelisted administrative accounts profiled for normal velocity baselines.
  - **False-Positive Guard Status:** Active verification preventing legitimate administrators from being penalized during normal maintenance.
  - **Last Recorded Event & Timestamp:** Discord relative timestamp and last logged event type.
• **Interactive Components V2 Controls:**
  - \`[Engage Learning]\` / \`[Disengage Learning]\`: Toggles continuous adaptive profiling on or off.
  - \`[Run Baseline Scan]\`: Triggers on-demand full audit scan across current staff, elevated roles, and webhooks.
  - \`[View Signatures]\`: Displays paginated view of fingerprinted anomaly records.
  - \`[Clear History]\`: Resets captured signature registry for the server.
  - \`[Refresh]\`: Re-fetches current live SQLite metrics and re-renders container.`
      },
      {
        pageTitle: 'Subcommands, SQLite Engine & Slash Support',
        content:
`# 2. Comprehensive Subcommand Suite (Prefix & Slash Supported)
Athena Prime supports full parity across standard text prefixes (\`!learn\`) and Discord slash commands (\`/learn\`):
• \`!learn on\` / \`!learn enable\`: Engages continuous adaptive profiling.
• \`!learn off\` / \`!learn disable\`: Disengages profiling mode.
• \`!learn baseline\`: Performs a real-time audit scan of server staff members, elevated roles, and webhooks to establish a clean initial baseline.
• \`!learn signatures\` / \`!learn list\`: Displays the recent threat signatures and velocity anomaly patterns recorded for the server.
• \`!learn clear\`: Resets the recorded signature registry for the guild.
• \`!learn status\`: Displays the live telemetry dashboard.

# 3. Persistent SQLite Signature & Baseline Engine (\`src/database.js\`)
• **Database Methods:** Powered by dedicated storage pipelines: \`getNukeSignatures()\`, \`addNukeSignature()\`, \`clearNukeSignatures()\`, \`getLearnBaseline()\`, and \`recordBaselineAction()\`.
• **Infinite Bloat Protection:** Threat signatures and event history are cleanly capped and circular-buffered to maintain microsecond query performance without database degradation.

# 4. Slash Command Support (\`/learn\`)
• Registered as a Discord Chat Input command with an \`action\` option choice: \`status\`, \`enable\`, \`disable\`, \`baseline\`, \`signatures\`, and \`clear\`.`
      }
    ]
  },
  honeypot: {
    id: 'honeypot',
    label: 'Honeypot Trap Security',
    aliases: ['trap', 'honeypots', 'antispam_trap'],
    title: 'Honeypot Channel Trap & Zero-Tolerance Defense | <a:atheNATICK:1557841381630681106>',
    description: 'Decoy channel baiting automated raiders and selfbots into instant timeout and message purge.',
    pages: [
      {
        pageTitle: 'Under-the-Hood Honeypot Mechanics',
        content:
`# 1. What is a Honeypot Trap?
A Honeypot is a designated text channel configured with permissions hidden or silenced for human users, but left visible to automated selfbots, token scrapers, and mass raid accounts that spam every channel.

# 2. Athena's Zero-Latency Tripwire Protocol
• **Channel ID Binding:** The designated channel is tracked strictly by ID (\`dbConfig.honeypotChannelId\`) in SQLite.
• **Instant Message Interception:** In \`src/events/messageCreate.js\`, any message received in the honeypot channel triggers an instant security response:
  1. **Purge:** Message is deleted from Discord in sub-millisecond execution.
  2. **Automated Timeout:** Offender is immediately timed out for \`honeypotTimeoutMinutes\` (default 15 minutes).
  3. **Security Audit Log:** Comprehensive security incident logged with user ID, channel ID, and message snippet.
  4. **Immunity Validation:** Server Owner, Bot Owner, and Extra Owners are bypassed safely.`
      }
    ]
  },
  neural: {
    id: 'neural',
    label: 'Athena Neural AI Matrix',
    aliases: ['ai', 'ask', 'gemini', 'neuralengine', 'toxicity', 'triage'],
    title: 'Athena Prime Neural AI Matrix & Cognitive Safeguards | <a:atheNATICK:1557841381630681106>',
    description: 'Multi-provider AI intelligence, AI Toxicity AutoMod, and Smart Ticket Triage.',
    pages: [
      {
        pageTitle: 'AI Engine & Container Architecture',
        content:
`# 1. Multi-Provider Fallback Matrix
• **Primary:** Google Gemini 3.8 Flash API for advanced reasoning when \`GEMINI_API_KEY\` is configured.
• **Autonomous Fallback:** High-speed edge inference providing resilient fallback responses.
• **Native Emoji Scrubbing:** Filters out unicode Discord emojis to strictly uphold Athena's brand identity.

# 2. Strict AI Invocation Protocol
• **Dedicated Invocations:** AI answers are strictly restricted to the \`!ask\` and \`/ask\` commands.
• **AI Mode:** Server owners can toggle conversational channel mode (\`!aimode channel #channel\`) to bind AI chat to a specific channel.
• **Accent Borderless CV2 Container:** Formats responses with server accent colors, section dividers, and markdown styling.`
      },
      {
        pageTitle: 'AI Toxicity & Sentiment AutoMod Architecture',
        content:
`# 1. AI Toxicity & Sentiment AutoMod Mechanics
• **Proactive Interception:** Scans message streams in real time for severe toxicity, aggressive targeted arguments, hate slurs, and malicious doxxing attempts before human moderators need to intervene.
• **Doxxing Detection Matrix:**
  • **IPv4 / IPv6 Broadcasts:** Intercepts raw IP address leaks combined with dox context or packet keywords (\`lives at\`, \`dox\`, \`swat\`, \`leak\`).
  • **Social Security Numbers (SSN):** Regex heuristic scans for PII SSN patterns (\`000-00-0000\`) under zero-tolerance protocol.
  • **Phone Number & Residential Address Doxxing:** Identifies residential address formats and telephone numbers paired with malicious intent keywords.
• **Autonomous Penalties:**
  • Automatically purges the offending payload from chat.
  • Applies escalating timeouts (15 minutes for toxicity/slurs, 1 hour for critical doxxing/SSN leaks).
  • Dispatches forensic security incident cards to the configured security log channel.

# 2. Strict Optional Deployment
• **Default State:** Disabled by default (\`aiToxicityEnabled: false\`) to preserve complete server autonomy.
• **Configuration Toggles:**
  • Prefix: \`!automod ai on\` / \`!automod ai off\`
  • Slash: \`/automod subcommand:ai_toxicity\`
  • Interactive Dashboard: One-click toggle button in \`!automod advanced\` panel.`
      },
      {
        pageTitle: 'Smart Ban Appeals & Ticket Triage Architecture',
        content:
`# 1. Smart Ticket Triage & Categorization
• **Cognitive Issue Classification:** Automatically classifies user support tickets and modal submissions into clear administrative domains:
  • **Ban Appeal & Punishment Dispute:** Escalates punishment disputes with urgent priority, prompting staff to review moderation audit logs.
  • **Billing & Store Fulfillment:** Directs store and coin inquiries to economy ledgers and fulfillment records.
  • **Bug & Exploit Report:** Flags system glitches with high priority for developer reproduction.
  • **Member Harassment & Safety Report:** Immediately alerts moderators to safety issues and toxic behavior.
  • **General Support & Inquiries:** Organizes standard server inquiries.
• **Automated Executive Summary:** Generates concise 1-2 sentence executive briefs of member inquiries so staff do not need to read long disjointed paragraphs.
• **Actionable Recommendations:** Suggests concrete next steps for support moderators directly inside the ticket channel.

# 2. Optional Setup & Administrative Control
• **Setup Integration:** Can be toggled on directly during ticket deployment:
  • Prefix: \`!ticket setup <#category> <@staffRole> [ai_on]\`
  • Slash: \`/ticket setup category:<cat> staff_role:<role> ai_triage:true\`
• **Standalone Control:**
  • Command: \`!ticket ai on|off\` or \`/ticket ai enabled:true|false\`
  • Ticket Panel Manager: One-click interactive toggle button (\`tp_toggle_ai\`) in \`!ticketpanel\`.`
      }
    ]
  },
  economy: {
    id: 'economy',
    label: 'Commerce & Role Fulfillment Engine',
    aliases: ['shop', 'coins', 'balance', 'daily'],
    title: 'Server Commerce & Role Privilege Matrix | <a:atheNATICK:1557841381630681106>',
    description: 'Persistent currency ledger, interactive coinflip wagering, and automated role shop.',
    pages: [
      {
        pageTitle: 'Economy & Shop Mechanics',
        content:
`# 1. Persistent Currency Ledger
• **SQLite & JSON Storage:** Tracks wallet, vault reserves, and daily streak counters per guild.
• **Daily Stipends:** Consecutive streak bonus rewarding active members up to +600 bonus coins.
• **Cloud Backup Sync:** All economy balances and shop item mappings are continuously synchronized into Discord Cloud Backups.

# 2. Role Shop & Instant Fulfillment
• **Item Registration:** Administrators list purchasable perks with \`!shop add <name> <price> <@role>\`.
• **ID-Based Role Assignment:** When a member purchases an item (\`!shop buy <itemId>\`), coins are deducted atomically and the role is assigned by Role ID.`
      }
    ]
  },

  defcon: {
    id: 'defcon',
    label: 'DEFCON Defense Matrix Architecture',
    aliases: ['defcon', 'threatmatrix', 'panicmode', 'emergencymode', 'dashboard', 'commandcenter', 'omni'],
    title: 'DEFCON Defense Matrix & Panic Architecture | <a:atheNATICK:1557841381630681106>',
    description: 'Autonomous 5-tier threat posture, parallel batched lockdown execution (~1.2s), and zero-loss snapshot rollback.',
    pages: [
      {
        pageTitle: 'The 5-Tier Readiness Spectrum (DEFCON 5 to 1)',
        content:
`# DEFCON Defense Matrix Posture
Athena Prime models military Defense Readiness Conditions (DEFCON) to provide structured threat escalation:

• **DEFCON 5 (Peacetime / Normal Operations):**
  - Baseline operation mode.
  - Sub-millisecond (<1ms) WebSocket wiretap running in background.
  - 60-second Linked Role audit log cross-examination active on \`guildMemberUpdate\`.
  - Normal server verification levels.

• **DEFCON 4 (Guarded / Elevated Surveillance):**
  - Passive staff velocity heuristics tracking rapid role, channel, or webhook actions.
  - Phishing, token stealer, and fake nitro domain filters active.
  - Zero-day invite link inspection neutralizes dangerous permission links in <1ms.

• **DEFCON 3 (Elevated / Heightened Raid Alert):**
  - Join-velocity burst monitoring triggered (default: 8 joins in 5 seconds).
  - Minimum account age restrictions active; automated quarantine armed.
  - Pre-lockdown permission bitmask caching ready in database memory.

• **DEFCON 2 (Severe / Raid Mode Auto-Quarantine):**
  - Engaged automatically via join burst or manually via \`!raidmode on\`.
  - Elevation to **Very High (Verified Phone Required)**.
  - All new incoming joins isolated into \`.   You Have Been Quarantined\`.

• **DEFCON 1 (Maximum Critical / Emergency Blackout):**
  - Engaged via \`!panic\`, \`!emergency\`, or \`!lockdown 3\`.
  - Total server blackout: all public channels hidden or muted for \`@everyone\`.
  - Concurrent batched REST execution (8 channels/chunk) finishes in **~1.2 seconds**.`
      },
      {
        pageTitle: 'Parallel Batched REST Engine (~1.2s Speed)',
        content:
`# Batched Concurrent Execution Engine
Traditional bots execute channel permission alterations sequentially in a single-threaded loop:
\`\`\`js
// Legacy slow approach (15-25 seconds lag):
for (const channel of channels) {
  await channel.permissionOverwrites.set(...); // Triggers lag, attackers exploit the window
}
\`\`\`

Athena Prime employs **Micro-Batched Parallel REST Workers**:
• **Chunk Size (BATCH_SIZE = 8):** Channels are divided into concurrent slices of 8.
• **Concurrent Execution (\`Promise.allSettled\`):** All 8 channels mutate in parallel, maximizing Discord's global per-route bucket throughput without tripping HTTP 429 secondary rate limits.
• **Execution Benchmark:** 60-channel server lockdown or restoration completes in **~1.2 seconds** instead of 20+ seconds.
• **Anti-Bypass Phone Shield:** In Tier 2 and Tier 3 lockdowns, verification is elevated so attackers cannot bypass channel permissions using unverified alt accounts.`
      },
      {
        pageTitle: 'Zero-Loss Bitmask Snapshots & Recovery Manual',
        content:
`# Pre-Lockdown Bitmask Snapshot Serialization
Before any permission is modified, Athena serializes every channel's exact allow/deny bitfield into \`db.cache.lockdownSnapshots\` on disk:
• **Preserves Complex Permissions:** Private staff channels, bot gates, and VIP perms are captured bit-for-bit (\`BigInt\` allow/deny).
• **1-Click Rollback:**
  - Command: \`!unlockdown\` or \`!unpanic\`
  - Interactive Button: \`[Lift Lockdown]\` attached to alert banners.
• **Rollback Integrity:** Replays the exact bitmasks back into the Discord REST API in ~1.2s, restores baseline verification level, reverts raid mode, and flushes database snapshot memory.`
      }
    ]
  },

  lockdown: {
    id: 'lockdown',
    label: 'One-Click Panic Lockdown',
    aliases: ['paniclockdown', 'unlockdown', 'tierlockdown'],
    title: 'One-Click Emergency Panic Lockdown Architecture | <a:atheNATICK:1557841381630681106>',
    description: 'Tiered 1-click server blackout defense, ~1.2s parallel batching, and pre-lockdown bitmask recovery.',
    pages: [
      {
        pageTitle: 'Tiered Lockdown Protocols (Tiers 1, 2, 3)',
        content:
`# Emergency Panic Lockdown Tiers
• **Tier 1 (Soft Lockdown):** Denies \`SendMessages\`, thread creation, and voice \`Speak\` across all public channels for \`@everyone\`.
• **Tier 2 (Medium Lockdown):** Tier 1 + Denies \`AddReactions\`, \`UseApplicationCommands\`, \`AttachFiles\`, and \`EmbedLinks\`. Automatically engages Server Raid Mode and elevates verification to Phone Required.
• **Tier 3 (Nuclear Lockdown):** Total server dark mode. Denies \`ViewChannel\` across all channels (keeping rules/quarantine visible with Send denied) and disallows voice connections.
• **Pre-Lockdown Snapshot Persistence:** Prior to altering any permissions, Athena serializes all channel overwrite bitmasks into \`db.cache.lockdownSnapshots\` on disk.`
      },
      {
        pageTitle: 'Zero-Loss State Restoration Engine',
        content:
`# State Restoration Engine (\`!unlockdown\` / \`/unlockdown\`)
• **Database Snapshot Lookup:** Retrieves the exact bitmasks snapshotted prior to panic lockdown engagement.
• **Parallel Batched Restoration:** Iterates through channels in concurrent chunks of 8, restoring pre-lockdown permissions via \`channel.permissionOverwrites.set()\` in ~1.2s.
• **Verification & Raid Normalization:** Automatically restores verification level and raid protection state to their pre-lockdown baseline.
• **Database Flush:** Clears the temporary snapshot once all channels are verified healthy.`
      }
    ]
  },

  phishing: {
    id: 'phishing',
    label: 'Automated Phishing & Scam Shield',
    aliases: ['phishingshield', 'antiscam', 'fakegift', 'nitroshield'],
    title: 'Real-Time Anti-Phishing & Token Stealer Shield | <a:atheNATICK:1557841381630681106>',
    description: 'High-speed regex domain classifier and token stealer neutralizer.',
    pages: [
      {
        pageTitle: 'Phishing Heuristics & Domain Spoofing Mitigations',
        content:
`# Automated Threat Classifier (\`src/utils/phishingShield.js\`)
• **Domain Spoofing Interception:** Inspects lookalike domains mimicking Discord (e.g., \`discorcl\`, \`dlscord\`, \`discord-nitro-gift\`, \`steam-community\`).
• **Zero-Day Token Stealer Regex:** Detects browser credential snatchers, token grabber links, and fake Steam trade authorization traps.
• **Sub-Millisecond Wiretap:** Intercepts message packets inside \`messageCreate.js\` before members can click malicious URLs.
• **Immediate Neutralization:** Deletes malicious link in <1ms, applies a 1-hour timeout quarantine to the infected account, and dispatches an alert container to the security log channel.`
      }
    ]
  },

  captcha: {
    id: 'captcha',
    label: 'Graphic CAPTCHA & Math Verification',
    aliases: ['verify', 'mathcaptcha', 'graphiccaptcha'],
    title: 'Graphic CAPTCHA & Math Verification Engine | <a:atheNATICK:1557841381630681106>',
    description: 'Canvas noise distortion and zero false-positive raid barrier.',
    pages: [
      {
        pageTitle: 'Algorithmic Noise & Distortion Verification',
        content:
`# Graphic CAPTCHA Engine (\`src/utils/captchaEngine.js\`)
• **Canvas Noise Injection:** Generates high-entropy multi-colored distortion lines and dot clusters preventing OCR evasion.
• **Rotational Character Jitter:** Applies randomized degree rotation (-15° to +15°) to alphanumeric glyphs.
• **In-Memory TTL Cryptography:** Stores generated answers in multi-guild memory maps with automatic 5-minute expiration timers.
• **Interactive Modal Flow:** Members view the generated graphic challenge and submit solutions via Discord interactive text modals.`
      }
    ]
  },

  minigames: {
    id: 'minigames',
    label: 'Casino Minigames & Tournaments',
    aliases: ['blackjack', 'roulette', 'trivia', 'casinostats'],
    title: 'Casino Minigames & Server Economy Architecture | <a:atheNATICK:1557841381630681106>',
    description: 'Interactive Components V2 casino card tables, roulette wheels, and trivia tournaments.',
    pages: [
      {
        pageTitle: 'Blackjack, Roulette & Trivia Mechanics',
        content:
`# Minigames & Economy Suite (\`src/commands/minigames.js\`)
• **Blackjack Table:** Standard 52-card deck with Fisher-Yates shuffling, Ace valuation (1/11), interactive \`Hit\`, \`Stand\`, and \`Double Down\` Components V2 buttons, and 3:2 Natural 21 payouts.
• **European Roulette:** Provably fair wheel selection (numbers 0 through 36) supporting Red/Black (2x), Even/Odd (2x), Green Zero (14x), and Single Number (36x) bets.
• **Trivia Tournaments:** Multi-topic question bank rendered with 4 shuffled Discord action buttons and 25-second countdown timers.
• **Ledger Persistence:** Atomic wallet balance deduction, recorded tournament stats in SQLite, and Discord Cloud Backup synchronization.`
      }
    ]
  },

  studio: {
    id: 'studio',
    label: 'Container Studio & Forensic Audits',
    aliases: ['auditlogs', 'embedstudio', 'forensics'],
    title: 'Container Studio & Forensic Audit Logs Architecture | <a:atheNATICK:1557841381630681106>',
    description: 'Visual container announcement builder and deep Gateway audit log inspection.',
    pages: [
      {
        pageTitle: 'Container Studio & Forensic Inspection',
        content:
`# Container Studio & Forensic Audit Logs (\`src/commands/studio.js\`)
• **Interactive Studio Builder:** Allows staff to compose title, description, custom fields, and footers via Discord modals, with live ephemeral previews and persistent template storage on disk.
• **Forensic Audit Log Engine:** Direct Gateway API interrogation of \`GuildAuditLogs\` with member/executor filtering, action classifier mapping, and relative timestamp analysis.`
      }
    ]
  },

  athena: {
    id: 'athena',
    label: 'Athena AI Specialist & System Guide',
    aliases: ['guide', 'botguide', 'aiguide', 'neuralguide', 'ai_guide', 'athena_guide', 'ai'],
    title: 'Athena AI Specialist & System Guide Architecture | <a:atheNATICK:1557841381630681106>',
    description: 'Dynamic codebase RAG, Damerau-Levenshtein typo correction, rolling thread memory, and 1-click action buttons.',
    pages: [
      {
        pageTitle: 'Dynamic Knowledge RAG & Typo Auto-Correction',
        content:
`# 1. Dynamic Command Catalog Indexing (\`src/utils/botGuideKnowledge.js\`)
• **Autonomous Codebase RAG:** Dynamically introspects and indexes all 257+ commands, slash schemas, parameter syntax, permission bitmasks, and subcommands directly from \`src/commands/loader.js\`.
• **Subsystem Deep Dockets:** Generates domain dossiers for complex subsystems (Security & Antinuke, AutoMod & Filters, Quarantine Isolation, Ticket Management, Voice Grid, Economy, Leveling).
• **Fuzzy Typo Auto-Correction (Damerau-Levenshtein Algorithm):**
  • Automatically intercepts misspelled command names (e.g. \`!athena how to use rnkthme\`, \`tcikets\`, \`atninuke\`, \`qrmanager\`, \`vcdrg\`).
  • Calculates transposition and edit distance against the command index; immediately matches and injects the canonical command definition and exact syntax into the retrieval-augmented generation (RAG) context.

# 2. Clearance-Aware Adaptive Guidance
• **Role Tier Cross-Examination:** Resolves caller's authorization tier (Server Owner, Extra Owner, Admin Tier, Mod Tier, Public Member).
• **Adaptive Synthesized Instructions:** Automatically alerts members if elevated clearance (like Administrator or Extra Owner) is mandatory before attempting execution, preventing unauthorized privilege escalation confusion.
• **Prefix-First Formatting:** Formats guidance with clean Discord markdown code blocks (\`!command <arg>\`) prioritizing the server's configured prefix while detailing slash command alternatives (\`/command\`).`
      },
      {
        pageTitle: 'Conversational Memory, Thread Expiry & Streaming Telemetry',
        content:
`# 1. Multi-Turn Conversational Thread Memory
• **Session State Preservation (\`athenaSessions\` Map):** Scopes multi-turn conversational context to \`channelId_userId\`. Users can ask natural follow-up questions (e.g., "how do I add a bypass for that?", "give me a button for that") without repeating the original command context.
• **Rolling 10-Minute Expiry (Sliding TTL):** Every turn updates \`expiresAt = Date.now() + 10 * 60 * 1000\`.
• **Garbage Collection Sweep:** Automatically evicts expired sessions from memory to guarantee zero heap degradation.

# 2. Live Thinking Telemetry & Multi-Tier AI Cascade (\`src/utils/ai.js\`)
• **Live Progress Counter:** Emits a live-updating thinking banner with elapsed execution time (\`Thinking... (1.2s)\`) keeping users informed during external AI API processing.
• **Google Gemini 3.8 Flash Flagship Pipeline:** Primary engine utilizing Google Generative Language REST \`system_instruction\` schema with relaxed cybersecurity moderation for technical bot administration.
• **Cascade Fallback Matrix:**
  • Tier 1: \`gemini-3.8-flash\`
  • Tier 2: Resilient neural edge failover responding in <3s.`
      },
      {
        pageTitle: 'One-Click Action Buttons & On-Demand Interactive Components',
        content:
`# 1. Interactive Action Buttons (\`style: 2\`)
• **Strict Palette Compliance:** Every generated button strictly enforces Discord Secondary style (\`style: 2\`, grey), with literally no color.
• **Domain Action Synthesis:** Automatically generates executable grey action buttons for queried commands:
  • \`ranktheme\`: 1-Click buttons to preview and switch between Anime, Cyberpunk, and Hogwarts themes.
  • \`ticket\`: 1-Click launch of the interactive Ticket Panel Manager.
  • \`security\` / \`antinuke\`: 1-Click security overview dashboard.
  • \`automod\`: 1-Click interactive AutoMod configuration toggle.
  • \`quarantine\`: 1-Click quarantine deployment wizard.
• **Proactive Invitation Protocol:** Informs users that interactive action buttons are attached and explicitly invites them to request custom buttons for any sub-feature.

# 2. On-Demand Custom Button Generator (\`detectRequestedButton\`)
• **Natural Language Intent Parsing:** Scans user prompts and follow-up replies for button requests (e.g., "give me a button for anime theme", "make a button to configure antinuke", "add a button to check security").
• **Dynamic Component Synthesis:** On-the-fly component generator creates and binds the exact requested action buttons directly to the response container.
• **Component Execution Pipeline (\`handleAthenaGuideButtons\` in \`src/commands/athena.js\`):** Directly validates caller permissions before executing database mutations, launching modals, or toggling subsystems.`
      }
    ]
  },

  aiannounce: {
    id: 'aiannounce',
    label: 'AI Announcement Studio & Neural Pipeline',
    aliases: ['aian', 'smartannounce', 'studioannounce', 'ai_announcement', 'aiannouncement'],
    title: 'AI Announcement Studio & Neural Pipeline Architecture | <a:atheNATICK:1557841381630681106>',
    description: 'Autonomous natural language speech enhancement, custom emoji & raw ID synthesis, Components V2 live preview studio, and broadcast dispatching.',
    pages: [
      {
        pageTitle: 'Human-Speech Error Resilience & Natural Language Ingestion',
        content:
`# 1. Human-Speech Error Resilience & Natural Language Ingestion (\`src/commands/aiannounce.js\`)
• **Casual Speech & Typo Normalization:** Ingests unrefined, brief, or typo-ridden human prompts (e.g. *"game night at 8pm ist bring snax and drinks, use emoji id 1557841381630681106 for bullets"*).
• **Neural Prompt Refinement:** Transmits prompt through Google Gemini 3.8 Flash High intelligence engine, enhancing structure, grammatical flow, and tone while faithfully preserving all facts, dates, times, and participant instructions.
• **Discord Grey Subtext Post-Processing (\`cleanAnnouncementBody\`):**
  • Automatically prefixes every body line with \`-# \` to render Discord's modern grey subtext typography.
  • Dynamically converts emphasized phrases, dates, and roles into bold underlines: \`**__Time: 8:00 PM IST__**\`.
  • Strips raw markdown hashes (\`#\`, \`##\`) and square brackets from content lines to guarantee uniform aesthetic presentation.`
      },
      {
        pageTitle: 'Custom Emoji Resolution & Raw ID Synthesis Engine',
        content:
`# 1. Custom Emoji & Numerical ID Extraction (\`resolveCustomEmojiIds\`)
• **Raw Emoji ID Extraction:** Users can supply raw 18–19 digit Discord snowflake IDs directly in the prompt (e.g. \`use emoji id 1557841381630681106 for bullets\` or \`use 1557841381630681107 in heading\`).
• **Live Guild & Client Cache Lookup:** Athena evaluates numerical IDs against \`client.emojis.cache.get(id)\` and \`guild.emojis.cache.get(id)\`:
  • Resolves whether the emoji is animated (\`<a:name:id>\`) or static (\`<:name:id>\`).
  • Formats the full Discord emoji token so the client renders it natively without broken text strings.
• **Heading vs. Bullet Custom Emoji Placement:**
  • If a title/heading emoji is designated, the AI strictly embeds it in the announcement title.
  • If a bullet emoji is designated, the AI applies that exact emoji at the beginning of each bullet item.
• **Zero-Native-Emoji Enforcement:** Automatically strips Discord native unicode emojis to maintain pristine Athena Prime brand compliance.`
      },
      {
        pageTitle: 'Components V2 Interactive Studio Controls & Broadcast Dispatcher',
        content:
`# 1. Ephemeral Components V2 Live Studio Preview (\`buildAnnouncementStudioContainer\`)
• **Interactive Preview Mode:** Generates a real-time Components V2 container (\`type: 17\`) showing the announcement exactly as members will see it before anything is dispatched.
• **Target Channel Dropdown Selector:** Interactive \`ChannelSelectMenuBuilder\` configured for \`GuildText\` and \`GuildAnnouncement\` channels, allowing staff to route broadcasts with 1 click.
• **Broadcast Mention Mode Selector:** Dedicated \`StringSelectMenuBuilder\` allowing instant toggles between:
  • \`Silent (No Mention)\` — Clean message drop without pings.
  • \`@here (Online Members)\` — Pings active channel members.
  • \`@everyone (All Members)\` — Server-wide notification.
• **Full In-Flight Manual Modals:** Staff can edit Title, Body, Footer, or Media/Banner URLs at any point before dispatching.

# 2. Discord Payload Display Limit Budgeting & Safe Dispatching
• **4,000-Character Display Ceiling Protection:** Discord enforces a strict 4,000 character limit across all displayable text components combined.
• **Dynamic Budget Allocation:** Calculates fixed header, controls, and footer length and dynamically caps body text to stay strictly $\\le 3,800$ characters via \`sanitizeCV2Payload\`.
• **Atomic Broadcast Dispatch:** Posts the finalized announcement container to the target channel with mention bitfield elevation and auto-deletes the preview studio.`
      }
    ]
  }
,

  welcome: {
    id: 'welcome',
    label: 'Welcome, Leave & Dynamic Placeholders',
    aliases: ['welcomer', 'greet', 'leave', 'farewell', 'placeholders', 'membercount', 'welcome_engine'],
    title: 'Welcome, Leave & Dynamic Placeholder Engine | <a:atheNATICK:1557841381630681106>',
    description: 'Autonomous join greetings, departure dispatch, CV2 container formatting, and multi-token variable resolution.',
    pages: [
      {
        pageTitle: 'Dynamic Variable Interpolation & Full Placeholder Suite',
        content:
`# Dynamic Variable Interpolation Engine (resolvePlaceholders)
Athena Prime features a high-performance, multi-token variable resolution engine in \`src/commands/welcome.js\` that dynamically injects real-time guild and member metadata into greeting messages, embeds, and auto-replies.

### Supported Placeholder Matrix
• **Member Count Tokens:**
  - \`{membercount}\`, \`{member_count}\`, \`{members}\`, \`{count}\`, \`{server.membercount}\` — Injects live guild member total (e.g. \`142\`).
• **Ordinals & Milestones:**
  - \`{ordinal}\`, \`{ordinal_count}\`, \`{ordinal_membercount}\` — Injects formatted join ordinal (e.g. \`1st\`, \`2nd\`, \`3rd\`, \`142nd\`).
• **User Identification Tokens:**
  - \`{user}\`, \`{member}\` — Injects user mention \`<@id>\` or customizable Markdown profile link (\`[User](https://discord.com/users/id)\`).
  - \`{mention}\`, \`{usermention}\`, \`{user.mention}\` — Injects literal user ping \`<@id>\`.
  - \`{username}\`, \`{user.username}\`, \`{name}\` — Clean sanitized username.
  - \`{displayname}\`, \`{nickname}\`, \`{nick}\` — Server nickname or display name.
  - \`{tag}\`, \`{usertag}\`, \`{user.tag}\` — Full Discord tag.
  - \`{userid}\`, \`{user.id}\`, \`{id}\` — Raw Discord snowflake ID.
  - \`{avatar}\`, \`{user.avatar}\`, \`{useravatar}\` — Direct CDN avatar URL.
• **Account & Join Chronology:**
  - \`{created}\`, \`{created_at}\`, \`{user.created_at}\` — Discord relative timestamp for account age (<t:timestamp:R>).
  - \`{joined}\`, \`{joined_at}\`, \`{user.joined_at}\` — Discord relative timestamp for guild join date (<t:timestamp:R>).
• **Guild & Server Metadata:**
  - \`{server}\`, \`{guild}\`, \`{servername}\`, \`{server.name}\` — Guild name.
  - \`{serverid}\`, \`{server.id}\`, \`{guildid}\` — Guild snowflake ID.
  - \`{server.icon}\`, \`{servericon}\`, \`{guild.icon}\` — Direct CDN guild icon URL.
  - \`{owner}\`, \`{server.owner}\`, \`{guild.owner}\` — Server Owner mention.
  - \`{ownerid}\`, \`{server.owner_id}\` — Server Owner snowflake ID.
  - \`{boosts}\`, \`{boost_count}\`, \`{server.boosts}\` — Total server boost count.
  - \`{tier}\`, \`{server.tier}\` — Nitro boost tier level.
  - \`{roles}\`, \`{rolecount}\` — Total active roles in guild.
  - \`{channels}\`, \`{channelcount}\` — Total active channels in guild.`
      },
      {
        pageTitle: 'Welcome & Leave Architecture & Deliverability',
        content:
`# Welcome & Leave Dispatch Architecture (src/commands/welcome.js)
• **Event Gateways:**
  - Join triggers in \`guildMemberAdd\` immediately dispatch \`sendWelcomeMessage(member)\`.
  - Departure triggers in \`guildMemberRemove\` immediately dispatch \`sendLeaveMessage(member)\`.
• **Resilient Channel Fetching:**
  - Uses \`guild.channels.cache.get(id) || await guild.channels.fetch(id)\` to eliminate silent drops caused by cold channel caches or bot restarts.
• **Dual Layout Architecture (Content + Embed):**
  - **Top Text (message):** Standalone plaintext header rendered above the card.
  - **Embed Construction (buildWelcomeEmbed):** Fully customizable author, title, description, thumbnail, large media (GIF & MP4 conversion), server accent theme integration (via !accent), footer text, and footer icons.
• **Universal Media & Pinterest Pipeline:**
  - Full support for direct Pinterest links (\`pin.it\` and \`pinterest.com/pin/...\`). Athena automatically scrapes the master uncompressed image resolution for Large Image, Thumbnail, Author Icon, and Footer Icon.
  - Automatically converts uploaded MP4 videos into animated looping Discord GIFs via \`convertMp4ToGif\` and re-hosts them securely on Discord CDN via \`uploadGifToDiscord\`.
• **Auto-Reply Integration (src/commands/trigger.js):**
  - All auto-responders and trigger keyword replies dynamically parse the full placeholder suite on invocation. Supports direct Pinterest links for automated response images and GIFs.`
      }
    ]
  }
,
  synced_gif_hud: {
    id: 'synced_gif_hud',
    label: 'Synced Looping Animated GIF HUDs & Progress Bars',
    aliases: ['gifhud', 'canvasbanner', 'progressbar', 'gifprogress', 'animatedhud', 'sleekbar', 'warroom'],
    title: '1024x512 Sci-Fi War Room Animated GIF HUD Architecture | <a:atheNATICK:1557841381630681106>',
    description: '1024x512 cyberpunk war room control deck 8-frame looping GIF engine with electric plasma oscillating sine wave progress bars across all tracking & security commands.',
    pages: [
      {
        pageTitle: 'Looping GIF Architecture & Canvas Rendering Pipeline',
        content:
`# Dynamic Looping Animated GIF Engine (generateCommandStatusBanner)
Athena Prime features a specialized real-time 8-frame animated GIF generation engine in \`src/utils/canvasCards.js\` modeled after the ultra-sleek 1024x512 Athena Global Defense War Room Control Center.

### Under-The-Hood Mechanics:
• **War Room Command Base Plate (1024x512):** Built upon high-fidelity tactical holographic deck art (\`src/assets/hud_war_room_plate.jpg\`) with translucent cyber glass console overlay (\`roundRect(242, 82, 616, 250, 12)\`).
• **Rotating Avatar Reticle:** Features dual concentric neon radar borders at \`(cx: 138, cy: 177, r: 50)\` with 12 rotating HUD degree tick marks that dynamically rotate each frame (\`rotAngle = (f / numFrames) * Math.PI * 2\`).
• **Dynamic Badge Pill with Chevrons:** Displays high-priority status with chevron brackets (\`>>>\`) and electric accent border glow.
• **Dual-Harmonic Electric Plasma Sine Wave:**
  - The progress bar (\`barX: 255, barY: 202, barW: 580, barH: 26\`) is drawn directly onto each frame of the canvas before compilation.
  - Multi-harmonic trigonometric sine waves (\`Math.sin(relX * 0.05 + phi * 2) * 5.5\` + \`Math.cos(relX * 0.04 - phi * 1.5) * 4.5\`) create authentic oscillating energy currents through the plasma bar.
  - Features an oscillating plasma head orb and lens flare that sweeps seamlessly along the active fill position.
• **Three Dynamic Metric Chips:** Bottom HUD chips dynamically display real-time live metrics and operational values.
• **Two-Pass FFmpeg Optimization:**
  - Compiles 8 frames using \`palettegen=stats_mode=diff\` with custom Bayer dithering (\`paletteuse=dither=bayer:bayer_scale=3\`) via \`ffmpeg-static\`.
  - Delivers crystal-clear 1024x512 looping animations in ~1.2s without external API rate limits.
• **Components V2 Media Gallery Integration:**
  - Seamlessly embedded in Discord Components V2 (\`type: 12\`) referencing local attachments (\`attachment://filename.gif\`).`
      },
      {
        pageTitle: 'Synced Command Matrix & Real-Time Tracking Integration',
        content:
`# Real-Time Synchronized Command Matrix
The 1024x512 War Room animated GIF HUD with in-GIF electric progress bar is implemented across all 9 core commands with tracking or configurable parameters:

### 1. Whitelist Overview & Clearance (!whitelist / !wl)
• **File:** \`wl_banner.gif\` & \`wl_access.gif\`
• **Metrics Tracked:** Total whitelisted users and roles vs 25 trusted cap; individual member whitelisted category counts vs total defense categories.
• **In-GIF Progress Bar:** Dynamically shifts from red (untrusted) to cyber green/cyan (#00ff88) as permissions are granted.

### 2. Security Firewall Status (!security / !ss)
• **File:** \`sec_status.gif\`
• **Metrics Tracked:** Active defense modules vs total 28 modules, member hierarchy gate (200 threshold), and threat events blocked.
• **In-GIF Progress Bar:** Indicates total shield integrity and real-time firewall defense health.

### 3. Trigger Response Matrix (!trigger / !trig)
• **File:** \`trigger_banner.gif\`
• **Metrics Tracked:** Server trigger count vs 50-slot capacity, global network auto-responses, and synchronization state.
• **In-GIF Progress Bar:** Visualizes server trigger memory capacity and slot allocation.

### 4. AutoMod Heuristic Matrix (!automod)
• **File:** \`automod_banner.gif\`
• **Metrics Tracked:** 10 core heuristic filters (AI Toxicity, Mentions, Anti-Flood, Anti-Link, Invites, Word Filter, Big Fonts, Selfbot, Hidden URLs, File Check), active bypass count, and honeypot timeout.
• **In-GIF Progress Bar:** Visualizes server heuristic filter armor integrity.

### 5. Server Threat Audit (!scanserver / !scan)
• **File:** \`scan_banner.gif\`
• **Metrics Tracked:** Verified safe bots vs total server bots, high-risk human administrators, and dangerous onboarding prompt roles.
• **In-GIF Progress Bar:** Indicates server threat verification ratio.

### 6. Infraction Tracker HUD (!warnings / !warn)
• **File:** \`warn_banner.gif\`
• **Metrics Tracked:** Active warnings on disk vs server escalation threshold (!maxwarnings), punishment escalation (quarantine/timeout).
• **In-GIF Progress Bar:** Visualizes disciplinary strike meter from clean green to punishable crimson.

### 7. Security Diagnostics & Health (!health / !audit)
• **File:** \`health_banner.gif\`
• **Metrics Tracked:** Global server health score (0-100%), core permissions clearance (8/8), audit socket round-trip latency (ms).
• **In-GIF Progress Bar:** Dynamic server health meter with real-time diagnostics.

### 8. Anti-Raid Panic Mode (!raidmode)
• **File:** \`raid_banner.gif\`
• **Metrics Tracked:** Lockdown engagement level, join-velocity auto-shield threshold and window, isolated accounts in quarantine.
• **In-GIF Progress Bar:** Visualizes server intrusion lockdown posture.

### 9. Quarantine Containment Manager (!qrmanager status)
• **File:** \`qr_banner.gif\`
• **Metrics Tracked:** 4/4 containment components (Quarantine Role, Category, Text Channel, Voice Chamber).
• **In-GIF Progress Bar:** Visualizes quarantine setup completeness and readiness.`
      }
    ]
  },

  tts_voices: {
    id: 'tts_voices',
    label: 'AI & Celebrity TTS Voices Engine',
    aliases: ['tts', 'voice', 'voices', 'celebritytts', 'speech', 'donaldtrump', 'modi', 'michaeljackson'],
    title: 'AI & Celebrity Text-To-Speech (TTS) Voice Engine | <a:atheNATICK:1557841381630681106>',
    description: 'Zero-latency multi-celebrity and character voice transformation engine with real-time acoustic DSP filtering and instant VC streaming.',
    pages: [
      {
        pageTitle: 'Voice Directory & Command Syntax',
        content:
`# AI & Celebrity Voice Directory & Syntax
Athena Prime includes a built-in voice transformation suite featuring world leaders, global pop icons, and iconic characters:

### Celebrity & Character Roster:
• **Donald Trump (\`trump\`):** Resonant baritone, punchy cadence, aggressive pitch modulation.
• **Narendra Modi (\`modi\`):** Deliberate tempo, harmonic overtone richness, rhythmic inflection.
• **Barack Obama (\`obama\`):** Measured cadence, baritone warmth, signature rhythmic pauses.
• **Michael Jackson (\`mj\`):** High tenor, 6.2Hz rapid signature vibrato, expressive presence.
• **Taylor Swift (\`taylor\`):** Bright crystal acoustic presence, airy tone, rhythmic warmth.
• **Ariana Grande (\`ariana\`):** High soprano, gentle airy modulation, extended harmonic lift.
• **Sabrina Carpenter (\`sabrina\`):** Warm conversational modern pitch, crisp acoustic articulation.
• **Justin Bieber (\`bieber\`):** R&B melodic cadence, subtle vibrato, tenor resonance.
• **Elon Musk (\`elon\`):** Fast cadence, thoughtful pauses, tech-pitch modulation.
• **Darth Vader (\`vader\`):** Deep sub-bass growl, mechanical flanger, heavy resonance.
• **Chipmunk (\`chipmunk\`):** Ultra-high pitch shift (+8.5 semitones), energetic tempo boost.
• **Demon / Monster (\`demon\`):** Dual-pitch sub-octave growl (-9.5 semitones) with demonic chorus.
• **Robot / Cyber (\`robot\`):** 40Hz square-wave robotic flanger with synthetic vocoder tone.
• **Ghost / Spectral (\`ghost\`):** Ethereal tremolo, resonant echo, spatial spectral shimmer.

### Command Usage:
• **Interactive Directory:** \`!tts voices\` — View all celebrity & character options in a Components V2 gallery.
• **Set Default Voice:** \`!tts voice <name>\` (e.g. \`!tts voice trump\` or \`!tts voice mj\`).
• **Reset to Standard:** \`!tts voice default\` — Restores neutral delivery.
• **On-The-Fly Shortcut:** \`!tts <voice> <msg>\` (e.g. \`!tts trump We have the best server\` or \`!tts mj Shamone he he\`).
• **Voice Channel Auto-TTS:** \`!tts autovc\` — Automatically reads all typed messages in current VC.`
      },
      {
        pageTitle: 'Audio DSP Pipeline & Architecture',
        content:
`# Under-The-Hood Audio DSP Architecture
Unlike slow third-party web scrapers that face rate-limits and 30-second queues, Athena Prime uses a localized high-performance DSP audio pipeline in \`src/utils/ttsVoiceEngine.js\`:

### Execution Pipeline:
1. **Base Speech Synthesis:** Generates high-fidelity base speech stream using localized language accent matching.
2. **Audio DSP Filtering via FFmpeg:**
   - Feeds raw audio through custom \`-af\` filterchains using \`ffmpeg-static\`.
   - Modulates pitch via \`asetrate=r*X\`, restores tempo with \`atempo=1/X\`.
   - Applies custom 3-band parametric acoustic EQ (\`equalizer=f=...:t=q:w=...:g=...\`).
   - Introduces dynamic vibrato (\`vibrato=f=...:d=...\`), flange choruses, and spectral pitch-shifters.
3. **Sub-120ms Execution Speed:**
   - Synthesizes and filters full speech clips in 80ms - 150ms.
   - Piped directly into Discord voice via \`@discordjs/voice\` AudioResource without disk thrashing.
4. **100% Uptime & Independence:**
   - Completely immune to API outages, external token exhaustion, or third-party downtime.`
      }
    ]
  },

  advanced_triggers: {
    id: 'advanced_triggers',
    label: 'Advanced Trigger & Automation Engines',
    aliases: ['triggers', 'trigger', 'autoresponder', 'ar', 'bounty', 'ghosttrigger', 'clocktrigger'],
    title: 'Advanced Next-Gen Trigger & Automation Systems | <a:atheNATICK:1557841381630681106>',
    description: 'Autonomous trigger word responder matrix, 4 advanced automation engines, emoji synergy, emergency mirroring, and dual-interface setup.',
    pages: [
      {
        pageTitle: 'The 4 Advanced Trigger Engines',
        content:
`# The 4 Advanced Trigger Automation Engines
Athena Prime expands traditional auto-responders into an intelligent automation network with 4 specialized execution modules:

### 1. Ghost / Self-Destruct Triggers (\`ghost:<seconds>\`)
• **Mechanics:** Once invoked in chat, the trigger response auto-deletes itself cleanly after a specified number of seconds without leaving chat clutter.
• **Syntax:** \`!trigger create secret | This self-destructs! | ghost:10\`
• **Use Cases:** Temporary notices, event passwords, ephemeral game hints.

### 2. Bounty XP Rewards (\`xp:<amount>\` & \`maxclaims:<limit>\`)
• **Mechanics:** First user (or first N users) to trigger the keyword receives instant XP deposited into their Athena profile. Tracks claimed IDs on disk to prevent double-claiming.
• **Syntax:** \`!trigger create trivia | Correct! Claim your prize! | xp:50 maxclaims:5\`
• **Use Cases:** Scavenger hunts, server trivia, hidden Easter eggs.

### 3. Time / Clock Variant Triggers (\`time:<daypart>\`)
• **Mechanics:** Evaluates current Indian Standard Time (IST) / server clock. Only triggers during specified dayparts: \`morning\` (5am-12pm), \`day\` (12pm-5pm), \`night\` (5pm-5am), or \`weekend\` (Saturday/Sunday).
• **Syntax:** \`!trigger create gm | Good morning sunshine! | time:morning\`

### 4. Tier & Audience Adaptive Triggers (\`audience:<tier>\`)
• **Mechanics:** Dynamically inspects the invoking member's permissions, roles, and server tenure:
  - \`newbie\` (accounts under 7 days in server)
  - \`booster\` (Server Boosters holding nitro role)
  - \`staff\` (Moderator, Admin, Extra Owner clearance)
• **Syntax:** \`!trigger create perks | Booster exclusive perks unlocked! | audience:booster\``
      },
      {
        pageTitle: 'Dual-Action Synergy, Mirroring & Access Clearance',
        content:
`# Dual-Action Emoji Reactions & Emergency Escalation
Beyond automated message dispatch, Athena Prime supports cross-action synergy:

### Dual-Action Emoji Reaction Synergy
• **Mechanics:** Automatically adds a custom or unicode emoji reaction to the user's triggering message in addition to sending the configured text/embed response.
• **Direct Command:** \`!trigger react <keyword> <emoji | none>\`
• **Creation Syntax:** \`!trigger create gg | Well played! | reaction:<a:atheNATICK:1557841381630681106>\`

### Staff Alert & Channel Mirroring (Emergency Triggers)
• **Mechanics:** When specific keywords (e.g., raid, alert, exploit, bug) are detected, Athena simultaneously mirrors an alert with user tag, channel link, and context to a secure staff escalation channel.
• **Direct Command:** \`!trigger mirror <keyword> <#channel | none>\`
• **Creation Syntax:** \`!trigger create alert | Staff notified! | mirror:#mod-logs\`

### Removal Access Clearance & Security
• **Strict Role Clearance:** In accordance with Athena's Zero-Trust architecture, trigger deletion (\`!trigger delete\`) and wiping (\`!trigger clearall\`) are strictly restricted to **Server Admins**, **Extra Owners**, and the **Server Owner**.
• **Simple Fast Syntax:**
  - Simple creation: \`!trigger create <match> | <response>\`
  - Direct shortcut: \`!trigger <match> | <response>\`
  - Interactive Dashboard: \`!trigger\` (or \`!trig\`) with synced looping animated GIF HUD and sleek capacity progress bar.`
      }
    ]
  }

};

export const DETAILED_COMMANDS = {
  trigger: {
    name: 'trigger',
    aliases: ['trig', 'autorespond', 'customresponse'],
    category: 'Automation & Utilities',
    clearance: 'Public (View/Test) / Server Admin & Extra Owner (Create/Delete/Clear)',
    syntax: '!trigger / !trigger create <match> | <response> / !trigger delete <match> / !trigger react <match> <emoji> / !trigger mirror <match> <#channel>',
    purpose: 'Interactive server trigger word responder dashboard with synced animated looping GIF HUD, electric progress bar, and 4 advanced automation modules.',
    architecture:
`• **Synced Looping Animated GIF HUD (trigger_banner.gif):**
  - Features a real-time canvas-rendered 8-frame looping GIF with server avatar reticle, animated scan-lines, and glowing progress bar drawn directly in the GIF.
  - Visualizes trigger slot capacity (\`triggers.length / 50\`) with real-time metrics for triggers, global network replies, and synchronization status.
• **Simple Usual Setup Syntax:**
  - Fast creation: \`!trigger create <match> | <response>\` (e.g., \`!trigger create hello | Hello {user}, welcome to {server}!\`).
  - Direct shortcut: \`!trigger <match> | <response>\`.
  - Quick delete: \`!trigger delete <match>\` (Restricted to Server Admins & Extra Owners).
• **The 4 Advanced Trigger Engines:**
  - **Ghost / Auto-Destruct (\`ghost:<seconds>\`):** Automatically purges response after N seconds to prevent channel spam.
  - **Bounty XP Rewards (\`xp:<amount>\` & \`maxclaims:<limit>\`):** Awards dynamic XP to the first N users who trigger the response.
  - **Time / Clock Variant (\`time:<morning|day|night|weekend>\`):** Daypart-dependent response matching current server clock.
  - **Audience & Tier Adaptive (\`audience:<newbie|booster|staff>\`):** Personalizes responses based on user tenure, booster status, or staff tier.
• **Dual-Action Emoji Reaction Synergy (\`reaction:<emoji>\`):** Reacts with custom/unicode emoji on the triggering message while responding.
• **Staff Mirroring (\`mirror:<#channel>\`):** Escalates emergency keywords directly to staff channels in real time.`,
    example: '!trigger create rules | Please read our rules in {channel}! | ghost:15'
  },

  whitelist: {
    name: 'whitelist',
    aliases: ['wl', 'wlist'],
    category: 'Security & Antinuke Defense',
    clearance: 'Server Owner / Extra Owner',
    syntax: '!whitelist / !wl / !wl <user|role> / !unwl <user|role> / !wlist',
    purpose: 'Interactive Whitelist Defense Matrix dashboard with synced looping animated GIF HUD, permission category clearance, and custom action limits.',
    architecture:
`• **Synced Looping Animated GIF HUD (wl_banner.gif & wl_access.gif):**
  - Canvas-rendered 8-frame animated looping HUD with in-GIF glowing electric progress bar.
  - Overview HUD tracks total whitelisted users and roles against the 25 trusted cap (\`totalWl / 25\`).
  - Access Clearance HUD tracks individual user/role category clearance (\`enabledCategories / totalCategories\`).
• **Granular Action & Module Whitelisting:**
  - Whitelist specific entities for specific modules (e.g., Channel Protection, Role Protection, Mass Ban, Bot Add).
  - Supports custom action limits (e.g., allow up to 5 bans per hour without tripping antinuke threshold).
• **Database-Backed ID Resolution:**
  - Whitelists are stored strictly by Discord Snowflake ID in SQLite, immune to display name spoofing or role renaming.`,
    example: '!whitelist'
  },

  security: {
    name: 'security',
    aliases: ['ss'],
    category: 'Security & Antinuke Defense',
    clearance: 'Server Owner / Extra Owner',
    syntax: '!security enable all / !security disable all / !security status / !security records',
    purpose: 'The master unbypassable command to deploy 100% bulletproof antinuke defense across the server in one single command.',
    architecture:
`• **The Fast, One-Click Method (!security enable all):** You do NOT need to manually configure channels or individual settings. Running "!security enable all" turns on ALL server defenses simultaneously in a single automated sequence:
  1. Creates and binds persistence backup roles ("Athena Unbypassable", "Athena Firewall") to Athena with Administrator privileges so rogue admins cannot remove or strip her permissions.
  2. Creates and deploys "#athenas-dashboard" with real-time status and interactive module toggles.
  3. Binds and activates "#security-logs" for forensic audit trails.
  4. Activates ALL 28 antinuke modules (Anti-Ban, Anti-Kick, Anti-Channel Delete/Create/Update, Anti-Role Delete/Create/Update, Anti-Bot Add, Anti-Webhook, Anti-Member Purge, Anti-Linked Role, etc.).
  5. Turns on 100% zero-tolerance defenses: threshold 1, instant ban punishment, anti-invite, anti-link, anti-spam, and AI toxicity/doxxing shields.
• **Sub-1ms Dual-Strike Pre-Emption:**
  • Pre-warmed Undici TLS sockets to Discord API execute parallel "rawRoleStrip" + "rawBan".
  • Stripping all roles removes Administrator & ManageChannels in Discord's permissions cache within 10-15ms, causing Discord to immediately return 403 Forbidden on any second channel deletion before the nuke bot can execute it.
• **Intelligent Zero-Duplicate Damage Repair:**
  • Synchronous atomic deduplication locks ("queued", "inFlight", "restored") prevent creating double channels or roles.
  • Two-phase topological repair: Categories reconstructed first, then child channels linked to their respective categories by ID or name fallback.
  • Exact rawPosition preserved and locked via setPosition without misplacing channels in the tree.
  • Post-attack reconciliation pass ("reconcileGuildStructure") guarantees 100% channel parentage and hierarchy integrity.
• **Prerequisites:**
  • Athena's highest role must be placed among the Top 3 highest roles in Discord Server Settings (Role Hierarchy) so she can override rogue admin actions.
  • Must be executed by the Server Owner, Extra Owner, or Bot Owner. (Server requires 200+ members; Bot Owners bypass).
• **Whitelist Staff:** Grant trusted staff immunity using "!whitelist @user", "!whitelist @role", or "!botwhitelist add <bot_id>".
• **Status & Live Incident Records:** Type "!security status" (or "!ss") at any time to verify active shields, or "!security records" (or "!security live") to review the live telemetry incident log.`,
    example: '!security enable all'
  },

  antinuke: {
    name: 'antinuke',
    aliases: ['an', 'anti-nuke'],
    category: 'Security & Antinuke Defense',
    clearance: 'Server Owner / Extra Owner',
    syntax: '!security enable all / !security status',
    purpose: 'Autonomous zero-day exploit and antinuke defense engine.',
    architecture:
`• **Enabling Antinuke:** Enabled directly via "!security enable all". There is no separate "!antinuke config" command. Running "!security enable all" turns on all 28 antinuke modules and safeguards the server against all nuke vectors.
• **First-Action Neutralization (Stopping Nuke Bots Before 2nd Action):**
  • WebSocket audit log ring buffer delivers 0ms executor identification without REST request lag.
  • Parallel dual-strike ("rawRoleStrip" + "rawBan") strips all roles within 10ms, revoking Administrator and ManageChannels so Discord immediately returns 403 Forbidden if the nuke bot attempts to delete a second channel.
• **Intelligent Damage Repair Matrix:**
  • Continuous live infrastructure snapshots track ground truth channel structures, parent categories, and role states.
  • Synchronous deduplication guarantees zero double channels or roles.
  • Categories restored first, then child channels placed into respective parent categories and locked at exact positions.
• **Unbypassable Persistence Roles ("Athena Unbypassable" & "Athena Firewall"):**
  • Self-healing loop intercepts deletion or permission stripping in sub-1ms, instantly re-creating roles with Administrator and banning attackers.`,
    example: '!security enable all'
  },

  raidmode: {
    name: 'raidmode',
    aliases: ['raid', 'rm'],
    category: 'Security & Antinuke Defense',
    clearance: 'Administrator / Extra Owner',
    syntax: '!raidmode [on|off|auto on|auto off|auto threshold <num>|auto window <sec>]',
    purpose: 'Unified Server Raid Defense Matrix with synced 1024x512 Sci-Fi War Room animated GIF HUD, manual lockdown control, and automated join-velocity burst detection.',
    architecture:
`• **Synced War Room Animated GIF HUD (raid_banner.gif):**
  - Features dynamic 1024x512 tactical control deck with rotating radar reticle around server avatar.
  - In-GIF electric plasma oscillating sine wave progress bar tracking lockdown level and posture.
  - Three real-time telemetry chips: Burst Velocity threshold, Auto-Shield status, Quarantined intruder count.
• **Manual Raid Lockdown (!raidmode on):**
  1. Sets server raid mode to active in SQLite database.
  2. Snapshots current server verification level.
  3. Elevates Discord server verification level to 4 (VERY_HIGH - Phone Verified Required) to stop disposable bot accounts immediately.
  4. Automatically isolates and quarantines all incoming joiners.
• **Lockdown Deactivation (!raidmode off):**
  1. Reverts server raid mode to standby.
  2. Restores pre-raid baseline verification level from database.
  3. Triggers automated parallel mass-unquarantine for accounts caught during the raid.
• **Join-Velocity Auto-Shield (!raidmode auto on):**
  1. Monitors member join timestamps across a sliding window.
  2. If joins breach threshold (default: 8 joins / 5 seconds), auto-engages Raid Mode lockdown and Phone Verification.
  3. Dispatches high-priority alert container to #security-logs and DMs the Server Owner.
• **Threshold & Window Directives:**
  • \`!raidmode auto threshold <num>\`: Sets how many accounts trigger the auto-shield.
  • \`!raidmode auto window <sec>\`: Sets the join time window in seconds.`,
    example: '!raidmode on'
  },

  health: {
    name: 'health',
    aliases: ['audit', 'securityhealth', 'antinukeaudit', 'healthcheck'],
    category: 'Security & Antinuke Defense',
    clearance: 'Administrator / Extra Owner',
    syntax: '!health / !audit',
    purpose: 'Runs real-time hierarchy, permission, persistence, and audit socket diagnostics with synced 1024x512 Sci-Fi War Room animated GIF HUD.',
    architecture:
`• **Synced War Room Animated GIF HUD (health_banner.gif):**
  - 1024x512 animated looping HUD with holographic cyber glass console overlay.
  - In-GIF electric plasma sine wave progress bar rendering total composite health score (0-100%).
  - Telemetry chips tracking Health Score (%), Socket Latency (ms), and Core Permissions (X/8).
• **Hierarchy Integrity Check:** Compares bot's highest role position against all roles in the server. Scans for any roles above Athena that possess dangerous administrative permissions (Administrator, Manage Guild, Manage Roles, Manage Channels, Ban, Kick).
• **Core Permissions Validation:** Verifies all 8 critical operational permissions (Administrator, Manage Guild, Manage Roles, Manage Channels, Ban Members, Kick Members, View Audit Log, Manage Webhooks).
• **Defense Matrix Status:** Assesses live master antinuke engine, general security, raid mode, and auto join-velocity shield.
• **Continuous Infrastructure Snapshot:** Reports tracked channels, roles, and snapshot freshness.
• **Persistence Sentinel Roles:** Validates Athena Unbypassable and Athena Firewall roles.
• **Audit Socket Latency:** Measures direct Undici keep-alive round-trip socket latency to Discord API in milliseconds.`,
    example: '!health'
  },

  qrmanager: {
    name: 'qrmanager',
    aliases: ['quarantinemanager', 'qrsetup', 'containment'],
    category: 'Security & Antinuke Defense',
    clearance: 'Administrator / Extra Owner / Server Owner',
    syntax: '!qrmanager setup / !qrmanager status / !qrmanager setrole <@role> / !qrmanager setchannel <#channel> / !qrmanager setvc <#vc>',
    purpose: 'Automated quarantine containment setup, role binding, voice chamber isolation, and real-time status matrix with synced 1024x512 Sci-Fi War Room GIF HUD.',
    architecture:
`• **Synced War Room Animated GIF HUD (qr_banner.gif):**
  - 1024x512 holographic control deck displaying containment readiness ratio (0-4 components).
  - In-GIF dual-harmonic oscillating plasma progress bar with pulsing head plasma orb.
  - HUD metric chips: Role status, Category status, System armed readiness.
• **One-Click Automated Setup (!qrmanager setup):**
  - Creates hidden isolation category, dedicated quarantine role, and restricted chat holding cell.
  - Automatically denies ViewChannel across all server channels for the quarantine role and grants access exclusively to the containment zone.
• **Dedicated Voice Chamber Isolation (!qrmanager setvc <#vc>):**
  - Configures dedicated voice chamber where suspicious accounts or raided joiners are isolated.
• **100% Database-Driven IDs:**
  - Persists and reads role, channel, and category IDs strictly from database configuration.`,
    example: '!qrmanager status'
  },

  tts: {
    name: 'tts',
    aliases: ['voice', 'voices', 'speak', 'say'],
    category: 'Utilities & Voice Intelligence',
    clearance: 'Public / Everyone',
    syntax: '!tts <msg> / !tts voices / !tts voice <name> / !tts <voice> <msg> / !tts stop / !tts autovc',
    purpose: 'Zero-latency celebrity and character Text-to-Speech voice synthesis broadcasting directly into voice channels with custom audio DSP filters.',
    architecture:
`• **Celebrity & Character Voice Roster:**
  - **Donald Trump (trump):** Resonant baritone, punchy cadence, aggressive pitch modulation.
  - **Narendra Modi (modi):** Deliberate cadence, rich acoustic overtones, rhythmic inflection.
  - **Barack Obama (obama):** Measured pacing, baritone warmth, signature rhythmic pauses.
  - **Michael Jackson (mj):** High tenor, signature 6.2Hz vibrato filter, expressive presence.
  - **Taylor Swift (taylor):** Bright crystal presence, acoustic warmth, signature tone.
  - **Ariana Grande (ariana):** High soprano, gentle airy modulation, extended harmonic lift.
  - **Sabrina Carpenter (sabrina):** Modern conversational pitch, crisp acoustic articulation.
  - **Justin Bieber (bieber):** R&B melodic cadence, subtle vibrato, tenor resonance.
  - **Elon Musk (elon):** Fast cadence, thoughtful pauses, tech-pitch modulation.
  - **Darth Vader (vader):** Deep sub-bass growl, mechanical flanger, heavy resonance.
  - **Chipmunk (chipmunk):** Ultra-high pitch shift (+8.5 semitones), energetic tempo boost.
  - **Demon / Monster (demon):** Sub-octave growl (-9.5 semitones) with demonic chorus.
  - **Robot / Cyber (robot):** 40Hz square-wave robotic flanger with vocoder tone.
  - **Ghost / Spectral (ghost):** Ethereal tremolo, resonant echo, spatial spectral shimmer.
• **Audio DSP Pipeline via FFmpeg:**
  - Fast localized audio transformation using ffmpeg-static in sub-120ms without external API rate limits.
  - Uses asetrate, atempo, 3-band parametric EQ, and vibrato/flanger modulation chains.
• **Command Shortcuts & Features:**
  - Interactive voice directory: !tts voices (Components V2 gallery).
  - Lock your preferred default voice: !tts voice trump.
  - Speak on-the-fly: !tts mj Shamone he he.
  - Auto-read voice channel text: !tts autovc.`,
    example: '!tts trump We are going to build the greatest Discord server!'
  },

  records: {
    name: 'records',
    aliases: ['security records', 'incidents', 'threats', 'live', 'liverecords', 'logs'],
    category: 'Security & Antinuke Defense',
    clearance: 'Administrator / Extra Owner / Server Owner',
    syntax: '!security records / !security live / !antinuke records / /security action:records',
    purpose: 'Real-time security live audit & incident telemetry stream displaying neutralized attacks, execution speeds, and automatic rollbacks.',
    architecture:
`• **Live Memory Threat Stream:**
  • Sub-1ms real-time buffer of all neutralized attacks stored in SQLite database.
  • Retains up to 100 recent security events across all vectors: channel deletes, role creates, admin escalations, rogue bot additions, mass kicks/bans, and invite floods.
• **Forensic Breakdown Per Incident:**
  • Event Type: Exact vector neutralized (e.g. Channel Delete, Role Tampering, Rogue Invite).
  • Perpetrator Identification: Username, tag, and snowflake ID of the hostile account.
  • Countermeasure Verdict: Action executed (e.g. BAN_APPLIED, ROLES_STRIPPED, QUARANTINED) with execution speed (1-3ms execution).
  • Damage Repair & Rollback: State of restored channels, categories, or revoked permissions.
• **Tactile Control Interface:**
  • Interactive pagination controls (Prev / Next) to review threat history.
  • Refresh: Instantly syncs with the live SQLite audit ledger.
  • Firewall Status: One-click shortcut back to the 28-module defense matrix.
  • Clear History: Authorizes Server Owners to purge memory logs once reviewed.`,
    example: '!security records'
  },

  athena: {
    name: 'athena',
    aliases: ['guide', 'howto', 'askathena', 'assistant', 'athenahelp'],
    category: 'AI & System Intelligence',
    clearance: 'Public / Everyone',
    syntax: '!athena [question] / /athena [query]',
    purpose: 'Interactive Athena AI Specialist to explain all 257+ commands, resolve doubts, and provide 1-click grey action buttons.',
    architecture:
`• **Live Codebase RAG:** Dynamically indexes 257+ commands, permission bitmasks, syntax schemas, and domain dossiers.
• **Fuzzy Typo Auto-Correction:** Employs Damerau-Levenshtein distance to automatically identify and correct misspelled commands (e.g. \`rnkthme\`, \`tcikets\`).
• **Context-Aware Thread Memory:** Preserves multi-turn conversational context for 10 minutes with rolling sliding expiry.
• **Clearance-Aware Guidance:** Adapts instructions to caller's authorization tier (Server Owner, Admin, Mod, Public).
• **One-Click Grey Action Buttons:** Generates neutral grey interactive buttons (\`style: 2\`) and synthesizes custom buttons on demand.
• **Flagship Gemini 3.8 Flash Pipeline:** High-reasoning AI backend with live elapsed progress telemetry and edge failover.`,
    example: '!athena how do I setup tickets with AI triage?'
  },

  ask: {
    name: 'ask',
    aliases: ['ai', 'neural', 'gemini'],
    category: 'Utilities & Integrations',
    clearance: 'Public / Everyone',
    syntax: '!ask <prompt> / /ask <prompt>',
    purpose: 'Query Athena Prime Neural AI Engine for intelligent answers, analysis, and assistance.',
    architecture:
`• **Multi-Provider Fallback:** Evaluates prompt against Google Gemini API with seamless fallback to high-speed neural edge provider.
• **Accent Borderless CV2 Container:** Dynamically formats answer using guild accent color, divider components, and sanitized markdown.
• **Security Protocol:** Native unicode emojis are automatically scrubbed from responses to adhere to brand guidelines.`,
    example: '!ask explain quantum computing in simple terms'
  },

  aimode: {
    name: 'aimode',
    aliases: ['aimode'],
    category: 'Utilities & Integrations',
    clearance: 'Administrator',
    syntax: '!aimode [status|on|off|channel #channel]',
    purpose: 'Configure conversational AI assistant mode and bind dedicated chat channels.',
    architecture:
`• **Channel ID Binding:** Binds dedicated channel ID to SQLite guild configuration.
• **Strict Isolation:** In all standard channels, AI replies are strictly restricted to the !ask command to prevent unwanted chatter.`,
    example: '!aimode channel #ai-chat'
  },

  aiannounce: {
    name: 'aiannounce',
    aliases: ['aian', 'ai-announce', 'smartannounce', 'studioannounce'],
    category: 'Server Administration & AI Tools',
    clearance: 'Manage Messages / Administrator',
    syntax: '!aiannounce [prompt] [#channel] / /aiannounce [prompt] [channel]',
    purpose: 'Launch the AI Announcement Studio to transform rough ideas, typos, or notes into stunning Discord announcements with live preview, custom emojis, and target channel selection.',
    architecture:
`• **Human-Speech Error Resilience:** Ingests brief, informal notes or typo-filled user text, enhancing structure and tone via Gemini 3.8 Flash High.
• **Custom Emoji & Raw ID Resolution:** Scans for full emojis (<:name:id>, <a:name:id>) or raw 18-19 digit Discord IDs specified for titles or bullets.
• **Interactive Studio Preview:** Renders an ephemeral Components V2 container with channel select dropdown, broadcast mention mode (@everyone, @here, Silent), and modal editing.
• **Display Limit Budgeting:** Enforces strict payload text budgeting (<= 3,800 characters) via sanitizeCV2Payload to prevent Discord 50035 errors.`,
    example: '!aiannounce Movie night at 8pm IST, snacks provided, use emoji id 1557841381630681106 for bullets #announcements'
  },

  db: {
    name: 'db',
    aliases: ['botdb', 'dbbackup', 'dbrestore', 'dbexport', 'database'],
    category: 'Utilities & Integrations',
    clearance: 'Bot Owner',
    syntax: '!db [status|backup|restore|export|setchannel #channel]',
    purpose: 'Manage automated Discord database cloud backups, SQLite WAL checkpoints, and zero-downtime host recovery.',
    architecture:
`• **Dual-Payload Serialization:** Flushes memory cache to JSON and triggers wal_checkpoint(TRUNCATE) on SQLite database.
• **Cloud Discord Storage:** Uploads timestamped snapshots (db.json + stats.db) with structured diagnostic metrics cards.
• **Zero-Downtime Auto-Restore:** Detects fresh host migrations upon boot and automatically pulls and restores database state from Discord without manual copying.`,
    example: '!db backup'
  },

  balance: {
    name: 'balance',
    aliases: ['bal', 'coins', 'money'],
    category: 'Community & Engagement',
    clearance: 'Public / Everyone',
    syntax: '!balance / !bal [@user] / /balance [user]',
    purpose: 'Displays wallet balance, vault reserves, and daily streak progress in Athena Coins.',
    architecture:
`• **Ledger Resolution:** Queries SQLite economy tables with atomic fallback to default starting stipend.
• **CV2 Container:** Renders financial status inside a dark borderless Components V2 panel.`,
    example: '!bal @user'
  },

  daily: {
    name: 'daily',
    aliases: ['claimdaily'],
    category: 'Community & Engagement',
    clearance: 'Public / Everyone',
    syntax: '!daily / /daily',
    purpose: 'Claim 24-hour coin dividend with consecutive day streak multipliers.',
    architecture:
`• **Streak Clock:** Enforces 24-hour cooldown with 48-hour streak protection window.
• **Multiplier Calculation:** Awards +300 base coins plus up to +600 streak bonus coins.`,
    example: '!daily'
  },

  shop: {
    name: 'shop',
    aliases: ['shop'],
    category: 'Community & Engagement',
    clearance: 'Public / Admin (for adding/removing)',
    syntax: '!shop [buy <id>|add <name> <price> <@role>|remove <id>]',
    purpose: 'Browse and purchase server role privileges and exclusive perks using earned Athena coins.',
    architecture:
`• **ID-Based Role Assignment:** Strictly maps items to Discord Role IDs stored in database.
• **Atomic Purchase Flow:** Verifies wallet balance, deducts coins, and assigns the target role immediately via Discord REST API.`,
    example: '!shop buy item_vip'
  },

  coinflip: {
    name: 'coinflip',
    aliases: ['cf', 'flip'],
    category: 'Community & Engagement',
    clearance: 'Public / Everyone',
    syntax: '!coinflip <heads|tails> <amount>',
    purpose: 'Wager coins in a provably fair 50/50 double-or-nothing coin toss.',
    architecture:
`• **Atomic Ledger Verification:** Deducts bet before coin execution and credits 2x payout immediately on victory.`,
    example: '!coinflip heads 100'
  },

  blackjack: {
    name: 'blackjack',
    aliases: ['bj', '21'],
    category: 'Community & Engagement',
    clearance: 'Public / Everyone',
    syntax: '!blackjack <bet> / /blackjack bet: <amount>',
    purpose: 'Interactive casino card table with Components V2 buttons and 3:2 Natural 21 payouts.',
    architecture:
`• **Deck & Dealer Logic:** 52-card deck with Fisher-Yates shuffling, Ace valuation (1/11), and dealer stand on 17.
• **Components V2 Controls:** Live \`Hit\`, \`Stand\`, and \`Double Down\` button collectors with atomic wallet deduction and cloud backup sync.`,
    example: '!blackjack 250'
  },

  roulette: {
    name: 'roulette',
    aliases: ['roul', 'wheel'],
    category: 'Community & Engagement',
    clearance: 'Public / Everyone',
    syntax: '!roulette <bet> <red|black|green|even|odd|0-36>',
    purpose: 'European roulette wheel betting with proportional payout odds.',
    architecture:
`• **Wheel Mechanics:** Numbers 0-36 (0 is Green 14x, Red/Black 2x, Even/Odd 2x, Straight number 36x).
• **Ledger Sync:** Deducts bet upfront and reconciles winnings immediately upon spin completion.`,
    example: '!roulette 500 red'
  },

  trivia: {
    name: 'trivia',
    aliases: ['quiz', 'tournament'],
    category: 'Community & Engagement',
    clearance: 'Public / Everyone',
    syntax: '!trivia [wager] / /trivia [wager]',
    purpose: 'Interactive 4-choice knowledge tournament with coin rewards and bounty payouts.',
    architecture:
`• **Randomized Options:** Shuffles question choices across 4 Components V2 buttons with 25-second countdown collectors.
• **Bounty Mode:** Awards 50 coins on free trivia, or doubles wagered coin balance upon correct answer.`,
    example: '!trivia 100'
  },

  gamestats: {
    name: 'gamestats',
    aliases: ['mgstats', 'casinostats'],
    category: 'Community & Engagement',
    clearance: 'Public / Everyone',
    syntax: '!gamestats [@user] / /gamestats [user]',
    purpose: 'View your personal or another user\'s casino records, wins, and net earnings.',
    architecture:
`• **Telemetry Matrix:** Pulls blackjack, roulette, and trivia wins, total wagered, total won, and net profit from \`db.cache.minigamesStats\`.`,
    example: '!gamestats @User'
  },

  lockdown: {
    name: 'lockdown',
    aliases: ['ld', 'paniclockdown'],
    category: 'Security & Access Control',
    clearance: 'Administrator / Extra Owner',
    syntax: '!lockdown <1|2|3|off> / /lockdown tier: <tier>',
    purpose: 'One-click emergency server panic lockdown with tiered intensity and pre-lockdown bitmask snapshots.',
    architecture:
`• **Tier 1 (Soft):** Mutes text \`SendMessages\` and voice \`Speak\` across public channels for \`@everyone\`.
• **Tier 2 (Medium):** Tier 1 + Denies reactions, commands, attachments, embeds, and auto-engages Raid Mode.
• **Tier 3 (Nuclear):** Total blackout. Denies \`ViewChannel\` across all channels (rules/quarantine visible but muted).
• **Pre-Lockdown Snapshot:** Persists all pre-lockdown channel overwrites to database disk before applying changes.`,
    example: '!lockdown 2'
  },

  unlockdown: {
    name: 'unlockdown',
    aliases: ['unld', 'unlockserver', 'liftlockdown'],
    category: 'Security & Access Control',
    clearance: 'Administrator / Extra Owner',
    syntax: '!unlockdown / /unlockdown',
    purpose: 'Lifts panic lockdown and recovers exact pre-lockdown channels and role bitmasks from database snapshot.',
    architecture:
`• **Snapshot Reconstruction:** Re-applies exact saved \`allow\` and \`deny\` bitfields to all channels and normalizes Raid Mode.`,
    example: '!unlockdown'
  },

  voiceanalytics: {
    name: 'voiceanalytics',
    aliases: ['va', 'vcstats', 'voiceheatmap'],
    category: 'Voice Utilities',
    clearance: 'Staff / Manage Channels',
    syntax: '!voiceanalytics / /voiceanalytics',
    purpose: '24-hour diurnal voice activity heatmaps, peak engagement windows, and channel telemetry.',
    architecture:
`• **Live Session Tracking:** Monitored via \`voiceStateUpdate.js\` sessions with minute-accurate diurnal bucket aggregation in SQLite/DB.`,
    example: '!voiceanalytics'
  },

  studio: {
    name: 'studio',
    aliases: ['embedstudio', 'containerstudio'],
    category: 'Server Administration',
    clearance: 'Manage Server',
    syntax: '!studio [create|list|send|delete] / /studio action: <action>',
    purpose: 'Interactive container, embed & announcement builder studio with persistent template storage.',
    architecture:
`• **Modal Builder & Preview:** Composes Discord Components V2 borderless containers with ephemeral live preview and disk persistence.`,
    example: '!studio list'
  },

  auditlogs: {
    name: 'auditlogs',
    aliases: ['audit', 'forensics'],
    category: 'Server Administration',
    clearance: 'View Audit Log',
    syntax: '!auditlogs [@user] [limit] / /auditlogs [user] [limit]',
    purpose: 'Forensic audit log search with member filtering, action classifier, and relative timestamps.',
    architecture:
`• **Gateway Interrogation:** Fetches \`GuildAuditLogs\` filtered by moderator or target, mapping action types to clear telemetry events.`,
    example: '!auditlogs @RogueMod 10'
  },

  ranktheme: {
    name: 'ranktheme',
    aliases: ['setranktheme', 'cardtheme'],
    category: 'Community & Engagement',
    clearance: 'Public / Everyone',
    syntax: '!ranktheme <hogwarts|athena> / /ranktheme [theme]',
    purpose: 'Switch personalized XP rank card visual theme between Hogwarts Looping Animated GIF and Athena Classic (Obsidian & God of War stone card).',
    architecture:
`• **Available Themes:**
  1. \`!ranktheme athena\` (or \`classic\`) \u2014 The sleek Obsidian & God of War stone card.
  2. \`!ranktheme hogwarts\` \u2014 Cinematic Looping Animated GIF with soaring Hedwig owl & flaming altar.
• **Theme Persistence:** Stores user aesthetic choice in SQLite database (\`userRankThemes\`).
• **Canvas/FFmpeg Pipeline:** Hogwarts theme renders 12-frame 10 FPS palettegen GIF; Athena theme renders ultra-HD stone card with Cinzel God of War typography.`,
    example: '!ranktheme athena'
  },

  rankrewards: {
    name: 'rankrewards',
    aliases: ['levelrewards', 'lvlaur', 'xprewards'],
    category: 'Community & Engagement',
    clearance: 'Public / Admin',
    syntax: '!rankrewards [list|add <level> <@role>|remove <level>]',
    purpose: 'Configure automatic role rewards granted upon reaching specific XP levels.',
    architecture:
`• **Level Ascension Hook:** Processed during processLevelUp in xpEngine.js.
• **Role ID Verification:** Fetches and assigns roles strictly by Discord Role ID with bot hierarchy validation.`,
    example: '!rankrewards add 10 @Veteran'
  },

  unbypassable: {
    name: 'unbypassable',
    aliases: ['unb', 'sentinels', 'persistenceroles'],
    category: 'Security & Access Control',
    clearance: 'Public Telemetry / Admin Deployment',
    syntax: '!unbypassable [deploy|check|status|repair]',
    purpose: 'Inspects and auto-deploys Athena Unbypassable and Athena Firewall persistence sentinel roles.',
    architecture: 
`• **Persistence Sentinel Roles:** Queries guild role hierarchy, verifies position of bot's integration role, and provisions \`Athena Unbypassable\` and \`Athena Firewall\` persistence sentinel roles.
• **Anti-Strip Protection:** Continuously monitors role stripping attempts and auto-re-adds both sentinel roles if removed.
• **Anti-Role Delete Guard:** Auto-recreates roles with exact Administrator privileges if deleted by a rogue admin.
• **Anti-Role Perm Modification:** Auto-restores Administrator privileges if permissions are tampered with.
• **Bot Role Assignment:** Ensures both sentinel roles remain bound to Athena at the highest hierarchy position.`,
    example: '!unbypassable'
  },

  neutralizeonboarding: {
    name: 'neutralizeonboarding',
    aliases: ['onboarding', 'neutralize'],
    category: 'Security & Access Control',
    clearance: 'Extra Owner / Server Owner',
    syntax: '!neutralizeonboarding [audit|clean]',
    purpose: 'Scans Discord Community Onboarding questionnaire prompts for dangerous permissions and neutralizes unlogged role exploits.',
    architecture: 
`• **REST Inspection:** Connects to \`/guilds/{id}/onboarding\` endpoint and inspects all prompt options.
• **Permission Bitfield Scan:** Flags any option attached to roles with \`Administrator\`, \`Manage Server\`, \`Manage Roles\`, etc.
• **Proactive Scrubbing:** Removes the role reference from the onboarding prompt, sets role permissions to 0n, and quarantines unauthorized holders.
• **Exploit Protection:** Closes the zero-audit-log Linked Role & Onboarding privilege escalation loophole.`,
    example: '!neutralizeonboarding'
  },

  antinuke: {
    name: 'antinuke',
    aliases: ['an'],
    category: 'Security & Access Control',
    clearance: 'Extra Owner / Server Owner',
    syntax: '!antinuke [config|status|guide]',
    purpose: 'Interactive dashboard for Athena Prime zero-day autonomous antinuke defense system.',
    architecture: 
`• **Strike Engine:** Direct REST API execution strikes nukers in ~1-3 milliseconds upon threshold breach.
• **Websocket Wiretap:** Intercepts role, channel, webhook, and member events with zero gateway latency.
• **Condemned Cache:** Known malicious actors are immediately isolated without redundant audit evaluations.
• **Channel & Role Healing:** Automatically reconstructs deleted channels and roles with original permissions intact.`,
    example: '!antinuke config'
  },

  firewall: {
    name: 'firewall',
    aliases: ['fw', 'matrix', 'telemetry', 'statusnet'],
    category: 'Security & Access Control',
    clearance: 'Public / Everyone',
    syntax: '!firewall',
    purpose: 'Inspects real-time Athena firewall telemetry stream, gateway connection, SQLite WAL, and global defense matrix.',
    architecture: 
`• **WebSocket TLS 443 Wiretap:** Directly hooks the Discord Gateway socket client to sample round-trip heartbeat ping in real-time (<20ms nominal).
• **REST Rate-Limit Bucket Synchronization:** Interrogates internal REST sequential request queues and confirms rate-limit tokens across global and route buckets.
• **SQLite Database & Memory Cache:** Telemetry on active server caches, WAL disk synchronization, and in-memory incident buffers.
• **Cloud Backup Sync:** Tracks real-time status and timestamps of cloud database snapshots.
• **Global Antinuke Defense Matrix:** Displays network-wide coverage and local module arming metrics.
• **Process Runtime & V8 Engine:** Monitors real-time heap and RSS memory consumption.`,
    example: '!firewall'
  },

  panic: {
    name: 'panic',
    aliases: ['emergency', 'lockdown'],
    category: 'Security & Access Control',
    clearance: 'Extra Owner / Server Owner',
    syntax: '!panic / !emergency',
    purpose: 'Immediately freezes the entire server, revokes public send permissions, and initiates full defensive lockdown.',
    architecture: 
`• **Channel Mass Overwrite:** Simultaneously updates \`@everyone\` permission overwrites across all channels to deny \`SendMessages\`, \`AddReactions\`, and \`Connect\`.
• **Invite Invalidation:** Pauses or disables guild invites to halt active raids in progress.
• **Lift Command:** \`!endemergency\` cleanly restores previous channel permissions from database cache.`,
    example: '!panic'
  },

  automod: {
    name: 'automod',
    aliases: ['filters', 'automoderator'],
    category: 'Security & Access Control',
    clearance: 'Extra Owner / Server Owner',
    syntax: '!automod [config|bypass|advanced]',
    purpose: 'Interactive configuration console for real-time link, invite, phishing, and word filter defenses.',
    architecture: 
`• **Multi-Tier Processing:** Synchronous message inspection across regular expression, unicode normalization, and domain whitelists.
• **Granular Role Bypass:** Allows specific trusted roles to bypass individual filter modules while enforcing rules on general members.`,
    example: '!automod config'
  },

  scanserver: {
    name: 'scanserver',
    aliases: ['auditperms', 'secscan'],
    category: 'Security & Access Control',
    clearance: 'Extra Owner / Server Owner',
    syntax: '!scanserver',
    purpose: 'Audits every role and integrated bot in the server for dangerous permissions, rogue integrations, and privilege escalation risks.',
    architecture: 
`• **Permission Matrix Audit:** Inspects all guild roles for \`Administrator\` (0x8) and administrative flags.
• **Bot Integration Audit:** Flags external bots holding dangerous permissions that are not registered in Athena's trusted whitelist (\`!botwhitelist\`).
• **Actionable Report:** Outputs a structured Components V2 container detailing vulnerable roles and recommendations.`,
    example: '!scanserver'
  },

  quarantine: {
    name: 'quarantine',
    aliases: ['isolate'],
    category: 'Security & Access Control',
    clearance: 'Administrator / Extra Owner',
    syntax: '!quarantine <@user|id> [reason] / !quarantine setup / !quarantine release <@user|id>',
    purpose: 'Isolates suspect accounts into a dedicated, locked quarantine containment environment while backing up original roles.',
    architecture: 
`• **Permission Enclosure:** Overrides channel permissions across all guild channels to completely isolate the user.
• **Role Preservation:** Backs up user roles into SQLite database and strips them via API.
• **Restoration:** On \`!quarantine release\`, retrieves saved role IDs and restores them cleanly.`,
    example: '!quarantine @user Suspicious behavior'
  },

  backup: {
    name: 'backup',
    aliases: ['cloudsync', 'snapshot'],
    category: 'Server Administration',
    clearance: 'Server Owner / Extra Owner',
    syntax: '!backup create / !backup load <id> / !backup list',
    purpose: 'Creates encrypted cloud snapshots of server structure, roles, permissions, channels, and configuration.',
    architecture: 
`• **Deep Serialization:** Captures every channel attribute, role hierarchy position, and permission overwrite.
• **Cloud Dispatch:** Posts encrypted JSON payload to private cloud storage channel.
• **Instant Restore:** Rebuilds channels and roles with exact previous settings.`,
    example: '!backup create'
  },

  kick: {
    name: 'kick',
    aliases: ['k'],
    category: 'Moderation',
    clearance: 'Mod Tier / Kick Members',
    syntax: '!kick <@user|id> [reason]',
    purpose: 'Ejects a target member from the server. The kicked member is removed from the guild but retains the ability to rejoin via a valid invite link.',
    architecture: 
`• **Hierarchy & Authority Verification:** Asserts that the executing moderator's highest role and Athena Prime's integration role are strictly higher than all target members.
• **Pre-Action DM Notification:** Delivers an automated direct message container informing the user of the guild name, moderator, and kick reason before removing them.
• **Audit Log & Security Stamping:** Dispatches authenticated Discord REST \`DELETE /guilds/{id}/members/{user}\` with reason header, logging forensics to the server's security channel.
• **Anti-Nuke Velocity Monitor:** Tracked by the Mass Action engine. If an admin account executes multiple kicks exceeding configured thresholds (>3/10s), Athena immediately revokes their permissions, quarantines the account, and freezes the guild.`,
    example: '!kick @user Repeated spam after warning'
  },

  ban: {
    name: 'ban',
    aliases: ['b'],
    category: 'Moderation',
    clearance: 'Mod Tier / Ban Members',
    syntax: '!ban <@user|id> [reason] / !ban <@user|id> [delete_days] [reason]',
    purpose: 'Permanently bans a member or user snowflake ID from the guild, revokes access, and optionally purges up to 7 days of message history.',
    architecture: 
`• **Zero-Day Hierarchy Check:** Verifies that target members are subordinate in the guild role hierarchy. Prevents banning the Server Owner, Bot Owner, or Extra Owners.
• **Message History Purging:** Calls REST \`PUT /guilds/{id}/bans/{userId}\` with custom \`delete_message_seconds\` (purging recent spam/malicious payloads).
• **Database Audit & Forensics:** Records the ban into SQLite database forensics, capturing user snowflake, moderator ID, and justification.
• **Anti-Ban Wiretap Guard:** Coordinated with Athena's Raw WebSocket Wiretap (<1ms). Unauthorized burst bans trigger instant revoking of administrative credentials and emergency server lockdown.`,
    example: '!ban @user Raid advertisement'
  },

  unban: {
    name: 'unban',
    aliases: ['ub'],
    category: 'Moderation',
    clearance: 'Mod Tier / Ban Members',
    syntax: '!unban <userId> [reason]',
    purpose: 'Revokes an active server ban for a specified user snowflake ID, allowing them to rejoin the guild.',
    architecture: 
`• **Ban Lookup:** Queries \`GET /guilds/{id}/bans/{userId}\` to verify previous ban record and reason.
• **Direct REST Revocation:** Dispatches \`DELETE /guilds/{id}/bans/{userId}\` with audit log tracking.
• **Anti-Unban Monitoring:** Intercepted by Anti-Nuke to prevent unauthorized bulk unbanning of previously quarantined raiders.`,
    example: '!unban 123456789012345678 Appealed ban successfully'
  },

  tempban: {
    name: 'tempban',
    aliases: ['tb'],
    category: 'Moderation',
    clearance: 'Mod Tier / Ban Members',
    syntax: '!tempban <@user|id> <duration> [reason]',
    purpose: 'Bans a user temporarily for a specific duration (e.g. 1h, 1d, 7d), automatically unbanning them once the timer expires.',
    architecture: 
`• **Duration Parsing:** Converts time strings (s, m, h, d, w) into unix epoch millisecond timestamps.
• **Database Job Scheduler:** Inserts the scheduled unban into SQLite database with \`unban_at\` timestamp.
• **Automated Worker Daemon:** Athena's background timer evaluates active tempbans and automatically calls REST unban upon expiration with zero manual intervention.`,
    example: '!tempban @user 3d Toxicity in general chat'
  },

  timeout: {
    name: 'timeout',
    aliases: ['mute', 'm', 'to', 'silence'],
    category: 'Moderation',
    clearance: 'Mod Tier / Moderate Members',
    syntax: '!timeout <@user|id> <duration> [reason]',
    purpose: 'Applies Discord native communication disable on a member, restricting them from sending messages, speaking in voice, or adding reactions.',
    architecture: 
`• **Discord Native REST Patch:** Sets \`communication_disabled_until\` ISO 8601 timestamp via direct REST API (up to 28 days max).
• **Role Integrity Preservation:** Unlike legacy mute roles that corrupt role hierarchies, native timeouts preserve 100% of member roles intact.
• **DM Notification & Audit:** Dispatches automated punishment notification to the user's direct messages and logs forensic details to the security channel.`,
    example: '!timeout @user 1h Heated argument in chat'
  },

  untimeout: {
    name: 'untimeout',
    aliases: ['unmute', 'um'],
    category: 'Moderation',
    clearance: 'Mod Tier / Moderate Members',
    syntax: '!untimeout <@user|id> [reason]',
    purpose: 'Immediately lifts an active timeout or voice mute, restoring the member\'s communication privileges.',
    architecture: 
`• **REST Reset:** Sets \`communication_disabled_until\` to \`null\` on the member object via direct API.
• **Voice State Sync:** If voice-muted, clears server-mute bitfield in voice gateway.`,
    example: '!untimeout @user Apologized and agreed to rules'
  },

  warn: {
    name: 'warn',
    aliases: ['w'],
    category: 'Moderation',
    clearance: 'Mod Tier / Staff Tier',
    syntax: '!warn <@user|id> [reason]',
    purpose: 'Issues an official warning to a member, increments their warning count in database, and triggers automated quarantine on ceiling breach.',
    architecture: 
`• **SQLite Persistence:** Writes warning record to database with guild ID, user ID, moderator ID, timestamp, and reason.
• **Escalation Engine:** Compares active warnings against guild's \`maxWarnings\` threshold (default: 3). If breached, Athena automatically engages Quarantine containment.`,
    example: '!warn @user Disrespecting community guidelines'
  },

  warnings: {
    name: 'warnings',
    aliases: ['warns'],
    category: 'Moderation',
    clearance: 'Mod Tier / Staff Tier',
    syntax: '!warnings <@user|id>',
    purpose: 'Displays a comprehensive forensic report of all active warnings issued to a member.',
    architecture: 
`• **Database Query:** Retrieves all warning records from SQLite database and renders an interactive Components V2 card.`,
    example: '!warnings @user'
  },

  clearwarns: {
    name: 'clearwarns',
    aliases: ['cw', 'resetwarns'],
    category: 'Moderation',
    clearance: 'Admin Tier / Extra Owner',
    syntax: '!clearwarns <@user|id>',
    purpose: 'Clears all disciplinary warnings from a member\'s database record.',
    architecture: 
`• **Database Purge:** Executes SQL DELETE for the specified user and guild ID, resetting warning escalation counter to 0.`,
    example: '!clearwarns @user'
  },

  purge: {
    name: 'purge',
    aliases: ['clear', 'c'],
    category: 'Moderation',
    clearance: 'Mod Tier / Manage Messages',
    syntax: '!purge <count> [@user|bot|links]',
    purpose: 'Bulk deletes up to 100 messages from the channel with optional filtering for specific users, bots, or links.',
    architecture: 
`• **REST Bulk Delete:** Dispatches \`POST /channels/{id}/messages/bulk-delete\` for messages younger than 14 days.
• **Audit Spam Suppression:** Automatically suppresses redundant individual message delete event logging in audit logs to prevent gateway flooding.`,
    example: '!purge 50'
  },

  slowmode: {
    name: 'slowmode',
    aliases: ['sm'],
    category: 'Moderation',
    clearance: 'Mod Tier / Manage Channels',
    syntax: '!slowmode <duration|off>',
    purpose: 'Sets the per-user message cooldown on the current channel from 0s up to 6 hours.',
    architecture: 
`• **Channel Patching:** Updates \`rate_limit_per_user\` attribute on the text channel via direct API.`,
    example: '!slowmode 10s'
  },

  nuke: {
    name: 'nuke',
    aliases: ['clonedelete'],
    category: 'Moderation',
    clearance: 'Admin Tier / Extra Owner',
    syntax: '!nuke',
    purpose: 'Clones the current channel with exact permissions, topic, and category placement, then purges the original channel.',
    architecture: 
`• **Channel State Snapshot:** Clones channel permissions, category parent, topic, nsfw flag, bitrate, and slowmode.
• **Anti-Nuke Exemption:** Registers channel ID in internal Anti-Nuke state to prevent triggering false-positive channel delete strikes.`,
    example: '!nuke'
  },

  massban: {
    name: 'massban',
    aliases: ['mb'],
    category: 'Moderation',
    clearance: 'Extra Owner / Server Owner',
    syntax: '!massban <user1> <user2> ... [reason]',
    purpose: 'Bans multiple users or user snowflake IDs in a single batched operation.',
    architecture: 
`• **Throttled Batching:** Executes bans sequentially with a 150ms buffer between calls to respect Discord REST rate limits.
• **Immunity Checks:** Verifies that no target is the Server Owner, Bot Owner, or Extra Owner before striking.`,
    example: '!massban @user1 @user2 Raid accounts'
  },

  masskick: {
    name: 'masskick',
    aliases: ['mk'],
    category: 'Moderation',
    clearance: 'Extra Owner / Server Owner',
    syntax: '!masskick <user1> <user2> ... [reason]',
    purpose: 'Kicks multiple users from the server in a single batched command.',
    architecture: 
`• **Sequential Pipeline:** Executes kicks with rate-limit buffers and security channel reporting.`,
    example: '!masskick @user1 @user2 Unverified accounts'
  },

  hide: {
    name: 'hide',
    aliases: ['lockview'],
    category: 'Moderation',
    clearance: 'Admin Tier / Manage Channels',
    syntax: '!hide [#channel]',
    purpose: 'Hides a channel from @everyone by modifying permission overwrites.',
    architecture: 
`• **Permission Overwrite Manipulation:** Sets \`ViewChannel: false\` on \`@everyone\` role overwrite while leaving staff roles intact.`,
    example: '!hide #announcements'
  },

  unhide: {
    name: 'unhide',
    aliases: ['unlockview'],
    category: 'Moderation',
    clearance: 'Admin Tier / Manage Channels',
    syntax: '!unhide [#channel]',
    purpose: 'Reveals a previously hidden channel to @everyone.',
    architecture: 
`• **Permission Overwrite Reset:** Sets \`ViewChannel: null\` or \`true\` on \`@everyone\` role overwrite.`,
    example: '!unhide #announcements'
  },

  lock: {
    name: 'lock',
    aliases: ['lockchannel'],
    category: 'Moderation',
    clearance: 'Mod Tier / Manage Channels',
    syntax: '!lock [#channel] [reason]',
    purpose: 'Locks a channel from @everyone sending messages.',
    architecture: 
`• **Send Overwrite Guard:** Disables \`SendMessages\` and \`SendMessagesInThreads\` on \`@everyone\` overwrite.`,
    example: '!lock #chat Raid in progress'
  },

  unlock: {
    name: 'unlock',
    aliases: ['unlockchannel'],
    category: 'Moderation',
    clearance: 'Mod Tier / Manage Channels',
    syntax: '!unlock [#channel]',
    purpose: 'Unlocks a channel, restoring @everyone sending permissions.',
    architecture: 
`• **Send Overwrite Restoration:** Restores \`SendMessages\` and \`SendMessagesInThreads\` on \`@everyone\` overwrite.`,
    example: '!unlock #chat'
  },

  addrole: {
    name: 'addrole',
    aliases: ['roleadd', 'giverole'],
    category: 'Server Administration',
    clearance: 'Admin Tier / Manage Roles',
    syntax: '!addrole <@user|id> <@role|name|id>',
    purpose: 'Assigns a role to a member with hierarchy verification.',
    architecture: 
`• **Role Hierarchy Check:** Asserts that target role is subordinate to executor's highest role and bot's highest role.
• **Dangerous Perm Interceptor:** Restricts assignment of roles containing Administrator without Extra Owner clearance.`,
    example: '!addrole @user @Verified'
  },

  removerole: {
    name: 'removerole',
    aliases: ['roledel', 'takerole'],
    category: 'Server Administration',
    clearance: 'Admin Tier / Manage Roles',
    syntax: '!removerole <@user|id> <@role|name|id>',
    purpose: 'Removes a specified role from a member.',
    architecture: 
`• **Hierarchy Assertion:** Verifies role position before calling REST \`DELETE /guilds/{id}/members/{user}/roles/{role}\`.`,
    example: '!removerole @user @Muted'
  },

  striproles: {
    name: 'striproles',
    aliases: ['strip', 'wipeuserroles'],
    category: 'Server Administration',
    clearance: 'Admin Tier / Manage Roles',
    syntax: '!striproles <@user|id>',
    purpose: 'Removes all assignable roles from a member and saves them into database for recovery.',
    architecture: 
`• **Cache & Bulk Removal:** Collects all roles below bot's highest role, saves IDs to database, and strips them via REST.`,
    example: '!striproles @user'
  },

  autorole: {
    name: 'autorole',
    aliases: ['joinrole'],
    category: 'Server Administration',
    clearance: 'Admin Tier / Extra Owner',
    syntax: '!autorole [add|remove|list] @role',
    purpose: 'Configures automated role assignment for new members joining the server.',
    architecture: 
`• **Database Configuration:** Role IDs are stored in SQLite configuration.
• **Join Interceptor:** Intercepted in \`guildMemberAdd\` with safety checks preventing dangerous roles from being auto-assigned.`,
    example: '!autorole add @Member'
  },

  ticket: {
    name: 'ticket',
    aliases: ['newticket', 'tickets'],
    category: 'Community & Engagement',
    clearance: 'Administrator (Setup & AI Toggle) / Public (Opening Tickets)',
    syntax: '!ticket setup <#category> <@staffRole> [@additionalRoles...] [ai_on] | !ticket ai on|off',
    purpose: 'Quick one-command ticket system deployment and AI triage configuration.',
    architecture: 
`• **Fast Deployment (!ticket setup):** Directly posts a standard single-button panel into the current channel with the "Open Ticket" button (\`ticket_open_general\`). Permanently stores the Category ID and Staff Role IDs in SQLite (\`db.updateTicketConfig\`). NOTE: Running this command does NOT create private channels immediately; it only deploys the panel.
• **Dynamic Channel Generation:** A private text channel (\`ticket-username\`) and private voice channel (\`ticket-username-voice\`) are ONLY generated when a member actually clicks the "Open Ticket" button or selects a reason. Permissions dynamically isolate \`@everyone\` (deny View/Connect) while explicitly allowing the ticket author and configured staff roles.
• **Smart Ban Appeals & AI Triage (!ticket ai on|off):** Toggles neural ticket classification. When enabled, prompts users with an appeal/inquiry modal, categorizes urgency (Ban Appeal, Billing, Bug Report, Harassment), and posts an executive summary for staff.
• **Transcript Archival & Lifecycle:** In-ticket buttons allow staff to claim tickets (\`ticket_claim\`) and close tickets (\`ticket_close\`), archiving the full chat history into HTML transcripts before deleting the channels.`,
    example: '!ticket setup #tickets @Staff ai_on'
  },

  ticketpanel: {
    name: 'ticketpanel',
    aliases: ['tp', 'ticket-panel', 'ticketmgr'],
    category: 'Community & Engagement',
    clearance: 'Administrator',
    syntax: '!ticketpanel',
    purpose: 'Interactive visual Ticket Panel Manager dashboard with real-time UI controls to customize and deploy bespoke ticket panels.',
    architecture: 
`• **Interactive Manager UI:** Running \`!ticketpanel\` opens the management control panel in Discord (\`updateManagerMessage\`) with buttons, select menus, and modals to customize settings in real-time.
• **Visual Customization Modals:** 
  - \`Edit Title & Desc\` (\`tp_edit_text\`): Customize the panel's title, greeting, and support guidelines.
  - \`Edit Media & Placeholder\` (\`tp_edit_media\`): Configure banner image URLs, thumbnail URLs, and dropdown placeholder text.
• **Dropdown Reasons Builder (\`tp_add_option\` / \`tp_reset_options\`):** Allows admins to add custom ticket category reasons (e.g. "General Support", "Billing & Store", "Ban Appeal", "Report User"). When options exist, the deployed panel automatically uses a Discord String Select Menu instead of a basic button!
• **Target Channel & Closing Roles Selectors:**
  - \`Target Channel\` (\`tp_target_channel\`): Pick any specific text channel to deploy the panel into.
  - \`Closing Roles\` (\`tp_close_roles\`): Select specific staff roles authorized to close tickets.
• **Deploy Panel (\`tp_send\`):** Compiles all settings from SQLite (\`db.getTickets\`) and deploys the finished interactive panel to the target channel.
• **Clarification on Channel Creation:** Like \`!ticket setup\`, deploying a panel does NOT create a private ticket channel immediately. Private channels are ONLY created dynamically when a user clicks the button or chooses an option from the dropdown menu.`,
    example: '!ticketpanel'
  },

  rate: {
    name: 'rate',
    aliases: ['edit', 'rateedit', 'editrate', 'rate-edit'],
    category: 'Community & Engagement',
    clearance: 'Administrator (Channel Binding) / Public (Rating Edits)',
    syntax: '!rate <#channel | channel_id> (Bind Channel) | !rate <attachment | url> (Submit Edit)',
    purpose: 'Community Edit Rating System with interactive 1-5 star voting cards, author stats, and designated channel binding.',
    architecture: 
`• **Channel Binding (!rate <#channel>):** Server Administrators bind the designated edit rating channel by running \`!rate <#channel>\` (or \`!rate <channelId>\` / \`!rateedit <#channel>\`). Athena saves the channel ID to SQLite via \`db.setRateChannel(guildId, channelId)\`.
• **Enforced Channel Isolation:** Once configured, submitting edits and rating cards is restricted exclusively to the bound channel, keeping server chat clean.
• **Interactive Rating Panel:** When a member shares their edit with an attachment or URL, Athena replies with the Components V2 "RATE USER'S EDIT" container featuring dynamic 1-5 star buttons (\`rate_edit_1\` through \`rate_edit_5\`) and a Remove button (\`rate_edit_delete\`).
• **Live Vote Aggregation:** Stores votes dynamically in SQLite (\`db.createEditRating\`), updating the average rating (/5), total vote counter, and latest voter list in real time.
• **Rating Leaderboard:** The top-rated server edits and creators are ranked and displayed via \`!ratelb\` / \`!editlb\`.`,
    example: '!rate #edits'
  },

  news: {
    name: 'news',
    aliases: ['rss', 'newsfeed', 'feeds'],
    category: 'Utility & Automation',
    clearance: 'Manage Server / Administrator',
    syntax: '!news setup <#channel> [@pingRole] | !news add <preset|url> | !news list | !news remove <url> | !news disable (Also supports /news)',
    purpose: 'Automated RSS news feed syndication engine that monitors global news outlets (BBC, Tech, Al Jazeera, CNN) or custom RSS feeds and broadcasts updates with image embeds.',
    architecture: 
`• **Dual Prefix & Slash Execution:** Fully supported via BOTH prefix commands (\`!news setup\`, \`!news add\`, \`!news list\`, \`!news remove\`, \`!news disable\`) and slash commands (\`/news\`).
• **Channel & Role Binding:** Administrators bind the destination channel and optional alert ping role using \`!news setup <#channel> [@role]\`. State is permanently saved in SQLite via \`db.setNewsSetup(guildId, channelId, roleId)\`.
• **Preset & Custom RSS Parsing:** Built-in fast XML parser monitors pre-configured reputable sources (\`BBC World News\`, \`BBC Tech\`, \`Al Jazeera\`, \`CNN\`) or any custom valid RSS XML URL. Feeds are saved via \`db.addNewsFeed(guildId, name, url)\` (up to 5 feeds per server).
• **Autonomous Background Cron Job (\`newsJob.js\`):** Runs every 3 minutes, tracking processed articles via GUID hash memory (\`db.updateNewsGuids\`, capped at 200 GUIDs) to guarantee zero duplicate announcements.
• **Clean Deactivation:** \`!news disable\` or \`/news disable\` safely purges feed subscriptions and resets channel bindings via \`db.setNewsSetup(guildId, null, null)\`.`,
    example: '!news setup #news-feed @NewsAlerts'
  },

  welcome: {
    name: 'welcome',
    aliases: ['welcomer', 'greet'],
    category: 'Community & Engagement',
    clearance: 'Manage Server / Admin',
    syntax: '!welcome',
    purpose: 'Interactive visual builder for join greetings with full dynamic placeholder interpolation and MP4-to-GIF conversion.',
    architecture: 
`• **Interactive Control Dashboard:** Running !welcome launches an interactive Components V2 manager panel with buttons for Top Text, Author, Title, Description, Media, Footer, Avatar Positioning, and Name Formatting (embed colors automatically inherit the server's accent theme via !accent).
• **Comprehensive Placeholder Suite:** Injects live variables at dispatch time:
  - Member counts: \`{membercount}\`, \`{member_count}\`, \`{members}\`, \`{count}\`, \`{server.membercount}\`
  - Ordinal numbers: \`{ordinal}\`, \`{ordinal_count}\` (e.g. \`1st\`, \`142nd\`)
  - User details: \`{user}\`, \`{username}\`, \`{displayname}\`, \`{nickname}\`, \`{tag}\`, \`{userid}\`, \`{avatar}\`
  - Timestamps: \`{created}\`, \`{joined}\`
  - Server metadata: \`{server}\`, \`{serverid}\`, \`{server.icon}\`, \`{owner}\`, \`{boosts}\`, \`{tier}\`, \`{roles}\`, \`{channels}\`
• **Resilient Delivery:** Automatically falls back to Discord REST fetch(channelId) if channel is not cached.
• **Universal Media & Direct Pinterest Support:** Accepts direct image URLs, animated GIFs, and direct Pinterest links (\`pin.it\` or \`pinterest.com/pin/...\`) for Large Image, Thumbnail, Author Icon, and Footer Icon. Automatically upgrades Pinterest links to uncompressed master quality and converts MP4 video links into animated looping Discord GIFs.`,
    example: '!welcome'
  },

  leave: {
    name: 'leave',
    aliases: ['farewell', 'goodbye'],
    category: 'Community & Engagement',
    clearance: 'Manage Server / Admin',
    syntax: '!leave',
    purpose: 'Interactive visual builder for departure messages when members exit the server.',
    architecture: 
`• **Interactive Control Dashboard:** Running !leave launches an interactive Components V2 manager panel mirroring the welcome builder.
• **Shared Interpolation Engine:** Shares resolvePlaceholders to dynamically inject \`{membercount}\`, \`{user}\`, \`{username}\`, \`{server}\`, \`{created}\`, \`{joined}\`, and server statistics into farewell announcements.
• **Gateway Trigger:** Evaluated instantly inside guildMemberRemove alongside server logging.`,
    example: '!leave'
  },
  serverstats: {
    name: 'serverstats',
    aliases: ['statsvc', 'membercountvc', 'statsetup', 'membercount'],
    category: 'Utility & Statistics',
    clearance: 'Extra Owner / Administrator',
    syntax: '!serverstats <setup|config|disable>',
    purpose: 'Deploys dynamic, locked voice channels that continuously display real-time server member counts, human counts, and bot counts.',
    architecture: 
`• **Live Gateway Synchronization:** Listens to guildMemberAdd and guildMemberRemove to update voice channel names dynamically in real-time.
• **Three Dynamic Counters:** Generates locked voice channels for Total Members, Humans, and Bots under a dedicated category.
• **Font & Emoji Styling Engine:** Interactive configuration via !serverstats config offering 8 typographical fonts (Small Caps, Bold, Script, Double Struck) and custom emojis.
• **Database State:** Persisted in SQLite via db.setServerStats and updated on gateway events.`,
    example: '!serverstats setup'
  },

  pinterest: {
    name: 'pinterest',
    aliases: ['pin', 'pinit', 'pintrest'],
    category: 'Media & Utility',
    clearance: '@everyone (Standard User)',
    syntax: '!pinterest <link> (or !pin <link>, or reply to a message with !pin)',
    purpose: 'Fetches, extracts, and delivers uncompressed original high-resolution images and MP4 videos from any Pinterest link or short URL (pin.it).',
    architecture: 
`• **Multi-Format Ingestion:** Supports standard pin URLs (pinterest.com/pin/...), short redirect URLs (pin.it/...), and direct pinimg links.
• **Full-Resolution Upgrade Engine:** Automatically inspects page metadata and upgrades resized preview thumbnails (736x, 564x, 236x) to original uncompressed master files (/originals/).
• **Video & Image Extraction:** Dynamically detects whether a pin contains an MP4 video (v.pinimg.com) or static/animated image asset.
• **Direct Discord Upload Pipeline:** Downloads media buffer and attaches it directly via AttachmentBuilder, bypassing hotlink blocks and guaranteeing permanent preview rendering.
• **1-Click Download Button:** Every extracted pin embeds an instant 1-click Download Image / Download Video button for effortless direct downloads.
• **Universal Cross-Bot Integration:** Paste direct Pinterest links (pin.it or pinterest.com) into any image button or modal across Athena (!welcome, !leave, !ticketpanel, !announce, !aiannounce, !autoreply, and Studio) and Athena will automatically extract and render the uncompressed master media seamlessly.
• **Reply-Aware Invocation:** Automatically parses replied messages when invoked via !pin as a Discord reply.`,
    example: '!pinterest https://pin.it/5gq1j4x'
  },

  weather: {
    name: 'weather',
    aliases: ['wtr', 'climate', 'forecast', 'temp', 'temperature'],
    category: 'Media & Utility',
    clearance: '@everyone (Standard User)',
    syntax: '!weather <city | country | coordinates | google_maps_url> (or !wtr, !climate, !forecast, !temp, !temperature, /weather)',
    purpose: 'Live global weather reconnaissance with real-time Equirectangular satellite world map projection and 3-day meteorological forecast.',
    architecture:
`• **Universal Location & Coordinates Engine:**
  - Accepts any location globally: city name, country, ISO code, latitude/longitude coordinates (e.g., 13.0827, 80.2707), or raw Google Maps links.
  - Automatically parses and extracts target coordinates from standard and shortened Google Maps URLs (maps.google.com, maps.app.goo.gl).
• **Canvas Equirectangular Satellite World Map HUD:**
  - Renders a 1000x500 high-resolution satellite world map with high-precision radar crosshairs centered directly on target coordinates.
  - Features an animated target lock ring, cyan glowing target beacon, and telemetry text repositioned cleanly in the lower open ocean without obstructing Northern landmasses.
• **Atmospheric & Solar Telemetry Suite:**
  - Real-time current temperature (°C and °F), feels-like index, humidity, wind velocity and direction, UV index, pressure, and visibility.
  - 3-day meteorological forecast with daily max/min temperatures and condition summaries.
  - Solar and lunar cycle indicators (sunrise, sunset, moon illumination).`,
    example: '!wtr Tokyo'
  },

  image: {
    name: 'image',
    aliases: ['pic', 'img', 'photo', 'picture', 'searchimg'],
    category: 'Media & Utility',
    clearance: '@everyone (Standard User)',
    syntax: '!image <query> (or !pic, !img, !photo, !picture, !searchimg, /image)',
    purpose: 'Real-time web image search retrieving actual authentic high-resolution pictures from the internet with interactive multi-page browsing.',
    architecture:
`• **Live Web Scraping & Multi-Engine Aggregation:**
  - Queries real-time internet search engines to discover and extract authentic web photos for any search term (e.g. cat, worldmap, fog, car, cm of tn, biden).
  - Automatically filters corrupted or dead thumbnails and resolves direct CDN image sources.
• **70+ Image Pool & Dynamic Shuffling:**
  - Simultaneously retrieves and pools dozens of high-res images per search query.
  - Dynamic index shuffling prevents repetitive result sequences across consecutive searches.
• **Interactive Browsing & Fail-Safe Pagination:**
  - Browse results using \`◀ Previous\` and \`Next ▶\` buttons directly inside Discord.
  - \`🎲 Random\` button for rapid discovery and \`🔄 Fresh Batch\` button to pull brand new pictures on demand.
  - Auto-recovering session manager ensures interactive buttons remain fully responsive even if sessions age.
• **Direct Source Inspection:**
  - Every picture result includes an external web button linking directly to the full-resolution asset on the host domain.
• **Conversational AI Synthesis:**
  - Athena's AI guide naturally triggers this engine when users ask for pictures in chat (@Athena picture of cat).`,
    example: '!pic cat'
  },

  stock: {
    name: 'stock',
    aliases: ['stocks', 'market', 'stockmarket', 'ticker', 'share', 'shares'],
    category: 'Finance & Utility',
    clearance: '@everyone (Standard User)',
    syntax: '!stock [symbol] (or !market, !stocks, !ticker <symbol>, /stock [symbol])',
    purpose: 'Generates real-time stock, ETF, and cryptocurrency telemetry in a high-resolution Canvas image with financial breakdown and market intelligence.',
    architecture:
`• **Dual-Mode Telemetry Rendering:**
  - **Global Market Overview Mode (!stock / !market):** Renders a master 6-index telemetry dashboard (S&P 500, NASDAQ, Dow Jones, NIFTY 50, Bitcoin, Ethereum) with individual mini sparklines plus mega-caps ticker tape.
  - **Single Stock Telemetry Mode (!stock <symbol>):** Renders a widescreen Canvas terminal card with smooth Bezier price curve, day range slider, 52-week range slider, 24h volume, and sentiment gauge.
• **Exchange API Aggregation:**
  - Connects to real-time financial market streams to query quotes, price changes, high/low bounds, and intraday trading volumes.
  - Automatic company name resolution (e.g. typing "apple" resolves to AAPL).
• **Interactive Discord Components V2 Controls:**
  - 1-click \`🔄 Refresh\` button to update quotes in place.
  - 1-click \`📊 AI Breakdown\` button for instant technical and fundamental analysis.
  - 1-click \`📰 News\` button for live financial catalysts and headlines.
• **Mandatory Risk Transparency Notice:**
  - Prominently states on every image and embed that Athena can make mistakes, quotes may be delayed, and insights do not constitute financial advice.`,
    example: '!stock NVDA'
  },

  stockai: {
    name: 'stockai',
    aliases: ['stockexplain', 'marketai', 'stai'],
    category: 'Finance & Utility',
    clearance: '@everyone (Standard User)',
    syntax: '!stockai <question or topic or symbol>',
    purpose: 'AI-powered quantitative financial analyst providing in-depth market explanations, earnings breakdowns, and valuation concepts.',
    architecture:
`• **Context-Enriched Financial AI:**
  - Automatically detects mentioned tickers, pulling live quotes and recent news headlines to ground the AI response in real market reality.
  - Analyzes macroeconomic indicators, Federal Reserve interest rate policy, earnings reports, valuation metrics (P/E, PEG), and key technical support/resistance levels.
• **Grey Markdown Formatting:**
  - Outputs strictly in Discord small grey text (-# ) with bold-underlined headers for clean readability.
• **Strict Risk Disclaimer:**
  - Prominently reminds users that Athena can make mistakes and AI insights are for informational/educational purposes only.`,
    example: '!stockai why did tech drop today?'
  },

  stockchannel: {
    name: 'stockchannel',
    aliases: ['dailystock', 'setstockchannel', 'stockalert'],
    category: 'Automation & Finance',
    clearance: 'Administrator / Extra Owner',
    syntax: '!stockchannel <set <#channel> | disable | status | test>',
    purpose: 'Configures an automated daily morning stock market intelligence briefing and Canvas image upload channel.',
    architecture:
`• **Database Snowflake ID Ground-Truth:**
  - Stores and resolves target channel strictly via Discord Snowflake ID in SQLite, immune to channel renaming or display spoofing.
• **Automated Daily Dispatch Daemon:**
  - Background daemon checks every 60 seconds; dispatches automatically at US Market Open (09:30 AM EST / 14:30 UTC).
  - Generates the World Market Pulse dashboard image and compiles the morning narrative.
• **Instant Test & Status Directives:**
  - \`!stockchannel test\`: Immediately generates and uploads today's market briefing into the configured channel.
  - \`!stockchannel status\`: Reports current binding and last sent timestamp.`,
    example: '!stockchannel set #stock-market'
  },

  movers: {
    name: 'movers',
    aliases: ['topmovers', 'gainers', 'losers', 'marketmovers'],
    category: 'Finance & Utility',
    clearance: '@everyone (Standard User)',
    syntax: '!movers / !topmovers / !gainers / !losers',
    purpose: 'Real-time market volatility and momentum scanner across mega-cap equities and major cryptocurrencies.',
    architecture:
`• **Real-Time Cross-Asset Velocity Scan:**
  - Evaluates live percentage changes across major equity indices, mega-caps (NVDA, AAPL, MSFT, TSLA, GOOGL, AMZN), and top cryptocurrencies (BTC, ETH, SOL).
  - Automatically partitions assets into **Top Gainers (Momentum Leaders)** and **Top Decliners (Volatility Pullbacks)**.
• **Instant Navigation Buttons:**
  - Embedded Component V2 buttons allow instant toggling between Global Market Pulse, Crypto Pulse, and full financial suite guidance.
• **Risk Disclaimer:**
  - Prominently reminds users that Athena can make mistakes and market data may experience network delays.`,
    example: '!movers'
  },

  crypto: {
    name: 'crypto',
    aliases: ['cryptocurrency', 'coin', 'btc', 'eth'],
    category: 'Finance & Utility',
    clearance: '@everyone (Standard User)',
    syntax: '!crypto [coin] (or !btc, !eth, !coin <symbol>)',
    purpose: 'Dedicated cryptocurrency market telemetry and Canvas price action charts.',
    architecture:
`• **Universal Cryptocurrency Resolution:**
  - Automatically resolves crypto symbols (e.g., BTC, ETH, SOL, DOGE, XRP) against standard USD quote pairs.
  - Defaults to Bitcoin (BTC-USD) if invoked without arguments.
• **Widescreen Canvas Charts & Range Sliders:**
  - Generates high-resolution price action curves with 24h range, 52-week range, volume, and sentiment gauge.
• **Risk Disclaimer:**
  - Prominently warns that crypto markets are volatile and quotes are for informational purposes only.`,
    example: '!crypto SOL'
  },

  stocknews: {
    name: 'stocknews',
    aliases: ['marketnews', 'financenews'],
    category: 'Finance & Utility',
    clearance: '@everyone (Standard User)',
    syntax: '!stocknews [symbol/topic] (or !marketnews)',
    purpose: 'Real-time financial press wiretap aggregating breaking news and market catalysts.',
    architecture:
`• **Direct Financial Press Aggregation:**
  - Queries live financial news engines to pull headlines, publishers, and verified URLs (Bloomberg, Reuters, Yahoo Finance, Motley Fool).
  - Relative Discord timestamps (<t:...:R>) display exactly when news broke.
• **Targeted Ticker News & Macro Catalyst Search:**
  - Search news for any specific company (\`!stocknews NVDA\`, \`!stocknews TSLA\`) or the general market (\`!stocknews\`).
• **Risk Disclaimer:**
  - Prominently highlights that news summaries are for informational purposes only.`,
    example: '!stocknews NVDA'
  },

  symbols: {
    name: 'symbols',
    aliases: ['symbollist', 'tickers', 'tickerlist', 'stocksymbols', 'marketlist', 'symlist'],
    category: 'Finance & Utility',
    clearance: '@everyone (Standard User)',
    syntax: '!symbols [query/category] (or /symbols [query])',
    purpose: 'Universal symbol directory and real-time ticker resolution covering every publicly traded asset worldwide.',
    architecture:
`• **Universal Asset Resolution:**
  - Full support for Indian equities (NSE/BSE like TCS, RELIANCE, INFY, TATAMOTORS, SBIN, ITC, HDFCBANK), US tech titans (NVDA, AAPL, MSFT, TSLA, GOOGL), crypto (BTC, ETH, SOL), commodities (GOLD, SILVER, CRUDE, NATGAS), and global indices (NIFTY, SENSEX, SP500, NASDAQ).
• **Real-Time Dynamic Symbol Search:**
  - Queries global financial search APIs in real-time to find exact symbols, exchange codes, and asset classes from company names or keywords (e.g. \`!symbols Tata\`, \`!symbols Adani\`, \`!symbols Palantir\`).
• **Interactive Categorized Directory:**
  - Interactive Component V2 buttons allow 1-click browsing across India (NSE/BSE), US Tech & AI, Cryptocurrencies, and Commodities/Macro.
• **Risk Disclaimer:**
  - Reminds users that Athena can make mistakes and quotes are for educational/informational purposes only.`,
    example: '!symbols TCS'
  },

  afk: {
    name: 'afk',
    aliases: ['brb'],
    category: 'Community & Engagement',
    clearance: 'Public / Everyone',
    syntax: '!afk [status message]',
    purpose: 'Sets an away-from-keyboard status that notifies anyone who mentions you.',
    architecture: 
`• **Mention Interceptor:** Listens in \`messageCreate\`. If a mentioned user is AFK, posts their message and automatically clears status when the user speaks.`,
    example: '!afk Eating lunch'
  },

  snipe: {
    name: 'snipe',
    aliases: ['s'],
    category: 'Utilities & Integrations',
    clearance: 'Staff Tier / Mod Tier',
    syntax: '!snipe [#channel]',
    purpose: 'Retrieves the most recently deleted message in the channel.',
    architecture: 
`• **In-Memory Ring Buffer:** Captures deleted messages from \`messageDelete\` event in an ephemeral memory cache with 15-minute TTL.`,
    example: '!snipe'
  },

  jtc: {
    name: 'jtc',
    aliases: ['jointocreate', 'tempvc'],
    category: 'Voice & Media',
    clearance: 'Admin Tier / Manage Channels',
    syntax: '!jtc [setup|panel|lock|limit]',
    purpose: 'Dynamic temporary voice channel management.',
    architecture: 
`• **Voice State Wiretap:** When a member enters the JTC hub, Athena creates a private channel, moves the member, and deletes the channel when empty.`,
    example: '!jtc setup'
  },

  voicerole: {
    name: 'voicerole',
    aliases: ['vcrole', 'voice-role'],
    category: 'Voice & Community Systems',
    clearance: 'Manage Server / Manage Roles / Extra Owner / Server Owner',
    syntax: '!voicerole [@role|ID|Name|disable] / /voicerole [role] [disable]',
    purpose: 'Automatically assigns a designated role to members the instant they connect to ANY voice channel, and strips it when they disconnect.',
    architecture: 
`• **Universal Scope & Permissive Matrix:**
  - Enforces automatic role grant and revocation for **ALL** entities: **Server Owner**, **Bot Owner**, **Extra Owners**, **Standard Members**, and **Integration Bots** (music bots, utility bots, etc.).
  - Hierarchy Safety: Requires bot's highest role to be positioned strictly above the target voice role with Manage Roles permissions.
  - Safe Exception Containment: Wrapped in non-blocking API catches to eliminate gateway disruption if Discord hierarchy restrictions apply.

• **Gateway Event Wiretap (\`src/events/voiceStateUpdate.js\`):**
  - Real-time sub-millisecond voice connection and disconnection interceptor.
  - Grants role upon connecting (\`isInVc && !hasRole\`).
  - Strips role upon leaving voice channels (\`!isInVc && hasRole\`).
  - Channel hopping immunity: Switching between channels does not trigger redundant remove/add API cycles.

• **Live State Synchronization (\`syncVoiceRoles\`):**
  - **On Role Enable/Switch:** Immediately iterates over all active voice states across the server and grants the role to everyone currently in VC without requiring them to leave and rejoin.
  - **On Role Switch:** Strips the previous role from active holders and binds the new role.
  - **On Disable:** Instantly revokes the voice role from all current holders guild-wide.
  - **Inactive Cleanup:** Automatically strips the voice role from members who hold it while not connected to any voice channel.

• **Cold-Start Resilience (\`src/events/ready.js\`):**
  - Runs automated startup voice role sync across all indexed servers upon bot boot or gateway resume.

• **Interactive Control Matrix & Database Compliance:**
  - Running \`!voicerole\` without arguments opens an interactive Components V2 panel with live status, Role Select Menu, and one-click Disable/Close controls.
  - Stored strictly by role snowflake ID in SQLite database (\`guildConfig.voiceRoleId\`).`,
    example: '!voicerole @Active Voice'
  },

  auth: {
    name: 'auth',
    aliases: ['tiers', 'setauth'],
    category: 'Security & Access Control',
    clearance: 'Server Owner / Extra Owner',
    syntax: '!auth [admin|mod|staff] @role',
    purpose: 'Binds Discord roles to Athena Prime authorization tiers (Admin, Mod, Staff) in SQLite database.',
    architecture: 
`• **Database ID Binding:** Saves role IDs into \`auth_tiers\` table. Role name spoofing is completely ineffective.`,
    example: '!auth admin @Administrators'
  },

  tier: {
    name: 'tier',
    aliases: ['perms', 'myperms'],
    category: 'Security & Access Control',
    clearance: 'Public / Everyone',
    syntax: '!tier [@user]',
    purpose: 'Displays a user\'s current authorization tier, permission matrix, and access clearance.',
    architecture: 
`• **Real-Time Permission Evaluator:** Computes member bitfields against guild database tiers and renders a Components V2 card.`,
    example: '!tier'
  },

  modmode: {
    name: 'modmode',
    aliases: ['maintenancemode'],
    category: 'Security & Access Control',
    clearance: 'Server Owner Only',
    syntax: '!modmode on|off',
    purpose: 'Temporarily pauses Anti-Nuke channel/role restoration during authorized server maintenance.',
    architecture: 
`• **State Lockout:** Pauses instant auto-restore for the Server Owner while maintaining audit trail logging.`,
    example: '!modmode on'
  },

  learn: {
    name: 'learn',
    aliases: ['ai', 'heuristics', 'behavioral'],
    category: 'Security & Access Control',
    clearance: 'Admin Tier / Server Owner / Extra Owners',
    syntax: '!learn [status|on|off|baseline|signatures|clear]',
    purpose: 'Interactive Heuristic Threat Profiling & Machine Learning engine that establishes staff velocity baselines and fingerprints rogue attack signatures.',
    architecture: 
`• **Interactive Components V2 Dashboard (\`!learn\` / \`!learn status\`):**
  - **Live Telemetry Status:** <a:uptime:1552608831060844575> \`Active (Adaptive Profiling Engaged)\` vs <:off:1533844858983157851> \`Inactive / Standby\`.
  - **Metrics Tracked:** Threat Signatures Captured, Baseline Staff Actions Profiled, Staff Accounts Indexed, False-Positive Guard Status, and Last Recorded Event & Timestamp.
  - **Interactive 1-Click Buttons:** \`[Engage/Disengage Learning]\`, \`[Run Baseline Scan]\`, \`[View Signatures]\`, \`[Clear History]\`, and \`[Refresh]\`.
• **Full Subcommand Suite (Prefix & Slash Supported):**
  - \`!learn on\` / \`!learn enable\`: Engages continuous adaptive profiling.
  - \`!learn off\` / \`!learn disable\`: Disengages profiling mode.
  - \`!learn baseline\`: Real-time audit scan of server staff members, elevated roles, and webhooks to establish a clean initial baseline.
  - \`!learn signatures\` / \`!learn list\`: Displays recent threat signatures and velocity anomaly patterns.
  - \`!learn clear\`: Resets recorded signature registry for the guild.
  - \`!learn status\`: Displays the live telemetry dashboard.
• **Persistent SQLite Signature & Baseline Engine (\`src/database.js\`):**
  - Powered by \`getNukeSignatures()\`, \`addNukeSignature()\`, \`clearNukeSignatures()\`, \`getLearnBaseline()\`, and \`recordBaselineAction()\`.
  - Threat signatures are cleanly capped in a circular buffer to prevent database bloat.
• **Slash Command Support (\`/learn\`):**
  - Full slash command implementation with \`action\` choices (\`status\`, \`enable\`, \`disable\`, \`baseline\`, \`signatures\`, \`clear\`).`,
    example: '!learn baseline'
  },

  np: {
    name: 'np',
    aliases: ['noprefix'],
    category: 'Security & Access Control',
    clearance: 'Bot Owner Only',
    syntax: '!np [add|remove|list] @user',
    purpose: 'Global No-Prefix management dashboard for trusted members across all Athena Prime guilds.',
    architecture: 
`• **Global SQLite Table:** Stores user IDs with no-prefix privileges, evaluated at the root of \`messageCreate\`.`,
    example: '!np list'
  },

  autonick: {
    name: 'autonick',
    aliases: ['hoistcleaner'],
    category: 'Security & Access Control',
    clearance: 'Extra Owner / Server Owner',
    syntax: '!autonick [on|off|symbol]',
    purpose: 'Enforces anti-hoisting character filtering on member nicknames to prevent sorting exploits.',
    architecture: 
`• **Nickname Normalizer:** Intercepts \`guildMemberUpdate\` and \`guildMemberAdd\`, resetting special unicode symbols (!, ?, ., etc.) from nickname heads.`,
    example: '!autonick on'
  },

  botwhitelist: {
    name: 'botwhitelist',
    aliases: ['trustedbots', 'bw'],
    category: 'Security & Access Control',
    clearance: 'Extra Owner / Server Owner',
    syntax: '!botwhitelist [add|remove|list] <botId>',
    purpose: 'Authorizes trusted external bots to prevent instant auto-ban on join.',
    architecture: 
`• **Whitelist Registry:** Stores authorized bot IDs in SQLite configuration. Any non-whitelisted bot added is banned in <1ms.`,
    example: '!botwhitelist add 123456789012345678'
  },

  spampermit: {
    name: 'spampermit',
    aliases: ['spambypass'],
    category: 'Security & Access Control',
    clearance: 'Extra Owner / Server Owner',
    syntax: '!spampermit <@user/id>',
    purpose: 'Grants webhook and spam protection bypass clearance for trusted bots or webhook executors.',
    architecture: 
`• **Bypass Memory Cache:** Evaluates message and webhook authors against bypass list to prevent false-positive spam mutes.`,
    example: '!spampermit @WebhookBot'
  },

  vcdrag: {
    name: 'vcdrag',
    aliases: ['loopdrag', 'vcloop'],
    category: 'Voice Grid Control & Security',
    clearance: 'Extra Owner / Server Owner',
    syntax: '!vcdrag <@user> [interval_seconds]',
    purpose: 'Enforces an automated high-velocity drag loop on a target member across all voice channels in the guild.',
    architecture: 
`• **Voice Channel Enumeration:** Queries all cached guild voice channels (\`ChannelType.GuildVoice\` and \`GuildStageVoice\`).
• **Gateway Patch Dispatch:** Sequentially updates target's voice state via \`PATCH /guilds/{id}/members/{user}\` with successive \`channel_id\` values.
• **Threaded Interval Loop:** Holds interval reference in memory (\`activeDrags\` map) cycling channels every N seconds until terminated by \`!vcdragstop\`.
• **Immunity Enforcement:** Asserts that target is subordinate; Server Owner, Bot Owner, and Extra Owners are completely immune.`,
    example: '!vcdrag @user 2'
  },

  vcdragstop: {
    name: 'vcdragstop',
    aliases: ['dragstop', 'stopdrag'],
    category: 'Voice Grid Control & Security',
    clearance: 'Extra Owner / Server Owner',
    syntax: '!vcdragstop <@user>',
    purpose: 'Immediately halts an active voice channel drag loop for the specified member.',
    architecture: 
`• **Timer Cancellation:** Clears the active \`setInterval\` timer associated with \`\${guildId}:\${userId}\`.
• **Memory Garbage Collection:** Deletes the session key from \`activeDrags\` map to release memory and restore member stability.`,
    example: '!vcdragstop @user'
  },

  massmove: {
    name: 'massmove',
    aliases: ['vcmove', 'moveall'],
    category: 'Voice Grid Control & Security',
    clearance: 'Extra Owner / Server Owner',
    syntax: '!massmove <destinationVC> [sourceVC]',
    purpose: 'Atomically transfers all connected members from one voice channel into a destination voice channel.',
    architecture: 
`• **Voice State Resolution:** Collects all occupants of \`sourceVC\` (or caller's active voice channel if omitted).
• **Throttled Batch Pipeline:** Dispatches \`member.voice.setChannel(destVc.id)\` sequentially with a 150ms buffer to respect Discord voice rate-limiting.
• **Caller Immunity:** Does not relocate the executing owner unless explicitly configured.`,
    example: '!massmove #StageChannel #WaitingRoom'
  },

  massdc: {
    name: 'massdc',
    aliases: ['vcdc', 'massdisconnect', 'dcall'],
    category: 'Voice Grid Control & Security',
    clearance: 'Extra Owner / Server Owner',
    syntax: '!massdc [voiceChannel]',
    purpose: 'Forcibly disconnects all members from a voice channel in a single batched sweep.',
    architecture: 
`• **Voice State Severing:** Calls \`PATCH /guilds/{id}/members/{user}\` setting \`channel_id: null\` on each target member.
• **Owner & Staff Immunity:** Automatically ignores the Server Owner, Bot Owner, and Extra Owners during the sweep.
• **Raid Neutralization:** Instantly clears compromised, raided, or audio-spammed voice channels.`,
    example: '!massdc #GeneralVC'
  },

  muteall: {
    name: 'muteall',
    aliases: ['vcmuteall', 'servermuteall'],
    category: 'Voice Grid Control & Security',
    clearance: 'Extra Owner / Server Owner',
    syntax: '!muteall [voiceChannel]',
    purpose: 'Server-mutes every member in the active voice channel simultaneously.',
    architecture: 
`• **Bulk Voice Patching:** Dispatches \`member.voice.setMute(true)\` across all channel occupants via direct API calls.
• **Security Audit Stamping:** Dispatches forensic event record to the security log channel detailing affected member count and executor tier.`,
    example: '!muteall'
  },

  unmuteall: {
    name: 'unmuteall',
    aliases: ['vcunmuteall', 'serverunmuteall'],
    category: 'Voice Grid Control & Security',
    clearance: 'Extra Owner / Server Owner',
    syntax: '!unmuteall [voiceChannel]',
    purpose: 'Lifts server-mute on all members in the voice channel.',
    architecture: 
`• **Voice State Restoration:** Iterates through members holding \`serverMute: true\` and calls \`member.voice.setMute(false)\`.`,
    example: '!unmuteall'
  },

  deafenall: {
    name: 'deafenall',
    aliases: ['vcdeafenall', 'serverdeafenall'],
    category: 'Voice Grid Control & Security',
    clearance: 'Extra Owner / Server Owner',
    syntax: '!deafenall [voiceChannel]',
    purpose: 'Server-deafens all occupants in the active voice channel to prevent audio interception during sensitive announcements.',
    architecture: 
`• **Bulk Deafen Dispatch:** Dispatches \`member.voice.setDeaf(true)\` on each occupant across the voice channel.`,
    example: '!deafenall'
  },

  undeafenall: {
    name: 'undeafenall',
    aliases: ['vcundeafenall', 'serverundeafenall'],
    category: 'Voice Grid Control & Security',
    clearance: 'Extra Owner / Server Owner',
    syntax: '!undeafenall [voiceChannel]',
    purpose: 'Restores normal audio reception for all members in the voice channel.',
    architecture: 
`• **Voice State Restoration:** Clears \`serverDeaf\` attribute on all members in the target VC.`,
    example: '!undeafenall'
  },

  vcprotect: {
    name: 'vcprotect',
    aliases: ['lockvc', 'protectvc'],
    category: 'Voice Grid Control & Security',
    clearance: 'Admin Tier / Extra Owner',
    syntax: '!vcprotect <#vc|ID>',
    purpose: 'Enforces anti-drag and anti-disconnect protection on sensitive voice channels.',
    architecture: 
`• **Voice State Wiretap:** Monitors \`voiceStateUpdate\` packets; if an unauthorized moderator disconnects or drags protected occupants, Athena immediately reverts the action and disciplines the offender.`,
    example: '!vcprotect #ExecutiveRoom'
  },

  setup: {
    name: 'setup',
    aliases: ['setlogs', 'setquarantine', 'configsetup'],
    category: 'Server Administration',
    clearance: 'Administrator',
    syntax: '!setup [logs|role|vc] <#channel|@role|ID>',
    purpose: 'Binds and configures core server resources (Security Logs Channel, Quarantine Role, Quarantine Voice) strictly by Discord Snowflake IDs.',
    architecture: 
`• **Database ID Binding:** Extracts snowflake IDs from mentions or raw digits and queries guild cache/API. Writes \`securityLogChannelId\`, \`logChannel\`, \`quarantineRoleId\`, and \`quarantineVcId\` to SQLite.
• **Zero Name Fallback:** Eliminates display name spoofing; all Athena modules detect bound entities exclusively by ID.`,
    example: '!setup logs #security-logs'
  },

  restore: {
    name: 'restore',
    aliases: ['loadbackup', 'applysnapshot'],
    category: 'Server Administration',
    clearance: 'Server Owner / Extra Owner',
    syntax: '!restore <backupId>',
    purpose: 'Restores server structure, roles, permissions, and channel layouts from an encrypted cloud backup snapshot.',
    architecture: 
`• **Snapshot Deserialization:** Reads encrypted snapshot JSON from private cloud storage channel.
• **Hierarchical Reconstruction:** Recreates roles in original hierarchy order with exact permission bitfields, then rebuilds categories, channels, and permission overwrites.`,
    example: '!restore backup_123456'
  }
};

/**
 * Dynamically builds a detailed command structure for any command registered in Athena Prime's commandMap.
 */
export function buildDynamicCommandDetails(cmd, prefix = '!') {
  if (!cmd) return null;

  let permsText = "Public / Everyone";
  if (cmd.name === "unbypassable") {
    permsText = "Administrators, Server Owner, Extra Owners, and Bot Owners";
  } else if (cmd.permissions && cmd.permissions.length > 0) {
    if (cmd.permissions.includes(8n)) permsText = "Administrator";
    else if (cmd.permissions.includes(32n)) permsText = "Manage Server";
    else if (cmd.permissions.includes(268435456n)) permsText = "Manage Roles";
    else if (cmd.permissions.includes(16n)) permsText = "Manage Channels";
    else if (cmd.permissions.includes(4n)) permsText = "Ban Members";
    else if (cmd.permissions.includes(2n)) permsText = "Kick Members";
    else if (cmd.permissions.includes(1099511627776n)) permsText = "Moderate Members";
    else permsText = "Elevated Staff Permissions";
  }

  const category = cmd.category ? cmd.category.charAt(0).toUpperCase() + cmd.category.slice(1) : "General";
  const aliases = Array.isArray(cmd.aliases) ? cmd.aliases : [];
  const syntax = `${prefix}${cmd.name}${cmd.options && cmd.options.length > 0 ? ' ' + cmd.options.map(o => o.required ? `<${o.name}>` : `[${o.name}]`).join(' ') : ''}`;

  return {
    name: cmd.name,
    aliases: aliases,
    category: category,
    clearance: permsText,
    syntax: syntax,
    purpose: cmd.description || `Executes the ${cmd.name} system function within the ${category} module.`,
    architecture: 
`• **Gateway & REST Interaction:** Validates executor clearance, evaluates caller and bot hierarchy positions, and dispatches authenticated Discord API requests.
• **State & Database Synchronization:** Queries guild configuration and commits real-time telemetry to the server database.
• **Security & Hierarchy Mitigations:** Enforces role hierarchy protection, bot immunity checks, and rate-limited execution pipelines.`,
    example: `${prefix}${cmd.name}`
  };
}

/**
 * Builds a friendly "Not Found" container that shows the failure notice and the topic directory.
 */
export function buildNotFoundContainer(query, prefix = '!') {
  const dir = buildTopicsDirectoryContainer(prefix);
  dir.components.unshift(
    { type: 10, content: `-! <:cross_red:1533860128015519895> **Command or Architecture Topic Not Found:** \`${query}\`\n-# Browse the available architecture deep dives below or inspect specific commands using \`${prefix}explain <command>\`.` },
    { type: 14, divider: true }
  );
  return dir;
}

/**
 * Formats architecture explanation markdown so all bullets, steps, and highlights
 * render in grey bold underlined format (-# • **__Keyword:__** ...) in Discord.
 */
export function formatExplainerMarkdown(content) {
  if (!content) return '';
  const lines = content.split('\n');
  const formatted = [];
  let inCode = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith('```')) {
      inCode = !inCode;
      formatted.push(rawLine);
      continue;
    }
    if (inCode) {
      formatted.push(rawLine);
      continue;
    }
    if (!trimmed) {
      formatted.push('');
      continue;
    }

    // Keep top-level markdown headers #, ##, ### as primary headings
    if (/^#{1,3}\s+/.test(trimmed)) {
      formatted.push(trimmed);
      continue;
    }

    // If line already starts with -# or > -#
    if (/^(?:>\s*)?-#/.test(trimmed)) {
      formatted.push(
        trimmed
          .replace(/__\*\*([^*_]+)\*\*__/g, '**__$1__**')
          .replace(/\*\*(?!__)(.*?)(?<!__)\*\*/g, '**__$1__**')
      );
      continue;
    }

    // Bullet point: • **Title**: or • **Title:** or - text
    if (/^(?:[-•]|\*(?!\*))\s+/.test(trimmed)) {
      let cleanBullet = trimmed.replace(/^(?:[-•]|\*(?!\*))\s+/, '');
      cleanBullet = cleanBullet
        .replace(/__\*\*([^*_]+)\*\*__/g, '**__$1__**')
        .replace(/\*\*(?!__)(.*?)(?<!__)\*\*/g, '**__$1__**');
      formatted.push(`-# • ${cleanBullet}`);
      continue;
    }

    // Numbered list: 1. , 2.
    const numMatch = trimmed.match(/^(\d+[\.\)])\s+(.+)$/);
    if (numMatch) {
      let numText = numMatch[2]
        .replace(/__\*\*([^*_]+)\*\*__/g, '**__$1__**')
        .replace(/\*\*(?!__)(.*?)(?<!__)\*\*/g, '**__$1__**');
      formatted.push(`-# **__${numMatch[1]}__** ${numText}`);
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      let body = trimmed.replace(/^>\s*/, '');
      body = body
        .replace(/__\*\*([^*_]+)\*\*__/g, '**__$1__**')
        .replace(/\*\*(?!__)(.*?)(?<!__)\*\*/g, '**__$1__**');
      formatted.push(`> -# ${body}`);
      continue;
    }

    // Standard body text with bold highlights
    let body = trimmed
      .replace(/__\*\*([^*_]+)\*\*__/g, '**__$1__**')
      .replace(/\*\*(?!__)(.*?)(?<!__)\*\*/g, '**__$1__**');
    formatted.push(`-# ${body}`);
  }

  return formatted.join('\n');
}

/**
 * Build a structured Components V2 container for an Architecture Topic or Command deep dive.
 */
export function buildExplainContainer(topicOrCmd, pageIndex = 0, prefix = '!', commandMap = null) {
  const q = String(topicOrCmd || '').toLowerCase().trim();

  // 1. Check if it matches an Architecture Topic
  let matchedTopic = null;
  for (const key of Object.keys(ARCHITECTURE_TOPICS)) {
    const t = ARCHITECTURE_TOPICS[key];
    if (t.id === q || t.aliases.includes(q)) {
      matchedTopic = t;
      break;
    }
  }

  if (matchedTopic) {
    const totalPages = matchedTopic.pages.length;
    const safeIndex = Math.max(0, Math.min(pageIndex, totalPages - 1));
    const currentPage = matchedTopic.pages[safeIndex];

    const rawComponents = [];

    // Header
    rawComponents.push({
      type: 10,
      content: `# ${matchedTopic.title}\n> -# **__Topic Overview:__** ${matchedTopic.description}\n> -# **__Section [${safeIndex + 1}/${totalPages}]:__** **__${currentPage.pageTitle}__**`
    });
    rawComponents.push({ type: 14, divider: true });

    // Page Content
    rawComponents.push({
      type: 10,
      content: formatExplainerMarkdown(currentPage.content)
    });
    rawComponents.push({ type: 14, divider: true });

    // Navigation Buttons (Row 1)
    const navButtons = [];
    if (safeIndex > 0) {
      navButtons.push({
        type: 2,
        custom_id: `arch_page_${matchedTopic.id}_${safeIndex - 1}`,
        label: 'Previous Section',
        style: 2,
        emoji: { id: '1523766004839088301' }
      });
    }
    if (safeIndex < totalPages - 1) {
      navButtons.push({
        type: 2,
        custom_id: `arch_page_${matchedTopic.id}_${safeIndex + 1}`,
        label: 'Next Section',
        style: 2,
        emoji: { id: '1523766065576935475' }
      });
    }
    navButtons.push({
      type: 2,
      custom_id: 'arch_home',
      label: 'Topic Directory',
      style: 2,
      emoji: { id: '1523765738655973589' }
    });
    navButtons.push({
      type: 2,
      custom_id: 'arch_close',
      label: 'Close',
      style: 2,
      emoji: { id: '1523766340752642109' }
    });

    rawComponents.push({
      type: 1,
      components: navButtons
    });

    rawComponents.push({ type: 14, divider: true });
    rawComponents.push({
      type: 10,
      content: '-# **Athena Prime Deep-Dive Architecture Matrix · Unbypassable Security**'
    });

    return {
      type: 17,
      components: rawComponents
    };
  }

  // 2. Check if it matches a Detailed Command
  let matchedCmd = null;
  for (const key of Object.keys(DETAILED_COMMANDS)) {
    const c = DETAILED_COMMANDS[key];
    if (c.name === q || c.aliases.includes(q)) {
      matchedCmd = c;
      break;
    }
  }

  // 2.5. Dynamic Fallback: Check registered commands in commandMap
  if (!matchedCmd && commandMap) {
    const foundCmd = commandMap.get(q);
    if (foundCmd) {
      matchedCmd = buildDynamicCommandDetails(foundCmd, prefix);
    }
  }

  if (matchedCmd) {
    const aliasesText = matchedCmd.aliases.map(a => `\`${prefix}${a}\``).join(', ') || '`None`';
    const rawComponents = [
      {
        type: 10,
        content: 
`# Command Architecture: \`${prefix}${matchedCmd.name}\` | <a:atheNATICK:1557841381630681106>
> -# **__Category:__** ${matchedCmd.category}
> -# **__Required Clearance:__** \`${matchedCmd.clearance}\`
> -# **__Aliases:__** ${aliasesText}
> -# **__Syntax:__** \`${matchedCmd.syntax.replace(/!/g, prefix)}\``
      },
      { type: 14, divider: true },
      {
        type: 10,
        content:
`### Purpose & Functional Objective
> -# **__${matchedCmd.purpose}__**

### Internal Architecture & Gateway Mechanics
${formatExplainerMarkdown(matchedCmd.architecture)}

### Verified Example
> \`${matchedCmd.example.replace(/!/g, prefix)}\``
      },
      { type: 14, divider: true },
      {
        type: 1,
        components: [
          { type: 2, custom_id: 'arch_home', label: 'Topic Directory', style: 2, emoji: { id: '1523765738655973589' } },
          { type: 2, custom_id: 'arch_close', label: 'Close', style: 2, emoji: { id: '1523766340752642109' } }
        ]
      },
      { type: 14, divider: true },
      {
        type: 10,
        content: '-# **Athena Prime Deep-Dive Architecture Matrix · Unbypassable Security**'
      }
    ];

    return {
      type: 17,
      components: rawComponents
    };
  }

  // 3. Fallback: Return not found notice with topic directory
  return buildNotFoundContainer(topicOrCmd, prefix);
}

/**
 * Builds the Directory of all available Architecture Explanations.
 */
export function buildTopicsDirectoryContainer(prefix = '!') {
  const selectOptions = [
    {
      label: 'Synced Looping Animated GIF HUDs',
      description: 'Canvas-rendered animated looping HUDs & progress bars drawn in GIF',
      value: 'synced_gif_hud'
    },
    {
      label: 'AI & Celebrity TTS Voices Engine',
      description: '14 Celebrity voices, zero-latency DSP filtering & voice channel streaming',
      value: 'tts_voices'
    },
    {
      label: 'Advanced Trigger Systems',
      description: 'Ghost, Bounty XP, Time-variant & Tier-adaptive trigger engines',
      value: 'advanced_triggers'
    },
    {
      label: 'Welcome, Leave & Placeholders',
      description: 'Dynamic variable interpolation, {membercount}, ordinals & CV2 builder',
      value: 'welcome'
    },
    {
      label: 'Heuristic Threat Profiling',
      description: 'Adaptive staff baselining, ML profiling & threat signatures',
      value: 'learn'
    },
    {
      label: 'AI & System Intelligence',
      description: 'Damerau-Levenshtein typo correction, dynamic RAG & action buttons',
      value: 'athena'
    },
    {
      label: 'AI Announcement Studio',
      description: 'Neural prompt intake, custom emoji synthesis & live studio preview',
      value: 'aiannounce'
    },
    {
      label: 'Security & Role Exploits',
      description: 'Linked Roles, 60s audit threshold & zero-day wiretap',
      value: 'security'
    },
    {
      label: 'Persistence Sentinel Roles',
      description: 'Athena Unbypassable hierarchy & persistence sentinels',
      value: 'unbypassable'
    },
    {
      label: 'Onboarding Exploit Guard',
      description: 'Neutralize dangerous onboarding prompt roles',
      value: 'onboarding'
    },
    {
      label: 'Voice Grid & Channel Drag',
      description: 'High-velocity loop dragging & mass relocation',
      value: 'voice'
    },
    {
      label: 'Moderation & Mass Actions',
      description: 'Action velocity throttling & rogue admin defense',
      value: 'moderation'
    },
    {
      label: 'Automod & Filter Engine',
      description: 'Real-time regex, invite neutralization & filters',
      value: 'automod'
    },
    {
      label: 'Quarantine Containment',
      description: 'Zero-trust isolation & role strip caching',
      value: 'quarantine'
    },
    {
      label: 'Cloud Backup & Manifest',
      description: 'Encrypted snapshot serialization & 1-click restore',
      value: 'cloudsync'
    },
    {
      label: 'Access Control & Tiers',
      description: 'Database-backed three-tier authorization matrix',
      value: 'auth'
    }
  ];

  const rawComponents = [
    {
      type: 10,
      content: 
`# Architecture & Command Deep-Dive Explainer | <a:atheNATICK:1557841381630681106>
> <a:uptime:1552608831060844575> **Welcome to the Athena Prime Architecture Explainer Engine!**
> Full technical breakdowns of Gateway wiretaps, velocity throttling, zero-day exploit mitigations, and execution mechanics.
> -# **__To inspect any command:__** Type \`${prefix}explain <command>\` (e.g. \`${prefix}explain kick\`, \`${prefix}explain vcdrag\`)`
    },
    { type: 14, divider: true },
    {
      type: 10,
      content:
`### 1. Autonomous Security & Antinuke Architecture
> -# **__Under-the-Hood:__** Raw WebSocket wiretap (<1ms) intercepts unlogged Linked Role and Onboarding escalations via 60s audit threshold. Reinstates sentinel roles and quarantines offenders.
-# • **__Commands:__** \`unbypassable\`, \`antinuke\`, \`firewall\`, \`neutralizeonboarding\`, \`scanserver\`, \`panic\`, \`quarantine\`, \`botwhitelist\`, \`spampermit\`, \`autonick\`, \`learn\`, \`modmode\`

### 2. Voice Grid Control & Channel Drag Architecture
> -# **__Under-the-Hood:__** Voice gateway wiretap updates state via PATCH /guilds/{id}/members/{user}. Executes drag loops, mass moves, and mass disconnects with 150ms buffers and caller immunity.
-# • **__Commands:__** \`vcdrag\`, \`vcdragstop\`, \`massmove\`, \`massdc\`, \`muteall\`, \`unmuteall\`, \`deafenall\`, \`undeafenall\`, \`jtc\`, \`vcprotect\`

### 3. Mass Moderation & Action Velocity Architecture
> -# **__Under-the-Hood:__** Sequential REST execution with hierarchy checks. Velocity tripwires (>3 actions/10s) quarantine rogue staff, while pre-action DMs and SQLite forensics record accountability.
-# • **__Commands:__** \`kick\`, \`ban\`, \`unban\`, \`tempban\`, \`massban\`, \`masskick\`, \`timeout\`, \`untimeout\`, \`warn\`, \`warnings\`, \`clearwarns\`, \`purge\`, \`slowmode\`, \`nuke\``
    },
    { type: 14, divider: true },
    {
      type: 10,
      content:
`### 4. Channel Lifecycle & ACL Isolation Architecture
> -# **__Under-the-Hood:__** Manipulates explicit @everyone and role overwrite bitmasks. Rewrites channel ACLs dynamically during lockdown, quarantine isolation, and metadata-preserving clones.
-# • **__Commands:__** \`lock\`, \`unlock\`, \`hide\`, \`unhide\`, \`nuke\`, \`quarantine\`

### 5. Role Hierarchy & Identity Persistence Architecture
> -# **__Under-the-Hood:__** Strict database ID binding immune to display spoofing. Manages join-time autoroles, dynamic member stripping, anti-strip self-healing triggers, and three-tier clearance.
-# • **__Commands:__** \`addrole\`, \`removerole\`, \`striproles\`, \`autorole\`, \`auth\`, \`tier\`

### 6. Automod, Regex & Phishing Defense Architecture
> -# **__Under-the-Hood:__** Pre-dispatch inspection. De-cloaks punycode URLs, executes compiled regex dictionaries, intercepts Discord invites in <1ms, and evaluates role bypass caches.
-# • **__Commands:__** \`automod\`, \`spampermit\`

### 7. Cloud Snapshot & State Restoration Architecture
> -# **__Under-the-Hood:__** Serializes full guild state (roles, permissions, channels, settings) into AES-encrypted JSON snapshots stored off-site for 1-click disaster recovery.
-# • **__Commands:__** \`backup\`, \`restore\`, \`setup\`

### 8. Athena AI Specialist & Neural Guide Architecture
> -# **__Under-the-Hood:__** Multi-tier RAG indexing 257+ commands with Damerau-Levenshtein typo auto-correction, 10m rolling thread memory, and dynamic grey action button synthesis.
-# • **__Commands:__** \`athena\`, \`ask\`, \`aimode\`, \`explain\``
    },
    { type: 14, divider: true },
    {
      type: 1,
      components: [
        {
          type: 3,
          custom_id: 'arch_select_topic',
          placeholder: 'Select an Architecture Deep-Dive Topic...',
          options: selectOptions
        }
      ]
    },
    { type: 14, divider: true },
    {
      type: 1,
      components: [
        { type: 2, custom_id: 'arch_topic_security', label: 'Security & Exploits', style: 2 },
        { type: 2, custom_id: 'arch_topic_athena', label: 'AI Architecture', style: 2 },
        { type: 2, custom_id: 'arch_topic_unbypassable', label: 'Sentinel Roles', style: 2 },
        { type: 2, custom_id: 'arch_topic_moderation', label: 'Mass Moderation', style: 2 },
        { type: 2, custom_id: 'arch_close', label: 'Close', style: 2, emoji: { id: '1523766340752642109' } }
      ]
    },
    { type: 14, divider: true },
    {
      type: 10,
      content: '-# **Athena Prime Deep-Dive Architecture Matrix · Unbypassable Security**'
    }
  ];

  return {
    type: 17,
    components: rawComponents
  };
}

export const COMMAND_EXPLAINERS = DETAILED_COMMANDS;
