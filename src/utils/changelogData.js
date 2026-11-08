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
