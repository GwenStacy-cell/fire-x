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
    date: '26 November 2026',
    version: 'v4.0.13',
    headline: 'Tiered JTC Boot-Time Auto-Reconciliation & Rapid 3s VC Status Restore',
    summary: 'Fixed legacy 4-tier MongoDB hydration overriding Squad [4] with Unlimited and skipping newly added Unlimited [Free] lobbies, accelerated post-boot JTC VC status sync to 3s (with 5-minute watchdog), and added permanent error logging.',
    whatsNew: [],
    improvements: [
      {
        title: 'Strict DB-ID & UserLimit Tiered Lobby Reconciliation (reconcileTieredJtcConfig)',
        desc: 'Detects and repairs stale 4-tier database/Mongo mappings where Squad [4] (userLimit 4) was bound under unlimited and binds missing generator lobbies inside the DB-tracked category without using channel name matching.'
      },
      {
        title: 'Faster 3-Second Startup Restore & 5-Minute Watchdog',
        desc: 'Reduced initial JTC lobby status restore delay from 20s to 3s on startup and tightened periodic JTC lobby VC status refresh to every 5 minutes.'
      }
    ],
    fixes: [
      {
        title: 'Resolved Squad [4] / Unlimited [Free] Status Mismatch After Mongo Hydration',
        desc: 'Prevents stale MongoDB channel_setups entries from mislabeling Squad [4] as Unlimited VC or leaving Unlimited [Free] without its animated status.'
      }
    ],
    tip: 'If Solo/Duo ever lose their status on an already-running instance, restart or run !jtctiers sync once to heal both Discord and MongoDB.',
    author: '@Dev Porsche </>'
  },
  {
    date: '26 November 2026',
    version: 'v4.0.12',
    headline: 'JTC Tier VC Status Persistence Fix & !va Off-Thread Telemetry Matrix',
    summary: 'Eliminated missing Solo/Duo/Tier Join-to-Create voice channel statuses across restarts and empty-room transitions, protected JTC/Stats VCs from AutoVCStatus sweeps, and redesigned !va with an Athena Telemetry Matrix CV2 layout and worker-offloaded 24h Canvas chart.',
    whatsNew: [
      {
        title: 'Redesigned !va Voice Telemetry Matrix & Off-Thread Canvas Chart',
        desc: 'Rebuilt !va (/voiceanalytics) with a clean obsidian Type 17 Components V2 container featuring dynamic heading glyphs, clickable channel/member links, share percentages, and an off-thread worker Canvas chart (voiceAnalyticsCanvas.js) displaying a 24h UTC curve, Peak badge, and Top Channels/Participants bars.'
      }
    ],
    improvements: [
      {
        title: 'Rate-Limit Resilient JTC Lobby Status Sync & !jtctiers sync Action',
        desc: 'Upgraded setVoiceChannelStatus with HTTP 429 retry/backoff and sequential pacing, added boot-time + 10-minute JTC status watchdog sync in ready.js, added debounced post-move/leave restoration in voiceStateUpdate.js, and exposed !jtctiers sync (/jtctiers action: sync) for instant repair.'
      }
    ],
    fixes: [
      {
        title: 'Solo/Duo Empty-VC Status Wipe & AutoVCStatus Override Protection',
        desc: 'Fixed Discord automatically wiping VC statuses on Solo [1] and Duo [2] after temp-room moves/empty transitions, and excluded JTC infrastructure and live Server Stats voice channels from !autovcstatus sweeps and clears.'
      }
    ],
    tip: 'Use !jtctiers sync anytime to force-repair Tier VC statuses, and run !va to inspect the new Voice Telemetry Matrix.',
    author: '@Dev Porsche </>'
  },
  {
    date: '26 November 2026',
    version: 'v4.0.11',
    headline: 'Military-Grade Anti-Nuke Hardening, Unbypassable 2FA & Dual-Key Fix',
    summary: 'Closed critical authorization, fallback, vanity, Dual-Key, and startup TLS pre-warm gaps for zero-bypass military-grade server security and sub-millisecond cold-start readiness.',
    whatsNew: [
      {
        title: 'Expanded 8-Socket Boot-Time Raw TLS Pre-Warming & Snapshot Persistence',
        desc: 'Doubled the Raw Kernel TLS TCP_NODELAY ban pool to 8 sockets and moved pre-warming to boot/ready so all sockets are active before Strike #1, alongside disk-backed cold-start infrastructure snapshot hydration and atomic temp-file database persistence.'
      }
    ],
    improvements: [
      {
        title: 'True Wiretap Strike Verification, Uncached Bot Cascade & Sticker Coverage',
        desc: 'Wiretap now verifies rawBan outcomes with automatic discord.js ban/kick hierarchy fallback, resolves swept/uncached attacking bots post-ban for inviter cascade, adds Guild Sticker interception, deduplicates trigger-limited whitelist consumption per event, and records real performance.now() strike metrics.'
      },
      {
        title: 'Scoped ModMode & Disarmed Bot Quarantine Isolation',
        desc: 'Restricted ModMode bypass strictly to authorized maintenance actors so attackers cannot nuke during maintenance, and disarmed dangerous permissions on editable managed integration roles if bots are quarantined.'
      }
    ],
    fixes: [
      {
        title: 'Unbypassable 2FA Disarm Gate, Vanity Owner Safety & Dual-Key Single-Use Grants',
        desc: 'Unified cryptographically random, brute-force-limited (5 attempts / 10m expiry) Gmail 2FA challenges across !antinuke disable, /antinuke disable_all, !security disable, and toggle_antinuke; prevented Wiretap vanity reclaim from reverting Server Owner edits; fixed Dual-Key infinite approval loops, covered slash/emergency buttons, and restricted Dual-Key disarmament to Server/Bot Owners.'
      }
    ],
    tip: 'Use !combatops or !ss to inspect real-time 8-socket Raw TLS pool telemetry and zero-bypass defense status.',
    author: '@Dev Porsche </>'
  },
  {
    date: '26 November 2026',
    version: 'v4.0.10',
    headline: 'Canvas Worker Thread Offloading, Presence Telemetry Trim & Async CloudSync',
    summary: 'Isolated heavy Canvas PNG/GIF rendering off the Wiretap gateway thread into a persistent worker_threads worker, filtered noisy PRESENCE_UPDATE/TYPING_START telemetry churn, and eliminated synchronous disk/zlib stalls in cloud backups.',
    whatsNew: [
      {
        title: 'Dedicated Canvas Rendering Worker Thread',
        desc: 'Added canvasWorkerHost.js and canvasWorkerTask.js so !ping telemetry graphs, quotes, security dashboards, global ban action cards, stock charts, classic rank cards, and command status banners render in a separate OS thread with seamless local fallback.'
      }
    ],
    improvements: [
      {
        title: 'High-Churn Presence Telemetry Filtering',
        desc: 'Skipped PRESENCE_UPDATE and TYPING_START packet logging in index.js and liveOpsMonitor.js while keeping GuildPresences live for ServerStats online counters.'
      },
      {
        title: 'Non-Blocking CloudSync Backup & Restore I/O',
        desc: 'Replaced synchronous fs.readFileSync/writeFileSync and zlib.gzipSync/gunzipSync calls in cloudSync.js with non-blocking async file and zlib promises.'
      }
    ],
    fixes: [
      {
        title: 'Event-Loop Anti-Stall Protection',
        desc: 'Prevented ~28-60ms Canvas image rendering pauses or periodic cloud backup compression from delaying incoming Wiretap security packets.'
      }
    ],
    tip: 'All Canvas PNG/GIF visuals keep identical styling while running off the Anti-Nuke security thread.',
    author: '@Dev Porsche </>'
  },
  {
    date: '26 November 2026',
    version: 'v4.0.9',
    headline: 'Raw Kernel TLS Ban Fast-Lane & Zero-Jitter Listener Pipeline',
    summary: 'Deployed a dedicated raw Node tls.TLSSocket TCP_NODELAY ban lane ahead of Undici, prioritized Wiretap to run as the #1 raw gateway listener via prependListener, and eliminated synchronous array-shift and git subprocess blocking on the event loop.',
    whatsNew: [],
    improvements: [
      {
        title: 'Raw Kernel TLS TCP_NODELAY Ban Fast-Lane',
        desc: 'Added src/utils/rawTlsBanLane.js with 4 pre-connected raw TLS keep-alive sockets (cached IPv4 DNS, TLS session resumption, pre-assembled ASCII HTTP/1.1 PUT /bans buffer writes, and instant RFC 204 return) ahead of the 128-socket Undici fallback pool.'
      },
      {
        title: 'Priority #1 Raw Gateway Hook & Non-Blocking Telemetry',
        desc: 'Upgraded fastWiretap.js to attach via client.prependListener(\'raw\') ahead of telemetry hooks, deferred liveOpsMonitor packet recording via queueMicrotask, replaced O(n) shift() loops with a sliding head index, and made git telemetry async via execFile.'
      },
      {
        title: '3x Faster Native C++ Database Serialization',
        desc: 'Updated database.js save() to run native C++ JSON.stringify first (falling back to the replacer callback only on BigInt/circular exceptions), cutting synchronous serialization pause by ~3x.'
      }
    ],
    fixes: [
      {
        title: 'Event-Loop Stutter Elimination',
        desc: 'Eliminated synchronous git subprocess calls (execSync) and per-packet telemetry array shifts ahead of Wiretap security packet processing.'
      }
    ],
    tip: 'Anti-Nuke strikes now route over raw pre-connected TLS TCP_NODELAY sockets first with zero listener ordering overhead.',
    author: '@Dev Porsche </>'
  },
  {
    date: '26 November 2026',
    version: 'v4.0.8',
    headline: 'Ultra-Low-Latency Anti-Nuke & 50-Burst Zero-Contention Hardening',
    summary: 'Squeezed out remaining pre-ban latency, closed Anti-Stab and Linked Role timing bypasses, upgraded Undici to HTTP/2 + Keep-Alive with direct HTTP 429 retry, and enforced strict Ban-First isolation across 50-action nuke bursts.',
    whatsNew: [],
    improvements: [
      {
        title: '6 Pre-Warmed Keep-Alive Sockets & Direct 429 Recovery',
        desc: 'Expanded pre-warmed Undici TLS pool headroom (6 active keep-alive sockets across 128 max connections), eliminated per-packet audit ring array allocations, and added direct socket HTTP 429 retry inside rawBan.'
      },
      {
        title: 'Strict Zero-Contention Ban-First Isolation',
        desc: 'Deferred non-critical REST polls, punish cleanup sweeps, role-member batch restores (chunks of 5), and main-thread DB JSON serialization while bans or raids are in flight.'
      }
    ],
    fixes: [
      {
        title: '0ms Wiretap Anti-Stab & Linked Role Fast-Fail',
        desc: 'Intercepted Administrator stripping on Athena Firewall / Unbypassable / integration roles at 0ms packet speed, fixed roleUpdate reorder AuditLogEvent ID (31 vs 11), guarded both sentinel roles Ban-First in guildMemberUpdate, and tightened Linked Role/audit wait windows.'
      },
      {
        title: 'Webhook Logs, Module Parity & Instant Member Hydration',
        desc: 'Stopped duplicate bot-join bans and webhook log suppression, aligned handleAuditLogEntry module falsiness checks, and triggered background member cache hydration right after enabling security.'
      }
    ],
    tip: 'Use !ss and !combatops to inspect 32/32 Anti-Nuke shield readiness and live single-shot strike speeds.',
    author: '@Dev Porsche </>'
  },
  {
    date: '25 November 2026',
    version: 'v4.0.7',
    headline: 'Minimalist Grey Subtext !ping Card (No Avatar Accessory)',
    summary: 'Converted !ping telemetry body lines and section headers to Discord grey subtext formatting (-# / > -#) and removed the bot avatar thumbnail for a sleek full-width card.',
    whatsNew: [],
    improvements: [
      {
        title: 'Uniform Grey & Grey-Bold Typography',
        desc: 'Formatted !ping sections and telemetry metrics with -# and > -# subtext markdown so labels and values render cleanly in grey and grey bold.'
      }
    ],
    fixes: [
      {
        title: 'Removed Avatar Thumbnail from !ping',
        desc: 'Replaced the Section thumbnail accessory in buildPingPayload with clean full-width text blocks.'
      }
    ],
    tip: 'Use !ping for a compact grey-themed latency card with the real-time telemetry chart.',
    author: '@Dev Porsche </>'
  },
  {
    date: '25 November 2026',
    version: 'v4.0.6',
    headline: 'Clean !ping Telemetry Typography Polish',
    summary: 'Removed the heading tick icon and inline monospace code pills from !ping / /ping for cleaner readability without copy-box wrapping.',
    whatsNew: [],
    improvements: [
      {
        title: 'Clean Bold Typography on !ping',
        desc: 'Formatted WebSocket, REST, TLS pool, strike latency, memory, and uptime metrics using crisp bold text instead of clickable backtick pills, preventing multi-line wrap beside the bot thumbnail.'
      }
    ],
    fixes: [
      {
        title: 'Removed Header Tick Icon on !ping',
        desc: 'Removed the tick badge inside the ninja-bullet !ping heading for a cleaner symmetric header.'
      }
    ],
    tip: 'Use !ping anytime to view live socket latency alongside the real-time telemetry graph.',
    author: '@Dev Porsche </>'
  },
  {
    date: '25 November 2026',
    version: 'v4.0.5',
    headline: 'Tactical !ping UI Redesign & Authentic Multi-Layer Telemetry Graph',
    summary: 'Redesigned !ping / /ping with a modern Components V2 tactical telemetry card, live warm-TLS & REST latency probes, real Anti-Nuke strike benchmarks, runtime memory/uptime readouts, and an upgraded obsidian telemetry matrix graph driven purely by real samples.',
    whatsNew: [
      {
        title: 'Redesigned !ping Tactical HUD & Live Matrix Graph',
        desc: 'Upgraded utility.js and graph.js into a unified buildPingPayload card displaying real Gateway WS ping, concurrent Discord REST & 128-socket Undici TLS RTT, combatTelemetry strike latency, process heap/RSS RAM, uptime, shard index, and a sleek 920x300 telemetry chart.'
      }
    ],
    improvements: [
      {
        title: 'Authentic Measurements & Unified Prefix/Slash Rendering',
        desc: 'Removed simulated Math.random() DB/Redis jitter and synthetic graph spikes, unified duplicate prefix and slash handlers into buildPingPayload, and wired server accent color + bot avatar section framing cleanly.'
      }
    ],
    fixes: [
      {
        title: 'Cold-Start Zero-Byte Graph & Emoji Compliance Guard',
        desc: 'Guarded attachment generation against empty fallback buffers and enforced Athena ninja-bullet headings, animated custom bullets, and nickname links.'
      }
    ],
    tip: 'Run !ping after startup or combat strikes to monitor real WebSocket, Undici TLS pool, and rawBan millisecond latencies.',
    author: '@Dev Porsche </>'
  },
  {
    date: '25 November 2026',
    version: 'v4.0.4',
    headline: 'Gateway Delete-Before-Audit Race Fix & Multi-Ban While-Loop Barrier',
    summary: 'Fixed the ChannelDelete/RoleDelete vs GUILD_AUDIT_LOG_ENTRY_CREATE ordering race in fastWiretap, upgraded waitForInFlightPunishments to drain dynamically queued multi-attacker bans cleanly before any repair or log fires, eliminated duplicate active-attack webhook REST fetches, and converted pool heartbeat prewarming to raw Undici requests.',
    whatsNew: [
      {
        title: 'Strict Sequential Ban-First → Parallel Repair + Logging Guarantee',
        desc: 'Upgraded waitForInFlightPunishments to loop while any ban for the guild remains active on the wire and gated notifyAndLog behind it so concurrent multi-bot bans settle 100% before parallel repairs and logs begin.'
      }
    ],
    improvements: [
      {
        title: 'Gateway Ordering Race Eliminated',
        desc: 'Scoped Wiretap self-restoration guards in fastWiretap.js so ChannelDelete/RoleDelete audit packets never skip 0ms rawBan strikes when channelDelete/roleDelete mark queued state 1ms earlier, and used isChannelRestoring for ChannelUpdate.'
      },
      {
        title: 'Socket Prewarm & Webhook REST Cleanup',
        desc: 'Converted prewarmPool to zero-allocation dispatcher.request, reused cached getBotAuthHeader in rawFetchAuditLogs, skipped redundant channel.fetchWebhooks in webhookUpdate.js during active attacks, and avoided double GuildUpdate vanity reclaims.'
      }
    ],
    fixes: [
      {
        title: 'Ban-First Barrier Re-Entrancy',
        desc: 'Fixed waitForInFlightPunishments snapshot edge case where a second ban starting mid-flight could let repairs start early.'
      }
    ],
    tip: 'Host near Discord US-East (iad) and keep Athena above all staff/bot roles so Discord rejects burst requests with 403 immediately after single-shot rawBan.',
    author: '@Dev Porsche </>'
  },
  {
    date: '25 November 2026',
    version: 'v4.0.3',
    headline: 'Interactive Panel Zero-Trust Lock, Audit Dedupe & Condemned Rollback Completion',
    summary: 'Locked all unauthenticated security UI buttons/modals (Extra Owner, Whitelist, AutoMod, 2FA), deduplicated Wiretap vs Discord.js audit dispatch with full condemned-attacker rollbacks, fixed Vanity module gating, and eliminated the 80ms blind sleep and REST contention across role, invite, join, and Anti-Stab paths.',
    whatsNew: [
      {
        title: 'Strict Zero-Trust Clearance Across Security Panels & Modals',
        desc: 'Enforced Server Owner / Bot Owner checks on sec_extra_owner, sec_2fa_gmail, modal_sec_extra_owner, and modal_2fa_setup/verify, gated all sec_*, am_*, bp_*, wlo_*, wl_*, and wlModal_limit_* controls to Extra Owners+, and removed stale Administrator fallbacks in security.js commands.'
      }
    ],
    improvements: [
      {
        title: 'Single-Flight Audit Entry Deduplication & Full Condemned Rollbacks',
        desc: 'Added entry.id deduplication across recordAuditEntry and handleAuditLogEntry via markAuditEntryHandled, prevented duplicate ChannelCreate/RoleCreate/WebhookCreate deletions, and ensured condemned attackers follow-up actions still ban rogue bots/recipients and revert channel/role/guild tampers.'
      },
      {
        title: 'Zero-Sleep Role Audit Race & Warm Undici Sockets Everywhere',
        desc: 'Replaced the 80ms blind sleep and discord.js fetchAuditLogs in guildMemberUpdate.js with an immediate waitForRingMatch vs sharedFetchAuditLogs race, moved cascadeToInviter strictly post-ban, switched Wiretap WEBHOOKS_UPDATE from fetch() to warm Undici dispatcher, and eliminated normal-invite REST polling during attacks.'
      }
    ],
    fixes: [
      {
        title: 'Independent Anti-Vanity Steal Gate & Anti-Stab Tracking',
        desc: 'Fixed GUILD_UPDATE vanity sniping requiring antiServerUpdate !== false when antiVanitySteal was enabled independently, and registered tracked Ban-First strikes cleanly in antiStrip.js and guildMemberAdd.js.'
      }
    ],
    tip: 'Only grant Extra Owner clearance to fully trusted co-owners via !extraowner; Athena enforces Zero-Trust even on interactive dashboards.',
    author: '@Dev Porsche </>'
  },
  {
    date: '25 November 2026',
    version: 'v4.0.2',
    headline: 'Button Admin Bypass Closure, Webhook Raid Elimination & Bot-Join Acceleration',
    summary: 'Closed remaining native Administrator bypasses on security interactive panels, upgraded unauthorized bot and webhook spam interceptors to execute Ban-First / Delete-First elimination, eliminated the 120ms bot-join audit sleep, and deferred quarantine overwrites on channel creation until in-flight bans settle.',
    whatsNew: [
      {
        title: 'Pre-Existing Webhook & Bot Raid Neutralization',
        desc: 'Upgraded messageCreate to permanently rawBan unauthorized bots spamming mass pings/invites/floods and rawDeleteWebhook compromised webhooks committing phishing, invite, flood, or @everyone raid bursts.'
      }
    ],
    improvements: [
      {
        title: 'Zero-Sleep Bot Inviter Resolution',
        desc: 'Replaced the 120ms blind sleep in resolveBotInviter with a live WebSocket ring race against coalesced sharedFetchAuditLogs and tracked join-time bot/inviter rawBans cleanly via trackInFlightPunishment.'
      },
      {
        title: 'Quarantine Overwrite Deferral',
        desc: 'Updated channelCreate to await waitForInFlightPunishments and skip REST quarantine role edits during active attacks so hostile bans keep 100% REST throughput.'
      }
    ],
    fixes: [
      {
        title: 'Security Interactive Button Hardening',
        desc: 'Removed native Discord Administrator bypasses from lockdown_lift, honeypot_*, exploitscan_*, tm_restore_*, and gk_* button controls in interactionCreate.js and fixed logToSecurityChannel imports.'
      }
    ],
    tip: 'Keep Athena Prime directly beneath the Server Owner role and wipe legacy unused webhooks periodically via !decapitate.',
    author: '@Dev Porsche </>'
  },
  {
    date: '25 November 2026',
    version: 'v4.0.1',
    headline: 'Sub-Millisecond Hot-Path Anti-Nuke & TLS Session Optimization',
    summary: 'Eliminated per-packet configuration loops via O(1) WeakSet memoization, upgraded pre-warmed Undici transport with 128-session TLS resumption, pre-cached auth/reason headers with non-blocking strike drains, and prioritized Anti-Stab bans ahead of role repairs.',
    whatsNew: [
      {
        title: 'O(1) Hot-Path Config Cache',
        desc: 'Added WeakSet normalization memoization to db.getGuildConfig so every Gateway packet avoids repeated 32-module schema scans while automatically invalidating on updateGuildConfig.'
      },
      {
        title: 'TLS Session Resumption & Pre-Cached Strike Headers',
        desc: 'Configured Undici Agent with maxCachedSessions: 128 for zero-RTT TLS reconnects alongside cached auth/audit-reason headers and non-blocking rawBan response drains.'
      }
    ],
    improvements: [
      {
        title: 'Owner-First MemberRoleUpdate Fast Path',
        desc: 'Moved Server Owner, Extra Owner, and Bot Owner checks above async guild.roles.fetch in fastWiretap to guarantee zero REST latency on authorized grants.'
      },
      {
        title: 'Active-Attack REST Conservation',
        desc: 'Skipped redundant sharedFetchAuditLogs calls in CHANNEL_DELETE and GUILD_ROLE_DELETE when isGuildUnderAttack is already active and deferred hot-path console logging via queueMicrotask.'
      }
    ],
    fixes: [
      {
        title: 'Ban-First Anti-Stab Ordering',
        desc: 'Updated roleUpdate and roleDelete persistence guards so attackers stripping Admin are neutralized first whenever Athena still retains guild Administrator permissions.'
      }
    ],
    tip: 'Keep Athena Prime directly beneath the Server Owner role and host near US-East for minimum round-trip ban latency.',
    author: '@Dev Porsche </>'
  },
  {
    date: '25 November 2026',
    version: 'v4.0.0',
    headline: 'Military-Grade Ban-First Engine, 32-Module Sync & Zero-Trust Security Hardening',
    summary: 'Eliminated parallel REST contention during nuke bursts so hostile bans settle strictly before repairs or logs leave the wire, synchronized all 32 Anti-Nuke modules, closed native Administrator escalation bypasses, and fixed critical AutoMod and wiretap defects.',
    whatsNew: [
      {
        title: 'Strict Ban-First Wiretap Pipeline',
        desc: 'Unified GUILD_AUDIT_LOG_ENTRY_CREATE packet interception into a single fastWiretap pipeline that awaits waitForInFlightPunishments before running repairs, cleanups, vanity reclaims, or logging.'
      },
      {
        title: 'Full 32-Module Synchronization',
        desc: 'Synchronized all 32 Anti-Nuke module keys (including antiVanitySteal, antiSoundboardCreate, antiSoundboardDelete, and antiInviteDelete) while preserving individual admin toggles.'
      }
    ],
    improvements: [
      {
        title: 'Coalesced Audit Fetch & Zero-Contention Restoration',
        desc: 'Shared in-flight audit fetches via sharedFetchAuditLogs across burst events, removed voluntary member-leave audit polling, gated server-log audit lookups behind active logging modules, and scoped restoration queues per guild.'
      },
      {
        title: 'Expanded Pre-Warmed Undici Connection Pool',
        desc: 'Updated socket keep-alive heartbeats, Vanity URL PATCH payloads ({ code }), and startup member-cache warming for zero-delay role whitelist and member-role recovery.'
      }
    ],
    fixes: [
      {
        title: 'Zero-Trust Administrator Bypass & False-Ban Prevention',
        desc: 'Removed native Administrator bypasses from privilege-escalation guards and 9 security command modules, stopped spoofing bot: true on uncached users, and fixed Bot Owner checks in condemn and whitelist lookups.'
      },
      {
        title: 'Packet Dedupe, AutoMod & Join Guard Repairs',
        desc: 'Fixed processedPacketKeys dropping repeat GUILD_UPDATE/WEBHOOKS_UPDATE events, repaired inviterMember crash in join guards, fixed AI Toxicity await/key mismatches, honored allowedLinks domains, and preserved blacklistWords across toggles.'
      }
    ],
    tip: 'Keep Athena Prime directly beneath the Server Owner role so single-shot rawBan strikes execute cleanly against compromised bots.',
    author: '@Dev Porsche </>'
  },
  {
    date: '25 November 2026',
    version: 'v3.9.9',
    headline: 'Help Directory & Command Inspection Synchronization',
    summary: 'Fully updated and synchronized the interactive help system (!help), single-command inspector, automod toggle handlers, and explainer registry to reflect the word filter renaming (!wordfilter / !wf) and the global bot command blacklist suite (!bl / !unbl / !bllist).',
    whatsNew: [
      {
        title: 'Bot Blacklist Suite in Security Help',
        desc: 'Added !bl / !botban, !unbl / !botunban, and !bllist under Security Commands in the interactive help menu (!help security).'
      },
      {
        title: 'Word Filter Help Directory Overhaul',
        desc: 'Updated the Automod Filters module (!help filters) to document !wordfilter / !wf add, remove, and list, retiring legacy !blacklist references.'
      }
    ],
    improvements: [
      {
        title: 'Single Command Inspector Mapping',
        desc: 'Added custom usage syntax, clearance definitions, and alias routing for !help wordfilter (!help wf) and !help bl across prefix and slash commands.'
      },
      {
        title: 'Explainer & Interactive UI Synchronization',
        desc: 'Updated automod quick-toggle button responses and explainer documentation to reference !wordfilter (!wf).'
      }
    ],
    fixes: [
      {
        title: 'Command Collision Resolution',
        desc: 'Completely eliminated legacy !blacklist usage confusion between server word filtering and global bot command blacklisting.'
      }
    ]
  },
  {
    date: '24 November 2026',
    version: 'v3.9.8',
    headline: 'Interactive Announcement Builder State Preservation & Media Link Fix',
    summary: 'Overhauled the interactive announcement builder (!announce) with an in-memory draft state architecture and REST API fallback, completely eliminating state erasure where previously entered title and description text was wiped upon adding or updating image links.',
    whatsNew: [
      {
        title: 'Persistent Announcement Draft Store',
        desc: 'Implemented an in-memory announcementDrafts state store keyed by message ID, ensuring title, description, and channel configurations remain 100% intact when media links are added.'
      },
      {
        title: 'Multi-Input Channel Assignment',
        desc: 'Enhanced target channel detection in the announcement builder to accept raw channel IDs, channel mentions (<#channel>), and plain text channel names.'
      }
    ],
    improvements: [
      {
        title: 'URL Sanitization & Auto-Cleaning',
        desc: 'Added automated bracket stripping (<https://...>) on pasted image and thumbnail URLs alongside deep Pinterest media resolution.'
      },
      {
        title: 'Components V2 Layout Partitioning',
        desc: 'Re-architected buildAnnouncementContainer to cleanly partition header thumbnails, media gallery banners, and body text without text truncation.'
      }
    ],
    fixes: [
      {
        title: 'Text Erasure on Media Upload',
        desc: 'Resolved a bug where submitting image or thumbnail URLs through the Edit Media modal erased existing title and description content.'
      },
      {
        title: 'Compliant Channel Markdown Links',
        desc: 'Replaced legacy <#channel> mentions with formatChannelLink markdown links across all announcement confirmation notices.'
      }
    ]
  },
  {
    date: '24 November 2026',
    version: 'v3.9.7',
    headline: 'Global Bot Blacklist Bot Owner Authority & Server Owner Override',
    summary: 'Empowered Bot Owners with global override clearance on the !bl suite, permitting Bot Owners to blacklist any user globally—including Server Owners and Extra Owners—from executing Athena bot commands while preserving local protections against unauthorized moderators.',
    whatsNew: [
      {
        title: 'Global Bot Owner Blacklist Override',
        desc: 'Bot Owners now possess absolute global clearance to blacklist any user, including Server Owners and Extra Owners, from using Athena bot commands.'
      }
    ],
    improvements: [
      {
        title: 'Tiered Hierarchy Safety Evaluation',
        desc: 'Maintained strict protection of Server Owners and Extra Owners against local moderators, while honoring supreme global authority for Bot Owners.'
      }
    ],
    fixes: [
      {
        title: 'Server Owner Blacklist False-Positive',
        desc: 'Resolved an issue where Bot Owners executing !bl on a Server Owner received a \'You cannot blacklist the Server Owner or Extra Owners\' rejection.'
      }
    ]
  },
  {
    date: '24 November 2026',
    version: 'v3.9.6',
    headline: 'Bot Activity Status Rotation Update',
    summary: 'Enriched the bot\'s custom activity status note rotation with a notification highlighting that the word filter command was renamed from !blacklist to !wordfilter / !wf, ensuring server owners and staff stay informed across rotating presence cycles.',
    whatsNew: [
      {
        title: 'Word Filter Renaming PSA in Status Rotation',
        desc: 'Added \'Word filter command renamed from !blacklist to !wordfilter / !wf\' directly to the rotating activity status note in ready.js.'
      }
    ],
    improvements: [
      {
        title: 'Command Discoverability',
        desc: 'Elevated awareness across all servers for the dedicated !wordfilter (!wf) suite and the newly decoupled bot blacklist (!bl) commands.'
      }
    ],
    fixes: [
      {
        title: 'Presence Version Sync',
        desc: 'Updated the rotating activity status banner to roll out under v3.9.6.'
      }
    ]
  },
  {
    date: '24 November 2026',
    version: 'v3.9.5',
    headline: 'Bot Command Blacklist Messaging Polish & Ezal Suite Integration',
    summary: 'Updated the bot command blacklist confirmation embeds to explicitly communicate user restriction (\'User Blacklisted from using bot cmds\' and \'User Unblacklisted from using bot cmds\'). Fully synchronized the Ezal module with the !bl suite, adding ezal bl, ezal unbl, ezal bllist, and all relevant routing aliases.',
    whatsNew: [
      {
        title: 'Explicit Restriction Messaging',
        desc: 'Refined confirmation embed descriptions to state \'User Blacklisted from using bot cmds\' and \'User Unblacklisted from using bot cmds\'.'
      },
      {
        title: 'Ezal Command Blacklist Suite',
        desc: 'Integrated ezal bl, ezal unbl, and ezal bllist directly into Ezal command routing and ehelp documentation.'
      }
    ],
    improvements: [
      {
        title: 'Comprehensive Routing Aliases',
        desc: 'Mapped aliases including unblacklist, userunblacklist, botunblacklist, bunban, bbanlist, and blacklistlist across dispatchers.'
      }
    ],
    fixes: [
      {
        title: 'Ezal Switch Deduplication',
        desc: 'Cleaned up duplicate case fallthroughs in ezal.js command routing.'
      }
    ]
  },
  {
    date: '24 November 2026',
    version: 'v3.9.4',
    headline: 'Sleek & Minimal Voice Control Panel UI Redesign',
    summary: 'Streamlined the Server Owner Voice Control Panel (!vcpanel) with a modern, compact interface. Removed the oversized server avatar accessory, eliminated redundant button control text lists, rendered all channel/member metadata in sleek grey subtext, and reorganized the 18 voice actions into four perfectly balanced control rows.',
    whatsNew: [
      {
        title: 'Minimalist Header & Avatar Removal',
        desc: 'Removed the top-right server avatar accessory, giving the control panel title full layout width without awkward multi-line text wrapping.'
      },
      {
        title: 'Unified Grey Subtext Typography',
        desc: 'Applied sleek grey font styling (-#) across server owner tags, channel links, connected member rosters, and operational dispatches.'
      },
      {
        title: 'Balanced 4-Row Button Architecture',
        desc: 'Reorganized 18 voice action buttons into four balanced rows (Mass Audio, Target User, Member Moderation, Channel Privacy), completely preventing row overflow on Discord mobile.'
      }
    ],
    improvements: [
      {
        title: 'De-Cluttered Interface',
        desc: 'Eliminated redundant monospace lists of button names, letting the interactive buttons directly drive the UI.'
      }
    ],
    fixes: [
      {
        title: 'Layout Stability',
        desc: 'Prevented awkward mobile button wrapping and truncated button labels.'
      }
    ]
  },
  {
    date: '24 November 2026',
    version: 'v3.9.3',
    headline: 'Bot Command Blacklisting & Unblacklisting Suite (!bl / !unbl) with Custom Embed Telemetry',
    summary: 'Introduced dedicated !bl and !unbl commands enabling Server Owners, Extra Owners, and Bot Owners to blacklist and unblacklist users from executing any bot commands. Deployed sleek embed cards matching exact specifications with nickname hyperlinks, moderator links, appeal status, and custom # thumbnail badges. Completely gates blacklisted accounts from all commands and interactions across servers.',
    whatsNew: [
      {
        title: 'Dedicated Bot Blacklist Command (!bl <@user> [reason])',
        desc: 'Quickly ban troublesome accounts from invoking any Athena commands. Renders an embed card detailing target user, moderator, duration (Permanent), appeal routing, and the official blacklist badge.'
      },
      {
        title: 'Dedicated Bot Unblacklist Command (!unbl <@user>)',
        desc: 'Instantly restore full command permissions with !unbl, outputting a confirmed "Status: Restrictions Lifted | User Unblacklisted" embed card.'
      },
      {
        title: 'Full Alias & Execution Matrix',
        desc: 'Supports intuitive aliases including !bl, !unbl, !botban, !botunban, !bban, !bunban, !bllist, alongside ezal routing.'
      },
      {
        title: 'Strict Access Controls & Safety Protections',
        desc: 'Enforced isExtraOwnerOrHigher clearance (Bot Owner, Server Owner, Extra Owners) with immutable protections preventing blacklisting of Bot Owners, Server Owners, Extra Owners, or Athena itself.'
      }
    ],
    improvements: [
      {
        title: 'Wordfilter Decoupling',
        desc: 'Renamed word filter management from !blacklist to !wordfilter (!wf), preventing command collisions with user blacklisting.'
      }
    ],
    fixes: [
      {
        title: 'Moderator Tracking & Cloud Persistence',
        desc: 'Updated addUserToBotBlacklist to record moderator IDs, persisting records across memory cache and cloud snapshots.'
      }
    ]
  },
  {
    date: '24 November 2026',
    version: 'v3.9.2',
    headline: 'Clean Channel Hyperlinks Without Hash (#) Prefixes Across All Modules',
    summary: 'Refactored formatChannelLink across the entire bot to format channel hyperlinks cleanly as [channel-name](https://discord.com/channels/guild/channel) without a leading # prefix. Ensured voice channel join/leave/switch activity logs, control panels, and security telemetry display seamless, natural channel hyperlinks.',
    whatsNew: [
      {
        title: 'Clean Channel Link Formatting (No # Prefix)',
        desc: 'Updated formatChannelLink to render channel text links purely as [Channel Name](url) without #, producing natural sentences such as "joined voice channel General VC" instead of "#General VC".'
      },
      {
        title: 'Voice State Activity Log Polish',
        desc: 'Refined voice join and leave event notifications in voice logs to display clean voice channel hyperlinks with zero hashtag clutter.'
      }
    ],
    improvements: [
      {
        title: 'Bot-Wide Notification Standardization',
        desc: 'Replaced manual [#channel] formatting in bot notification event listeners with centralized formatChannelLink.'
      }
    ],
    fixes: [
      {
        title: 'AGENTS Formatting Rule Update',
        desc: 'Updated repository rules to strictly enforce channel text links without # prefixes.'
      }
    ]
  },
  {
    date: '24 November 2026',
    version: 'v3.9.1',
    headline: 'Universal Nickname Hyperlinks & Emoji-Free Channel Links across Voice Control Panel & System Logs',
    summary: 'Standardized user and channel link formatting across the Server Owner Voice Control Panel (!vcpanel), interaction handlers, and real-time security telemetry. Eliminated all raw Discord @user mentions and <#channel> tags in favor of formatUserLink ([Nickname](https://discord.com/users/id)) and formatChannelLink ([#clean-name](https://discord.com/channels/guild/channel)), ensuring clean, uncorrupted hyperlinks with all decorative emojis and markdown symbols stripped from link titles. Enforced strict Extra Owner / Server Owner clearance on voice panel controls.',
    whatsNew: [
      {
        title: 'Voice Control Panel Nickname & Channel Links (!vcpanel)',
        desc: 'Replaced raw @owner, <#voiceChannel>, and raw @connectedMember tags with formatUserLink and formatChannelLink. Display names and voice channel titles are now seamlessly rendered as clean, clickable Markdown hyperlinks.'
      },
      {
        title: 'Dynamic VC Panel Member Live Updater Refactor',
        desc: 'Updated voiceStateUpdate real-time panel updater to re-render connected members using formatUserLink and auto-deregister listeners when panels are dismissed or deleted.'
      },
      {
        title: 'Voice Action Dropdown & Execution Responses',
        desc: 'Upgraded all VC panel mute, unmute, deafen, undeafen, kick, ban, and unban action responses to use formatUserLink for targeted member confirmations.'
      },
      {
        title: 'Unified Extra Owner Access Control',
        desc: 'Standardized permission validation on !vcpanel and its interaction handlers to isExtraOwnerOrHigher (Bot Owner, Server Owner, Extra Owners).'
      }
    ],
    improvements: [
      {
        title: 'Security Telemetry & Social Matrix Link Normalization',
        desc: 'Replaced legacy <@user> and <#channel> tags in honeypot alerts, automated anti-raid security logs, tactical audio briefings, marriage announcements, and family adoption cards with formatUserLink and formatChannelLink.'
      }
    ],
    fixes: [
      {
        title: 'Clean Channel Link Parsing',
        desc: 'Ensured cleanChannelName strips custom/native emojis and decorative glyphs so channels with icons like 🎧 General VC render valid markdown links without breaking Discord formatting.'
      }
    ]
  },
  {
    date: '24 November 2026',
    version: 'v3.9.0',
    headline: '52-Item Global Market Expansion, Action Mini-Games (!hunt, !fish, !mine), Instant Liquidation (!sell) & 62 Custom Animated Emojis',
    summary: 'Massively expanded Athena\'s commerce catalog to 52 items across 7 distinct departments (Mystery Crates & Vaults, Boosters & Potions, Adventure Gear, Gems & Ores, Prestige Flex Assets, Mythical Eggs, and Server Roles). Wired 62 custom animated Discord emojis across every item, action mini-game command (!hunt, !fish, !mine, !sell), and slot machine reel symbol. Introduced rich OwO-style action mini-games: !hunt (track forest wildlife for bounties), !fish (catch deep-sea leviathans and sunken treasure), and !mine (excavate coal, iron, gold, and rare gem deposits). Added !sell / !shop sell to liquidate goods for instant coin payouts, plus Phoenix Feather loss salvage, Golden Horseshoe extreme fortune, Loaded Dice, and Hourglass of Chronos cooldown resets.',
    whatsNew: [
      {
        title: 'Complete 62-Emoji Custom Animated Suite',
        desc: 'Every single shop item, action game header (!hunt, !fish, !mine, !sell), and slot symbol (Crown, Diamond, Bell, Grapes, Cherry) is now wired with rich custom animated Discord emojis.'
      },
      {
        title: '52-Item 7-Department Global Catalog (!shop)',
        desc: 'Spanning Mystery Crates & Relic Vaults, Boosters & Potions, Adventure & Gathering Gear, Gems & Ores, Prestige & Luxury Flex Pieces, Mythical Eggs, and Server Roles.'
      },
      {
        title: 'Wildlife Hunting Engine (!hunt / !h)',
        desc: 'Track and capture woodland game for coin bounties. Synergizes with Hunter\'s Longbow (+30%), Dragon Crossbow (+75% and Mythical Kirin / Griffin tier), Golden Net, and Enchanted Bait.'
      },
      {
        title: 'Deep-Sea Fishing Engine (!fish / !f)',
        desc: 'Reel in ocean catches and sunken pirate galleons. Synergizes with Sturdy Fishing Rod, Titan Deep-Sea Harpoon (+75%), and salvages rare gems from the abyss.'
      },
      {
        title: 'Subterranean Mining Engine (!mine / !dig / !m)',
        desc: 'Excavate underground shafts to uncover Coal, Refined Iron Ingots, Pure Gold Bullion, and cut gemstones (Rubies, Sapphires, Emeralds, Amethysts) with pickaxes and dynamite.'
      },
      {
        title: 'Instant Commerce Liquidation (!sell)',
        desc: 'Liquidate mined ores, captured catches, gems, and spare backpack goods for instant coin earnings at established market values.'
      },
      {
        title: 'Advanced Boosters & Loss Insurance',
        desc: 'Equip Phoenix Feathers (50% casino defeat loss refund), Golden Horseshoes (+20% extreme luck), Loaded Dice (+15% casino payout bonus), and Hourglass of Chronos (instant cooldown reset).'
      },
      {
        title: 'Bot Owner Coin Spawning & Ezal Suite Integration (!givecoins & ezal givecoins)',
        desc: 'Restricted coin spawning strictly to Bot Owners (isBotOwnerSync) across !givecoins, /givecoins, and the Ezal developer suite (ezal givecoins / addcoins / spawncoins / ecoadd). Documented in the help directory as [Bot Owner] and in the 2-page Ezal Owner Suite manual.'
      }
    ],
    improvements: [
      {
        title: 'Strict Discord ActionRow Button Limits',
        desc: 'Split shop department buttons across compliant 5-button rows with integrated Backpack and Claim Daily shortcuts.'
      },
      {
        title: 'Full Emoji Registry Preparation',
        desc: 'Centralized ITEM_EMOJIS registry configured across all 52 items ready for custom animated/static Discord emoji attachments.'
      }
    ],
    fixes: [
      {
        title: 'User & Channel Mention Compliance',
        desc: 'Replaced all raw <@userId> mentions across economy cards and transaction receipts with formatted nickname hyperlinks.'
      },
      {
        title: 'Discord Subtext Markdown Formatting (-#)',
        desc: 'Corrected spacing on all economy and action game cards from raw bullet hashes (- #) to standard Discord grey subtext (-#) across shop catalog, inventory, and mini-games.'
      },
      {
        title: 'Zero-Trust Clearance Strict Hierarchy Alignment',
        desc: 'Replaced all legacy native Discord permission tags ([Administrator], [Manage Server]) across help modules and commands with Athena\'s strict Extra Owner hierarchy, guaranteeing execution access only to Bot Owners, Server Owners, and Extra Owners.'
      }
    ]
  },
  {
    date: '24 November 2026',
    version: 'v3.8.9',
    headline: 'OwO-Style Global Commerce Matrix, Mystery Crates, Consumables & Casino Slots',
    summary: 'Transformed Athena\'s economy into a rich, OwO-style interactive gaming and commerce ecosystem. Introduced a multi-department Global Market (!shop) featuring Mystery Crates, timed Luck Boosters, Streak Shields, and Prestige Collectibles. Added full backpack inventory tracking (!inv), crate unboxing (!open), booster consumption (!use), and an iconic 3-reel casino slot machine (!slots) with jackpot multipliers. Integrated cross-game shop discovery tips across all economy and casino commands.',
    whatsNew: [
      {
        title: 'Multi-Department Global Shop (!shop)',
        desc: 'Interactive Components V2 department switcher covering Mystery Crates (Common, Rare, Mythic), Consumables & Boosters (Lucky Clover, Gambler\'s Charm, Dividend Elixir), Streak Shields, and Prestige Collectibles alongside custom server roles.'
      },
      {
        title: 'Backpack Inventory Matrix (!inv)',
        desc: 'Inspect owned crates, consumable boosters, active buff countdown timers with live Discord relative timestamps, and jewelry collectibles.'
      },
      {
        title: 'Crate Unboxing Engine (!open)',
        desc: 'Crack open mystery boxes from your inventory to reveal surprise coin jackpots and lucky bonus drops with instant wallet settlement.'
      },
      {
        title: '3-Reel Casino Slot Machine (!slots)',
        desc: 'Wager coins on classic 3-reel slots featuring 20x Jackpot Crowns, 12x Diamonds, Bells, Grapes, and 1.5x pair payouts.'
      },
      {
        title: 'Booster Buffs & Streak Shield Automation',
        desc: 'Equip timed buffs (+12% gambling luck, +25% casino payout bonus) and passive Streak Shields that automatically rescue missed daily streaks.'
      }
    ],
    improvements: [
      {
        title: 'Cross-Game Shop Discovery Tips',
        desc: 'Added clean footer instructions across !daily, !balance, !coinflip, !slots, !blackjack, !roulette, and !trivia guiding players to explore the shop.'
      },
      {
        title: 'Batch Purchasing Support',
        desc: 'Enabled !shop buy <item_id> [quantity] to allow purchasing up to 50 crates or items in a single atomic transaction.'
      }
    ],
    fixes: [
      {
        title: 'Empty Catalog Resolution',
        desc: 'Resolved the empty shop screen when no custom server roles are set by providing built-in global commerce items.'
      }
    ]
  },
  {
    date: '24 November 2026',
    version: 'v3.8.8',
    headline: 'Departure Intelligence & Leave Details Toggle for !leave (Joined, Created, Reason)',
    summary: 'Introduced a 1-Click Toggle Details control button to the !leave manager dashboard, enabling servers to display member join date, account creation age, and live departure reason (Left on will, Kicked, Banned) together at once in farewell embeds. Powered by an intelligent real-time departure auditor that correlates audit logs and ban registries to pinpoint exact departure origins.',
    whatsNew: [
      {
        title: 'Toggle Details Dashboard Button',
        desc: 'Added a dedicated 1-Click Toggle Details button to the !leave manager panel that activates or deactivates detailed departure metadata cards instantly.'
      },
      {
        title: 'Unified Departure Intelligence Block',
        desc: 'Displays Account Created, Account Joined, and Leave Reason together at once with live Discord relative timestamps and formatted reason status tags.'
      },
      {
        title: 'Dynamic Leave Reason Placeholders',
        desc: 'Added {reason}, {leavereason}, and {leave_reason} dynamic placeholder variables supported across Top Text, Titles, Descriptions, and Footers.'
      }
    ],
    improvements: [
      {
        title: 'Real-Time Audit Log & Ban Correlation',
        desc: 'Combines Athena in-memory audit ring buffer with REST audit logs and ban cache to reliably distinguish voluntary departures from kicks and bans with executor attribution.'
      },
      {
        title: 'Fail-Safe Snowflake Epoch Resolution',
        desc: 'Guarantees 100% reliable account age timestamp resolution using Discord snowflake bitwise math even when member cache is partial during guildMemberRemove.'
      }
    ],
    fixes: [
      {
        title: 'Leave Test Message Preview Fidelity',
        desc: 'Updated the interactive Test Message preview in !leave to accurately demonstrate departure details and placeholder interpolation before saving.'
      }
    ]
  },
  {
    date: '24 November 2026',
    version: 'v3.8.7',
    headline: 'Unbreakable Channel Markdown Links & Emoji-Free Channel Names',
    summary: 'Resolved a critical Discord markdown parser flaw where channel links with emojis (e.g. [#📁 . server-logs] and [#🎧 . General VC]) failed to parse, breaking into raw text and URLs. Introduced cleanChannelName to sanitize all channel link labels by stripping custom emojis, native pictographs, variation selectors, and decorative symbols while preserving pure letters, combining marks, numbers, and clean hyphens/spaces. Additionally eliminated emojis from automated server-logs channel and category deployment.',
    whatsNew: [
      {
        title: 'Unbreakable Channel Links via cleanChannelName',
        desc: 'Engineered a specialized channel name sanitizer in helpers.js that removes all emojis, variation selectors, zero-width spaces, and box-drawing symbols so channel links never fail or break into raw URLs in Discord markdown.'
      },
      {
        title: 'Emoji-Free Server Logs Deployment',
        desc: 'Updated automated server logs infrastructure deployment to name channels and categories using pure letters (e.g. server-logs and Logs) with auto-sanitization of legacy emoji-prefixed channels.'
      }
    ],
    improvements: [
      {
        title: 'Standardized Event Channel Linking',
        desc: 'Standardized voice status logs, channel creations, channel updates, and auto-mod message logs to consistently route through formatChannelLink.'
      }
    ],
    fixes: [
      {
        title: 'Fixed Failed Markdown Channel Links',
        desc: 'Eliminated markdown link splitting on Discord desktop, web, and mobile where voice leave logs and channel bound embeds displayed raw bracketed text and plain URL links.'
      }
    ]
  },
  {
    date: '24 November 2026',
    version: 'v3.8.6',
    headline: 'Mathematical Bold Sans-Serif Subtitles & Event-Driven Real-Time ServerStats Auto-Updating',
    summary: 'Completely overhauled Voice Channel Status ServerStats to deliver pixel-perfect mathematical sans-serif bold subtitles (e.g. 𝗢𝗻𝗹𝗶𝗻𝗲: 𝟭𝟴𝟱, 𝗠𝗲𝗺𝗯𝗲𝗿𝘀: 𝟯𝟯𝟬𝟲, 𝗩𝗖 𝗨𝘀𝗲𝗿𝘀: 𝟰, 𝗔𝗰𝘁𝗶𝘃𝗲 𝗩𝗖: 𝟯) identical to target reference designs without text clipping. Resolved the Online: 0 presence reporting defect by utilizing withPresences member hydration and live voice state union. Deployed debounced gateway event hooks across voiceStateUpdate, guildMemberAdd, guildMemberRemove, and presenceUpdate for instant, real-time counter auto-updating with Connect: false permission lockouts.',
    whatsNew: [
      {
        title: 'Mathematical Sans-Serif Bold Subtitles',
        desc: 'Implemented Unicode mathematical sans-serif bold conversion for numbers and text in Discord voice channel status subtitles, rendering crisp, bold typography natively in channel headers.'
      },
      {
        title: 'Event-Driven Real-Time Auto-Updating',
        desc: 'Hooked debounced (3s window) live updates into voice channel joins/leaves/moves, member joins, member leaves, and presence status shifts, keeping statistics live without delay while honoring Discord rate limits.'
      }
    ],
    improvements: [
      {
        title: 'Presence Hydration & Accurate Online Telemetry',
        desc: 'Hydrated member cache with withPresences: true and combined live voice channel participants with active status sessions to guarantee 100% accurate online count.'
      },
      {
        title: 'Locked Voice Channel Enforcement',
        desc: 'Enforced Connect: false permission overwrites for @everyone on both newly created and existing statistics channels, displaying the locked voice indicator.'
      }
    ],
    fixes: [
      {
        title: 'Eliminated Online: 0 Bug',
        desc: 'Fixed empty presence collection returns when reading server metrics, ensuring valid, live counts on both desktop and mobile clients.'
      },
      {
        title: 'Subtitle Spacing & Sidebar Layout',
        desc: 'Streamlined each channel subtitle to 2 primary metrics per line, preventing text truncation and overflow on Discord desktop and mobile sidebars.'
      }
    ]
  },
  {
    date: '24 November 2026',
    version: 'v3.8.5',
    headline: 'Help System & Architecture Explainer Documentation Refresh',
    summary: 'Synchronized the entire interactive Help Menu (!help) and Explainer Architecture Registry (!explain) with recent feature launches. Documented the Dual-Mode ServerStats engine (Voice Status Subtitles vs Classic Renamed Channels with animated bouncing hearts), the Unified Server Modification & Voice Status Logger (!serverlogs setup / bind), the 5-tier Join-to-Create Voice Hub with 19 animated glyphs and animated pacha arrow subtitles, and Bot Whitelist security immunity.',
    whatsNew: [
      {
        title: 'Help Menu Synchronization',
        desc: 'Updated the Tracking, Server Configuration, and Voice Utilities help categories with new commands, dual-mode architectures, and setup procedures.'
      },
      {
        title: 'Explainer Registry Expansion',
        desc: 'Added comprehensive architectural breakdowns for serverlogs, updated serverstats documentation for voice status subtitles, and enriched JTC voice suite pages.'
      }
    ],
    improvements: [
      {
        title: 'Clear Command Syntaxes',
        desc: 'Added explicit syntax variations for !serverlogs setup/bind/test and !serverstats setup status/classic across all documentation tiers.'
      }
    ],
    fixes: [
      {
        title: 'Documentation Alignment',
        desc: 'Eliminated obsolete single-mode server statistics descriptions and aligned tier permissions across all utility commands.'
      }
    ]
  },
  {
    date: '24 November 2026',
    version: 'v3.8.4',
    headline: 'Unified Server Modification Logging System with Auto-Creation & Channel Binding',
    summary: 'Engineered a comprehensive server modification audit logging matrix featuring both automatic deployment (!serverlogs setup / create) and flexible binding to any existing channel (!serverlogs bind <#channel>). Tracks and visualizes all live server mutations including channel creations, deletions, updates, voice channel status subtitle pulses (VOICE_CHANNEL_STATUS_UPDATE gateway intercept), role changes and permission diffs, server settings, emojis/stickers, webhooks, and invites with accurate audit log attribution.',
    whatsNew: [
      {
        title: 'Dual Deployment: Auto-Create & Bind',
        desc: 'Provides both one-click automated creation of private staff category ╭・Logs & channel 📁・server-logs, and custom binding to any existing channel.'
      },
      {
        title: 'Live Voice Channel Status Intercept',
        desc: 'Direct gateway packet capture of VOICE_CHANNEL_STATUS_UPDATE logging voice room activity status changes in real-time with deduplication.'
      },
      {
        title: 'Full Server Mutation Suite',
        desc: 'Logs channel/role/server modifications with before-and-after diffs, exact audit executor attribution via markdown nickname links, and reasons.'
      }
    ],
    improvements: [
      {
        title: 'Combat Rate-Limit Shield',
        desc: 'Suspends routine logging during active attacks to preserve 100% gateway API throughput for sub-10ms defensive bans.'
      },
      {
        title: 'Interactive Components V2 Card',
        desc: 'Added real-time dashboard (!serverlogs) with one-click creation, master toggle, test log verification, and channel unbinding.'
      }
    ],
    fixes: [
      {
        title: 'Shapeshift iconURL Validation',
        desc: 'Safeguarded footer iconURL parsing in server logger embeds against empty strings to eliminate Discord.js schema validation crashes.'
      }
    ]
  },
  {
    date: '24 November 2026',
    version: 'v3.8.3',
    headline: 'Dual-Mode ServerStats Architecture: Voice Status Subtitles & Classic Renamed Channels with Bouncing Heart Glyphs',
    summary: 'Introduced an optional dual-mode server statistics architecture featuring modern compact Voice Status Subtitles alongside classic Renamed Voice Channels under the ╭・Statistics category. Voice Status mode introduces 2 locked voice channels (Server Statistics and Voice Statistics) displaying rich animated metrics using <a:4964bouncingheart:1574534881776640010> (Online, Members, Bots, VC Users, Active VC, Server Boosts), bypassing Discord\'s 2/10m channel rename rate limits. Added seamless one-click mode toggling via interactive dashboard and commands, full automatic channel cleanup/migration, and background auto-sync integration.',
    whatsNew: [
      {
        title: 'Voice Status Subtitle Mode (2-Channel Compact)',
        desc: 'Deploys Server Statistics and Voice Statistics channels featuring rich telemetry metrics updated via live voice channel statuses without hitches or channel rename limits.'
      },
      {
        title: 'Bouncing Heart Metric Glyphs',
        desc: 'Integrated custom animated bouncing heart glyph (<a:4964bouncingheart:1574534881776640010>) as metric delimiter across all server and voice statistics status lines.'
      },
      {
        title: 'Instant Mode Switching & Auto-Migration',
        desc: 'Switch between Voice Status and Classic Renamed Modes instantly via interactive panel button or commands with zero leftover ghost channels.'
      }
    ],
    improvements: [
      {
        title: 'Rate-Limit Immune Updates',
        desc: 'Voice Status mode uses PUT /channels/:id/voice-status, completely avoiding Discord\'s 2 renames per 10 minutes restriction.'
      },
      {
        title: 'Background Sync Unification',
        desc: 'Refactored ready.js 6-minute background auto-update loop to delegate to unified updateServerStatsChannels handler across all active servers.'
      }
    ],
    fixes: [
      {
        title: 'Channel Migration Cleanup',
        desc: 'Switching modes immediately removes obsolete channels of the former mode and preserves category hierarchy.'
      }
    ]
  },
  {
    date: '24 November 2026',
    version: 'v3.8.2',
    headline: 'JTC Voice Channel Status Subtitles with Animated Pacha Arrow Glyph',
    summary: 'Configured automated Discord Voice Channel Status subtitles for all Join to Create generator lobbies and dynamic temporary rooms using the custom animated pacha arrow glyph (<a:pacha_arrow:1574537362610856010>). All generator lobbies (Solo, Duo, Trio, Squad, Unlimited, and Standard) now display official styled status badges ("Join 2 Create <Tier> VC") directly below their channel names in the guild channel sidebar. Synchronized the live production channels and updated status modal handlers.',
    whatsNew: [
      {
        title: 'Voice Channel Status Subtitles',
        desc: 'Automated Discord Voice Channel Status subtitles for generator lobbies displaying custom animated pacha arrow indicator.'
      },
      {
        title: 'Dynamic Temporary Room Status',
        desc: 'Spawned temporary voice rooms automatically receive initial styled room status with seamless support for owner overrides.'
      }
    ],
    improvements: [
      {
        title: 'REST Voice Status Utility',
        desc: 'Added safe setVoiceChannelStatus helper in jtc.js to dispatch voice status changes with rate limit protection.'
      },
      {
        title: 'Live Server Migration',
        desc: 'Configured animated arrow statuses on all 5 generator lobbies in live server without channel recreation.'
      }
    ],
    fixes: [
      {
        title: 'Modal Status Prefix Formatting',
        desc: 'Enhanced jtc_status modal to automatically format and preserve the animated arrow badge on custom user statuses.'
      }
    ]
  },
  {
    date: '24 November 2026',
    version: 'v3.8.1',
    headline: 'JTC Animated Visual Interface Leap: 19 Custom Action Glyphs for Select Menus & Quick Control Buttons',
    summary: 'Elevated Athena Prime\'s Voice Hub interface with a comprehensive custom animated emoji overhaul across all Join to Create controls. Integrated 19 numbered animated action glyphs across the Channel Settings & Configuration and Privacy & Access Permissions select menus, as well as the quick-action button strip (Lock/Unlock, Ghost/Visible, Claim Owner, and Room Info). Updated the live persistent #voice-controls interface deck in real-time.',
    whatsNew: [
      {
        title: '19 Custom Animated JTC Glyphs',
        desc: 'Equipped every option in both JTC dropdown menus with animated visual indicators from 01_adjust_bitrate through 19_transfer_ownership.'
      },
      {
        title: 'Animated Quick Action Buttons',
        desc: 'Added animated custom glyphs directly to the Lock/Unlock, Ghost/Visible, Claim Owner, and Room Info quick buttons.'
      }
    ],
    improvements: [
      {
        title: 'Numerical Menu Alignment',
        desc: 'Organized Channel Settings (01-11) and Privacy Permissions (12-19) into exact numerical sequence matching the action glyph badges.'
      },
      {
        title: 'Centralized Emoji Matrix',
        desc: 'Added JTC_EMOJIS registry in src/utils/emojis.js to keep all voice action components unified across control panels and ephemeral cards.'
      }
    ],
    fixes: [
      {
        title: 'Live Panel In-Place Refresh',
        desc: 'Successfully dispatched live component refresh to the persistent #voice-controls deck without resetting active voice rooms or configuration state.'
      }
    ]
  },
  {
    date: '24 November 2026',
    version: 'v3.8.0',
    headline: '5-Tier Dynamic Voice Hub Engine: Squad [4] & Unlimited [Free] Separation, Live Infrastructure Migration & Orphan Cleanup',
    summary: 'Upgraded Athena Prime\'s Tiered Join to Create (JTC) architecture from 4 tiers to 5 distinct generator lobbies. Separated tactical squad gaming from open community hangouts by assigning Squad [4] a strict 4-member limit and introducing a dedicated 5th generator channel: Unlimited [Free] (0 user limit). Cleaned up orphaned dummy categories left by previous deployment race conditions in active guilds, automatically reconfigured live servers to the new 5-tier schema, synced real-time state with MongoDB Atlas, and refreshed the persistent #voice-controls control deck with updated room tier selectors.',
    whatsNew: [
      {
        title: 'Dedicated 5-Tier Generator Suite',
        desc: 'Expanded Voice Hub architecture with 5 preset lobbies: Solo [1], Duo [2], Trio [3], Squad [4], and Unlimited [Free].'
      },
      {
        title: 'Squad User Limit Enforcement',
        desc: 'Fixed Squad rooms to strictly enforce userLimit: 4 for 4-player tactical team games (e.g. Fortnite, Warzone, Valorant, Apex).'
      },
      {
        title: 'New Unlimited [Free] Hub',
        desc: 'Added a 5th lobby spawning open voice rooms with userLimit: 0 for community chats and music hangouts.'
      }
    ],
    improvements: [
      {
        title: 'Live JTC Server Migration',
        desc: 'Automatically upgraded existing JTC servers in-place, creating the 5th unlimited channel, adjusting squad limits, and updating the #voice-controls interactive interface card.'
      },
      {
        title: 'Orphan Category & Channel Cleanup',
        desc: 'Purged orphaned dummy category and interface channels without disrupting active voice sessions.'
      }
    ],
    fixes: [
      {
        title: 'Tiered JTC Database Sync',
        desc: 'Updated getTierInfo and setTieredJtcConfig to index both squad (4 slots) and unlimited (unlimited slots) across SQLite and MongoDB Atlas.'
      },
      {
        title: 'MongoDB Atlas Sync Resilience',
        desc: 'Resolved burnEntries undefined reference in pushToMongo and added backups to EXCLUDED_CORE_KEYS to optimize cluster payloads.'
      }
    ]
  },
  {
    date: '23 November 2026',
    version: 'v3.7.9',
    headline: 'Server Owner Exclusive Bot Addition & 100% Full Anti-Nuke Immunity Engine for Whitelisted Bots',
    summary: 'Overhauled server bot addition and whitelist architecture across Athena Prime. Enforced strict Server Owner exclusive bot addition policy: only the Server Owner can add external bots into the server; any attempt by non-owner administrators or compromised staff to invite a bot results in immediate ban strikes against both the rogue bot and the unauthorized inviter. Transformed the Bot Whitelist (!botwhitelist add / !botwhitelist remove / !botunwhitelist) into a full Anti-Nuke immunity authorization system: whitelisted bots receive 100% full immunity to all Anti-Nuke modules (channel creation/deletion/update, role manipulation, kicks, bans, and webhooks). Unwhitelisting a bot atomically revokes its immunity, restoring active Anti-Nuke monitoring in sub-millisecond real-time.',
    whatsNew: [
      {
        title: 'Server Owner Exclusive Bot Addition Policy',
        desc: 'Only the Server Owner (and Bot Owner) can add bots into the server. All external bot additions by other staff members are automatically neutralized and banned alongside the inviter.'
      },
      {
        title: '100% Full Anti-Nuke Immunity for Whitelisted Bots',
        desc: 'Bots whitelisted via !botwhitelist add <botId> now receive complete immunity across all 28 Anti-Nuke modules without requiring redundant granular permissions.'
      },
      {
        title: 'Atomic Unwhitelisting Engine (!botwhitelist remove / !botunwhitelist)',
        desc: 'Added instant immunity revocation via !botwhitelist remove <botId> and dedicated !botunwhitelist <botId> command aliases.'
      }
    ],
    improvements: [
      {
        title: 'Zero-Latency Inviter Resolution (resolveBotInviter)',
        desc: 'Combined 0ms in-memory cache, audit log ring buffer, and raw Undici REST fetching with micro-retries to ensure bots invited by the Server Owner are recognized instantly with zero false bans.'
      },
      {
        title: 'Strict Owner Clearance Gating',
        desc: 'Bound botwhitelist commands strictly to the Server Owner (isBotOwnerOrServerOwnerStrict), preventing extra owners or administrators from tampering with bot immunity.'
      },
      {
        title: 'Enhanced Status & Help Telemetry',
        desc: 'Integrated !botwhitelist into the security help category (!help security), updated explainer manuals, and formatted all bot cards with clean nickname links and authorized badges.'
      }
    ],
    fixes: [
      {
        title: 'False Anti-Nuke Striking of Whitelisted Bots',
        desc: 'Eliminated false tampering strikes against whitelisted bots performing legitimate server management tasks.'
      },
      {
        title: 'Premature 0ms Pre-Emption Ban on Owner Invites',
        desc: 'Resolved race condition in fastWiretap.js and guildMemberAdd.js where newly invited owner bots were banned prior to audit log verification.'
      }
    ]
  },
  {
    date: '23 November 2026',
    version: 'v3.7.8',
    headline: 'Complete JTC Explainer & Help Documentation Suite: Dual-Mode Voice Grid, Persistent Control Deck & Anti-Nuke Harmonization Docs',
    summary: 'Comprehensive synchronization of Join to Create (JTC) architecture into Athena\'s technical explainer documentation engine (!explain), interactive guide hub (!athena), command manual catalog, slash command autocompletes, and public help menus (!help). Documents both standard minimalist lobby deployment (!jtcnormal) and the 4-tier preset voice hub (!jtcsetup tiers / !jtctiers) with persistent #voice-controls interface channels, sub-1ms Anti-Nuke bypass mechanics (isJtcInfrastructure), combat silence priority during hostile raids, and atomic teardown operations (!jtcdisable). Enforced system-wide markdown channel text links and user nickname links, with zero native Discord emojis across all voice documentation interfaces.',
    whatsNew: [
      {
        title: 'JTC Architecture Explainer Topic (!explain voice / !explain jtc)',
        desc: 'Deep-dive multi-page technical breakdown detailing Dual-Mode JTC infrastructure, Solo/Duo/Trio/Squad generator suites, persistent Components V2 control decks, and anti-nuke combat prioritization.'
      },
      {
        title: 'Dedicated Detailed Command Manuals',
        desc: 'Registered standalone manuals for !jtcnormal, !jtctiers, !jtcdisable, and expanded !jtc in DETAILED_COMMANDS with clearance levels, syntax, options, and operational flow.'
      },
      {
        title: 'Interactive Guide Hub JTC Deployment Panel (!athena)',
        desc: 'Added dynamic JTC hub configuration cards and 1-click deployment action buttons (athena_act_jtc_setup) presenting standard vs tiered options with real-time database state checks.'
      },
      {
        title: 'Slash Command Autocomplete Sync (/explain)',
        desc: 'Added instant discovery choices for voice, jtc, jtcnormal, jtctiers, and jtcdisable in the slash command autocomplete registry.'
      }
    ],
    improvements: [
      {
        title: 'Help Menu Voice Category Overhaul (!help voice)',
        desc: 'Reorganized VOICE & MEDIA command listings, updated obsolete JTC syntaxes, and added an architectural summary callout for Dynamic Join to Create.'
      },
      {
        title: 'Strict Markdown Link Formatting',
        desc: 'Replaced legacy <#channel> and <@user> mentions in counting, verification, and JTC guide cards with formatChannelLink and formatUserLink.'
      }
    ],
    fixes: [
      {
        title: 'Explainer Directory Indexing',
        desc: 'Updated buildTopicsDirectoryContainer to display dynamic JTC voice hub topics with live selection options.'
      }
    ]
  },
  {
    date: '23 November 2026',
    version: 'v3.7.7',
    headline: 'Security-Aligned JTC Architecture: Anti-Nuke Harmonization, Combat Silence, Infrastructure Bypass & Rate Limit Armor',
    summary: 'Full architectural optimization unifying Join to Create (JTC) with Athena\'s military-grade Anti-Nuke defense matrix. Eliminated all Anti-Nuke false alarms, redundant audit log queries, and server log spam caused by temporary voice channel lifecycle events. When JTC channels are created, modified, or deleted, channelCreate.js, channelUpdate.js, and channelDelete.js recognize them instantly as authorized ephemeral infrastructure, completely bypassing Anti-Nuke rollback triggers and deduplication locks. Enforced strict combat-awareness: JTC channel generation automatically suspends during active server attacks (isGuildUnderAttack) to reserve 100% of network sockets and REST rate limits for instant ban strikes against nuke bots. Added per-user 3-second rapid-join cooldown armor to prevent channel creation flood abuse, and embedded quarantine role denial directly into initial channel creation payloads with zero extra REST requests.',
    whatsNew: [
      {
        title: 'Anti-Nuke JTC Harmonization (Zero False Alarms)',
        desc: 'Added isJtcInfrastructure detection across channelCreate, channelDelete, and channelUpdate. Temporary room actions and admin renames bypass Anti-Nuke rollback triggers without reducing server defense.'
      },
      {
        title: 'Combat-Aware JTC Priority (Security First)',
        desc: 'JTC channel generation automatically yields during active server attacks (isGuildUnderAttack), dedicating 100% of REST throughput and network bandwidth to immediate ban strikes.'
      },
      {
        title: 'Anti-Flood Gateway Armor',
        desc: 'Enforced a 3-second per-user cooldown on JTC lobby joins, preventing malicious bots and spam-clickers from flooding Discord with channel creation requests.'
      },
      {
        title: 'Atomic Quarantine Role Security',
        desc: 'Quarantine role deny overwrites are embedded directly into the initial channel creation payload, guaranteeing quarantined users cannot access JTC rooms with zero extra API calls.'
      }
    ],
    improvements: [
      {
        title: 'Seamless Infrastructure Teardown Sync',
        desc: 'Teardown commands (!jtcdisable) register channel deletions with Anti-Nuke deduplication locks, preventing false nuke alerts when categories or suites are removed.'
      },
      {
        title: 'Restoration Queue Integrity',
        desc: 'Temporary JTC voice channels and linked chats are excluded from snapshot restorations, keeping the backup and repair queue pristine.'
      }
    ],
    fixes: [
      {
        title: 'Channel Permission & Name Tampering False Strikes',
        desc: 'Resolved false Anti-Nuke tampering detections when room owners lock, ghost, or rename their temporary voice rooms.'
      },
      {
        title: 'Server Log Spam Elimination',
        desc: 'Silenced routine channel create and delete log dispatches for ephemeral JTC channels, keeping the server logging channel clean and focused on real events.'
      }
    ]
  },
  {
    date: '23 November 2026',
    version: 'v3.7.6',
    headline: 'Tiered Join to Create (JTC) Voice Hub, Components V2 Control Center & Atomic Teardown Architecture',
    summary: 'Conducted an exhaustive audit and architectural leap of Athena\'s Join to Create (JTC) engine. Introduced an optional 4-Tier Voice Hub suite featuring generator lobbies for Solo [1 slot], Duo [2 slots], Trio [3 slots], and Squad [Unlimited slots] under a dedicated category, alongside a persistent Components V2 Interface Channel control center. Enforced strict database ID tracking allowing admins to rename categories and channels freely in Discord without breaking functionality. Implemented an atomic teardown engine (!jtcdisable tiers) that completely wipes the JTC category, interface channel, and generator channels in seconds. Wired previously dead select menu and modal interaction handlers in interactionCreate.js, added 1-click quick control buttons, and unified all user/channel links with zero native Discord emojis.',
    whatsNew: [
      {
        title: 'Dedicated Normal Single JTC Command (!jtcnormal)',
        desc: 'Added a dedicated command !jtcnormal (aliases: !normaljtc, !jtcsingle, !singlejtc, !jtcstandard) to instantly deploy a single standard Join to Create voice lobby and category.'
      },
      {
        title: 'Tiered Voice Hub Suite (Solo, Duo, Trio, Squad)',
        desc: 'Deploy a dedicated JTC category with preset generator channels for Solo (1 slot), Duo (2 slots), Trio (3 slots), and Squad (Unlimited) via !jtcsetup tiers or !jtctiers setup.'
      },
      {
        title: 'Persistent Interface Channel Control Center',
        desc: 'Dedicated #voice-controls text channel with a persistent Components V2 interactive panel featuring dropdown menus and 1-click buttons for room lock/unlock, ghost/unghost, claim, and info.'
      },
      {
        title: 'Atomic Teardown Engine (!jtcdisable tiers)',
        desc: 'Cleanly wipes the dedicated JTC category, interface channel, generator channels, and active temporary rooms from Discord and purges database records in one command.'
      },
      {
        title: '1-Click Quick Control Buttons',
        desc: 'Instant, 1-click button row on both per-room and persistent interface panels for instant lock toggle, visibility toggle, ownership claim, and room overview.'
      }
    ],
    improvements: [
      {
        title: 'Strict Database ID Tracking',
        desc: 'All JTC categories, interface channels, and generator channels are tracked purely by database ID, enabling admins to rename them freely in Discord without breaking bot logic.'
      },
      {
        title: 'Sub-1.5s Voice Text Initialization',
        desc: 'Streamlined temporary channel text dispatch with fast-path initialization and auto-recovery from instant user leaves.'
      },
      {
        title: 'Zero Discord Native Emojis & Markdown Links',
        desc: 'Enforced strict compliance with Athena UI matrix: custom animated ticks, crosses, warning badges, bullets, and rich markdown nickname/channel links across all JTC flows.'
      }
    ],
    fixes: [
      {
        title: 'Resolved ContainerBuilder Shapeshift Validation Error',
        desc: 'Eliminated invalid SectionBuilder accessory nesting in Components V2 container payloads that triggered Discord.js CombinedError: Received one or more errors during setup.'
      },
      {
        title: 'Wired Dead JTC Select Menus and Modals',
        desc: 'Connected jtc_ custom IDs to interactionCreate.js router, fixing a critical bug where dropdown selections and modal submissions were silently ignored.'
      },
      {
        title: 'Voice Logging & Chime Raw Mentions',
        desc: 'Eliminated raw user and channel mentions in voice state logs and entrance chimes in favor of clean formatted markdown links.'
      }
    ]
  },
  {
    date: '23 November 2026',
    version: 'v3.7.5',
    headline: 'Combat Execution Priority Architecture: Instant Ban First, Attacker Bounce Window & Post-Ban Repair',
    summary: 'Re-architected the Anti-Nuke pipeline to enforce strict chronological combat execution. On the very first destructive action, Athena commits 100% of network sockets and REST rate limits to ban the hostile immediately. Silenced all routine server logging, embed dispatches, and quarantine permission edits during active attacks. Introduced an 800ms combat settle window post-ban, allowing all remaining concurrent requests fired by the nuke bot to reach Discord and fail with HTTP 403 Forbidden. Server repair (restoring roles, categories, channels) and unified security incident logging now run strictly post-ban.',
    whatsNew: [
      {
        title: 'Instant Strike Priority (Ban First)',
        desc: 'On first hostile action, Athena dedicates 100% of network throughput and REST rate limits to fire rawBan immediately. All secondary operations (logging, overwrites, repairs) are suspended until the attacker is evicted.'
      },
      {
        title: 'Attacker Bounce Window (800ms Settle)',
        desc: 'Enforced an 800ms post-ban settle window before beginning server repair. This lets all remaining pipelined requests fired by the nuke bot hit Discord and automatically fail with HTTP 403 Forbidden.'
      },
      {
        title: 'Combat Silence on General Server Logs',
        desc: 'Silenced routine server log dispatches across channelDelete, channelCreate, roleDelete, roleCreate, and guildBanAdd during active attacks, preventing API rate limit starvation.'
      }
    ],
    improvements: [
      {
        title: 'Guaranteed 3-Tier Rebuild Post-Neutralization',
        desc: 'Restoration queue processing is held strictly until hostile ban strikes confirm over the wire and the bounce window passes, ensuring safe and unhindered damage repair.'
      }
    ],
    fixes: [
      {
        title: 'Rogue Channel Permission Overwrite Queue Starvation',
        desc: 'Permanently prevented permission overwrite edits on newly created spam channels during attacks, keeping the API queue clear for defensive actions.'
      }
    ]
  },
  {
    date: '23 November 2026',
    version: 'v3.7.4',
    headline: 'Anti-Nuke Vulnerability Remediation, Honeypot Role Activation & Zero-Contention Sockets',
    summary: 'Conducted a deep vulnerability audit of the Anti-Nuke pipeline and patched 5 critical weaknesses. Activated live honeypot role detection to instant-ban any account assigning or receiving the canary role at 0ms. Fixed a fatal ReferenceError in fastWiretap vanity URL snipe protection. Eliminated REST queue starvation during active attacks by bypassing permission overwrite edits on rogue channels and utilizing in-memory cache directly during rogue channel/role sweeps. Enforced direct bans on rogue webhook creators during in-flight attacks and enhanced audit-log fallback resolution.',
    whatsNew: [
      {
        title: 'Live Honeypot Role Canary Defense',
        desc: 'Activated immediate 0ms direct bans for any account receiving or assigning the configured honeypot role, closing a silent blind spot.'
      },
      {
        title: 'Zero-Contention In-Memory Sweeps',
        desc: 'Switched rogue channel and role mass-annihilation sweeps from heavy REST fetches to Discord.js in-memory cache, saving 200–500ms and eliminating API rate limit contention.'
      },
      {
        title: 'Rogue Webhook Creator Neutralization',
        desc: 'Added immediate raw bans for rogue webhook creators intercepted during active server attacks.'
      }
    ],
    improvements: [
      {
        title: 'Spam Channel Queue Starvation Bypass',
        desc: 'Bypassed quarantine permission overwrite edits on newly created channels when the server is actively under attack, preventing REST queue backlog.'
      },
      {
        title: 'Instant In-Memory Audit Resolution in Cascade',
        desc: 'Upgraded bot-inviter cascade to check the 0ms WebSocket audit ring before falling back to REST queries.'
      }
    ],
    fixes: [
      {
        title: 'FastWiretap Vanity Sniping Crash',
        desc: 'Fixed a ReferenceError: entry is not defined bug inside fastWiretap during GUILD_UPDATE packet processing.'
      },
      {
        title: 'Anti-MassBan & Anti-Purge Module Aliasing',
        desc: 'Corrected directStrike module mapping to properly honor antiMassBan and antiMemberPurge aliases.'
      }
    ]
  },
  {
    date: '23 November 2026',
    version: 'v3.7.3',
    headline: 'Military-Grade Anti-Nuke Speed Optimization & Instant Direct-Ban Pipeline',
    summary: 'Conducted a deep architectural overhaul of the Anti-Nuke defense pipeline. Eliminated all role-stripping and quarantine delays prior to bans across all security interceptors, enforcing an instant direct raw-ban policy. Completely converted all low-level Discord REST requests (rawBan, rawDeleteWebhook, rawChannelDelete, rawRoleDelete, rawUnban, rawFetchAuditLogs) from standard fetch to native Undici dispatcher.request, eliminating WHATWG object allocations and saving critical milliseconds. Intercepted rogue administrative invites and persistence role escalations with 0ms direct execution.',
    whatsNew: [
      {
        title: 'Instant Direct-Ban Policy',
        desc: 'Eliminated intermediate role removals, roles.set([]), and quarantine executions before hostile actions. Attackers are now banned instantly on the first network packet, reserving 100% of Discord REST rate limits strictly for permanent ban eviction.'
      },
      {
        title: 'Native Undici Socket Execution',
        desc: 'Replaced WHATWG fetch() with direct dispatcher.request() across all raw socket endpoints, saving 5–8ms in object allocation and garbage collection overhead.'
      },
      {
        title: 'Zero-Day Rogue Invite Intercept',
        desc: 'Added instant direct ban and audit condemn on any rogue creator attempting to deploy invites with administrative/dangerous permissions.'
      }
    ],
    improvements: [
      {
        title: 'Bot Persistence Role Defense',
        desc: 'Eliminated arbitrary 80ms sleep delays in unauthorized bot persistence checks, executing immediate parallel direct bans against rogue executors and recipients.'
      },
      {
        title: 'Rate Limit Quota Preservation',
        desc: 'Stripping role modification requests preserves full per-route REST buckets strictly for PUT /bans, preventing 429 rate limit errors during coordinated multi-account bot attacks.'
      }
    ],
    fixes: [
      {
        title: 'FastWiretap GuildUpdate Property Bug',
        desc: 'Fixed a ReferenceError: entry is not defined bug during raw GUILD_UPDATE packet handling by correctly binding to the gateway audit payload.'
      },
      {
        title: 'Universal Nickname Link Compliance',
        desc: 'Ensured all anti-nuke audit logs, rollbacks, and ban telemetry use formatUserLink without raw @ mentions.'
      },
      {
        title: 'Ephemeral Burn Room Cloud Count Erase',
        desc: 'Resolved an issue where self-destructed or expired burn rooms remained counted in database audit telemetry. Added automatic reconnection and pre-count collection purging in MongoDB synchronization, ensuring the active count instantly zeroes out upon expiration or manual destruction.'
      }
    ]
  },
  {
    date: '23 November 2026',
    version: 'v3.7.2',
    headline: 'Universal Nickname Profile Links & Channel Text Links Standard',
    summary: 'Enforced a system-wide formatting policy eliminating raw Discord @user and <#channel> mentions across all bot panels, security overviews, and embeds. Introduced standardized formatUserLink and formatChannelLink helpers ensuring users are consistently presented via clean markdown nickname profile links ([Nickname](https://discord.com/users/id)) and channels via clickable text jump links ([#channel](https://discord.com/channels/guild/channel)).',
    whatsNew: [
      {
        title: 'Markdown Nickname Profile Links',
        desc: 'Implemented formatUserLink to display all member and owner references as clean, clickable Discord profile links using sanitized nicknames without raw @ mentions.'
      },
      {
        title: 'Markdown Channel Text Links',
        desc: 'Implemented formatChannelLink to convert raw <#channelId> mentions into formatted text links directly jumping to the respective Discord channel URL.'
      }
    ],
    improvements: [
      {
        title: 'Security & Whitelist Suite Modernization',
        desc: 'Overhauled !wl overview, single clearance inspections, Extra Owners rosters, and quarantine notices to universally use nickname profile links.'
      },
      {
        title: 'Burn Protocol Upgrades',
        desc: 'Updated !burn ephemeral chamber deployment notifications, room rosters, and channel briefings with text channel links and creator profile links.'
      }
    ],
    fixes: [
      {
        title: 'Raw Mentions & Ghost Pings',
        desc: 'Eliminated raw @ mentions and unformatted <#channel> IDs across bot messages, protecting users from unwanted pings and unstyled text.'
      }
    ]
  },
  {
    date: '23 November 2026',
    version: 'v3.7.1',
    headline: 'Minimalist Whitelist UI Refinement & Telemetry De-clutter',
    summary: 'Refined the Antinuke Whitelist UI (!wl) to deliver a sleek, uncluttered presentation. Completely eliminated heavy progress bars, uptime emojis, and dense header framing in favor of a minimal, clean text layout with subtle animated glyph headings, direct entity mentions, and streamlined action buttons.',
    whatsNew: [
      {
        title: 'Minimalist Whitelist Overview',
        desc: 'Overhauled !wl overview panel with a clean animated glyph heading, security matrix subtitle, active user/role counts, and direct entity rosters without progress bars or uptime emojis.'
      },
      {
        title: 'Streamlined Clearance Editor',
        desc: 'Refined single-entity inspection (!wl @user / !wl @role) with clean category bypass listings and custom action limits.'
      }
    ],
    improvements: [
      {
        title: 'De-Cluttered Action Palette',
        desc: 'Organized interactive buttons into standard clean rows (Add/Manage/Remove User, Add/Manage/Remove Role, Close) without visual bloat.'
      },
      {
        title: 'Universal CV2 Text Sanitization',
        desc: 'Preserved sanitizeCV2Payload wrappers across all whitelist panels to prevent Discord 4,000-character component limit truncation.'
      }
    ],
    fixes: [
      {
        title: 'Progress Bar & Uptime Emoji Removal',
        desc: 'Completely removed progress bars and uptime indicators from the whitelist interface as requested.'
      }
    ]
  },
  {
    date: '23 November 2026',
    version: 'v3.7.0',
    headline: 'Whitelist Clearance Matrix Modernization & Tactile Components V2 Overhaul',
    summary: 'Redesigned the entire Antinuke Whitelist Management Suite (!wl, !whitelist, !wlist) with high-fidelity Components V2 architecture. Features symmetrical ninja bullet header framing, real-time 25-slot capacity telemetry progress bar, structured entity clearance cards with action limit badges, tactile dual-row member/role controls, custom animated navigation beats, and payload auto-sanitization.',
    whatsNew: [
      {
        title: 'Tactile Whitelist Clearance Matrix',
        desc: 'Overhauled !wl overview dashboard with military-grade styling, displaying real-time trusted entity capacity (out of 25 slots), permanent Server Owner master bypass, and Extra Owner rosters.'
      },
      {
        title: 'Structured Entity Clearance Cards',
        desc: 'Replaced bare text mentions with formatted cards showing assigned action limits (e.g. Unlimited or 10/hr) and active shield bypass summaries.'
      },
      {
        title: 'Dual-Row Action Center & Animated Navigation',
        desc: 'Organized controls into dedicated User and Role action rows, accompanied by custom animated Home (<a:01_home_beat:...>) and Close (<a:02_delete_beat:...>) navigation buttons.'
      }
    ],
    improvements: [
      {
        title: 'Single-Entity Clearance Editor Upgrade',
        desc: 'Modernized !wl @user and !wl @role with categorized shield rosters, clearance status badges (God Tier vs Granular), and quick-action bypass buttons.'
      },
      {
        title: 'Universal CV2 Text Sanitization',
        desc: 'Guarded all whitelist panels with sanitizeCV2Payload, ensuring zero risk of Discord 4,000-character component overflow errors.'
      }
    ],
    fixes: [
      {
        title: 'Plain Markdown Layout Modernization',
        desc: 'Replaced rudimentary plain text whitelist rosters with aesthetic Components V2 containers and live telemetry progress bars.'
      }
    ]
  },
  {
    date: '23 November 2026',
    version: 'v3.6.9',
    headline: 'Command Alias Resolution: Restored !p for Ping & Decommissioned Legacy Music Modules',
    summary: 'Resolved command alias collision where !p was hijacked by legacy music play commands. Removed the p alias from play and decommissioned non-functional music commands from the central loader and help matrix, ensuring !p cleanly and instantly triggers Athena\'s real-time latency and heartbeat graph (!ping / !p / !latency).',
    whatsNew: [
      {
        title: 'Instant !p Resolution for Ping',
        desc: 'Unbound the p alias collision in the command registry. Typing !p now immediately executes the ping telemetry diagnostic and Canvas latency visualizer without interference.'
      },
      {
        title: 'Legacy Music Decommission',
        desc: 'Decommissioned non-functional music player commands (!play, !setupmusic) from the command loader and interactive Help Menu.'
      }
    ],
    improvements: [
      {
        title: 'Cleaned Help Menu Footprint',
        desc: 'Removed obsolete music command entries from Community tools in the interactive help dashboard, further streamlining CV2 container size.'
      }
    ],
    fixes: [
      {
        title: 'Fixed !p Command Conflict',
        desc: 'Fixed !p attempting to queue music instead of returning gateway ping and database latency.'
      }
    ]
  },
  {
    date: '23 November 2026',
    version: 'v3.6.8',
    headline: 'Burn Room Lifecycle Real-Time Erase & Cloud Audit Synchronization',
    summary: 'Resolved an issue where ephemeral burn room counts persisted in the database audit after manual self-destruction or timer expiration. Added immediate MongoDB cloud deletion via deleteBurnRoomFromMongo upon room destruction, hardened getMongoDetailedAudit to strictly count active unexpired rooms (excluding metadata and stale records), and patched pushToMongo to automatically prune expired chambers and prevent ghost room retention.',
    whatsNew: [
      {
        title: 'Instant MongoDB Cloud Burn Room Obliteration',
        desc: 'Engineered deleteBurnRoomFromMongo, invoked synchronously by db.removeBurnRoom whenever a member clicks "Self-Destruct Now" or when the 10-minute burn timer expires, ensuring rooms are wiped from cloud storage with zero residual trace.'
      },
      {
        title: 'Strict Active Chamber Audit Filtering',
        desc: 'Updated getMongoDetailedAudit and !db status to filter MongoDB collection counts for unexpired chambers only (expiresAt > Date.now()), preventing meta-documents and stale logs from displaying artificial active room counts.'
      },
      {
        title: 'Automated Cloud Pruning in Push Pipeline',
        desc: 'Enhanced pushToMongo to delete any expired or orphaned burn room documents during synchronization, ensuring MongoDB cloud always mirrors active Discord channels.'
      }
    ],
    improvements: [
      {
        title: 'Ephemeral Channel Delete Interceptor',
        desc: 'Added automated burn room detection to the channelDelete gateway event handler, instantly cleaning up database records and preventing Antinuke from mistakenly restoring expired ephemeral chambers.'
      }
    ],
    fixes: [
      {
        title: 'Burn Room Count Not Erasing',
        desc: 'Fixed ghost active room counts appearing in database audits after burn rooms were deleted or expired, ensuring the room count accurately erases to 0.'
      }
    ]
  },
  {
    date: '23 November 2026',
    version: 'v3.6.7',
    headline: 'Help Menu Display Size Optimization & General Utilities Overflow Resolution',
    summary: 'Resolved an issue where the General Utilities module failed to render in the interactive Help Menu (!help) due to Discord\'s 4,000-character component display limit. Streamlined redundant command duplicates across General Utilities and Security modules, enforced strict cv2.sanitizeCV2Payload boundaries on all help containers, and ensured instant, reliable navigation across all 24 help modules.',
    whatsNew: [
      {
        title: 'Universal Help Container Text Sanitization',
        desc: 'Applied cv2.sanitizeCV2Payload directly within buildHelpContainer and handleHelpInteraction, ensuring every rendered help container is automatically guarded against exceeding Discord\'s 4,000-character ceiling.'
      },
      {
        title: 'General Utilities Module Streamlining',
        desc: 'Eliminated 19 duplicate command entries from General Utilities that already had dedicated home modules (Security, AI, Tickets, Tracking, Config, and Community), reducing character size from 4,059 to 2,535 characters for instant rendering.'
      },
      {
        title: 'Security Module Character Margin Hardening',
        desc: 'Streamlined cross-module overlaps in the Security module (moving moderation and config references to their primary modules), safely bringing its footprint down to 3,620 characters.'
      }
    ],
    improvements: [
      {
        title: 'Zero-Lag Interactive Help Navigation',
        desc: 'All 24 help modules now sit comfortably between 800 and 3,710 characters, eliminating API rejection errors (DiscordAPIError 50035) and ensuring responsive dropdown and button interactions.'
      }
    ],
    fixes: [
      {
        title: 'Fixed Unresponsive General Utilities Dropdown',
        desc: 'Fixed the bug where selecting "General Utilities" in !help would silently fail to update the menu message due to Discord rejecting payloads exceeding 4,000 characters.'
      }
    ]
  },
  {
    date: '23 November 2026',
    version: 'v3.6.6',
    headline: 'Automated Quarantine Timeout Fallback & Precision Moderation Diagnostics',
    summary: 'Resolved misleading role hierarchy error notifications on bot and administrator timeouts. Discord API fundamentally rejects native timeouts on bots and administrators with Missing Permissions (50013) regardless of role position. Athena now automatically engages Quarantine Isolation as an intelligent fallback for the requested duration, seamlessly lifts isolation via untimeout, provides surgical error diagnostics, and solidifies absolute Bot Owner moderation bypass clearance.',
    whatsNew: [
      {
        title: 'Intelligent Quarantine Timeout Fallback',
        desc: 'When attempting to timeout a bot account (like Sapphire) or an Administrator, Athena automatically engages Quarantine Isolation for the requested duration with automated role restoration upon expiry.'
      },
      {
        title: 'Dual-Engine Untimeout & Isolation Release',
        desc: 'Upgraded !untimeout and !unto to detect both native Discord timeouts and database quarantine records, cleanly restoring original member roles and lifting server isolation.'
      },
      {
        title: 'Surgical Error Diagnostics Matrix',
        desc: 'Replaced vague role hierarchy error messages with exact diagnostic breakdowns (identifying bot targets, administrator status, Server Owner immunity, missing bot permissions, and precise role position comparisons).'
      },
      {
        title: 'Absolute Bot Owner Moderation Bypass',
        desc: 'Synchronized canModerate clearance in helpers.js to ensure Bot Owners hold unconditional moderation power across all targets and extra owners without hierarchy friction.'
      }
    ],
    improvements: [
      {
        title: 'Purged Legacy Off Emojis in Moderation Commands',
        desc: 'Replaced all legacy <:off:...> emojis across moderation, say, purge, slowmode, and VC actions with rule-compliant custom animated crosses and tick circles.'
      },
      {
        title: 'Temptimeout Engine Standardization',
        desc: 'Aligned !temptimeout and /temptimeout through the unified handleTimeout pipeline to inherit automatic bot/admin isolation fallbacks and rich status feedback.'
      }
    ]
  },
  {
    date: '23 November 2026',
    version: 'v3.6.5',
    headline: 'Universal Components V2 UI Theming & Command Matrix Polish',
    summary: 'Executed a comprehensive UI upgrade across core commands and the CV2 container rendering engine. Introduced symmetrical ninja bullet framed headers, thematic category accent colors, and high-density telemetry data grids. Modernized userinfo, serverinfo, botstats, about, avatar, banner, and ping with pure Components V2 layouts while eliminating multi-container message spam.',
    whatsNew: [
      {
        title: 'Unified Server Intelligence Dashboard (!serverinfo / !si)',
        desc: 'Consolidated serverinfo and si into an ultra-clean, high-density single CV2 container featuring framed ninja bullet headings, asset metrics, member demographics, and full Athena defense matrix telemetry.'
      },
      {
        title: 'Member Intelligence Overhaul (!userinfo / !ui)',
        desc: 'Upgraded userinfo with high-density tabular telemetry, authority clearance tiers, account creation & join timelines, active infraction records, and formatted role pills.'
      },
      {
        title: 'Modern CV2 Media Galleries (!avatar / !banner)',
        desc: 'Migrated avatar and banner from legacy embeds to borderless Components V2 media galleries with direct asset links (PNG, WEBP, Global HD, Server HD).'
      },
      {
        title: 'Operational Intelligence Reports (!botstats / !about / !ping)',
        desc: 'Standardized botstats, about, and ping with symmetrical framed ninja bullet headers, custom target blink bullets, and structured latency/cluster telemetry.'
      }
    ],
    improvements: [
      {
        title: 'Heading Glyph Collision Neutralization',
        desc: 'Upgraded hasHeadingGlyphStart in emojis.js to detect custom emoji prefixes and ninja bullets, eliminating accidental double-glyph prefixes in sanitizeCV2Payload.'
      },
      {
        title: 'Thematic Category Accent Colors in cv2.js',
        desc: 'Integrated category-tailored accent colors (stealth obsidian, emerald green, amber warning, and crimson coral) across all cv2 builder helpers.'
      }
    ]
  },
  {
    date: '23 November 2026',
    version: 'v3.6.4',
    headline: 'Expressive User Action Mentions in CV2 Container & Extended Aliases',
    summary: 'Introduced natural-language action expressions and member mentions for the !gif command (!gif punches @user, !gif hugs @user, !gif dances with @user), rendering an accent borderless Components V2 container that highlights both initiator and target. Integrated automatic verb conjugation, Discord snowflake filtering for federated GIF search engines, and greatly expanded alias catalogs across !gif, !quarantine, and !unquarantine.',
    whatsNew: [
      {
        title: 'Action Expressions with User Mentions in CV2 Container',
        desc: 'Commands like !gif punches @user, !gif hugs @user, or !gif dances with @user now display formatted ninja bullet headings and sub-headers mentioning both users, persisting context seamlessly across carousel pagination.'
      },
      {
        title: 'Intelligent Verb Conjugation & Anime Action Bridge',
        desc: 'Engineered an action verb conjugation engine (punch ➔ punches, hug ➔ hugs, dance ➔ dances with) mapped to dedicated anime GIF providers (Purrbot, OtakuGifs, Nekos.best) with query sanitization to prevent raw mention noise.'
      },
      {
        title: 'Extended Quarantine & Unquarantine Aliases',
        desc: 'Added extensive command aliases for !quarantine (!detain, !contain, !detention, !quarzone, !quarantinezone, !jailuser, !isolateuser, !freezeuser, !quaruser) and !unquarantine (!liftquarantine, !removequarantine, !remquarantine, !unquarzone, !freeuser, !releaseuser, !unjailuser, !unfreezeuser, !pardonuser, !uncontain, !undetain).'
      },
      {
        title: 'Extended GIF Command Aliases',
        desc: 'Expanded !gif aliases to include !findgif, !searchgif, !gifs, !tenor, !klipy, !g, !gifsearch, !tenorgif, !klipygif, !giphy, !gifme, !reactiongif, !reactgif, !actiongif, and !anigif.'
      }
    ],
    improvements: [
      {
        title: 'Help Matrix Synchronization',
        desc: 'Updated help modules (Quarantine System, Roleplay & Affinity Matrix, General Utilities) and command deep-dive explainers in utility.js to reflect new action syntax and alias catalogs.'
      }
    ]
  },
  {
    date: '23 November 2026',
    version: 'v3.6.3',
    headline: 'Help System Upgrade for Statistics Suite & Command Deep Dives',
    summary: "Updated Athena's universal help matrix and command inspection engine (!help / /help) with comprehensive documentation for Stats Bot voice counters, Server Overview HUD, and 3-in-1 !stats routing. Added granular usage guides, full alias catalogs, and architecture explanations across both prefix and slash inspection handlers.",
    whatsNew: [
      {
        title: 'Stats Bot Voice Counters in Help Directory',
        desc: 'Updated Server Configuration and Tracking & Logs help modules to fully document !serverstats / !statsetup / !vcstats with all subcommands (setup, refresh, config, disable) and symbols.'
      },
      {
        title: 'Command Deep Dives for Stats & ServerStats',
        desc: 'Running !help serverstats or !help stats now returns a dedicated Components V2 inspection panel with command usage, aliases, clearance level, and detailed explanation.'
      },
      {
        title: 'Extended Command Alias Support',
        desc: 'Added !statsvc, !vccounters, and !channelstats aliases to serverstats.js, all fully indexed and navigable within the help explorer.'
      }
    ],
    improvements: [
      {
        title: 'Harmonized Prefix & Slash Help Handlers',
        desc: 'Synchronized executePrefix and executeSlash command explainers to ensure identical clearance verification, usage syntax, and feature descriptions.'
      }
    ]
  },
  {
    date: '23 November 2026',
    version: 'v3.6.2',
    headline: 'Stats Bot Style Statistics Suite & Interactive Reset/Refresh Engine',
    summary: 'Replicated the exact Stats Bot aesthetic for server statistics voice channels, introducing the ╭・Statistics category with locked voice counters for Members (🌐), Bots (🤖), and Boosters (🚀). Built an interactive Refresh / Reset button directly on the Components V2 dashboard for instant count synchronization alongside full rate-limit resilience.',
    whatsNew: [
      {
        title: 'Stats Bot Aesthetic ╭・Statistics Suite',
        desc: '!serverstats setup now creates the exact ╭・Statistics category and locked voice channels: 🌐 . Members: X, 🤖 . Bots: Y, and 🚀 . Server Booster: Z.'
      },
      {
        title: 'Interactive Refresh / Reset Button',
        desc: 'Added a primary Refresh / Reset button (<a:01_home_beat:1567037361810833428>) to immediately recalculate member and bot counts, syncing voice channel titles in real-time.'
      },
      {
        title: 'Disambiguated !stats & !serverstats Routing',
        desc: 'Unified subcommands across !stats and !serverstats, allowing setup, refresh, reset, sync, config, and disable to route seamlessly to the statistics channel engine.'
      }
    ],
    improvements: [
      {
        title: 'Discord Rate-Limit Graceful Degradation',
        desc: "Manual refreshes gracefully handle Discord's 2-updates-per-10-minutes channel rename rate limit, informing the user while scheduling background updates without throwing errors."
      },
      {
        title: 'Background 6-Minute Auto-Sync Upgrade',
        desc: 'Updated ready.js periodic interval to keep the booster counter (🚀 . Server Booster: Z) continuously synchronized along with member and bot counts.'
      }
    ]
  },
  {
    date: '22 November 2026',
    version: 'v3.6.1',
    headline: 'De-conflicted !serverstats Setup Engine & Command Disambiguation',
    summary: 'Resolved command collision between serveroverview and serverstats where running !serverstats setup inadvertently triggered the Graphical Server Overview dashboard. De-registered colliding aliases, restored direct routing for !serverstats setup/config/disable to voice channel management, and added an interactive status HUD for unparameterized !serverstats calls.',
    whatsNew: [
      {
        title: 'Voice Stats Channel Setup Restoration',
        desc: '!serverstats setup, !serverstats config, and !serverstats disable now execute member count voice channel creation and configuration with zero interference.'
      },
      {
        title: 'Interactive Voice Channel Status HUD',
        desc: 'Running !serverstats without arguments now displays an informative Components V2 status panel showing channel links, auto-update health, and direct action shortcuts.'
      },
      {
        title: 'Command Alias Disambiguation',
        desc: 'Cleaned serveroverview aliases in loader and utility help directory, clearly separating !serveroverview / !so (graphical dashboard) from !serverstats (voice counters).'
      }
    ],
    improvements: [
      {
        title: 'Clean Components V2 Voice Stats Dashboard',
        desc: 'Enhanced serverstats prefix handler with one-click button navigation to both voice setup and the graphical server overview dashboard.'
      }
    ]
  },
  {
    date: '22 November 2026',
    version: 'v3.6.0',
    headline: 'Unified Server & Member Statistics Hub with Components V2 Architecture',
    summary: 'Resolved !stats command failures by architecting a unified statistics hub that intelligently routes to the high-fidelity Server Overview Dashboard when invoked without arguments, while seamlessly generating personal insight cards for user mentions, IDs, and !stats me. Hardened stat canvas image generation against null guild icons and empty channel records, and wrapped user stat cards in borderless Components V2 media containers.',
    whatsNew: [
      {
        title: 'Unified !stats Routing Hub',
        desc: 'Running !stats now instantly renders the 8-panel Server Stats Overview HUD (Messages, Voice, Active Users, Top Contributors, Reactions, and Links) with full interactive tab navigation and timeframe controls.'
      },
      {
        title: 'Dual User & Server Context Support',
        desc: '!stats me, !stats @user, and aliases (!me, !mystats, !statsme) now generate high-resolution personal telemetry cards enclosed within a modern Components V2 container with media gallery embedding.'
      },
      {
        title: 'Voice Count Channel Forwarding',
        desc: '!stats vc, !stats setup, and !stats config automatically delegate to member count voice channel management for seamless administrative workflow.'
      }
    ],
    improvements: [
      {
        title: 'Resilient Canvas Telemetry Rendering',
        desc: 'Added safe functional chaining for guild.iconURL and array checks for top message/voice channels in generateStatCard, preventing canvas render crashes on new or un-iconed guilds.'
      },
      {
        title: 'Components V2 In-Place Message Updates',
        desc: 'Upgraded serveroverview.js and stats.js to edit thinking messages in-place without deleting and re-sending, eliminating chat flicker and race conditions.'
      }
    ]
  },
  {
    date: '22 November 2026',
    version: 'v3.5.9',
    headline: 'Multi-Role Deletion Engine, Bot Owner Hierarchy Bypass & Resilient TTS VC Lifecycle',
    summary: 'Upgraded !deleterole to support batch deletion of multiple roles via mentions, IDs, and names, with complete hierarchy bypass for the Bot Owner. Resolved post-recording TTS audio degradation by restoring voice connection tracking, auto-reconnecting Home VC sessions after recording stops, and ensuring non-blocking audio capture buffers.',
    whatsNew: [
      {
        title: 'Multi-Role Deletion Engine',
        desc: 'Upgraded deleterole (!dr, !delrole, !roledelete, !role delete) to accept multiple roles in a single command via role mentions, Snowflakes/IDs, and names, reporting per-role execution results.'
      },
      {
        title: 'Bot Owner Hierarchy Exemption',
        desc: 'Enabled full hierarchy bypass for the Bot Owner, Server Owner, and Extra Owners during role deletion, allowing deletion of roles regardless of the caller\'s member role position in the server.'
      },
      {
        title: 'TTS Voice Connection Recovery',
        desc: 'Hardened queueTtsMessage and playNext in tts.js to detect destroyed or disconnected voice sockets, auto-reconnect seamlessly, and prevent idle destruction on active Home VCs.'
      },
      {
        title: 'Post-Recording Voice Restoration',
        desc: 'audioRecorder.js now purges stale TTS connection caches on recording start/stop and automatically restores persistent Home VC connections if configured on the server.'
      }
    ],
    improvements: [
      {
        title: 'Non-Blocking PCM Silence Padding',
        desc: 'Optimized zero-byte silence padding in audio capture to write up to 512KB chunks, preventing event loop lag during recording synchronization.'
      },
      {
        title: 'Pure Custom Emoji Enforcement',
        desc: 'Replaced legacy off indicators in record commands and interactive buttons with Athena custom tick and cross emojis.'
      }
    ]
  },
  {
    date: '22 November 2026',
    version: 'v3.5.8',
    headline: 'Symmetric Ninja Bullet Header Framing Across Help & Explainer Systems',
    summary: 'Standardized all help module headings, command inspectors, and architectural deep-dive explainers to always be framed symmetrically between the custom ninja bullet glyphs (<a:ninja_bullet:1567038601668337705> and <a:ninja_bullet_rtl:1567038652687712317>), eliminating inconsistent icon fallbacks and matching official UI standards.',
    whatsNew: [
      {
        title: 'Symmetric Ninja Bullet Help Headings',
        desc: 'Configured buildHelpContainer in utility.js to unconditionally frame all help module titles symmetrically between NINJA_BULLET and NINJA_BULLET_RTL (e.g. # <a:ninja_bullet:...> AUTOMOD FILTERS <a:ninja_bullet_rtl:...>).'
      },
      {
        title: 'Command Inspector Header Standardization',
        desc: 'Updated detailed command inspectors in both prefix (!help <command>) and slash (/help command:<command>) interfaces to frame command names between ninja bullet glyphs.'
      },
      {
        title: 'Explainer Registry Header Alignment',
        desc: 'Updated topic explainers and command architecture deep-dive cards in explainerRegistry.js to consistently use symmetric ninja bullet headers.'
      }
    ],
    improvements: [
      {
        title: 'Zero Emoji Inconsistency',
        desc: 'Replaced random probability checks and legacy icon fallbacks with 100% consistent custom animated ninja bullet framing across all help directory interfaces.'
      }
    ]
  },
  {
    date: '22 November 2026',
    version: 'v3.5.7',
    headline: 'Full Quarantine Alias Suite, Help Directory Integration & Pre-Emptive Role Guard',
    summary: 'Expanded quarantine and unquarantine command alias routing throughout the system, integrating extensive aliases into the !help module directory, command inspectors, and architectural explainer registry. Hardened role assignment by pre-emptively purging quarantine records and exploit taints in !addrole and /addrole to eliminate isolation sentinel race conditions.',
    whatsNew: [
      {
        title: 'Help Directory & Command Inspector Alias Mapping',
        desc: 'Fully mapped all quarantine and unquarantine aliases (!qr, !q, !isolate, !jail, !freeze, !unq, !lift, !unjail, !unfreeze, !release, !pardon, etc.) directly to the Quarantine module container in !help and the detailed command inspector with rich architectural descriptions.'
      },
      {
        title: 'Explainer Registry Expansion',
        desc: 'Documented the complete quarantine and unquarantine command architecture, clearance policies (Server Owner, Extra Owner, Whitelisted Staff), Dual-Quarantine protection for rogue admins, and zero-delay manual UI removal in explainerRegistry.js.'
      },
      {
        title: 'Pre-Emptive Role Assignment Safeguard',
        desc: 'Enhanced !addrole and /addrole to pre-emptively purge quarantine records, exploit taints, and quarantine roles before applying new roles, eliminating race conditions with quarantine isolation sentinels.'
      }
    ],
    improvements: [
      {
        title: 'Dual-Quarantine Policy Transparency',
        desc: 'Updated user-facing help modules and architectural explainers to explicitly detail that general Discord Administrators are barred from lifting quarantine and will be quarantined if they attempt unauthorized manual role removal.'
      }
    ]
  },
  {
    date: '22 November 2026',
    version: 'v3.5.6',
    headline: 'Strict Extra Owner Quarantine Enforcement & Dual-Quarantine Breach Sentinel',
    summary: 'Restricted quarantine and unquarantine authorization strictly to Extra Owners, Server Owner, Bot Owners, and Whitelisted Security Staff, completely barring general Administrators. Engineered a dual-quarantine breach countermeasure in guildMemberUpdate that isolates both the target and any unauthorized administrator attempting to manually strip quarantine roles, while allowing authorized whitelisted staff to lift quarantines directly via Discord role removal.',
    whatsNew: [
      {
        title: 'Dual-Quarantine Breach Countermeasure',
        desc: 'Implemented an active audit interceptor in guildMemberUpdate: if an unauthorized administrator attempts to remove the Quarantine role from a quarantined user, containment is instantly restored and the unauthorized administrator is immediately placed under containment isolation.'
      },
      {
        title: 'Authorized Manual Discord Role Removal',
        desc: 'Enabled seamless manual unquarantine directly via the Discord client UI for Server Owner, Extra Owners, and Whitelisted Security Staff without executing commands—automatically lifting the database record, clearing exploit taints, and restoring saved roles.'
      },
      {
        title: 'Comprehensive Quarantine & Unquarantine Aliases',
        desc: 'Added extensive command aliases across prefix and slash commands, including !jail, !freeze, !qzone, !iso, !quar, !unjail, !unfreeze, !release, !dequarantine, and !pardon.'
      }
    ],
    improvements: [
      {
        title: 'Strict Administrator Clearance Boundary',
        desc: 'Enforced that general Discord Administrator permissions do not grant quarantine or unquarantine privileges, preserving Extra Owner hierarchy.'
      }
    ]
  },
  {
    date: '22 November 2026',
    version: 'v3.5.5',
    headline: 'Exploit Taint De-Quarantine Resolution & Multi-Tier Role Authorization Matrix',
    summary: 'Resolved privilege escalation re-quarantine feedback loops by ensuring unquarantine completely purges exploit taint records from the database and lifting restrictions for Server Owners, Bot Owners, Extra Owners, Whitelisted users, and Admins. Eliminated premature role stripping during audit log ingestion, preventing false-positive zero-audit linked role strikes.',
    whatsNew: [
      {
        title: 'Exploit Taint Database Purge on Unquarantine',
        desc: 'Upgraded executeUnquarantine to purge both active quarantine records and database exploit taints (db.removeExploitTaint), preventing members from being permanently barred or re-quarantined when granted roles.'
      },
      {
        title: 'Multi-Tier Role Grant Authorization Recognition',
        desc: 'Unified dangerous role verification across guildMemberUpdate, antinuke.js, and fastWiretap to recognize Server Owners, Bot Owners, Extra Owners, Whitelisted roles/users, Server Admins, and Athena commands (!addrole) as fully authorized grantors.'
      },
      {
        title: 'Zero-Flicker Role Audit Polling Architecture',
        desc: 'Eliminated premature pre-emptive role stripping before audit correlation, avoiding false Linked Role Exploit / Zero Audit detections when server owners assign roles in the Discord client.'
      }
    ],
    improvements: [
      {
        title: 'Self-Clearing Authoritative Role Commands',
        desc: 'Hardened !addrole and /addrole to automatically remove the Quarantined role and erase exploit taint whenever authorized server staff assign roles.'
      }
    ]
  },
  {
    date: '22 November 2026',
    version: 'v3.5.4',
    headline: '24/7 Home VC Anti-Disconnect Architecture & UDP Silence Heartbeat Sentinel',
    summary: 'Engineered permanent 24/7 Home VC persistence by eliminating unprovoked connection.destroy() teardowns, introducing an automated Opus silence keep-alive heartbeat to prevent Discord idle UDP timeouts, and ensuring Athena remains connected continuously without leaving until explicitly unset with unsethomevc.',
    whatsNew: [
      {
        title: '24/7 Opus Silence Keep-Alive UDP Heartbeat',
        desc: 'Implemented an automated RFC 6716 Opus silence frame (0xF8, 0xFF, 0xFE) transmission pipeline every 3 seconds, punching through router NAT firewalls and permanently preventing Discord voice servers from terminating idle voice sessions.'
      },
      {
        title: 'Zero-Drop Seamless Rejoin Pipeline',
        desc: 'Replaced destructive connection.destroy() teardowns during Discord voice server migrations and network hiccups with seamless connection.rejoin(), eliminating audible periodic disconnect/reconnect cycles.'
      },
      {
        title: 'Strict Unsethomevc Boundary Enforcement',
        desc: 'Enforced that Home VC connections are never voluntarily destroyed or disconnected unless an authorized owner explicitly runs !unsethomevc.'
      }
    ],
    improvements: [
      {
        title: 'Optimized 24/7 Auto-Reconnect Watchdog',
        desc: 'Hardened voice state resolution across member fetch caches in the 3-minute watchdog, ensuring existing active voice sessions are never interrupted.'
      }
    ]
  },
  {
    date: '21 November 2026',
    version: 'v3.5.3',
    headline: 'Server Overview Full CV2 Containerization & Interaction Engine Architecture',
    summary: 'Encapsulated the entire Statbot-style Server Overview telemetry dashboard (canvas graphics, media galleries, text telemetry breakdowns, action buttons, and timeframe selection dropdown) inside a native Discord Components V2 (type: 17) container. Fixed interaction double-acknowledgement race conditions and resolved attachment-clearing conflicts across tab transitions.',
    whatsNew: [
      {
        title: 'Native Discord Components V2 (CV2) Containerization',
        desc: 'Wrapped all 9 Server Overview tabs (Overview, Text, Voice, Engagement, Active, Graphs, Growth, Leaderboards, Compare) into unified type: 17 CV2 containers with clean headers, dividers, media galleries, embedded action rows, and defense status footers.'
      },
      {
        title: 'Zero-Fail Interaction & Attachment Reconciliation',
        desc: 'Eliminated DiscordAPIError[40060] interaction acknowledgement race conditions, added safe deferral guards, and intelligently differentiated between canvas attachment uploads and text-tab attachment clearing.'
      },
      {
        title: 'Tactical Navigation Button Emojis',
        desc: 'Integrated custom animated navigation beat glyphs for the Overview (<a:01_home_beat:1567037361810833428>) and Close (<a:02_delete_beat:1567037365547962449>) controls.'
      }
    ],
    improvements: [
      {
        title: 'Purged Redundant Collector Lifecycles',
        desc: 'Removed conflicting message component collectors in favor of global interaction routing, guaranteeing instant responsiveness without expired webhook token crashes.'
      }
    ]
  },
  {
    date: '21 November 2026',
    version: 'v3.5.2',
    headline: 'Military-Grade Strike Optimization & Pure Direct Ban Architecture',
    summary: 'Eliminated intermediate role-stripping before bans across all defense vectors, dedicating 100% of socket throughput to sub-10ms instantaneous rawBan execution. Purged duplicate raw Gateway listeners and implemented fast-ring packet deduplication, preventing redundant execution and eliminating recursive channel overwrite feedback loops.',
    whatsNew: [
      {
        title: 'Pure Direct Ban Pipeline',
        desc: 'Eliminated dual-strike role stripping (rawRoleStrip), directly executing rawBan (PUT /bans) across anti-strip sentinels, joined-member exploit guards, privilege escalation intercepts, and unauthorized role grants.'
      },
      {
        title: 'Single-Pipeline Gateway Hook & Packet Deduplication',
        desc: 'Consolidated Gateway listeners to a single client.on(\'raw\') pipeline and added an in-memory sliding Set to deduplicate raw packets and audit entries within burst windows.'
      },
      {
        title: 'Recursive Channel Overwrite Loop Shield',
        desc: 'Added atomic restoration lock marks during channel permission overwrites and setting rollbacks, permanently preventing ping-pong permission resets.'
      }
    ],
    improvements: [
      {
        title: 'Line-Rate Socket Execution',
        desc: 'Reserved 100% of Undici keep-alive socket capacity and Discord REST rate limits exclusively for instantaneous rawBan eviction.'
      }
    ]
  },
  {
    date: '21 November 2026',
    version: 'v3.5.1',
    headline: 'Security Status Panel Layout Restoration & 32-Module Scaling',
    summary: 'Restored the original rich Security Status panel layout for !ss (!security status) with full progress bars, exploit defense architecture walkthrough, live telemetry, and direct action buttons while properly scaling the total active shield matrix to 32 modules.',
    whatsNew: [
      {
        title: 'Complete 32-Module Defense Expansion',
        desc: 'Correctly expanded the Anti-Nuke suite from 28 to 32 modules by incorporating all 4 new defense modules (Anti Vanity Stealer, Anti Invite Delete, Anti Soundboard Create, Anti Soundboard Delete) alongside all 28 existing server and member shields.'
      },
      {
        title: 'Restoration of Full !ss Interface',
        desc: 'Restored all telemetry sections, hierarchy gate indicators, live audit counts, and action buttons (Engage/Disengage Shields, Live Records, Manage Modules, Exploit Guide, Close) in !ss.'
      }
    ],
    improvements: [
      {
        title: 'Dynamic Module Count Consistency',
        desc: 'All anti-nuke toggle feedback messages and module configuration descriptions now dynamically compute and display the live 32-module total.'
      }
    ]
  },
  {
    date: '21 November 2026',
    version: 'v3.5.0',
    headline: 'Full 32-Module Anti-Nuke Shield Matrix & Security Status Restoration',
    summary: 'Expanded the Anti-Nuke defense suite to 32 total modules by integrating all 4 missing shields (Anti Soundboard Create, Anti Soundboard Delete, Anti Vanity Stealer, and dedicated Anti Invite Delete). Restored the full telemetry, exploit guide, audit matrix, and progress reporting in !ss (!security status) while scaling the defense suite from 28 to 32 active modules.',
    whatsNew: [
      {
        title: 'Anti Soundboard Protection Suite',
        desc: 'Added real-time detection and neutralization for unauthorized soundboard sound creation (AuditLogEvent 130) and deletion (AuditLogEvent 132), immediately banning offenders and rolling back soundboard changes.'
      },
      {
        title: 'Anti Vanity URL Stealer Interceptor',
        desc: 'Deployed real-time vanity URL watchdog that detects unauthorized vanity code modifications, bans perpetrators instantly, and automatically restores the guild vanity URL via raw REST dispatch.'
      },
      {
        title: 'Dedicated Anti Invite Deletion Guard',
        desc: 'Decoupled invite deletion protection (AuditLogEvent 42) into a dedicated module separate from invite link creation/usage filtering.'
      },
      {
        title: '32-Module Defense Matrix in !ss',
        desc: 'Restored the comprehensive !ss status interface with complete exploit defense telemetry, live audit records, and progress bars while reflecting the scaled 32-module defense matrix.'
      }
    ],
    improvements: [
      {
        title: '3-Tier Partitioned Whitelist Management',
        desc: 'Upgraded the Whitelist Manager to support 3 distinct category select menus (Server & Infrastructure Shields, Moderation & Content Shields, and Auto-Mod Filters) comfortably within Discord 25-option and 5-action-row limits.'
      }
    ]
  },
  {
    date: '21 November 2026',
    version: 'v3.4.9',
    headline: 'Strict Discord Native Emoji Purge Across Whitelist & Security Controls',
    summary: 'Completely eliminated all Unicode native Discord emojis from Whitelist management panels, select menu placeholders, action buttons, security firewall status lines, and player announcements in strict compliance with the Bot Emoji Rules.',
    whatsNew: [
      {
        title: 'Native Emoji Purge from Whitelist Interface',
        desc: 'Removed native Unicode emojis from Whitelist category headers and dropdown placeholders, ensuring all UI elements strictly use Athena custom animated and static assets.'
      },
      {
        title: 'Security Control Buttons & Status Sanitization',
        desc: 'Stripped legacy Unicode emojis from security action buttons, audit pagination controls, and status telemetry.'
      }
    ],
    improvements: [
      {
        title: 'Audio Sentinel & Announcement Standardization',
        desc: 'Standardized music player fallback notifications and alert messages to use custom animated glyphs and ticks instead of native emojis.'
      }
    ]
  },
  {
    date: '21 November 2026',
    version: 'v3.4.8',
    headline: 'Whitelist Defense Matrix Expansion & Universal Extra Owner Immunity',
    summary: 'Expanded the Whitelist System (!whitelist / !wl) to support full granular whitelisting for both Anti-Nuke Shields (24 modules) and Auto-Mod / Chat Protections (10 modules, including Blacklisted Words, Anti-Link, Anti-Invite, Anti-Spam, Mass Mentions, Big Fonts, Hidden URLs, File Checks, AI Toxicity, and Quarantine). Partitioned whitelist management into two sleek action rows with multi-select menus to remain strictly within Discord limits. Established universal, unconditional immunity for Extra Owners across all auto-mod filters, anti-nuke punishers, quarantine triggers, and theater mode routines.',
    whatsNew: [
      {
        title: 'Auto-Mod & Chat Protections Whitelisting',
        desc: 'Added 10 new Auto-Mod & Chat Protection modules to the Whitelist Manager: Blacklisted Words Filter, Anti-Link, Anti-Invite, Anti-Spam & Flood, Anti-Mass Mention, Anti-Caps / Big Fonts, Anti-Hidden / Deceptive Links, Anti-File Extension Block, AI Toxicity & Doxxing Shield, and Quarantine Immunity.'
      },
      {
        title: 'Dual-Select Whitelist Management Menu',
        desc: 'Redesigned the Whitelist Manager panel into two dedicated select menus across Action Rows: one for Anti-Nuke Shields and one for Auto-Mod & Chat Filters, completely avoiding Discord 25-option limits while providing live pre-selected default states.'
      },
      {
        title: 'Universal Extra Owner Immunity Matrix',
        desc: 'Hardened all auto-mod bypass routines, anti-nuke punishers, condemnation locks, quarantine executors, and voice theater mode sentinels with instant in-memory Extra Owner ID verification, guaranteeing Extra Owners can never be restricted, banned, kicked, warned, or stripped of rank.'
      }
    ],
    improvements: [
      {
        title: 'Resolved Database isWhitelisted Security Gate',
        desc: 'Fixed an architectural quirk in db.isWhitelisted where disabled security was returning true for unrelated chat filters, ensuring precise module-specific whitelist authorization across all event listeners.'
      },
      {
        title: 'Quarantine Whitelist Immunity & Theater Shield',
        desc: 'Added explicit Quarantine Immunity to the whitelist matrix and purged accidental extra owner stripping logic from Theater Mode voice sentinels.'
      }
    ]
  },
  {
    date: '21 November 2026',
    version: 'v3.4.7',
    headline: 'Anti-Nuke Permission Overwrite Self-Loop Elimination & Extra Owner Privilege Immunity',
    summary: 'Fixed a critical recursive feedback loop where premature channel permission overwrite rollbacks triggered ping-pong channelUpdate events back and forth. Eliminated premature pre-reverts across channelUpdate, roleUpdate, and guildUpdate so rollbacks strictly execute via directStrike only when an executor is confirmed unauthorized, guaranteeing Extra Owners and Server Owners are 100% immune from false tampering rollbacks.',
    whatsNew: [
      {
        title: 'Channel & Role Self-Restoration In-Flight Tracking',
        desc: 'Added in-memory isChannelRestoring and isRoleRestoring debounce registries that tag entities modified by Athena Prime, completely ignoring Gateway echo events and permanently preventing recursive ping-pong loops.'
      },
      {
        title: 'Extra Owner & Server Owner Privilege Immunity',
        desc: 'Eliminated blind isGuildUnderAttack pre-reverts in channelUpdate.js, roleUpdate.js, and guildUpdate.js, ensuring all rollback and punishment routines are strictly governed by directStrike pre-checks where Extra Owners and Server Owners are verified by ID in memory.'
      }
    ],
    improvements: [
      {
        title: 'Zero False-Positive Channel & Role Gateway Filtering',
        desc: 'Updated WebSocket wiretap and event listeners to verify actor authorization before engaging countermeasures, preventing legitimate admin channel permissions and role drags from being wiped.'
      }
    ]
  },
  {
    date: '21 November 2026',
    version: 'v3.4.6',
    headline: 'Help Catalog Expansion & Native Discord Emojis Purge',
    summary: 'Expanded the interactive help menu and shortcuts system with !editrole / !er, !serveroverview / !so, and global 2-3 letter aliases. Completely purged all native Unicode Discord emojis from Role Manager buttons, placeholders, suggestion controls, and command interfaces in strict accordance with Athena Bot Emoji Rules.',
    whatsNew: [
      {
        title: 'Help Menu & Shortcuts Directory Expansion',
        desc: 'Updated Moderation, Tracking, and Utilities categories in !help and overhauled !shortcuts with 1,248+ active routes (!er, !cr, !dr, !so, !bs, !ui, !sinfo, !vcp, !vcl, !tp, !la, !ula, etc.).'
      },
      {
        title: 'Complete Native Emojis Purge',
        desc: 'Stripped all native Unicode emojis from Role Manager buttons and placeholders (Rename, Set Hex, Position, Clone, Members, Refresh, Delete), suggestion voting buttons, and component menus, binding custom animated delete beat for Close.'
      }
    ],
    improvements: [
      {
        title: 'Strict Bot Emoji Compliance',
        desc: 'All interactive component labels and descriptions now strictly adhere to custom animated glyphs and clean typography without native Discord emojis.'
      }
    ]
  },
  {
    date: '21 November 2026',
    version: 'v3.4.5',
    headline: 'Server Overview Component Race Condition Fix & Dual-Chart Trends Engine',
    summary: 'Resolved DiscordAPIError[40060] (Interaction already acknowledged) by eliminating duplicate collector listeners, added explicit attachments flushing across all 9 overview tabs for seamless transitions between canvas and embeds, and implemented a dedicated Dual-Chart Activity Trend Canvas for the Graphs tab.',
    whatsNew: [
      {
        title: 'Dual-Chart Server Trend Canvas Engine',
        desc: 'Implemented generateServerTrendImage rendering dual line charts with gradient fills for message distribution and voice durations across dates for the [Graphs] tab.'
      },
      {
        title: 'Seamless Tab & Attachment Transitions',
        desc: 'Ensured all 9 server overview tabs (Overview, Text, Voice, Engagement, Active, Graphs, Growth, Leaderboards, Compare) flush old attachments and render cleanly without state conflicts.'
      }
    ],
    improvements: [
      {
        title: 'Interaction Acknowledgment Race Condition Elimination',
        desc: 'Removed duplicate collector.on(collect) from executePrefix and executeSlash, leaving interaction handling exclusively to interactionCreate.js and eliminating DiscordAPIError 40060.'
      }
    ]
  },
  {
    date: '21 November 2026',
    version: 'v3.4.4',
    headline: 'Universal 1,248+ Aliases Network, Circular Import Cleanup & Ezal/Eval Intercept Guard',
    summary: 'Expanded the command aliases network to 1,248+ entries across all 29 modules (roleplay, moderation, utility, jtc, economy, etc.), severed circular import chains between loader.js, ccmd.js, date.js, and messageCreate.js, and unified ezal and eval prefix/prefixless security intercepts returning the formal Unauthorized Execution Attempt denial card.',
    whatsNew: [
      {
        title: 'Universal 1,248+ Aliases Network',
        desc: 'Added short intuitive 2-3 letter aliases across all bot modules including roleplay (!breakup, !unmarry, !cuddle2, !chomp), server overview (!so, !serverstats), role manager (!er), and utility/moderation shortcuts.'
      },
      {
        title: 'Dynamic Ezal / Eval Denial Guard',
        desc: 'Implemented dynamic security intercept for unauthorized eval, ezal, !eval, and !ezal calls, instantly delivering the Unauthorized Execution Attempt denial card for non-owners.'
      }
    ],
    improvements: [
      {
        title: 'Circular Dependency Severing',
        desc: 'Converted ccmd.js loader import to dynamic and re-routed date.js getCachedGif to roleplayEngine.js, ensuring clean circular-dependency-free startup.'
      }
    ]
  },
  {
    date: '21 November 2026',
    version: 'v3.4.3',
    headline: 'Interactive Role Manager Dashboard, Global Command Aliases & Ezal Isolation',
    summary: 'Deployed an interactive, real-time GUI Role Manager for !editrole and !er featuring role picker, modals for rename/hex/position, instant hoist/mentionable toggles, 13-color preset palette dropdown, core permissions toggler dropdown, role cloning, and member inspection. Added short aliases (er, cr, dr, ui, bs, yt, yts, etc.) across the codebase, fixed statsDB container initialization, and strictly purged eval in favor of ezal.',
    whatsNew: [
      {
        title: 'Interactive Role Manager Dashboard & Role Picker',
        desc: 'Invoking !editrole, !er, or /editrole opens an interactive RoleSelectMenu or direct role dashboard with 4 ActionRows: Rename/Hex/Position modals, Hoist/Mention instant toggles, 13-preset color dropdown, core permissions toggler dropdown, role cloning, member roster, refresh, and delete.'
      },
      {
        title: 'Comprehensive 2-3 Letter Global Command Aliases',
        desc: 'Added intuitive shortcuts across all primary bot features: !er (editrole), !cr (createrole), !dr (deleterole), !ui (userinfo), !bs (botstats), !yt (youtube), !yts (ytstats), !v (verify), !vcp (vcpanel), !vcl (vclock), !vcunl (vcunlock), !tp (ticketpanel), !sinfo (serverinfo), !qrm (qrmanager), !la (lockapps), !ula (unlockapps).'
      },
      {
        title: 'Ezal Isolation & Eval Command Purge',
        desc: 'Completely purged the eval command and alias across the bot in accordance with strict owner suite security. Retained exclusively ezal, with prefix-less security enforcement returning the formal denial card for non-owners.'
      }
    ],
    improvements: [
      {
        title: 'Container Crash Fix in statsDB.js',
        desc: 'Resolved ReferenceError on _logDailyReaction and _logDailyLink variable declaration mismatch, ensuring clean container startup and automated restart resilience.'
      }
    ]
  },
  {
    date: '21 November 2026',
    version: 'v3.4.2',
    headline: 'Statbot-Style Interactive Server Overview & Ezal Access Security Guard',
    summary: 'Rolled out an ultra-high-fidelity 8-panel Statbot-style graphical Server Overview dashboard with dynamic 4-row Discord controls (tabs, refresh, close, and timeframe dropdown for 24h, 7d, 30d, all). Added unauthorized execution denial intercept for non-owners attempting to run or enter eval/ezal mode.',
    whatsNew: [
      {
        title: 'Statbot-Style Graphical Server Overview',
        desc: 'Pixel-perfect 8-panel canvas HUD displaying Messages, Voice, Active Users, Top Message Members with avatars, Top Voice Members with avatars, Reactions, Links, and Member growth/churn metrics.'
      },
      {
        title: 'Dynamic 4-Row Discord Controls',
        desc: 'Interactive Discord interface featuring 9 feature tabs (Overview, Text, Voice, Engagement, Active, Graphs, Growth, Leaderboards, Compare), Refresh and Close actions, and a StringSelectMenu for timeframe toggling (24h, 7d, 30d, all).'
      },
      {
        title: 'Ezal / Eval Mode Access Denied Guard',
        desc: 'Unauthorized execution security intercept that blocks non-developers typing eval, ezal, !eval, or !ezal with a formal denial card (Unauthorized Execution Attempt).'
      }
    ],
    improvements: [
      {
        title: 'Automated Reactions & Links Telemetry',
        desc: 'Enhanced statsDB with server_activity_daily table, automatic retroactive backfills, and real-time logging in messageCreate and messageReactionAdd.'
      }
    ]
  },
  {
    date: '21 November 2026',
    version: 'v3.4.1',
    headline: 'Global Sanctions & Server Blacklist Cloud Collections',
    summary: 'Added dedicated MongoDB Cloud collections for globally banned users (global_bans), blacklisted servers (banned_servers), and NoPrefix permissions (noprefix_access). Integrated banned server metrics into Athena Cloud Backup manifests and the !db mongo persistence audit.',
    whatsNew: [
      {
        title: 'Dedicated Global Sanctions Collections',
        desc: 'Globally banned accounts (!gban) and blacklisted servers (ezal banserver) now sync into dedicated global_bans and banned_servers collections in MongoDB Atlas with automated boot-time hydration into O(1) in-memory lookup sets.'
      },
      {
        title: 'CloudSync Banned Server Metrics',
        desc: 'Athena Cloud Backup manifests now track and display blacklisted servers alongside global bans in the enforcement section.'
      }
    ],
    improvements: [
      {
        title: 'Persistent Sanctions Auditing',
        desc: 'Enhanced !db mongo cloud audit to report real-time counts for globally blacklisted users and banned server IDs across 30 cloud collections.'
      }
    ]
  },
  {
    date: '21 November 2026',
    version: 'v3.4.0',
    headline: 'Full-Spectrum Cloud Architecture & 27-Collection MongoDB Persistence',
    summary: 'Conducted a deep-dive backup audit across local and cloud databases. Added 10 dedicated collections to MongoDB Cloud sync (economy, users_xp, giveaways, reaction_roles, moderation_security, entry_gates, roleplay_data, server_snapshots, security_incidents, minigames_stats) eliminating the 16MB single-document bottleneck, and implemented a clean WAL/SHM file purge during SQLite cloud recovery.',
    whatsNew: [
      {
        title: '27 Dedicated MongoDB Cloud Collections',
        desc: 'Split all heavy structured datasets (economy ledgers, XP leveling, active giveaways, reaction roles, quarantines/temp-bans, entry gates, roleplay marriages, server snapshots, anti-nuke telemetry) into dedicated per-guild MongoDB collections, guaranteeing 100% cloud backup coverage.'
      },
      {
        title: 'Server Snapshots & Time Machine Cloud Persistence',
        desc: 'Server infrastructure snapshots and Time Machine restore points are now continuously backed up to the server_snapshots MongoDB collection per guild.'
      },
      {
        title: 'SQLite WAL Replay Protection in CloudSync',
        desc: 'During cloud database restoration, stale stats.db-wal and stats.db-shm files are proactively purged before mounting the restored stats.db, permanently preventing SQLite transaction replay corruption.'
      }
    ],
    improvements: [
      {
        title: '16MB Document Size Immunity',
        desc: 'By decomposing per-guild datasets out of core_cache global_state, the master configuration document remains under 50KB, permanently immune to MongoDB BSONObjectTooLarge errors.'
      }
    ]
  },
  {
    date: '21 November 2026',
    version: 'v3.3.9',
    headline: 'Direct Single-Strike Raw Ban Streamlining',
    summary: 'Streamlined Anti-Nuke hostile punishment to a single, zero-overhead raw ban request over pre-warmed Undici sockets. Removed redundant role-strip calls to conserve API rate limits and eliminate unnecessary multi-endpoint requests.',
    whatsNew: [
      {
        title: 'Single-Strike Direct Raw Ban',
        desc: 'punish() now directly and exclusively dispatches rawBan (PUT /guilds/:id/bans/:user_id) without prior or concurrent role-stripping, instantly and permanently removing the attacker in a single API call.'
      }
    ],
    improvements: [
      {
        title: 'API Rate-Limit & Resource Conservation',
        desc: 'Eliminating the secondary member PATCH request preserves server REST quotas and accelerates punishment execution down to a single socket dispatch.'
      }
    ]
  },
  {
    date: '21 November 2026',
    version: 'v3.3.8',
    headline: 'Dual-Strike Concurrent Pre-Emption & Full 28-Module Defense Matrix',
    summary: 'Implemented concurrent Dual-Strike pre-emption in anti-nuke punishment, dispatching rawRoleStrip and rawBan simultaneously over pre-warmed Undici sockets for sub-10ms permission revocation. Expanded directStrike module resolution to cover all 28 security modules with zero-overhead socket dispatch.',
    whatsNew: [
      {
        title: 'Concurrent Dual-Strike Neutralization',
        desc: 'punish() now executes rawRoleStrip and rawBan in parallel via Promise.allSettled. Revoking Administrator permissions in Discord edge caches within 8-10ms immediately turns any in-flight burst requests by nuke bots into 403 Forbidden while rawBan simultaneously purges the account in 10-15ms.'
      },
      {
        title: 'Full 28-Module Direct Strike Routing',
        desc: 'Mapped all 28 Anti-Nuke defense modules in directStrike including unbans, scheduled events, automod rules, and application commands for comprehensive real-time protection.'
      }
    ],
    improvements: [
      {
        title: 'Pre-Warmed Undici Socket Pipeline',
        desc: 'Parallel socket dispatch leverages keep-alive connection pooling with TCP_NODELAY, eliminating TLS handshake latency during emergency defensive strikes.'
      }
    ]
  },
  {
    date: '20 November 2026',
    version: 'v3.3.7',
    headline: 'Unknown Channel Self-Healing & Security Toggle Reference Fix',
    summary: 'Resolved ReferenceError in handleSecurityToggleAll, added null-safe channel checks in messageCreate command logging, and implemented automatic self-cleaning for stale dashboard and quarantine channel IDs in the database.',
    whatsNew: [
      {
        title: 'Security Toggle All Scope Fix',
        desc: 'Declared cfg configuration scope in handleSecurityToggleAll, allowing seamless disengagement and re-engagement of all 28 security modules via buttons or slash commands.'
      },
      {
        title: 'Stale Channel Self-Healing',
        desc: 'Automatically clears dead channel IDs (DiscordAPIError 10003) from database cache for both athenas-dashboard and quarantine channels.'
      }
    ],
    improvements: [
      {
        title: 'Null-Safe Channel Logging',
        desc: 'messageCreate execution telemetry now handles DM, deleted, and partial channels safely without property-of-null exceptions.'
      }
    ]
  },
  {
    date: '20 November 2026',
    version: 'v3.3.6',
    headline: 'CloudSync Telemetry Logging Fix',
    summary: 'Fixed undefined sizeKb reference in cloud backup success logging, reporting dual compressed and raw byte metrics accurately.',
    whatsNew: [
      {
        title: 'Dual Size Telemetry',
        desc: 'CloudSync completion logs now accurately display both compressed and raw sizes without reference errors.'
      }
    ],
    improvements: [
      {
        title: 'Robust Variable Alias',
        desc: 'Added sizeKb alias mapping to compressed size to preserve backwards compatibility across internal logging.'
      }
    ]
  },
  {
    date: '20 November 2026',
    version: 'v3.3.5',
    headline: 'Sentinel Reorder Suppression & Anti-Nuke Collateral Drag Guard',
    summary: 'Guarded anti-nuke universal role reorder enforcement against collateral role position shifts caused by sentinel auto-dragging. Eliminates mutual recursion ping-pong between anti-strip sentinel positioning and anti-reorder rollback.',
    whatsNew: [
      {
        title: 'Anti-Nuke Sentinel Sync Guard',
        desc: 'roleUpdate now inspects isSyncingSupportingRoles before checking role position shifts, preventing automatic rollback of roles shifted during sentinel alignment.'
      },
      {
        title: 'Immediate Cache & Baseline Sync',
        desc: 'Dynamically updates in-memory role positions and triggers baseline infrastructure snapshot synchronization immediately upon sentinel repositioning.'
      }
    ],
    improvements: [
      {
        title: 'Eliminated Role Reorder Oscillations',
        desc: 'Resolved infinite repositioning cascades across active guilds while preserving strict anti-nuke hierarchy tampering defense against unauthorized users.'
      }
    ]
  },
  {
    date: '20 November 2026',
    version: 'v3.3.4',
    headline: 'Gzip Compression & Snapshot Pruning for Discord Cloud Backups',
    summary: 'Implemented Gzip compression for Discord database backups, reducing payload sizes by ~89%. Enforced a rolling limit of 10 infrastructure snapshots per guild to permanently prevent DiscordAPIError[40005] Request entity too large and MongoDB quota exhaustion.',
    whatsNew: [
      {
        title: 'Gzip Cloud Backup Engine',
        desc: 'Cloud backups are now automatically compressed with gzip (.json.gz / .db.gz) before uploading to Discord, shrinking multi-megabyte payloads to a few hundred kilobytes.'
      },
      {
        title: 'Rolling Snapshot Pruning',
        desc: 'Limited server infrastructure snapshot history to 10 per guild with boot-time pruning, reclaiming 15+ MB of storage and preventing attachment size overruns.'
      }
    ],
    improvements: [
      {
        title: 'Backwards-Compatible Restore',
        desc: 'cloudSync auto-restoration seamlessly decompresses .gz archives while preserving full compatibility with legacy raw JSON backups.'
      }
    ]
  },
  {
    date: '20 November 2026',
    version: 'v3.3.3',
    headline: 'Sentinel Role Hierarchy Pre-Check & Permission Guard',
    summary: 'Added strict hierarchy positioning checks and ManageRoles permission validation before binding persistence roles to the bot. Prevents Discord API 50013 Missing Permissions warnings when sentinel roles are situated above bot primary roles.',
    whatsNew: [
      {
        title: 'Hierarchy-Aware Sentinel Assignment',
        desc: 'Bot now validates that sentinel roles are strictly below its highest role before binding, dynamically positioning them downward if editable to avoid API permission errors.'
      }
    ],
    improvements: [
      {
        title: 'Clean Log Telemetry',
        desc: 'Eliminated raw unhandled permission warning noise in server startup logs.'
      }
    ]
  },
  {
    date: '20 November 2026',
    version: 'v3.3.2',
    headline: 'Zero-Downtime Continuous Deployment Pipeline Verification',
    summary: 'Deployed live push verification payload v3.3.2. Synchronized Git supervisor watchdog across public mirrors, enabling instantaneous hot reloads and zero-downtime server restarts.',
    whatsNew: [
      {
        title: 'Live Push Auto-Reload Verification',
        desc: 'Dispatched v3.3.2 to verify automated 30s background Git polling, atomic hard reset synchronization, and zero-downtime container reboot on Pterodactyl.'
      }
    ],
    improvements: [
      {
        title: 'Continuous Pipeline Diagnostics',
        desc: 'Validated end-to-end webhook-free continuous deployment workflow directly from GitHub to production container.'
      }
    ]
  },
  {
    date: '20 November 2026',
    version: 'v3.3.1',
    headline: 'Boot-Time Repository Alignment & Untracked Tree Self-Healing',
    summary: 'Added proactive boot-time git fetch and reset --hard into start.sh to instantly heal untracked working tree merge collisions on existing containers without requiring manual console or startup command intervention.',
    whatsNew: [
      {
        title: 'Boot-Time Git Auto-Alignment',
        desc: 'start.sh now automatically resets the working tree to origin/main on every container initialization, preventing merge locks from previously untracked files.'
      }
    ],
    improvements: [
      {
        title: 'Zero Host Admin Dependency',
        desc: 'Allows servers to self-heal and stay in continuous deployment mode without requiring host provider or startup command modifications.'
      }
    ]
  },
  {
    date: '20 November 2026',
    version: 'v3.3.0',
    headline: 'Atomic Fetch & Hard Reset Synchronization Engine',
    summary: 'Upgraded daemon auto-deploy mechanism to use atomic git fetch and reset --hard FETCH_HEAD. Eliminates untracked working tree file overwrite merge aborts, preserving runtime configuration while enforcing clean synchronization with remote releases.',
    whatsNew: [
      {
        title: 'Atomic Fetch & Reset Sync',
        desc: 'Replaced git pull merge strategy with git fetch and git reset --hard in both start.sh and gitWatcher.js, preventing merge aborts from untracked working tree files.'
      }
    ],
    improvements: [
      {
        title: 'Protected Configuration Integrity',
        desc: 'Ensures untracked runtime state such as .env and data/ databases remain untouched during synchronization.'
      }
    ]
  },
  {
    date: '20 November 2026',
    version: 'v3.2.9',
    headline: 'Continuous Auto-Deploy Verification & Live Watchdog Sync',
    summary: 'Deployed live push verification payload. Calibrated 30-second Git daemon watcher to continuously synchronize Pterodactyl container state with public fire-x mirror.',
    whatsNew: [
      {
        title: 'Live Push Verification Engine',
        desc: 'Pushed test build v3.2.9 to confirm automated watcher triggering, graceful DB cache flush, and instant daemon reload.'
      }
    ],
    improvements: [
      {
        title: 'Public Mirror Health Check',
        desc: 'Ensured unauthenticated Git operations on fire-x.git execute with zero latency (<0.8s) across all headless deployments.'
      }
    ]
  },
  {
    date: '20 November 2026',
    version: 'v3.2.8',
    headline: 'Public Mirror Auto-Deploy Integration & Zero-Credential Pulls',
    summary: 'Bound auto-deploy daemon and background git watcher to the public repository mirror (fire-x.git), eliminating credential prompt stalls and enabling seamless automatic zero-downtime hot reloads and git pulls on headless Pterodactyl containers.',
    whatsNew: [
      {
        title: 'Zero-Credential Public Remote Sync',
        desc: 'Routed git ls-remote and git pull operations through the zero-auth public GitHub mirror, resolving fatal username prompt timeouts on headless container restarts.'
      },
      {
        title: 'Dual-Layer Auto-Deploy Pipeline',
        desc: 'Equipped both start.sh daemon loop and internal gitWatcher.js with public mirror polling, pre-restart package.json delta checks, and automated zero-downtime process recycling.'
      }
    ],
    improvements: [
      {
        title: 'Self-Healing Remote URL Migration',
        desc: 'start.sh and gitWatcher.js automatically detect and rebind container origin to the public mirror on initialization without manual shell intervention.'
      }
    ]
  },
  {
    date: '20 November 2026',
    version: 'v3.2.7',
    headline: 'Pterodactyl Daemon Supervisor & Git Auto-Deploy Calibration',
    summary: 'Configured non-interactive shell environment (GIT_TERMINAL_PROMPT=0) in production start.sh daemon loop. Verified automated GitHub continuous deployment pipeline and remote synchronization triggers across cloud containers.',
    whatsNew: [
      {
        title: 'Non-Interactive Daemon Shell',
        desc: 'Added export GIT_TERMINAL_PROMPT=0 and GIT_ASKPASS="" into start.sh to permanently suppress terminal credential prompts in container environments.'
      },
      {
        title: 'Remote Synchronization Verification',
        desc: 'Pushed v3.2.7 update to trigger and confirm real-time git pull and zero-downtime bot reload on Pterodactyl.'
      }
    ],
    improvements: [
      {
        title: 'Self-Healing Environment Checks',
        desc: 'Hardened git safe directory and remote origin self-repair checks on container initialization.'
      }
    ]
  },
  {
    date: '20 November 2026',
    version: 'v3.2.6',
    headline: 'Memory Leak Elimination, Role Drag Cooldown & MongoDB Quota Reclamation',
    summary: 'Eliminated out-of-memory crashes by implementing role dragging concurrency locks and cooldown guards to prevent recursive event feedback loops. Staggered periodic sentinel sweeps, configured non-interactive Git daemons, and automated MongoDB storage reclamation purging legacy backup blobs to unblock cluster writes.',
    whatsNew: [
      {
        title: 'Role Drag Anti-Recursion & 15s Cooldown',
        desc: 'Added syncingGuilds concurrency lock and 15-second cooldown per guild with isSyncingSupportingRoles(guildId) in roleUpdate.js, eliminating infinite event cascades and out-of-memory crashes.'
      },
      {
        title: 'Staggered Sentinel Sweeps',
        desc: 'Staggered role hierarchy checks across all servers by 250ms, eliminating heap spikes on bot startup and periodic sweeps.'
      },
      {
        title: 'Automated MongoDB Storage Reclamation',
        desc: 'Auto-purges bulky legacy cache dumps in cloud_backups on connection and upon reaching quota limits, keeping MongoDB Atlas storage under 15 MB and unblocking cluster writes. Added ezal mongofree.'
      },
      {
        title: 'Non-Interactive Git Daemon (Prompt Elimination)',
        desc: 'Configured GIT_TERMINAL_PROMPT=0 in gitWatcher.js to prevent background git daemons from ever prompting for username/password on headless containers.'
      }
    ],
    improvements: [
      {
        title: 'Startup Process Isolation',
        desc: 'Streamlined bot startup by removing duplicate role positioning calls, letting the staggered watchdog handle hierarchy normalization progressively.'
      }
    ]
  },
  {
    date: '20 November 2026',
    version: 'v3.2.5',
    headline: 'Ezal Active Session Command Passthrough & SS Security Routing',
    summary: 'Resolved command collision in active Ezal sessions where typing bot commands (e.g. ss, status) without a prefix would be erroneously evaluated as raw JavaScript. Added direct commandMap routing and explicit security status routing in Ezal mode.',
    whatsNew: [
      {
        title: 'Ezal Bot Command Passthrough',
        desc: 'Typing any registered bot command or alias (such as ss, status, secstatus, ping, etc.) while inside an active Ezal session now resolves and executes the command instead of throwing a ReferenceError.'
      },
      {
        title: 'Native SS & Security Status Handler',
        desc: 'Added dedicated case for ss and status in the Ezal command router to instantly return the real-time security overview panel.'
      }
    ],
    improvements: [
      {
        title: 'Safe Code Evaluation Fallback',
        desc: 'Unrecognized inputs in Ezal mode now check commandMap before evaluating arbitrary JavaScript strings.'
      }
    ]
  },
  {
    date: '20 November 2026',
    version: 'v3.2.4',
    headline: 'Supporting Secondary & Hidden Roles Sentinel Hierarchy Drag Watchdog',
    summary: 'Implemented atomic syncSupportingRolePositions and a continuous 90-second periodic watchdog to auto-drag supporting secondary (Athena Firewall) and hidden (Athena Unbypassable) roles directly underneath the bot\'s primary role from any distant position in the server hierarchy.',
    whatsNew: [
      {
        title: 'Auto-Drag Sentinel Repositioning',
        desc: 'Integrates syncSupportingRolePositions(guild) utilizing atomic guild.roles.setPositions to drag secondary (P - 1) and hidden (P - 2) roles straight underneath the bot\'s primary role (P).'
      },
      {
        title: '90-Second Periodic Watchdog',
        desc: 'Continuously scans all active servers with security enabled and auto-aligns drifted sentinel roles from afar with zero overhead when already aligned.'
      },
      {
        title: 'Reorder Shield Protection',
        desc: 'Exempts persistence sentinel roles from anti-reorder strikes, eliminating internal race conditions during dynamic role elevation.'
      }
    ],
    improvements: [
      {
        title: 'Manual Hierarchy Calibration',
        desc: 'Added ezal dragsentinels command to verify and force instant sentinel role alignment on demand.'
      }
    ]
  },
  {
    date: '20 November 2026',
    version: 'v3.2.3',
    headline: 'Ezal Telemetry Decoupling & Heading Glyph Restoration',
    summary: 'Restored randomized heading glyphs and target blink bullet points in Ezal Mode session banners and execution containers without tick emojis. Decoupled ETA (Transit Arrival) from ECT (Execution Compute Time) to accurately reflect true high-resolution CPU runtime.',
    whatsNew: [
      {
        title: 'Heading Glyph & Bullet Point Restoration',
        desc: 'Restored animated heading glyphs (# <glyph> Ezal Mode Enabled) and description bullet points (<a:target_blink:...>) while omitting tick emojis.'
      },
      {
        title: 'High-Precision Telemetry Decoupling',
        desc: 'Decoupled ETA (gateway ingress latency in ms/ns) and ECT (V8 execution compute time in µs/ns), eliminating identical fallback readings.'
      }
    ],
    improvements: [
      {
        title: 'Accurate Nanosecond Benchmarking',
        desc: 'Captures process.hrtime.bigint() at the top of the command router to compute true sub-millisecond execution compute time.'
      }
    ]
  },
  {
    date: '20 November 2026',
    version: 'v3.2.2',
    headline: 'In-Voice Role Cloud Persistence & MongoDB Sync Integration',
    summary: 'Integrated dedicated voice_roles collection and channel_setups schema mirroring into the MongoDB Atlas cloud synchronization matrix. Automatically preserves and restores auto-assigned in-voice roles (!voicerole) across host migrations.',
    whatsNew: [
      {
        title: 'Dedicated voice_roles Cloud Collection',
        desc: 'All configured in-voice role snowflakes are now bulk synchronized to a dedicated MongoDB Atlas collection with auto-indexing.'
      },
      {
        title: 'Live Inventory & Restoration Telemetry',
        desc: 'Added in-voice role metrics to !db mongo audit view, !db mongo sync push summaries, and !db mongo pull hydration results.'
      }
    ],
    improvements: [
      {
        title: 'Multi-Layer Redundancy',
        desc: 'In-voice roles are preserved across three tiers: dedicated voice_roles collection, channel_setups bindings, and full master cloud snapshots.'
      }
    ]
  },
  {
    date: '20 November 2026',
    version: 'v3.2.1',
    headline: 'Dedicated News Feed Cloud Persistence & MongoDB Sync Matrix',
    summary: 'Integrated dedicated news_feeds MongoDB collection mirroring all active channel bindings, ping roles, subscribed RSS feeds, and processed GUID histories. Added full bidirectional cloud synchronization, automatic hydration, and live inventory auditing.',
    whatsNew: [
      {
        title: 'Dedicated news_feeds Cloud Collection',
        desc: 'All server news channels, mention ping roles, subscribed RSS sources, and deduplication lastGuids arrays are now backed up directly to MongoDB Atlas.'
      },
      {
        title: 'Live Inventory & Telemetry Tracking',
        desc: 'Added news feed metrics to !db mongo audit view, !db mongo sync push reports, and !db mongo pull hydration summaries.'
      }
    ],
    improvements: [
      {
        title: 'Zero-Duplicate Cross-Host Hydration',
        desc: 'Preserving lastGuids in MongoDB prevents automated news broadcasters from re-posting recent articles when migrating hosts.'
      }
    ]
  },
  {
    date: '20 November 2026',
    version: 'v3.2.0',
    headline: 'Sun News & Polimer News Presets Integration',
    summary: 'Integrated official Sun News and Polimer News regional broadcasting presets into the automated news engine (/news add and !news add). Enhanced news embeds with high-definition YouTube thumbnail resolution.',
    whatsNew: [
      {
        title: 'Sun News & Polimer News Presets',
        desc: 'Added instant presets for Sun News (sun, sunnews) and Polimer News (polimer, polimernews) across both prefix and slash command menus.'
      },
      {
        title: 'HD Video News Embeds',
        desc: 'Automated news broadcaster (newsJob.js) now ingests high-resolution thumbnails for video news feeds, rendering full-size cover images in alerts.'
      }
    ],
    improvements: [
      {
        title: 'Multi-Alias Preset Mapping',
        desc: 'Users can quickly subscribe using !news add sun, !news add polimer, !news add sunnews, or !news add polimernews.'
      }
    ]
  },
  {
    date: '20 November 2026',
    version: 'v3.1.9',
    headline: 'Ezal Mode Minimalist Typography & Grey Font Standardization',
    summary: 'Stripped all glyphs, ticks, crosses, and bullet emojis from Ezal session banners and execution containers. Converted all authorization and telemetry metadata exclusively to Discord muted grey subtext (-#).',
    whatsNew: [
      {
        title: 'Minimalist Clean Ezal Mode Branding',
        desc: 'Removed all leading glyphs, trailing tick circles, crosses, and bullet emojis from Ezal session banners.'
      },
      {
        title: 'Grey Subtext Typography',
        desc: 'All description lines, developer mentions, session states, and telemetry lines are now styled in Discord muted grey fonts (-#).'
      }
    ],
    improvements: [
      {
        title: 'Reduced Visual Clutter',
        desc: 'Streamlined container appearance for high-contrast, distraction-free administrative runtime execution.'
      }
    ]
  },
  {
    date: '20 November 2026',
    version: 'v3.1.8',
    headline: 'Complete SQLite Stats Cloud Persistence & Chunked BulkWrite Engine',
    summary: 'Fully integrated SQLite stats.db (user activity, channel velocity, invite tracking, and join history) into all MongoDB synchronization pipelines. Added lazy statsDB resolution, chunked bulk writes (500 ops/batch), master snapshot stats summaries, and verified live cloud backup telemetry.',
    whatsNew: [
      {
        title: 'SQLite Stats Full Cloud Persistence',
        desc: 'All 4,672+ user activity rows, 8,253+ channel velocity records, user invites, and join logs in stats.db are mirrored directly to dedicated MongoDB collections with full bidirectional hydration.'
      },
      {
        title: 'High-Velocity Chunked BulkWrite Engine',
        desc: 'Implemented 500-operation chunking for MongoDB bulk writes to eliminate network timeouts and ensure seamless high-volume stats flushing.'
      }
    ],
    improvements: [
      {
        title: 'Master Snapshot Stats Metadata',
        desc: 'Rolling master backups in cloud_backups now include comprehensive stats telemetry summaries alongside in-memory database snapshots.'
      }
    ]
  },
  {
    date: '20 November 2026',
    version: 'v3.1.7',
    headline: 'Git Commit Count Presence Telemetry Synchronization',
    summary: 'Synchronized bot status presence note ("No of Git Commits Done so far") with live repository commit telemetry. Enhanced safe.directory resolution, auto-unshallowing for shallow container clones, and accurate fallback calibration.',
    whatsNew: [
      {
        title: 'Real-Time Git Commit Presence Sync',
        desc: 'The bot custom status note ("No of Git Commits Done so far - {commits}") now queries live git revision history dynamically, reporting 359+ commits.'
      },
      {
        title: 'Container Git Unshallowing Engine',
        desc: 'Added automated safe.directory permissions and depth-unshallowing support to prevent container environments from defaulting to 1 or stale counts.'
      }
    ],
    improvements: [
      {
        title: 'LiveOps Monitor Synchronization',
        desc: 'Aligned LiveOps daemon commit trackers and fallback metrics with current production git commit tallies.'
      }
    ]
  },
  {
    date: '20 November 2026',
    version: 'v3.1.6',
    headline: 'Git Push Selective Auto-Deploy & Container Daemon Supervisor',
    summary: 'Re-engineered start.sh and GitWatcher to auto-pull and restart exclusively when a new remote git push is detected. Added safe.directory auto-repair and conditional npm install when package.json changes.',
    whatsNew: [
      {
        title: 'Selective Git Push Auto-Pull & Restart',
        desc: 'Startup supervisor compares local and remote commit SHAs and only executes git pull and restart when a new remote commit exists.'
      },
      {
        title: 'Dubious Ownership Container Auto-Repair',
        desc: 'Configured automated safe.directory "*" repair on Linux and container environments (Pterodactyl/VPS) to ensure git watcher never drops to standby.'
      }
    ],
    improvements: [
      {
        title: '30-Second Fast Push Detection',
        desc: 'Reduced background git polling interval from 60s to 30s for rapid zero-downtime hot reloading.'
      }
    ]
  },
  {
    date: '20 November 2026',
    version: 'v3.1.5',
    headline: 'Ezal Runtime Mode Rebranding & Owner Execution Calibration',
    summary: 'Standardized all administrative session containers, banners, termination dialogs, and evaluation results strictly to Ezal Mode. Added active Ezal session auto-routing and code execution in prefix-less chat.',
    whatsNew: [
      {
        title: 'Ezal Mode Strict Branding',
        desc: 'Updated session activation banner to "# <glyph> Ezal Mode Enabled | <tick>", termination to "# <glyph> Ezal Mode Terminated | <tick>", and code outputs to "# <glyph> Ezal Execution Result | <tick>".'
      },
      {
        title: 'Active Ezal Session Subcommand Routing',
        desc: 'While Ezal Mode is active, typing any Ezal subcommands (mongo, export, backup, snapshots, etc.) or raw JavaScript executes directly with telemetry container responses.'
      }
    ],
    improvements: [
      {
        title: 'Prefix-Less Command Registry Expansion',
        desc: 'Added direct prefix-less mongo and mongodb recognition for the bot owner, automatically bridging into real-time MongoDB cluster telemetry.'
      }
    ]
  },
  {
    date: '20 November 2026',
    version: 'v3.1.4',
    headline: 'Live MongoDB Cloud Persistence Audit & Instant Database Export Suite',
    summary: 'Introduced real-time MongoDB Atlas inventory auditing with exact localized timestamps, 15-system document counters, and next-sync countdowns. Integrated direct database export (!db export, ezal export, and prefix-less export) to download raw db.json and stats.db files directly in Discord.',
    whatsNew: [
      {
        title: 'Live MongoDB Cloud Inventory Audit',
        desc: '!db mongo and ezal mongo now run real-time cluster queries reporting exact backup timestamps, next-sync countdowns, and live document counts across all 15 collections.'
      },
      {
        title: 'Direct Database File Export',
        desc: 'Typing ezal export, !db export, or prefix-less export compiles and sends raw db.json and stats.db files directly to chat as instant attachments.'
      },
      {
        title: 'Ezal Owner Suite Help Matrix',
        desc: 'Added explicit command cards and execution syntax for cloud audits, syncing, and raw exports across both Page 1 and Page 2 of ehelp.'
      }
    ],
    improvements: [
      {
        title: 'Localized Discord Timestamp Precision',
        desc: 'Backup records and next-sync countdowns now use dynamic Discord unix tags (<t:timestamp:F> / <t:timestamp:R>) for automatic client timezone localization.'
      }
    ]
  },
  {
    date: '20 November 2026',
    version: 'v3.1.3',
    headline: 'Home Voice Connection Staggering & Gateway Handshake Optimization',
    summary: 'Eliminated Discord Voice Gateway AbortErrors during startup by staggering Home VC connections across servers with a 2.5-second pacing interval, expanding connection handshake timeouts to 20 seconds, and suppressing noisy internal Node.js abort stack traces with intelligent auto-reconnection telemetry.',
    whatsNew: [
      {
        title: 'Staggered Voice Startup Sequencing',
        desc: 'Home VC connections are now paced across servers at 2.5-second intervals, preventing simultaneous UDP socket saturation and gateway rate-limiting.'
      },
      {
        title: 'Resilient Handshake Timeout',
        desc: 'EntersState timeout expanded from 10s to 20s to accommodate high-latency voice regions without aborting.'
      }
    ],
    improvements: [
      {
        title: 'Clean Handshake Logging',
        desc: 'Replaced multi-line internal Node AbortError traces with concise gateway status advisories and automatic watchdog recovery.'
      }
    ]
  },
  {
    date: '20 November 2026',
    version: 'v3.1.2',
    headline: 'Interactive Ezal Runtime & Eval Telemetry Engine (ETA, ECT, TAT)',
    summary: 'Decoupled ezal invocation from the help menu into an active administrative runtime mode. Re-routed the 2-page owner suite operations guide exclusively to ehelp, added eexit session termination, and implemented high-precision nanosecond telemetry metrics (ETA, ECT, TAT) with animated heading glyphs and custom bullet points.',
    whatsNew: [
      {
        title: 'Active Ezal / Eval Runtime Mode',
        desc: 'Typing ezal or eval enters administrative session mode, presenting authorization status, developer tag, and live execution telemetry.'
      },
      {
        title: 'Dedicated ehelp Operations Command',
        desc: 'The 2-page interactive Ezal Owner Suite help manual now triggers cleanly via ehelp (or ezal help).'
      },
      {
        title: 'eexit Session Termination',
        desc: 'Typing eexit terminates administrative mode and delivers execution closeout telemetry.'
      },
      {
        title: 'Native Bot Owner Evaluator',
        desc: 'Direct eval <code> execution with async support, token sanitization, and nanosecond benchmarking.'
      }
    ],
    improvements: [
      {
        title: 'ETA, ECT & TAT Nanosecond Telemetry',
        desc: 'Engineered hardware & gateway latency benchmarks: ETA (Execution Time Actual), ECT (Execution Compute Time), and TAT (Turnaround Time).'
      }
    ]
  },
  {
    date: '20 November 2026',
    version: 'v3.1.1',
    headline: 'Universal Modular MongoDB Cloud Sync: Counting, Tickets, Rates, Media, Auto-React, Triggers & Burn Rooms',
    summary: 'Extended the MongoDB cloud synchronization architecture with dedicated collections and explicit schema mappings for all interactive bot systems: counting engines, edit rating bound channels and reviews, ticket system lifecycle states, media downloader channels, auto-react emoji matrices, autoresponders and custom triggers, ephemeral !burn rooms, quote channels, and sticky messages. Fully integrated into the Ezal Owner Suite.',
    whatsNew: [
      {
        title: 'Universal Interactive Systems Cloud Coverage',
        desc: 'Dedicated MongoDB collections for counting channels, tickets, triggers, rate edits, burn rooms, auto-reacts, and sticky messages.'
      },
      {
        title: 'Ezal Owner Suite MongoDB Integration',
        desc: 'Direct ezal mongo, ezal mongo sync, and ezal mongo pull commands documented in interactive 2-page Ezal Owner Suite help menus.'
      },
      {
        title: 'Cross-Host Zero-Loss Hydration',
        desc: 'Complete bidirectional restoration restores all 73 guilds, active tickets, counting streaks, and channel bindings on bot startup.'
      }
    ],
    improvements: [
      {
        title: 'Automated DNS SRV Fallback',
        desc: 'Built-in resilient DNS resolver ensures error-free connection to MongoDB Atlas clusters across all VPS and cloud environments.'
      },
      {
        title: 'Detailed Cloud Telemetry Panel',
        desc: '!db mongo and ezal mongo now display live granular document counts across all 12 tracked sub-systems.'
      }
    ],
    fixes: [
      {
        title: 'Channel Setup Binding Synchronization',
        desc: 'Guaranteed seamless restoration of rateChannelId, mediaChannelId, quoteChannelId, and autoReacts into guild configurations.'
      }
    ]
  },
  {
    date: '20 November 2026',
    version: 'v3.1.0',
    headline: 'Real-Time MongoDB Cloud Database Persistence & Cross-Host Auto-Synchronization Engine',
    summary: 'Engineered high-velocity MongoDB Atlas cloud persistence pipeline that mirrors all 73 guilds, counting engines, channel setups (welcome, leave, JTC, server stats, tickets, verification), and member statistics into cloud collections. Delivers automated zero-downtime cross-host migration: setting MONGODB_URI instantly hydrates and keeps all server data synchronized across any hosting server.',
    whatsNew: [
      {
        title: 'Full MongoDB Cloud Synchronization',
        desc: 'All guild configurations, counting channels, server setups, and SQLite stats tables automatically stream to MongoDB in real time.'
      },
      {
        title: 'Zero-Effort Host Migrations',
        desc: 'Deploying Athena Prime on any new VPS or panel automatically hydrates all data from MongoDB on startup with zero file transfers needed.'
      },
      {
        title: 'Dedicated Mongo Admin Command',
        desc: 'Introduced !db mongo sync and !db mongo pull to inspect cloud health, document counts, and trigger manual two-way synchronization.'
      }
    ],
    improvements: [
      {
        title: 'Counting & Setup Preservation',
        desc: 'Guaranteed 100% cloud persistence for active counting channels, streaks, high scores, and modular channel bindings.'
      },
      {
        title: 'Debounced Microsecond Write Batching',
        desc: 'Non-blocking bulkWrite operations ensure zero latency on Discord message and antinuke event loops while maintaining real-time cloud sync.'
      }
    ],
    fixes: [
      {
        title: 'Cross-Host Data Desynchronization',
        desc: 'Eliminated the risk of losing configurations or stats during hosting server migrations by anchoring all persistence to MongoDB cloud.'
      }
    ],
    tip: 'Add MONGODB_URI=mongodb+srv://... to your .env to link your bot to a free MongoDB Atlas cluster for permanent cloud persistence.'
  },
  {
    date: '20 November 2026',
    version: 'v3.0.5',
    headline: 'Zero-Touch Cloud Database Restore Streamlining & Fallback Optimization',
    summary: 'Enhanced the database admin suite (!db restore / /db restore) to automatically default to pulling the latest persistent Discord cloud backup snapshot when invoked without arguments or attachments, eliminating parameter friction during server and host recoveries.',
    whatsNew: [
      {
        title: 'Zero-Arg Cloud Restore Default',
        desc: 'Executing !db restore now directly resolves and hot-reloads the latest persistent database snapshot across all 73 guilds with zero restart required.'
      }
    ],
    improvements: [
      {
        title: 'Streamlined Disaster Recovery',
        desc: 'Removed extra argument hurdles, ensuring instant recovery from Discord cloud storage whether typing !db restore, !db restore latest, or using slash commands.'
      }
    ],
    fixes: [
      {
        title: 'Restore Options Ambiguity',
        desc: 'Addressed the condition where bare !db restore returned an options warning embed instead of immediately restoring from cloud storage.'
      }
    ],
    tip: 'Run !db restore or !db restore latest at any time to hot-reload all server settings from your secure cloud backups.'
  },
  {
    date: '19 November 2026',
    version: 'v3.0.4',
    headline: 'Dependency Tree Sanitization & Deprecated Package Pruning for Hosting Environments',
    summary: 'Purged defunct and unpublished NPM dependencies (@mrnima/instagram-downloader) from package.json and package-lock.json that were triggering E404 install aborts in automated Pterodactyl container deployments. Streamlined media download fallbacks with native multi-strategy pipeline.',
    whatsNew: [
      {
        title: 'E404 Dependency Pruning',
        desc: 'Completely removed deleted @mrnima/instagram-downloader package from manifests to restore 100% clean automated npm install execution.'
      }
    ],
    improvements: [
      {
        title: 'Clean Headless Deployment',
        desc: 'Ensures npm install and Pterodactyl Docker entrypoints install all core packages (discord.js, @discordjs/voice, undici) without registry 404 blocks.'
      }
    ],
    fixes: [
      {
        title: 'ERR_MODULE_NOT_FOUND on Discord.js',
        desc: 'Resolved the issue where aborted npm install execution left node_modules incomplete, causing startup failure.'
      }
    ],
    tip: 'All dependencies are fully vetted and verified against the public npm registry.'
  },
  {
    date: '10 November 2026',
    version: 'v3.0.3',
    headline: 'Military-Grade Execution Priority: Ban-First Architecture with TCP_NODELAY & Zero-Contention Sockets',
    summary: 'Re-architected anti-nuke combat execution to enforce strict Ban-First prioritization across all raw WebSocket and REST event pathways. The hostile ban strike is dispatched onto the wire at 0ms over pre-warmed TCP_NODELAY TLS sockets to evict the attacker before their 2nd API request can land, while channel/role restoration requests are strictly sequenced to execute only after the ban has settled.',
    whatsNew: [
      {
        title: 'Ban-First, Fix-Second Strict Ordering',
        desc: 'Guaranteed that 100% of network socket bandwidth and API concurrency is dedicated to landing the PUT /bans strike before any channel or role restoration requests are dispatched.'
      },
      {
        title: 'TCP_NODELAY Socket Acceleration',
        desc: 'Disabled Nagle\'s algorithm on all Undici Discord API connections (noDelay: true), eliminating TCP buffering latency for instant packet transmission.'
      }
    ],
    improvements: [
      {
        title: 'Multi-Socket Pre-Warming Daemon',
        desc: 'Upgraded keep-alive ping loop to an 8-second multi-socket cycle, keeping multiple parallel TLS connections permanently pre-connected and hot at the top of the pool.'
      },
      {
        title: 'Zero-Overhead Microtask Telemetry',
        desc: 'Deferred telemetry calculations to background microtasks via queueMicrotask, reducing raw ban execution time to pure network wire latency.'
      }
    ],
    fixes: [
      {
        title: 'Eliminated Socket Contention',
        desc: 'Fixed restoration queue in fastWiretap so channel/role rebuild requests no longer compete with in-flight ban strikes.'
      }
    ],
    tip: 'Attacking nuke bots are evicted before their second request can hit Discord, causing all subsequent attacks to fail with 403 Forbidden.'
  },
  {
    date: '10 November 2026',
    version: 'v3.0.2',
    headline: 'Multi-Vector In-Flight Attack Lockdown Matrix & Absolute Innocent Member Immunity Protocol',
    summary: 'Hardened Athena Prime\'s real-time anti-nuke combat reflex during active hostile attacks. Integrated in-flight raw WebSocket interceptors for rogue webhooks and backdoor invites during lockdown, while establishing a zero-collateral immunity architecture that guarantees innocent members are protected from accidental bans, false positives, and nuke bot mass-ban waves.',
    whatsNew: [
      {
        title: 'In-Flight Webhook Vaporizer',
        desc: 'Intercepts WEBHOOKS_UPDATE on the raw gateway when isGuildUnderAttack is active, instantly deleting newly created rogue webhooks before raid pings can be broadcast.'
      },
      {
        title: 'Attack-Lockdown Backdoor Invite Annihilation',
        desc: 'Vaporizes unauthorized INVITE_CREATE attempts in <1ms during active attacks to block secondary bot/raider infiltration.'
      }
    ],
    improvements: [
      {
        title: 'Innocent Member 0ms Ban Reversal',
        desc: 'Accelerated direct socket rawUnban responses to immediately restore any innocent server members targeted by rogue nuke bot mass-ban routines.'
      },
      {
        title: 'Complete Collateral Damage Immunity',
        desc: 'Isolated condemnation exclusively to confirmed attacker executor IDs, ensuring regular members chatting or joining are never penalized.'
      }
    ],
    fixes: [
      {
        title: 'Zero-Tolerance Active Combat Lockdown',
        desc: 'Extended isGuildUnderAttack multi-vector reflex across spam channels, spam roles, rogue webhooks, and backdoor invites simultaneously.'
      }
    ],
    tip: 'Innocent members are completely immune to anti-nuke actions; only confirmed hostile executors are condemned and evicted.'
  },
  {
    date: '10 November 2026',
    version: 'v3.0.1',
    headline: 'Wiretap Privilege Escalation Guard Precision & Benign Role Update False-Positive Neutralization',
    summary: 'Resolved a critical false-positive vulnerability in the fastWiretap raw WebSocket defense engine where standard member autoroles, onboarding roles, or benign role updates assigned to newly joined members triggered erroneous privilege escalation condemnation bans. Implemented deep permission inspection checking for dangerous administrative permissions before engaging defensive strikes.',
    whatsNew: [
      {
        title: 'Granular Role Change Permission Inspector',
        desc: 'Wiretap engine now parses $add changes during GUILD_AUDIT_LOG_ENTRY_CREATE (MemberRoleUpdate) to inspect whether assigned roles hold dangerous permissions (Administrator, ManageGuild, BanMembers, ManageRoles, etc.) or whether the target is exploit-tainted before classifying as privilege escalation.'
      },
      {
        title: 'Benign Autorole Fast-Exit',
        desc: 'Normal, non-administrative role grants (autoroles, onboarding tags, cosmetic/color roles, level rewards) immediately bypass anti-nuke condemnation with zero false positives.'
      }
    ],
    improvements: [
      {
        title: 'Accurate Target Role Stripping',
        desc: 'When genuine privilege escalation attacks occur, raw REST role-stripping immediately strips the dangerous role from the recipient at 0ms over pre-warmed sockets.'
      },
      {
        title: 'Safe Role Removal Handling',
        desc: 'Addressed audit log events for role removals ($remove), ensuring role removals never falsely flag as privilege escalation attacks.'
      }
    ],
    fixes: [
      {
        title: 'Newly Joined Member False Ban Fix',
        desc: 'Fixed the bug where newly joined server members receiving a default member role from an autorole bot or onboarding mechanism were condemned and banned with [ATHENA WIRETAP] ⚡ Privilege Escalation Recipient Banned.'
      }
    ],
    tip: 'Autoroles and standard onboarding roles can now be safely assigned by third-party bots and integrations without wiretap interference.'
  },
  {
    date: '10 November 2026',
    version: 'v3.0.0',
    headline: 'Major Performance Milestone: Heap Memory Leak Eradication & Hot-Path Latency Optimizations',
    summary: 'Conducted a deep comprehensive architectural audit across Athena Prime\'s runtime, eliminating long-term memory leaks in high-frequency event listeners, bounding ephemeral caches with LRU eviction, and streamlining hot-path voice state event loops with static module bindings.',
    whatsNew: [
      {
        title: 'Unreferenced Background Memory Sweepers',
        desc: 'Implemented unreferenced 60-second periodic garbage collection across messageCreate tracking maps (spamCache, spamCooldown, massMentionCache, globalBanCooldowns, masterPingCooldowns).'
      },
      {
        title: 'Bounded Anti-Scam LRU Cache',
        desc: 'Protected flaggedMessages with an automatic 2,000-entry LRU ring buffer, preventing unbounded Set growth during scam waves.'
      },
      {
        title: 'Static Voice Module Dispatching',
        desc: 'Replaced dynamic await import() calls in voiceStateUpdate with static top-level bindings for musicManager and soundboardEngine, cutting voice event cycle latency.'
      }
    ],
    improvements: [
      {
        title: 'Command Key Allocation Caching',
        desc: 'Cached commandMap key arrays to eliminate repetitive multi-hundred-element heap allocations during fuzzy unknown command lookups.'
      },
      {
        title: 'Guild Join Velocity Pruning',
        desc: 'Added automated sweeper to guildJoinTracker in guildMemberAdd to cleanly evict inactive guild keys from RAM.'
      }
    ],
    fixes: [
      {
        title: 'Unknown Command Advisory Heading',
        desc: 'Updated fuzzy fallback embeds to strictly adhere to custom exclamation outline heading formatting.'
      }
    ],
    tip: 'Monitor real-time heap stability and event loop performance using !liveops or !bi.'
  },
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
