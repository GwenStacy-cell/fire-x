import { Routes } from 'discord.js';
import db from '../database.js';
import embed from '../embed.js';
import { getSafeUserAvatar, logToSecurityChannel, isBotOwnerSync } from '../utils/helpers.js';
import { TICK_EMOJI, BULLET_EMOJI, UPTIME_EMOJI, getRandomHeadingGlyph } from '../utils/emojis.js';

export default {
  name: 'messageReactionAdd',
  async execute(reaction, user) {
    if (user.bot) return;

    // Fetch partials if needed
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (error) {
        console.error('Something went wrong when fetching the reaction:', error);
      }
    }

    // ==========================================
    // HONEYPOT REACTION INTERCEPT
    // ==========================================
    const guild = reaction.message.guild;
    if (guild) {
      const config = db.getGuildConfig(guild.id);
      if (config && config.honeypotChannelId && reaction.message.channelId === config.honeypotChannelId) {
        reaction.users.remove(user.id).catch(() => null);

        const isOwner = isBotOwnerSync(user.id) || user.id === guild.ownerId || db.isExtraOwner(guild.id, user.id) || user.id === guild.client.user.id;
        if (!isOwner) {
          const punishment = (config.honeypotPunishment || config.honeypotAction || 'ban').toLowerCase();
          let actionTaken = 'Instant Direct Ban (<10ms)';

          if (punishment === 'timeout') {
            const timeoutUntil = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString();
            guild.client.rest.patch(Routes.guildMember(guild.id, user.id), {
              body: { communication_disabled_until: timeoutUntil },
              reason: '[ATHENA HONEYPOT] Reaction Canary Triggered (28D Timeout)'
            }).catch(() => null);
            actionTaken = 'Maximum 28-Day Timeout (<10ms)';
          } else if (punishment === 'kick') {
            guild.client.rest.delete(Routes.guildMember(guild.id, user.id), {
              reason: '[ATHENA HONEYPOT] Reaction Canary Triggered (Kicked)'
            }).catch(() => null);
            actionTaken = 'Instant Server Kick (<10ms)';
          } else {
            // Instant Direct Ban (Single API call, zero role-strip overhead)
            guild.client.rest.put(Routes.guildBan(guild.id, user.id), {
              body: { delete_message_seconds: 604800 },
              reason: '[ATHENA HONEYPOT] Reaction Canary Triggered (Banned)'
            }).catch(() => null);
          }

          logToSecurityChannel(guild, {
            content: `-# <a:uptime:1552608831060844575> **Honeypot Trap Triggered (Reaction)** | <a:03_tick_circle:1565665642084827206>\n` +
                     `-# ${BULLET_EMOJI} **Member:** <@${user.id}> \`(${user.id})\`\n` +
                     `-# ${BULLET_EMOJI} **Channel:** <#${config.honeypotChannelId}>\n` +
                     `-# ${BULLET_EMOJI} **Action Taken:** \`${actionTaken}\``
          }).catch(() => null);
          return;
        }
      }
    }

    // ==========================================
    // STARBOARD SYSTEM
    // ==========================================
    if (reaction.emoji.name === '⭐') {
      const config = db.getGuildConfig(reaction.message.guildId);
      if (config && config.starboardChannelId) {
        const starboardChannel = reaction.message.guild.channels.cache.get(config.starboardChannelId);
        if (starboardChannel) {
          const threshold = config.starboardThreshold || 3;
          if (reaction.count >= threshold) {
            if (!reaction.client.starboardMessages) reaction.client.starboardMessages = new Set();
            if (!reaction.client.starboardMessages.has(reaction.message.id)) {
              reaction.client.starboardMessages.add(reaction.message.id);
              
              const starEmbed = {
                color: 0xffac33,
                author: {
                  name: reaction.message.author.tag,
                  icon_url: getSafeUserAvatar(reaction.message.author)
                },
                description: reaction.message.content + `\n\n[**Jump to message**](${reaction.message.url})`,
                timestamp: new Date().toISOString(),
                footer: { text: `⭐ ${reaction.count} | ID: ${reaction.message.id}` }
              };
              
              if (reaction.message.attachments.size > 0) {
                const img = reaction.message.attachments.first();
                if (img.contentType && img.contentType.startsWith('image/')) {
                  starEmbed.image = { url: img.url };
                }
              }
              
              starboardChannel.send({
                content: `⭐ **${reaction.count}** <#${reaction.message.channelId}>`,
                embeds: [starEmbed]
              }).catch(() => null);
            }
          }
        }
      }
    }

    const menu = db.getReactionRoleMenu(reaction.message.id);
    if (!menu) return;

    // Resolve Emoji Identifier (unicode or custom ID)
    const emojiIdOrName = reaction.emoji.id || reaction.emoji.name;
    const roleId = menu.mappings[emojiIdOrName];
    if (!roleId) return;

    try {
      const guild = reaction.message.guild || await reaction.client.guilds.fetch(menu.guildId).catch(() => null);
      if (!guild) return;

      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) return;

      let role = guild.roles.cache.get(roleId);
      if (!role) {
        // Attempt to fetch if not in cache
        const fetchedRoles = await guild.roles.fetch();
        role = fetchedRoles.get(roleId);
      }
      if (!role) return;

      await member.roles.add(role, `Reaction Role: ${menu.title}`);

      const config = db.getGuildConfig(guild.id);
      if (config.rrDmsEnabled) {
        await user.send({
          embeds: [embed.success('Role Granted', `You have been given the **${role.name}** role in **${guild.name}**.`)]
        }).catch(() => null);
      }
    } catch (err) {
      console.error('Failed to grant reaction role:', err);
      // Attempt to DM the user about the error
      await user.send({
        embeds: [embed.error('Reaction Role Error', `I was unable to give you the role in **${reaction.message.guild?.name || 'the server'}**. This usually happens because my bot role is lower than the role you are trying to get, or I am missing the "Manage Roles" permission.`)]
      }).catch(() => null);
    }
  }
};
