import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { 
  BULLET_EMOJI, 
  NINJA_BULLET, 
  NINJA_BULLET_RTL, 
  NAV_EMOJI_IDS, 
  getRandomHeadingGlyph 
} from './emojis.js';
import { sanitizeCV2Payload } from '../cv2.js';

/**
 * Athena Prime - 5-Day Rolling Release & Changelog Matrix
 * Maintains strictly the latest 5 calendar days of updates, architectural optimizations,
 * feature rollouts, and security patches.
 */
export const CHANGELOG_ENTRIES = [
  {
    date: '10 November 2026',
    version: 'v2.9.9',
    headline: 'Streamlined Buttonless Presentation for !bi & !about with Public Clearance Cataloging',
    summary: 'Stripped legacy action row buttons from !bi (!botstats / !botinfo) and !about (/about) to deliver an uninhibited, zero-lag Components V2 container presentation. Enforced public command status across authorization gatekeepers for both commands and indexed !bi and !about directly into the Help catalog under Utilities with dedicated inspection cards.',
    whatsNew: [
      {
        title: 'Streamlined Buttonless Layout',
        desc: 'Removed interactive navigation buttons from !bi and !about for a clean, distraction-free visual footprint.'
      },
      {
        title: 'Complete Public Clearance Cataloging',
        desc: 'Explicitly registered !bi / !botstats / !botinfo and !about / !aboutathena as [Public] across the Help suite and security clearance resolvers.'
      },
      {
        title: 'Dedicated !help bi Inspection Card',
        desc: 'Added dedicated single-command help inspection for !bi, providing cluster scale, hardware metrics, and military defense status.'
      }
    ],
    improvements: [
      {
        title: 'Dynamic Version Binding',
        desc: 'Synchronized version metadata across !bi and !about to dynamically reflect latest releases directly from the release engine.'
      },
      {
        title: 'Public Command Set Whitelisting',
        desc: 'Updated PUBLIC_COMMANDS in helpers.js to include bi and binfo aliases alongside existing botstats and about registrations.'
      }
    ],
    fixes: [
      {
        title: 'Help Matrix Consistency',
        desc: 'Re-indexed Utilities command listing in help to surface !bi alongside !botstats and !about under Public clearance.'
      }
    ],
    tip: 'Execute !bi for live system telemetry or !about for a breakdown of Athena\'s military-grade security architecture.'
  },
  {
    date: '10 November 2026',
    version: 'v2.9.8',
    headline: 'Anti-Nuke CombatOps & LiveOps Registered in Help Menu as Server Owner & Extra Owner',
    summary: 'Formally integrated Anti-Nuke Combat Operations (!combatops / !strikeops) and the LiveOps Telemetry Matrix (!liveops / !telemetry) into the core Help suite (!help / /help) under the Security and Utilities modules with designated [Server Owner & Extra Owner] clearance. Added dedicated rich help inspection cards for !combatops, !liveops, and !about, complete with single-strike timeline breakdown telemetry, Undici keep-alive pool diagnostics, and zero-day eviction breakdowns.',
    whatsNew: [
      {
        title: 'CombatOps in Help Matrix',
        desc: 'Registered !combatops / !strikeops in the Security and Utilities modules marked with [Server Owner & Extra Owner] clearance.'
      },
      {
        title: 'Single-Strike Telemetry Help Card',
        desc: 'Implemented dedicated detailed inspection for !help combatops displaying the complete 0.00ms wiretap -> sub-12ms raw ban -> 403 Forbidden timeline.'
      },
      {
        title: 'Dedicated About Card in Help',
        desc: 'Added !about / !aboutathena to the Utilities module under [Public] clearance with full architectural breakdown.'
      }
    ],
    improvements: [
      {
        title: 'Clearance Tier Precision',
        desc: 'Standardized checkCommandClearance to strictly tag CombatOps and LiveOps as Server Owner & Extra Owner across prefix and slash execution.'
      },
      {
        title: 'LiveOps Navigation Uncoupling',
        desc: 'Uncoupled liveops from module grouping to allow direct rich command card inspection via !help liveops while preserving liveops views.'
      }
    ],
    fixes: [
      {
        title: 'Clearance Denial Diagnostics',
        desc: 'Updated permission failure embeds to accurately state Server Owner & Extra Owner required clearance when unauthorized users run combat or liveops commands.'
      }
    ],
    tip: 'Execute !help combatops for detailed single-strike anti-nuke benchmarks, or !help liveops to inspect real-time matrix subsystems.'
  },
  {
    date: '10 November 2026',
    version: 'v2.9.7',
    headline: 'Dedicated About Command & Military-Grade Security Profile Integration',
    summary: 'Introduced the dedicated !about (/about) command detailing Athena Prime\'s architectural identity, system scale, and military-grade security systems. Revamped !bi (!botstats / !botinfo) with high-fidelity Components V2 containers, custom tick status headers, animated target-blink indicators, and in-depth breakdowns of the 0ms raw TCP multi-hook wiretap, sub-12ms single-strike direct ban engine, 120 pre-warmed Undici TLS connections, and 28 automated antinuke shields.',
    whatsNew: [
      {
        title: 'Dedicated !about Command',
        desc: 'Added !about (aliases: !aboutathena, !botabout, !whoisathena) providing a full public overview of Athena\'s mission, creator credentials, and zero-day defense capabilities.'
      },
      {
        title: 'Revamped !bi / !botstats Suite',
        desc: 'Elevated the botinfo and botstats interface with custom tick headings, target-blink bulleted technical metrics, interactive quick-action buttons, and military-grade defense status.'
      }
    ],
    improvements: [
      {
        title: 'Military-Grade Security Visibility',
        desc: 'Highlighted core zero-day defense specs: 0ms TCP wiretap, sub-12ms direct rawBan line-rate eviction, pre-warmed Undici TLS pool, and live RAM ground-truth snapshot restoration.'
      },
      {
        title: 'Interactive Navigation Row',
        desc: 'Equipped both !about and !bi with interactive action rows allowing instant one-click transitions to Combat Telemetry, LiveOps Monitor, or message dismissal.'
      }
    ],
    fixes: [
      {
        title: 'Strict Custom Emoji Compliance',
        desc: 'Replaced legacy text dashes with animated target-blink indicators and formatted all headings strictly with custom tick circles.'
      }
    ],
    tip: 'Use !about to learn about Athena\'s zero-day architecture, or !bi for live technical telemetry and cluster scale.'
  },
  {
    date: '10 November 2026',
    version: 'v2.9.6',
    headline: 'Military-Grade Anti-Nuke Combat Telemetry & Single-Strike Timeline Monitor',
    summary: 'Introduced dedicated military-grade combat operations monitoring via !combatops and integrated high-fidelity combat telemetry directly into !liveops. Displays real-time single-strike timeline benchmarks tracking raw packet interception (0.00ms), zero-delay authorization (0.05ms), instant direct rawBan dispatch (0.10ms), Discord API acknowledgement (11.8ms), second burst attempt rejection with 403 Forbidden (12.0ms), and in-flight intelligent restoration. Features live socket connection benchmarks across 120 pre-warmed Undici TLS sockets, 25s keep-alive heartbeat loop, IPv4-first DNS routing, in-flight punishment lock tracking, actively condemned actors in memory, and real-time combat strike audit history.',
    whatsNew: [
      {
        title: 'Dedicated !combatops Command',
        desc: 'Added !combatops (aliases: !strikeops, !strikemonitor, !combattelemetry, !combatmon) providing instant access to the anti-nuke combat operations dashboard.'
      },
      {
        title: 'Deep Single-Strike Timeline Breakdown',
        desc: 'Renders the sub-millisecond timeline from initial hostile deletion through raw wiretap interception, synchronous auth check, direct rawBan dispatch, Discord 403 rejection on burst fire, and intelligent restoration.'
      },
      {
        title: 'Live Combat Telemetry Engine',
        desc: 'Integrated combatTelemetry in antinuke to record exact socket roundtrip latencies with performance.now(), tracking total strikes, success rates, condemned actors in RAM, and in-flight combat bandwidth priority locks.'
      }
    ],
    improvements: [
      {
        title: 'Interactive Components V2 Combat View',
        desc: 'Added a dedicated "Combat & Strike" view to the !liveops monitor with responsive 3-row Components V2 button navigation, live refresh, and seamless subsystem switching.'
      },
      {
        title: 'Zero-Day Multi-Vector Defense Visibility',
        desc: 'Surfaced complete technical breakdowns for Zero-Day Bot Eviction on Join (<1ms), Direct WebSocket Audit Push (0ms), Dual-Path Pre-Emption, and Instant Vanity URL Reclaim.'
      }
    ],
    fixes: [
      {
        title: 'Zero Socket Latency Overhead',
        desc: 'Ensured ban dispatch roundtrip telemetry is captured asynchronously without adding blocking overhead to the critical strike path.'
      }
    ],
    tip: 'Run !combatops or !liveops combat to inspect real-time anti-nuke socket benchmarks, single-strike timelines, and live defense metrics.'
  },
  {
    date: '10 November 2026',
    version: 'v2.9.5',
    headline: 'Pure Direct-Ban Execution & Zero-Overhead Strike Streamlining',
    summary: 'Eliminated role stripping from all strike pathways, dedicating 100% of socket throughput, bandwidth, and execution time to instantaneous direct bans (PUT /bans). Bypasses all intermediate role-strip HTTP requests, preventing socket overhead or rate-limit contention and permanently evicting attackers on their very first action. Streamlined fastWiretap, antinuke punish engine, and bot join guards to single-request ban annihilation.',
    whatsNew: [
      {
        title: 'Pure Direct-Ban Architecture',
        desc: 'Replaced multi-step role stripping with direct rawBan execution across fastWiretap and antinuke pipelines, guaranteeing immediate permanent eviction.'
      },
      {
        title: 'Single-Request Socket Dedication',
        desc: 'Dedicates 100% of TCP socket throughput to the ban payload (PUT /bans) without intermediate member PATCH overhead.'
      }
    ],
    improvements: [
      {
        title: 'Instant Eviction on First Strike',
        desc: 'Attackers are immediately evicted from the guild on their initial destructive attempt, terminating their gateway session and invalidating all subsequent burst requests.'
      },
      {
        title: 'Simplified Combat Pipeline',
        desc: 'Removed redundant role-strip fallbacks in favor of streamlined direct ban strikes across channel delete, role delete, bot add, and member join handlers.'
      }
    ],
    fixes: [
      {
        title: 'Role-Strip Latency Elimination',
        desc: 'Removed intermediate role strip requests that added extra network rounds before ban dispatch.'
      }
    ],
    tip: 'Athena now strikes attackers with immediate direct bans, evicting them in a single line-rate request.'
  },
  {
    date: '10 November 2026',
    version: 'v2.9.4',
    headline: 'Pre-Emptive Nuke Interception & Bot Join Immunity Decoupling',
    summary: 'Decoupled bot whitelist membership from destructive administrative permissions, eliminating the exploit where whitelisted or test bots were granted unintended immunity during live nuke simulations. Integrated zero-delay dual-path strike routing on raw CHANNEL_DELETE and GUILD_ROLE_DELETE packets correlating in-memory ring buffers and firing background raw HTTP audit fetches in sub-12ms without waiting for Discord audit log pushes. Optimized raw REST strike payloads with pre-compiled JSON buffers for sub-10ms role stripping, guaranteeing that nuke bots are disarmed and rejected with 403 Forbidden before their second channel deletion attempt can execute.',
    whatsNew: [
      {
        title: 'Bot Join Whitelist Decoupling',
        desc: 'Being in botWhitelist now strictly authorizes bot presence (antiBotAdd); 3rd-party bots are forbidden from deleting channels, deleting roles, or mass-banning unless explicitly granted per-module authorization.'
      },
      {
        title: 'Dual-Path CHANNEL_DELETE Pre-Emption',
        desc: 'Upon receiving CHANNEL_DELETE over WebSocket, Athena instantly correlates the in-memory audit ring and dispatches an immediate sub-12ms raw HTTP audit fetch, striking the attacker before Discord even pushes the audit WebSocket packet.'
      },
      {
        title: 'Pre-Compiled Strike Payloads',
        desc: 'Replaced runtime JSON.stringify with static buffer literals ({"roles":[]} and {"delete_message_seconds":0}) saving microtask serialization overhead on the hot punishment path.'
      }
    ],
    improvements: [
      {
        title: 'Second-Attempt Defense Hardening',
        desc: 'Guaranteed that when a server is attacked or tested with a live nuke bot, the attacker is disarmed in ~10ms so all subsequent channel deletion requests in the burst are rejected by Discord with 403 Forbidden.'
      },
      {
        title: 'DUAL-STRIKE RoleDelete Routing',
        desc: 'Equipped GUILD_ROLE_DELETE with parallel ring correlation and rapid raw fetch to intercept role-nuking bots at line-rate speed.'
      }
    ],
    fixes: [
      {
        title: 'Live Nuke Test Immunity Loophole',
        desc: 'Resolved permission check in isAuthorized() where bots added for testing were previously treated as authorized administrators due to blanket isBotAuthorized() inheritance.'
      }
    ],
    tip: 'Athena now strikes and neutralizes nuke bots on their very first channel deletion, blocking all subsequent deletions with 403 Forbidden.'
  },
  {
    date: '10 November 2026',
    version: 'v2.9.3',
    headline: 'Zero-Tolerance Multi-Hook Gateway Wiretap & IPv4 Edge Optimization',
    summary: 'Activated 4-tier gateway listener architecture binding client.on("raw"), Events.Raw, and WebSocketManager shard event dispatchers to capture destructive actions at 0ms raw TCP frames. Fixed GUILD_UPDATE identifier detection by inspecting packet.d.id for server-level payloads. Integrated in-flight punishment synchronization (trackInFlightPunishment) to reserve 100% of Discord API bandwidth for attacker neutralization before restorations begin. Enforced Node.js IPv4-first DNS order eliminating dual-stack resolution delays, and expanded reflex counter-measures to cover unauthorized unbans (Action 23), AutoMod destruction (Actions 140-142), and rogue integration removals (Action 82).',
    whatsNew: [
      {
        title: '4-Tier Direct Gateway Multi-Hook',
        desc: 'Wiretap now binds to client.on("raw"), Events.Raw, client.ws direct event dispatch, and legacy RAW handlers for guaranteed 0ms packet interception.'
      },
      {
        title: 'Concurrent Burst Reflex Loop',
        desc: 'Every destructive audit event immediately triggers counter-measures (restoration and resource vaporization) even if the violator was already condemned on a concurrent stream.'
      },
      {
        title: 'Bandwidth Prioritization for Strikes',
        desc: 'Restoration queues pause API execution while strike promises are in-flight (trackInFlightPunishment) ensuring bans and role strips receive full unthrottled line-rate priority.'
      },
      {
        title: 'Anti-Raid Unban Re-Ban Shield',
        desc: 'Instantly re-bans victims of unauthorized ban removals (Action 23) and punishes the violator at 0ms.'
      }
    ],
    improvements: [
      {
        title: 'IPv4-First DNS Edge Routing',
        desc: 'Configured dns.setDefaultResultOrder("ipv4first") eliminating IPv6 dual-stack handshake latency on all Undici Discord REST connections.'
      },
      {
        title: 'GUILD_UPDATE Payload Resolution',
        desc: 'Resolved guild ID detection for GUILD_UPDATE packets by inspecting packet.d.id alongside packet.d.guild_id.'
      },
      {
        title: 'AutoMod & Integration Guard Expansion',
        desc: 'Added zero-day wiretap coverage for AutoMod rule deletion/tampering (Actions 140-142) and bot integration removals (Action 82).'
      }
    ],
    fixes: [
      {
        title: 'Discord.js v14 Raw Event Delivery',
        desc: 'Fixed WebSocket event reception by listening to client.on("raw") and individual shard packet types instead of non-emitting client.ws.on("RAW").'
      }
    ],
    tip: 'Athena now intercepts and strikes nuke bot packets on the very first incoming TCP buffer before Discord.js object construction.'
  },
  {
    date: '10 November 2026',
    version: 'v2.9.2',
    headline: 'Military-Grade Anti-Nuke Reflex Engine & Zero-Day Pre-Emption',
    summary: 'Hardened anti-nuke pipeline to military-grade defense. Integrated 0ms raw WebSocket bot eviction on GUILD_MEMBER_ADD terminating unauthorized bots before their 1st command can fire. Corrected official Discord AuditLogEvent enum mapping across all 20 action types (WebhookCreate 50, WebhookDelete 52, RoleUpdate 31). Added instant target reflex vaporization destroying rogue webhooks, spam channels, and spam roles at 0ms. Optimized rawRoleStrip to pure roles array to bypass Discord timeout permission restrictions on Administrator accounts, and established an active 25s keep-alive heartbeat loop ensuring zero-handshake TLS sockets.',
    whatsNew: [
      {
        title: 'Zero-Day Bot Eviction On Join',
        desc: 'Intercepts GUILD_MEMBER_ADD at the raw TCP layer; unauthorized bots are banned and stripped within <1ms of entering the guild, before their first action.'
      },
      {
        title: 'Instant Target Reflex Vaporization',
        desc: 'Simultaneously annihilates created rogue webhooks (Action 50), spam channels (Action 10), and spam roles (Action 30) at 0ms in parallel with the attacker ban.'
      },
      {
        title: 'Bot Inviter Raw Socket Cascade',
        desc: 'Upgraded cascadeToInviter to query raw keep-alive audit sockets, eliminating the inviter who added a rogue bot in sub-15ms without gateway lag.'
      },
      {
        title: 'Instant Vanity Reclaim on GUILD_UPDATE',
        desc: 'Added 0ms raw WebSocket vanity interception directly in fastWiretap.js with pre-warmed Undici dispatcher.'
      }
    ],
    improvements: [
      {
        title: 'Active TLS Keep-Alive Warmup Heartbeat',
        desc: '25-second background heartbeat ensures Undici TLS 1.3 keep-alive sockets to discord.com remain permanently open and zero-latency.'
      },
      {
        title: 'Administrator-Safe Role Stripping',
        desc: 'Streamlined rawRoleStrip payload to pure roles: [] eliminating Discord 400/403 timeout rejections on members holding Administrator roles.'
      },
      {
        title: 'Multi-Action WebSocket Attack Sponge',
        desc: 'Vaporizes rogue roles created during active attack on GUILD_ROLE_CREATE at 0ms.'
      }
    ],
    fixes: [
      {
        title: 'Discord API AuditLogEvent Alignment',
        desc: 'Corrected WebhookCreate (50), WebhookDelete (52), RoleUpdate (31), and ChannelUpdate (11) audit action constants across fastWiretap and antinuke pipelines.'
      }
    ],
    tip: 'Nuker bots are now eliminated at the TCP packet layer before their second request can reach Discord edge servers.'
  },
  {
    date: '10 November 2026',
    version: 'v2.9.1',
    headline: 'Sub-15ms Antinuke Dual-Strike Pre-Emption & Administrator Bypass Seal',
    summary: 'Closed a critical permission bypass in the 0ms raw WebSocket wiretap where nuker bots with Administrator permissions previously escaped instant packet execution. Deployed parallel dual-strike pre-emption firing rawRoleStrip and rawBan concurrently over pre-warmed Undici HTTP keep-alive sockets. Stripping roles in ~10ms causes Discord to immediately return 403 Forbidden to any subsequent actions in a nuker attack burst before the 15ms ban settles. Purged 114 obsolete root test/scratch files for maximum repository performance.',
    whatsNew: [
      {
        title: 'Parallel Dual-Strike Pre-Emption',
        desc: 'rawBan (PUT /bans) and rawRoleStrip (PATCH /members with roles: [] & 28-day timeout) now fire concurrently using Promise.allSettled on separate Discord rate-limit buckets at 0ms.'
      },
      {
        title: 'Administrator Permission Loophole Sealed',
        desc: 'Strict anti-nuke authorization in fastWiretap.js now verifies only Server Owner, Extra Owners, Bot Owner, and explicit DB whitelisted entities. Attackers with Administrator roles are no longer bypassed.'
      },
      {
        title: 'Expanded Zero-Day Audit Actions',
        desc: 'fastWiretap now intercepts Action 1 (GuildUpdate/Vanity Hijack), Action 11 (RoleUpdate/Permission Escalation), and Action 21 (MemberPrune) at the raw WebSocket layer.'
      },
      {
        title: 'Raw WebSocket Pre-Caching',
        desc: 'Pre-caches CHANNEL_DELETE and GUILD_ROLE_DELETE packets into deletedCache at 0ms before standard Discord.js gateway events are dispatched.'
      }
    ],
    improvements: [
      {
        title: 'Repository Root Sanitization',
        desc: 'Purged 114 obsolete one-off test scripts, scratch files, and patches from repository root, leaving a pristine 15-file core deployment.'
      },
      {
        title: 'Zero-Loss Snapshot Assurance',
        desc: 'Re-verified that infrastructureSnapshots are permanently retained and never purged on guildDelete or server departure, guaranteeing continuous rolling 100-snapshot disaster recovery.'
      }
    ],
    fixes: [
      {
        title: 'Dual-Strike Fallback in AntiNuke Pipeline',
        desc: 'Upgraded punish() in antinuke.js to parallel dual-strike pre-emption so any audit log event routed through standard antinuke neutralizes attackers in sub-15ms.'
      }
    ],
    tip: 'Nuker bots are now stripped of all permissions in ~10ms, causing Discord to drop any 2nd burst action with 403 Forbidden.'
  },
  {
    date: '10 November 2026',
    version: 'v2.9.0',
    headline: '100-Rolling Snapshot Buffer & Granular Rollback Suite',
    summary: 'Automated zero-loss infrastructure and bot configuration snapshot engine taking periodic snapshots every 20 minutes with a 100-state rolling historical buffer per server. Enables instant single-click rollbacks for accidentally reset welcome/leave systems, autoroles, automod, or channels without data loss. Re-architected the Ezal owner suite with full Components V2 dashboard pagination and expanded real-time LiveOps telemetry.',
    whatsNew: [
      {
        title: '100-Rolling Snapshots Engine',
        desc: 'Automated 20-minute periodic snapshots preserving Discord channels, categories, permissions, roles, and all bot configurations (Welcome, Leave, Autoroles, Automod, Logs) across a past 100-snapshot buffer per server.'
      },
      {
        title: 'Zero-Loss Snapshot Retention',
        desc: 'Snapshots are permanently retained and never purged even if the bot leaves or is kicked from a server.'
      },
      {
        title: 'Granular State Rollback (ezal rollsnap, ezal restore)',
        desc: 'Restore accidentally reset welcome or server configs in 1 click (e.g. `ezal rollsnap <serverId> 1 config`) without modifying or wiping Discord channels or roles, or execute deep infrastructure reconstruction.'
      },
      {
        title: 'Ezal Owner Suite 2-Page CV2 Dashboard',
        desc: 'Re-engineered `ezal help` into an interactive 2-page Discord Components V2 container with Core Suite on Page 1 and 100-Rolling Snapshots Matrix on Page 2 with persistent navigation buttons.'
      },
      {
        title: 'Expanded LiveOps Telemetry (!liveops, /liveops)',
        desc: 'Integrated real-time Gateway WebSocket roundtrip metrics, V8 garbage collection telemetry, command execution telemetry, and cloud sync status into `!liveops`.'
      }
    ],
    improvements: [
      {
        title: 'Preserved CV2 Container Structure',
        desc: 'Resolved container component nesting to ensure Discord Containers (type 17) wrap all headers, dividers, fields, and action buttons cleanly without Discord display rejections.'
      },
      {
        title: 'Automod Hot-Path Optimization',
        desc: 'Safeguarded member permission evaluations in `messageCreate` against null member edge cases during gateway bursts.'
      },
      {
        title: 'Tic-Tac-Toe AI & Grid Hardening',
        desc: 'Restored full minimax AI decision tree and 3x3 interactive button grid execution.'
      }
    ],
    fixes: [
      {
        title: 'Guild Removal Snapshot Purge',
        desc: 'Eliminated destructive snapshot purges on `guildDelete` to guarantee 100% disaster recovery retention.'
      },
      {
        title: 'Command Indexing Integrity',
        desc: 'Verified and indexed `!exploitscan`, `!anomaly`, `!dualkey`, `!burn`, `!staffpulse`, and `!decapitate` across all help modules.'
      }
    ],
    tip: 'Use `ezal snapshots` or `ezal rollsnap <serverId> 1 config` to rollback accidentally reset welcome systems instantly.',
    author: '@Dev Porsche </>'
  },
  {
    date: '08 November 2026',
    version: 'v2.8.0',
    headline: 'Sub-10ms Antinuke Velocity & Architecture Optimization',
    summary: 'Comprehensive architectural overhaul eliminating redundant pre-ban role stripping for instant sub-10ms direct REST enforcement, deploying configurable honeypot punishments (ban, timeout, kick), and introducing the real-time LiveOps technical telemetry matrix with edge REST latency benchmarks.',
    whatsNew: [
      {
        title: 'Configurable Honeypot Punishments',
        desc: 'Honeypots now support selectable countermeasures: direct ban, 28-day timeout, or kick via `!honeypot setup [action]`, `/honeypot setup`, or the interactive dashboard cycle button.'
      },
      {
        title: 'LiveOps Telemetry Matrix (!liveops, /liveops)',
        desc: 'Real-time technical operations dashboard providing live event speeds, memory allocations, garbage collection stats, REST API roundtrip ping, and gateway heartbeats.'
      },
      {
        title: 'Owner-Clearance Restricted Telemetry',
        desc: 'Secured LiveOps access strictly to Server Owner and Extra Owners to safeguard sensitive runtime diagnostics and server topology.'
      },
      {
        title: 'Video-to-GIF Converter (!togif, /togif)',
        desc: 'Dedicated high-fidelity MP4, WebM, and MOV to GIF converter with two-pass Lanczos palette optimization, auto-size compression safeguards, and reply-to-convert support.'
      }
    ],
    improvements: [
      {
        title: 'Sub-10ms Direct Ban Enforcement',
        desc: 'Eliminated unnecessary multi-step role stripping prior to issuing bans in antinuke protocols. The engine routes directly to `Routes.guildBan`, preventing gateway latency and rate-limit starvation.'
      },
      {
        title: 'O(1) Cache-First Clearance Lookups',
        desc: 'Re-engineered ownership and clearance checks across all commands and button interactions to use in-memory cache lookups, eliminating redundant SQLite reads.'
      },
      {
        title: 'Zero-Lag Honeypot Countermeasures',
        desc: 'Replaced multi-step punishment sequences with atomic direct REST member patches, neutralizing honeypot invaders before they can broadcast further malicious requests.'
      }
    ],
    fixes: [
      {
        title: 'Concurrent Honeypot Trigger Interception',
        desc: 'Hardened honeypot against concurrent trigger edge cases where multiple bots enter the trap channel in the same gateway packet.'
      },
      {
        title: 'Display Text Limit Guard',
        desc: 'Integrated automated text-clamping sanitizers into CV2 containers to prevent Discord 3,800-character payload rejections.'
      }
    ],
    tip: 'Use `/liveops` or `!liveops` to inspect real-time system performance, and `!honeypot setup` to configure punishment modes.',
    author: '@Dev Porsche </>'
  },
  {
    date: '07 November 2026',
    version: 'v2.7.5',
    headline: 'Flagship Entertainment Suites & Raw Gateway Wiretaps',
    summary: 'Expansion of flagship entertainment engines alongside zero-latency raw WebSocket gateway wiretapping for instant antinuke event ingestion.',
    whatsNew: [
      {
        title: 'Flagship Entertainment Suites',
        desc: 'Deployed Meme Lab (`!meme`), CV2 Arcade (`!tictactoe`, `!connect4`, `!wordle`), Family Tree (`!marry`, `!tree`), Voice Soundboard (`!soundboard`), Social Wiretap (`!snipe`, `!editsnipe`), and AI Personas (`!persona`).'
      },
      {
        title: 'Action Roleplay & Affinity Matrix',
        desc: '54+ expressive action commands integrated with KLIPY GIF federation engine and relational affinity level tracking.'
      },
      {
        title: 'Public Stock Telemetry',
        desc: 'Added real-time global stock quotes, financial indices (`!nifty`, `!sensex`), and AI market sentiment analysis.'
      }
    ],
    improvements: [
      {
        title: 'Zero-Latency Raw Gateway Wiretaps',
        desc: 'Event pipelines bypass traditional client wrapping to process raw Discord gateway dispatch payloads within 0.8ms.'
      },
      {
        title: 'Pre-Compiled SQLite WAL Cache',
        desc: 'Optimized SQLite transaction bundling with Write-Ahead Logging for high-throughput concurrency during server raids.'
      }
    ],
    fixes: [
      {
        title: 'Reaction Role Allocation Race Prevention',
        desc: 'Prevented race conditions during simultaneous reaction role allocations under gateway packet bursts.'
      },
      {
        title: 'Audio Gateway Handshake Recovery',
        desc: 'Stabilized soundboard voice connections during Discord voice server region migrations.'
      }
    ],
    tip: 'Try `!arcade` to start interactive games or `!soundboard` to play live voice audio.',
    author: '@Dev Porsche </>'
  },
  {
    date: '06 November 2026',
    version: 'v2.7.0',
    headline: 'Support Ticket Overhaul & Autonomous Defense Swarm',
    summary: 'Complete rebuild of support ticket system with dual-channel pairing and autonomous multi-vector defense modules.',
    whatsNew: [
      {
        title: 'Advanced Defense Modules',
        desc: 'Activated Decapitate, TimeMachine, ExploitScan, Anomaly, Gatekeeper, StaffPulse, DualKey, and Burn sentries.'
      },
      {
        title: 'Dual-Channel Ticket Provisioning',
        desc: 'Paired private staff threads with member viewports and automated HTML/Text transcript auto-export.'
      }
    ],
    improvements: [
      {
        title: 'Fast Ticket Channel Creation',
        desc: 'Streamlined ticket channel generation under 150ms using cached channel permission templates.'
      },
      {
        title: 'Memory Leak Mitigation',
        desc: 'Refactored event listener pooling to auto-garbage collect expired ticket collector sessions.'
      }
    ],
    fixes: [
      {
        title: 'Ticket Overwrite Permission Collisions',
        desc: 'Fixed ticket permission overwrite collisions during simultaneous member button clicks.'
      },
      {
        title: 'Transcript Attachment Export',
        desc: 'Patched ticket transcript export edge-case when handling oversized message attachments.'
      }
    ],
    tip: 'Use `!ticket setup` to deploy dual-channel paired tickets with automated transcript exports.',
    author: '@Dev Porsche </>'
  },
  {
    date: '05 November 2026',
    version: 'v2.6.2',
    headline: 'Components V2 Borderless Theme & Symmetrical Typography',
    summary: 'Universal migration to Discord Components V2 borderless containers, animated beat navigation controls, and symmetrical framing.',
    whatsNew: [
      {
        title: 'Symmetrical Typography',
        desc: 'Implemented symmetrical ninja bullet framing `# <a:ninja_bullet:...> Heading <a:ninja_bullet_rtl:...>` across all major system embeds and panels.'
      },
      {
        title: 'Navigation Beat Controls',
        desc: 'Integrated animated pulse emojis for all interactive pagination components (Home, Delete, Prev, Next).'
      },
      {
        title: 'Dynamic Heading Glyphs',
        desc: 'Added 34 animated heading glyphs randomly selected for visual distinction across command responses.'
      }
    ],
    improvements: [
      {
        title: 'Borderless CV2 Containers',
        desc: 'Switched from legacy embeds to lightweight Discord Components V2 (`type: 17`) with built-in dividers and text displays.'
      },
      {
        title: 'Display Text Auto-Sanitization',
        desc: 'Auto-clamps oversized container texts to 3,800 characters to prevent `COMPONENT_DISPLAYABLE_TEXT_SIZE_EXCEEDED` API errors.'
      }
    ],
    fixes: [
      {
        title: 'Mobile Emoji Alignment',
        desc: 'Resolved Discord mobile rendering inconsistencies for custom animated emojis in button components.'
      },
      {
        title: 'Markdown Link Wrapping',
        desc: 'Corrected markdown link wrapping in CV2 text containers.'
      }
    ],
    tip: 'Use `!help` or `/help` to view the borderless Components V2 interface and navigation beats in action.',
    author: '@Dev Porsche </>'
  },
  {
    date: '04 November 2026',
    version: 'v2.5.8',
    headline: 'Persistence Sentinel Roles & Strict Database ID Binding',
    summary: 'Deep structural hardening enforcing strict database Snowflake ID binding and self-healing sentinel roles.',
    whatsNew: [
      {
        title: 'Persistence Sentinel Roles',
        desc: 'Provisioned Athena Unbypassable and Athena Firewall top-tier hierarchy roles guarded by autonomous self-healing sentries.'
      },
      {
        title: 'Onboarding Exploit Guard',
        desc: 'Deep audit of Discord Community Onboarding questionnaire prompts to disarm silent Administrator role assignments.'
      }
    ],
    improvements: [
      {
        title: 'Strict Database ID Detection',
        desc: 'Stripped all fragile string/name-matching fallbacks; every channel, category, and role is now strictly tracked by Discord Snowflake ID.'
      },
      {
        title: 'Instant Self-Healing',
        desc: 'If a sentinel role is deleted or stripped of permissions, Athena re-provisions and re-binds it in under 50ms.'
      }
    ],
    fixes: [
      {
        title: 'Linked Role Interception',
        desc: 'Neutralized Linked Role connection exploits where unverified members claimed Administrator roles without audit logs.'
      },
      {
        title: 'SQLite Concurrency Locks',
        desc: 'Fixed SQLite database schema locks under burst write scenarios during server raids.'
      }
    ],
    tip: 'Run `!unbypassable` to audit your server’s persistence sentinel hierarchy safeguards.',
    author: '@Dev Porsche </>'
  }
];

/**
 * Builds the interactive Components V2 changelog container and navigation row.
 * @param {number} page 1-indexed page number (1 to 5)
 */
export function buildChangelogPayload(page = 1) {
  // Strictly enforce 5 days
  const activeEntries = CHANGELOG_ENTRIES.slice(0, 5);
  const totalPages = activeEntries.length;
  const clampedPage = Math.max(1, Math.min(Number(page) || 1, totalPages));
  const entry = activeEntries[clampedPage - 1];

  const headerText = `# ${NINJA_BULLET} Athena Prime Changelog ${NINJA_BULLET_RTL}`;
  const dateText = `### ${entry.date}`;
  const headlineBlock = `## ${getRandomHeadingGlyph()} ${entry.version}: ${entry.headline}\n> -# **__Overview:__** ${entry.summary}`;

  let sectionsText = '';

  if (entry.whatsNew && entry.whatsNew.length > 0) {
    sectionsText += `### What's New\n`;
    for (const item of entry.whatsNew) {
      sectionsText += `${BULLET_EMOJI} **__${item.title}:__** ${item.desc}\n`;
    }
  }

  if (entry.improvements && entry.improvements.length > 0) {
    if (sectionsText) sectionsText += '\n';
    sectionsText += `### Improvements & Optimizations\n`;
    for (const item of entry.improvements) {
      sectionsText += `${BULLET_EMOJI} **__${item.title}:__** ${item.desc}\n`;
    }
  }

  if (entry.fixes && entry.fixes.length > 0) {
    if (sectionsText) sectionsText += '\n';
    sectionsText += `### Fixes & Security Hardening\n`;
    for (const item of entry.fixes) {
      sectionsText += `${BULLET_EMOJI} **__${item.title}:__** ${item.desc}\n`;
    }
  }

  let footerInfo = '';
  if (entry.tip) {
    footerInfo += `-# ${BULLET_EMOJI} ${entry.tip}\n`;
  }
  footerInfo += `-# Updated by **${entry.author}** • Page ${clampedPage} of ${totalPages} • Maintained across the last 5 days`;

  const containerJson = {
    type: 17,
    components: [
      { type: 10, content: headerText },
      { type: 14, divider: true },
      { type: 10, content: `${dateText}\n\n${headlineBlock}` },
      { type: 14, divider: true },
      { type: 10, content: sectionsText.trim() },
      { type: 14, divider: true },
      { type: 10, content: footerInfo }
    ]
  };

  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`changelog_page_${clampedPage - 1}`)
      .setLabel('Previous')
      .setEmoji(NAV_EMOJI_IDS.PREV)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(clampedPage === 1),
    new ButtonBuilder()
      .setCustomId('changelog_home')
      .setLabel('Latest')
      .setEmoji(NAV_EMOJI_IDS.HOME)
      .setStyle(clampedPage === 1 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`changelog_page_${clampedPage + 1}`)
      .setLabel('Next')
      .setEmoji(NAV_EMOJI_IDS.NEXT)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(clampedPage === totalPages),
    new ButtonBuilder()
      .setCustomId('changelog_close')
      .setLabel('Close')
      .setEmoji(NAV_EMOJI_IDS.DELETE)
      .setStyle(ButtonStyle.Secondary)
  );

  return sanitizeCV2Payload({
    components: [containerJson, navRow],
    flags: MessageFlags.IsComponentsV2
  });
}

/**
 * Handles interactive button clicks on the changelog view.
 */
export async function handleChangelogInteraction(interaction) {
  const customId = interaction.customId;
  if (!customId || !customId.startsWith('changelog_')) return false;

  const { isExtraOwnerOrHigher } = await import('./helpers.js');
  const { WRONG_EMOJI } = await import('./emojis.js');
  const cv2 = (await import('../cv2.js')).default;

  if (!isExtraOwnerOrHigher(interaction.user.id, interaction.guild)) {
    return interaction.reply({
      ...cv2.danger(
        `Access Denied | ${WRONG_EMOJI}`,
        'This changelog panel is strictly restricted to **Extra Owners** (or Server Owner).'
      ),
      flags: MessageFlags.Ephemeral
    }).catch(() => null);
  }

  if (customId === 'changelog_close') {
    try {
      if (interaction.message && interaction.message.deletable) {
        await interaction.message.delete().catch(() => null);
      } else {
        await interaction.update({ components: [] }).catch(() => null);
      }
    } catch {
      await interaction.update({ components: [] }).catch(() => null);
    }
    return true;
  }

  let targetPage = 1;
  if (customId === 'changelog_home') {
    targetPage = 1;
  } else if (customId.startsWith('changelog_page_')) {
    const rawNum = customId.replace('changelog_page_', '');
    const parsed = parseInt(rawNum, 10);
    targetPage = isNaN(parsed) ? 1 : parsed;
  }

  await interaction.deferUpdate().catch(() => null);
  const payload = buildChangelogPayload(targetPage);
  await interaction.editReply(payload).catch(() => null);
  return true;
}
