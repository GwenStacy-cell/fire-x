import { MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI, NAV_EMOJI_IDS } from '../utils/emojis.js';
import { sanitizeCV2Payload } from '../cv2.js';
import os from 'os';

export const commands = [
  {
    name: 'about',
    description: 'Learn about Athena Prime and its military-grade security & anti-nuke architecture',
    aliases: ['aboutathena', 'botabout', 'whoisathena'],
    category: 'utility',

    async executePrefix(message) {
      await this.execute(message);
    },

    async executeSlash(interaction) {
      await this.execute(interaction);
    },

    async execute(ctx) {
      const client = ctx.client;
      const uptime = Math.floor(process.uptime());
      const d = Math.floor(uptime / 86400);
      const h = Math.floor((uptime % 86400) / 3600);
      const m = Math.floor((uptime % 3600) / 60);
      const s = uptime % 60;
      const uptimeStr = `${d}d ${h}h ${m}m ${s}s`;

      const totalServers = client.guilds.cache.size;
      const totalUsers = typeof client.guilds.cache.reduce === 'function'
        ? client.guilds.cache.reduce((acc, guild) => acc + (guild.memberCount || 0), 0)
        : Array.from(client.guilds.cache.values()).reduce((acc, g) => acc + (g.memberCount || 0), 0);
      const totalChannels = client.channels.cache.size;

      let uniqueCommands = 92;
      try {
        const { commandMap } = await import('./loader.js');
        if (commandMap) uniqueCommands = new Set(commandMap.values()).size;
      } catch {}

      let ownerTag = `<@1509084068619489331>`;
      let ownerName = `Dev Prince`;
      try {
        if (!client.application.owner) await client.application.fetch();
        const owner = client.application.owner;
        if (owner) {
          if (owner.members) {
            ownerTag = `<@${owner.ownerId}>`;
          } else {
            ownerTag = `<@${owner.id}>`;
            ownerName = owner.username;
          }
        }
      } catch {}

      // Container 1: Overview & Military-Grade Architecture
      const container1 = {
        type: 17,
        components: [
          {
            type: 10,
            content: `# ${getRandomHeadingGlyph()} Athena Prime — Enterprise Sentinel | ${TICK_EMOJI}\n` +
                     `> -# <a:uptime:1552608831060844575> **Autonomous High-Velocity Security & Microsecond Combat Intelligence**\n` +
                     `> -# ${BULLET_EMOJI} Athena Prime is an enterprise-grade autonomous security, moderation, and infrastructure governance sentinel engineered for mission-critical community defense.`
          },
          {
            type: 9,
            components: [{
              type: 10,
              content:
                `> -# ${BULLET_EMOJI} **Identity :** **Athena Prime** | **Version :** \`v2.9.7\`\n` +
                `> -# ${BULLET_EMOJI} **Chief Architect :** **${ownerName}** (${ownerTag})\n` +
                `> -# ${BULLET_EMOJI} **Engine :** Node.js \`${process.version}\` | Discord.js \`v14.14.1\`\n` +
                `> -# ${BULLET_EMOJI} **Uptime :** \`${uptimeStr}\` | **Latency :** \`${client.ws.ping}ms\`\n` +
                `> -# ${BULLET_EMOJI} **Cluster :** \`${totalServers.toLocaleString()} servers\` | \`${totalUsers.toLocaleString()} members\`\n` +
                `> -# ${BULLET_EMOJI} **Catalog :** \`${uniqueCommands} verified commands\` loaded`
            }],
            accessory: { type: 11, media: { url: client.user.displayAvatarURL() } }
          },
          { type: 14, divider: true },
          {
            type: 10,
            content:
              `### **I. Military-Grade Anti-Nuke Architecture**\n` +
              `> -# <a:uptime:1552608831060844575> **Zero-Day Interception & Single-Strike Line-Rate Defense Engine**\n` +
              `> -# ${BULLET_EMOJI} **Zero-Day Bot Eviction :** Intercepts \`GUILD_MEMBER_ADD\` at 0ms TCP layer. Rogue bots are struck with an instant \`rawBan\` in \`<1ms\` before establishing a heartbeat.\n` +
              `> -# ${BULLET_EMOJI} **Single-Strike Sub-12ms Direct Ban :** Dedicates 100% of socket bandwidth to immediate \`rawBan\` (\`PUT /bans\`) with pre-compiled JSON. Nukers receive \`403 Forbidden\` on their 2nd attempt.\n` +
              `> -# ${BULLET_EMOJI} **4-Tier TCP Wiretap Hook :** Direct \`client.on('raw')\` packet capture at 0ms before Discord.js event dispatching.\n` +
              `> -# ${BULLET_EMOJI} **Pre-Warmed TLS Engine :** 120 Undici persistent sockets to \`discord.com\` with a 25s keep-alive heartbeat loop (~50ms saved).\n` +
              `> -# ${BULLET_EMOJI} **IPv4-First DNS Routing :** Enforces \`dns.setDefaultResultOrder('ipv4first')\`, eliminating dual-stack IPv6 DNS fallback delays (saving 15-30ms).\n` +
              `> -# ${BULLET_EMOJI} **Ground-Truth Restoration :** Continuous live RAM snapshots indexing channels and roles with zero-duplicate rebuild.`
          }
        ]
      };

      // Container 2: Defense Spectrum & Controls
      const container2 = {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `### **II. Automated Security Shields & Governance Spectrum**\n` +
              `> -# ${BULLET_EMOJI} **28 Armed Antinuke Shields :** Protection for Channels, Roles, Webhooks, Bots, Server Updates, Bans, Kicks, and Automod.\n` +
              `> -# ${BULLET_EMOJI} **In-Flight Combat Priority :** Restorations pause automatically while bans settle, guaranteeing zero API contention during attacks.\n` +
              `> -# ${BULLET_EMOJI} **Quarantine Facility :** Compromised accounts are stripped and isolated in an automated quarantine zone.\n` +
              `> -# ${BULLET_EMOJI} **Dual Persistence Sentinels :** Enforces \`Athena Firewall\` and \`Athena Unbypassable\` roles against unauthorized demotions.\n` +
              `> -# ${BULLET_EMOJI} **Vanity & Invite Protection :** Reclaims vanity URLs at 0ms and vaporizes dangerous invites in \`<1ms\`.\n\n` +
              `### **III. Operational Monitoring & Quick Controls**\n` +
              `> -# ${BULLET_EMOJI} \`!combatops\` \u2014 Military-grade live combat telemetry & single-strike timeline breakdown.\n` +
              `> -# ${BULLET_EMOJI} \`!liveops\` \u2014 Real-time engineering monitor covering V8 runtime, socket pools, and speeds.\n` +
              `> -# ${BULLET_EMOJI} \`!help\` \u2014 Interactive command catalog across all 376+ subsystems.\n` +
              `> -# ${BULLET_EMOJI} \`!botstats\` (\`!bi\`) \u2014 Technical statistics, cluster analytics, and resource footprints.`
          },
          { type: 14, divider: true },
          {
            type: 10,
            content: `-# **Athena Prime | Military-Grade Defense Matrix | Autonomous Governance**`
          }
        ]
      };

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('about:combat')
          .setLabel('Combat Telemetry')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('about:liveops')
          .setLabel('LiveOps Monitor')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('about:close')
          .setEmoji(NAV_EMOJI_IDS.DELETE)
          .setStyle(ButtonStyle.Secondary)
      );

      const payload = sanitizeCV2Payload({
        components: [container1, container2, row],
        flags: MessageFlags.IsComponentsV2
      });

      if (ctx.isCommand && ctx.isCommand()) {
        if (ctx.deferred || ctx.replied) return ctx.editReply(payload);
        return ctx.reply(payload);
      }
      return ctx.reply(payload);
    }
  }
];
