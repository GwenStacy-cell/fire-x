import db from '../database.js';
import { MessageFlags } from 'discord.js';
import { 
  getRandomHeadingGlyph, 
  TICK_EMOJI, 
  BULLET_EMOJI 
} from './emojis.js';

// Base formula constants (making it hard to level up)
const BASE_XP = 100;
const MULTIPLIER = 100;

export function calculateXpForLevel(level) {
  // Formula: 100 * (level^2) + 100 * level
  return BASE_XP * Math.pow(level, 2) + MULTIPLIER * level;
}

export function calculateLevel(xp) {
  // Inverse of the formula to find the level from total XP
  let level = 0;
  while (calculateXpForLevel(level + 1) <= xp) {
    level++;
  }
  return level;
}

export function getRandomXp(min = 15, max = 25) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function getRoleMultiplier(guildId, member) {
  const system = db.getXpSystem(guildId);
  if (!system || !system.enabled) return 1;

  let maxMultiplier = 1;
  for (const [roleId, mult] of Object.entries(system.multipliers || {})) {
    if (member?.roles?.cache?.has(roleId)) {
      if (mult > maxMultiplier) maxMultiplier = mult;
    }
  }
  return maxMultiplier;
}

export async function processLevelUp(client, guild, member, newLevel, currentChannel = null) {
  if (!guild || !member) return;
  const system = db.getXpSystem(guild.id);
  if (!system || !system.enabled) return;

  // 1. Role Rewards
  let rewardGiven = false;
  let rewardRole = null;
  const roleRewardId = system.roleRewards?.[String(newLevel)];
  if (roleRewardId) {
    const role = guild.roles.cache.get(roleRewardId) || await guild.roles.fetch(roleRewardId).catch(() => null);
    if (role) {
      await member.roles.add(role).catch(() => null);
      rewardGiven = true;
      rewardRole = role;
    }
  }

  // 2. Announcements
  const mode = system.announceMode || (system.announceChannelId ? 'channel' : 'current');
  if (mode === 'disabled') return;

  // When texting in the server, always post in that active chat channel itself!
  let targetSend = currentChannel;
  if (!targetSend) {
    if (mode === 'dm') {
      targetSend = member;
    } else if (system.announceChannelId) {
      targetSend = guild.channels.cache.get(system.announceChannelId) || await guild.channels.fetch(system.announceChannelId).catch(() => null);
    }
  }

  if (!targetSend) return;

  try {
    const userXp = db.getUserXp(guild.id, member.id);
    const requiredXp = calculateXpForLevel(newLevel + 1);
    const remainingXp = Math.max(0, requiredXp - userXp.xp);

    // Fetch linked XP stats channel (from database configuration)
    const targetChannelId = system.cmdChannelId || system.announceChannelId;
    let cmdChannel = null;
    if (targetChannelId) {
      cmdChannel = guild.channels.cache.get(targetChannelId) || await guild.channels.fetch(targetChannelId).catch(() => null);
    }

    let xpStatsLinkText = '';
    if (cmdChannel) {
      xpStatsLinkText = `<#${cmdChannel.id}>`;
    } else if (currentChannel) {
      xpStatsLinkText = `\`!rank\` (bind channel with \`!xp channel #channel\`)`;
    } else {
      xpStatsLinkText = `\`!rank\``;
    }

    let content = `# ${getRandomHeadingGlyph()} Level Ascended | ${TICK_EMOJI}\n` +
      `> -# ${BULLET_EMOJI} <@${member.id}> reached **Level ${newLevel}**!\n`;

    if (rewardGiven && rewardRole) {
      content += `> -# ${BULLET_EMOJI} **Role Reward:** <@&${rewardRole.id}>\n`;
    }

    content += `> -# ${BULLET_EMOJI} **XP Stats & Rank:** ${xpStatsLinkText}\n` +
      `> -# ${BULLET_EMOJI} **Next Milestone:** \`${remainingXp.toLocaleString()} XP\` to **Level ${newLevel + 1}**`;

    const avatarUrl = member.displayAvatarURL ? member.displayAvatarURL({ extension: 'png', size: 128 }) : member.user?.displayAvatarURL?.({ extension: 'png', size: 128 });

    const innerComponents = [];
    if (avatarUrl) {
      innerComponents.push({
        type: 9,
        components: [{ type: 10, content }],
        accessory: {
          type: 11,
          media: { url: avatarUrl }
        }
      });
    } else {
      innerComponents.push({ type: 10, content });
    }

    // Add action buttons
    const actionButtons = [];
    if (cmdChannel) {
      actionButtons.push({
        type: 2,
        style: 5,
        label: 'XP Stats Channel',
        url: `https://discord.com/channels/${guild.id}/${cmdChannel.id}`
      });
    }
    actionButtons.push({
      type: 2,
      style: 2,
      custom_id: `xp_view_rank_${member.id}`,
      label: 'View Rank Card'
    });

    innerComponents.push({ type: 14, divider: true });
    innerComponents.push({
      type: 1,
      components: actionButtons
    });

    const container = {
      type: 17,
      accent_color: 0x5865F2,
      components: innerComponents
    };

    await targetSend.send({
      content: `<@${member.id}>`,
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { users: [member.id] }
    }).catch(async (err) => {
      console.warn('[XP] Failed to dispatch CV2 level container, falling back to formatted text:', err.message);
      await targetSend.send({
        content: `<@${member.id}>\n${content}`,
        allowedMentions: { users: [member.id] }
      }).catch(() => null);
    });
  } catch (err) {
    console.error('[XP] Level up announcement error:', err);
  }
}
