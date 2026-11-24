import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI, WRONG_EMOJI, WARN_EMOJI } from '../utils/emojis.js';
import { PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelSelectMenuBuilder, ChannelType, AuditLogEvent } from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';
import { convertMp4ToGif, uploadGifToDiscord } from '../utils/mediaConverter.js';
import { isBotOwnerSync, isExtraOwnerOrHigher, cleanDisplayName, getSafeUserAvatar, getSafeGuildIcon, isValidImageUrl } from '../utils/helpers.js';
import { resolveMediaUrl, isPinterestUrl } from '../utils/pinterest.js';

// ============================================================
// ORDINAL NUMBER HELPER (1st, 2nd, 3rd, 142nd...)
// ============================================================
function getOrdinal(n) {
  const num = parseInt(n, 10);
  if (isNaN(num)) return String(n || 0);
  const s = ['th', 'st', 'nd', 'rd'];
  const v = num % 100;
  return num + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ============================================================
// COMPREHENSIVE PLACEHOLDER RESOLVER
// Supports {membercount}, {user}, {server}, {avatar}, {ordinal}, etc.
// ============================================================
export function resolvePlaceholders(text, memberOrUser, guildParam = null, cfg = {}, extraData = {}) {
  if (!text || typeof text !== 'string') return '';
  if (!memberOrUser) return text;

  const guild = guildParam || memberOrUser.guild || memberOrUser.client?.guilds?.cache?.get(memberOrUser.guildId) || null;
  const user = memberOrUser.user || memberOrUser;
  const username = cleanDisplayName(user?.username || 'User');
  const displayName = cleanDisplayName(memberOrUser?.displayName || username);
  const userId = memberOrUser?.id || user?.id || '';
  const tag = user?.tag || (user?.discriminator && user.discriminator !== '0' ? `${user.username}#${user.discriminator}` : user?.username) || username;

  let userFormat = userId ? `<@${userId}>` : username;
  if (cfg.nameFormat === 'user_link' && userId) {
    userFormat = `[${username}](https://discord.com/users/${userId})`;
  } else if (cfg.nameFormat === 'nick_link' && userId) {
    userFormat = `[${displayName}](https://discord.com/users/${userId})`;
  }

  const avatarUrl = getSafeUserAvatar(memberOrUser, 256);
  const serverIcon = getSafeGuildIcon(guild, 256) || '';
  const memberCount = guild?.memberCount || guild?.members?.cache?.size || 0;
  const countStr = String(memberCount);
  const ordinalStr = getOrdinal(memberCount);
  const serverName = guild?.name || 'Server';
  const serverId = guild?.id || '';
  const ownerId = guild?.ownerId || '';
  const ownerMention = ownerId ? `<@${ownerId}>` : 'Unknown';

  let userCreated = user?.createdTimestamp || user?.createdAt?.getTime?.();
  if (!userCreated && user?.id) {
    try {
      userCreated = Number((BigInt(user.id) >> 22n) + 1420070400000n);
    } catch {}
  }
  userCreated = userCreated || Date.now();

  const memberJoined = memberOrUser?.joinedTimestamp || memberOrUser?.joinedAt?.getTime?.() || Date.now();
  const createdTs = Math.floor(userCreated / 1000);
  const joinedTs = Math.floor(memberJoined / 1000);
  const leaveReason = extraData?.leaveReason || 'Left on will';

  return text
    // 1. Compound / Multi-word Placeholders (longer tokens replaced first)
    .replace(/\{server\.membercount\}/gi, countStr)
    .replace(/\{server\.member_count\}/gi, countStr)
    .replace(/\{server\.members\}/gi, countStr)
    .replace(/\{server\.count\}/gi, countStr)
    .replace(/\{guild\.membercount\}/gi, countStr)
    .replace(/\{guild\.member_count\}/gi, countStr)
    .replace(/\{guild\.members\}/gi, countStr)
    .replace(/\{guild\.count\}/gi, countStr)
    .replace(/\{membercount\}/gi, countStr)
    .replace(/\{member_count\}/gi, countStr)
    .replace(/\{members\}/gi, countStr)
    .replace(/\{ordinal_membercount\}/gi, ordinalStr)
    .replace(/\{ordinal_count\}/gi, ordinalStr)
    .replace(/\{ordinal\}/gi, ordinalStr)

    // 2. User Placeholders
    .replace(/\{user\.username\}/gi, username)
    .replace(/\{user\.name\}/gi, username)
    .replace(/\{username\}/gi, username)
    .replace(/\{displayname\}/gi, displayName)
    .replace(/\{display_name\}/gi, displayName)
    .replace(/\{nickname\}/gi, displayName)
    .replace(/\{nick\}/gi, displayName)
    .replace(/\{user\.mention\}/gi, userFormat)
    .replace(/\{usermention\}/gi, userFormat)
    .replace(/\{user_mention\}/gi, userFormat)
    .replace(/\{mention\}/gi, userId ? `<@${userId}>` : username)
    .replace(/\{user\.tag\}/gi, tag)
    .replace(/\{usertag\}/gi, tag)
    .replace(/\{tag\}/gi, tag)
    .replace(/\{user\.id\}/gi, userId)
    .replace(/\{userid\}/gi, userId)
    .replace(/\{user\.avatar\}/gi, avatarUrl)
    .replace(/\{useravatar\}/gi, avatarUrl)
    .replace(/\{user_avatar\}/gi, avatarUrl)
    .replace(/\{avatar\}/gi, avatarUrl)
    .replace(/\{user\.created_at\}/gi, `<t:${createdTs}:R>`)
    .replace(/\{created_at\}/gi, `<t:${createdTs}:R>`)
    .replace(/\{created\}/gi, `<t:${createdTs}:R>`)
    .replace(/\{user\.joined_at\}/gi, `<t:${joinedTs}:R>`)
    .replace(/\{joined_at\}/gi, `<t:${joinedTs}:R>`)
    .replace(/\{joined\}/gi, `<t:${joinedTs}:R>`)

    // 2.5. Departure Reason Placeholders
    .replace(/\{leavereason\}/gi, leaveReason)
    .replace(/\{leave_reason\}/gi, leaveReason)
    .replace(/\{reason\}/gi, leaveReason)

    // 3. Server / Guild Placeholders
    .replace(/\{server\.name\}/gi, serverName)
    .replace(/\{guild\.name\}/gi, serverName)
    .replace(/\{servername\}/gi, serverName)
    .replace(/\{server_name\}/gi, serverName)
    .replace(/\{server\.id\}/gi, serverId)
    .replace(/\{guild\.id\}/gi, serverId)
    .replace(/\{serverid\}/gi, serverId)
    .replace(/\{guildid\}/gi, serverId)
    .replace(/\{server\.icon\}/gi, serverIcon)
    .replace(/\{guild\.icon\}/gi, serverIcon)
    .replace(/\{servericon\}/gi, serverIcon)
    .replace(/\{guildicon\}/gi, serverIcon)
    .replace(/\{server\.owner_id\}/gi, ownerId)
    .replace(/\{server\.owner\}/gi, ownerMention)
    .replace(/\{guild\.owner\}/gi, ownerMention)
    .replace(/\{ownerid\}/gi, ownerId)
    .replace(/\{owner\}/gi, ownerMention)
    .replace(/\{server\.boosts\}/gi, String(guild?.premiumSubscriptionCount || 0))
    .replace(/\{boost_count\}/gi, String(guild?.premiumSubscriptionCount || 0))
    .replace(/\{boosts\}/gi, String(guild?.premiumSubscriptionCount || 0))
    .replace(/\{server\.tier\}/gi, String(guild?.premiumTier || 0))
    .replace(/\{tier\}/gi, String(guild?.premiumTier || 0))
    .replace(/\{rolecount\}/gi, String(guild?.roles?.cache?.size || 0))
    .replace(/\{roles\}/gi, String(guild?.roles?.cache?.size || 0))
    .replace(/\{channelcount\}/gi, String(guild?.channels?.cache?.size || 0))
    .replace(/\{channels\}/gi, String(guild?.channels?.cache?.size || 0))

    // 4. Primary Aliases (matched last)
    .replace(/\{user\}/gi, userFormat)
    .replace(/\{member\}/gi, userFormat)
    .replace(/\{server\}/gi, serverName)
    .replace(/\{guild\}/gi, serverName)
    .replace(/\{count\}/gi, countStr)
    .replace(/\{id\}/gi, userId);
}

function resolve(text, member, cfg = {}, extraData = {}) {
  return resolvePlaceholders(text, member, member?.guild, cfg, extraData);
}

// ============================================================
// BUILD EMBED FROM CONFIG
// ============================================================
export function buildWelcomeEmbed(member, cfg, extraData = {}) {
  if (!cfg) return null;
  const isLeave = extraData?.isLeave || Boolean(extraData?.leaveReason);
  const e = new EmbedBuilder();

  // Inherit server accent color from guild configuration
  const guildConfig = member?.guild ? db.getGuildConfig(member.guild.id) : null;
  const accentColor = guildConfig?.accentColor || '#5865F2';
  try {
    const hex = accentColor.replace('#', '');
    const intVal = parseInt(hex, 16);
    e.setColor(!isNaN(intVal) ? intVal : 0x5865F2);
  } catch {
    e.setColor(0x5865F2);
  }

  const user = member?.user || member;
  const userAvatar = getSafeUserAvatar(member, 256);
  const avatarPos = cfg.avatarPos || 'thumbnail';

  if (cfg.from || avatarPos === 'author') {
    try {
      const authorText = (cfg.from ? resolve(cfg.from, member, cfg, extraData) : resolve('{user}', member, cfg, extraData))
        .replace(/<@!?\d+>/g, user?.username || 'User')
        .trim();

      let authorIcon = undefined;
      if (avatarPos === 'author') {
        authorIcon = userAvatar;
      } else if (cfg.fromIcon) {
        const rawIcon = resolve(cfg.fromIcon, member, cfg, extraData);
        if (isValidImageUrl(rawIcon)) authorIcon = rawIcon.trim();
      } else {
        const gIcon = getSafeGuildIcon(member?.guild);
        if (gIcon) authorIcon = gIcon;
      }

      e.setAuthor({
        name: authorText.substring(0, 256) || (isLeave ? 'Goodbye' : 'Welcome'),
        ...(authorIcon && isValidImageUrl(authorIcon) ? { iconURL: authorIcon } : {})
      });
    } catch (err) {}
  }

  if (cfg.title) {
    const t = resolve(cfg.title, member, cfg, extraData);
    if (t) e.setTitle(t.substring(0, 256));
  }

  if (cfg.description) {
    const d = resolve(cfg.description, member, cfg, extraData);
    if (d) e.setDescription(d.substring(0, 4096));
  } else if (!cfg.title && !cfg.from) {
    if (isLeave) {
      const displayName = cleanDisplayName(member?.displayName || user?.displayName || user?.username || 'Member');
      e.setDescription(`**${displayName} has left the server.**`);
    } else {
      e.setDescription(`**Welcome to ${member?.guild?.name || 'the server'}!**`);
    }
  }

  let thumbUrl = null;
  if (cfg.thumbnailUrl) {
    const rawThumb = resolve(cfg.thumbnailUrl, member, cfg, extraData);
    if (isValidImageUrl(rawThumb)) {
      thumbUrl = rawThumb.trim();
    }
  }
  if (!thumbUrl && avatarPos === 'thumbnail') {
    thumbUrl = userAvatar;
  }
  if (thumbUrl && isValidImageUrl(thumbUrl)) {
    try { e.setThumbnail(thumbUrl); } catch {}
  }

  let imageUrl = null;
  if (cfg.image) {
    const rawImage = resolve(cfg.image, member, cfg, extraData);
    if (isValidImageUrl(rawImage)) {
      imageUrl = rawImage.trim();
    }
  } else if (avatarPos === 'image') {
    imageUrl = userAvatar;
  }
  if (imageUrl && isValidImageUrl(imageUrl)) {
    try { e.setImage(imageUrl); } catch {}
  }

  if (cfg.footer || avatarPos === 'footer') {
    try {
      const footerText = cfg.footer ? resolve(cfg.footer, member, cfg, extraData).trim() : (isLeave ? 'Goodbye!' : 'Welcome!');
      let footerIcon = undefined;
      if (avatarPos === 'footer') {
        footerIcon = userAvatar;
      } else if (cfg.footerIcon) {
        const rawFooterIcon = resolve(cfg.footerIcon, member, cfg, extraData);
        if (isValidImageUrl(rawFooterIcon)) footerIcon = rawFooterIcon.trim();
      }

      e.setFooter({
        text: footerText.substring(0, 2048) || (isLeave ? 'Goodbye!' : 'Welcome!'),
        ...(footerIcon && isValidImageUrl(footerIcon) ? { iconURL: footerIcon } : {})
      });
    } catch (err) {}
  }

  if (cfg.timestamp !== false) e.setTimestamp();

  // Leave Details: Account Created, Account Joined, Leave Reason (all together at once)
  if (cfg.showDetails) {
    let userCreated = user?.createdTimestamp || user?.createdAt?.getTime?.();
    if (!userCreated && user?.id) {
      try {
        userCreated = Number((BigInt(user.id) >> 22n) + 1420070400000n);
      } catch {}
    }
    userCreated = userCreated || Date.now();

    const memberJoined = member?.joinedTimestamp || member?.joinedAt?.getTime?.() || Date.now();
    const createdTs = Math.floor(userCreated / 1000);
    const joinedTs = Math.floor(memberJoined / 1000);
    const leaveReason = extraData?.leaveReason || 'Left on will';

    e.addFields([
      { name: 'Account Created', value: `<t:${createdTs}:R>`, inline: true },
      { name: 'Account Joined', value: `<t:${joinedTs}:R>`, inline: true },
      { name: 'Leave Reason', value: `\`${leaveReason}\``, inline: true }
    ]);
  }

  return e;
}

/**
 * Automatically determine the true cause of a member departure:
 * Detects if the member was Kicked, Banned, or Left on Will.
 */
export async function determineLeaveReason(guild, userId) {
  if (!guild || !userId) return 'Left on will';
  try {
    const { getRecentAuditEntry } = await import('../utils/antinuke.js');

    // 1. Check in-memory ring buffer (0ms sub-millisecond check)
    let kickEntry = getRecentAuditEntry(guild.id, AuditLogEvent.MemberKick, userId);
    let banEntry = getRecentAuditEntry(guild.id, AuditLogEvent.MemberBanAdd, userId);

    if (kickEntry) {
      const exec = kickEntry.executor ? cleanDisplayName(kickEntry.executor.displayName || kickEntry.executor.username) : null;
      return exec ? `Kicked by ${exec}` : 'Kicked';
    }
    if (banEntry) {
      const exec = banEntry.executor ? cleanDisplayName(banEntry.executor.displayName || banEntry.executor.username) : null;
      return exec ? `Banned by ${exec}` : 'Banned';
    }

    // 2. Fast check if user is already banned in the guild
    const ban = await guild.bans?.fetch(userId).catch(() => null);
    if (ban) {
      return ban.reason ? `Banned (${ban.reason.slice(0, 40)})` : 'Banned';
    }

    // 3. Brief wait for Discord audit logs to arrive on the REST gateway
    await new Promise(r => setTimeout(r, 450));

    // Re-check ring buffer
    kickEntry = getRecentAuditEntry(guild.id, AuditLogEvent.MemberKick, userId);
    if (kickEntry) {
      const exec = kickEntry.executor ? cleanDisplayName(kickEntry.executor.displayName || kickEntry.executor.username) : null;
      return exec ? `Kicked by ${exec}` : 'Kicked';
    }
    banEntry = getRecentAuditEntry(guild.id, AuditLogEvent.MemberBanAdd, userId);
    if (banEntry) {
      const exec = banEntry.executor ? cleanDisplayName(banEntry.executor.displayName || banEntry.executor.username) : null;
      return exec ? `Banned by ${exec}` : 'Banned';
    }

    // 4. Query Discord Audit Log directly if bot has permissions
    const me = guild.members?.me;
    if (me?.permissions?.has(PermissionFlagsBits.ViewAuditLog)) {
      const audit = await guild.fetchAuditLogs({ limit: 4 }).catch(() => null);
      if (audit) {
        const now = Date.now();
        const kLog = audit.entries.find(e => e.action === AuditLogEvent.MemberKick && e.target?.id === userId && (now - e.createdTimestamp) < 15000);
        if (kLog) {
          const exec = kLog.executor ? cleanDisplayName(kLog.executor.displayName || kLog.executor.username) : null;
          return exec ? `Kicked by ${exec}` : 'Kicked';
        }
        const bLog = audit.entries.find(e => e.action === AuditLogEvent.MemberBanAdd && e.target?.id === userId && (now - e.createdTimestamp) < 15000);
        if (bLog) {
          const exec = bLog.executor ? cleanDisplayName(bLog.executor.displayName || bLog.executor.username) : null;
          return exec ? `Banned by ${exec}` : 'Banned';
        }
      }
    }

    return 'Left on will';
  } catch {
    return 'Left on will';
  }
}

// ============================================================
// SEND MESSAGE
// ============================================================
export async function sendWelcomeMessage(member) {
  const guild = member.guild;
  if (!guild) return;
  const cfg = db.getWelcomeConfig(guild.id);
  if (!cfg?.enabled || !cfg?.channelId) return;
  const channel = guild.channels.cache.get(cfg.channelId) || await guild.channels.fetch(cfg.channelId).catch(() => null);
  if (!channel) return;
  const content = cfg.message ? resolve(cfg.message, member, cfg) : undefined;
  const embedObj = buildWelcomeEmbed(member, cfg);
  const payload = {};
  if (content) payload.content = content;
  if (embedObj) payload.embeds = [embedObj];
  if (!payload.content && !payload.embeds) return;
  await channel.send(payload).catch(err => {
    console.error(`[ATHENA WELCOME] Delivery failed in guild ${guild.id}:`, err?.message || err);
  });
}

export async function sendLeaveMessage(member) {
  const guild = member.guild;
  if (!guild) return;
  const cfg = db.getLeaveConfig(guild.id);
  if (!cfg?.enabled || !cfg?.channelId) return;
  const channel = guild.channels.cache.get(cfg.channelId) || await guild.channels.fetch(cfg.channelId).catch(() => null);
  if (!channel) return;

  const leaveReason = await determineLeaveReason(guild, member.id);
  const extraData = { leaveReason, isLeave: true };

  const content = cfg.message ? resolve(cfg.message, member, cfg, extraData) : undefined;
  const embedObj = buildWelcomeEmbed(member, cfg, extraData);
  const payload = {};
  if (content) payload.content = content;
  if (embedObj) payload.embeds = [embedObj];
  if (!payload.content && !payload.embeds) return;
  await channel.send(payload).catch(err => {
    console.error(`[ATHENA LEAVE] Delivery failed in guild ${guild.id}:`, err?.message || err);
  });
}

// ============================================================
// MANAGER UI
// ============================================================
export function getManagerPanel(guildId, type) {
  const isWelcome = type === 'welcome';
  const cfg = (isWelcome ? db.getWelcomeConfig(guildId) : db.getLeaveConfig(guildId)) || {};
  const label = isWelcome ? 'Welcome' : 'Leave';
  const prefix = isWelcome ? 'welcmgr_' : 'leavmgr_';

  const replyData = cv2.info(
    `${label} Manager`,
    `-# **• Manage settings for your server's ${label.toLowerCase()} messages.**\n\n` +
    `-# **__Current Configuration:__**\n` +
    `-# ${BULLET_EMOJI} **Channel:** ${cfg.channelId ? `<#${cfg.channelId}>` : '`Not Set`'}\n` +
    `-# ${BULLET_EMOJI} **Status:** ${cfg.enabled ? '`Enabled`' : '`Disabled`'}\n` +
    `-# ${BULLET_EMOJI} **Top Text:** ${cfg.message ? `\`${cfg.message.slice(0, 40)}...\`` : '`Not Set`'}\n` +
    `-# ${BULLET_EMOJI} **Author:** ${cfg.from ? `\`${cfg.from.slice(0, 30)}...\`` : '`Not Set`'}\n` +
    `-# ${BULLET_EMOJI} **Title:** ${cfg.title ? `\`${cfg.title.slice(0, 30)}...\`` : '`Not Set`'}\n` +
    `-# ${BULLET_EMOJI} **Description:** ${cfg.description ? `\`${cfg.description.slice(0, 40)}...\`` : '`Not Set`'}\n` +
    `-# ${BULLET_EMOJI} **Image:** ${cfg.image ? '`[Custom Link]`' : '`Not Set`'}\n` +
    `-# ${BULLET_EMOJI} **Footer:** ${cfg.footer ? `\`${cfg.footer.slice(0, 30)}...\`` : '`Not Set`'}\n` +
    `-# ${BULLET_EMOJI} **Name Format:** ${cfg.nameFormat === 'user_link' ? '`Username Link`' : cfg.nameFormat === 'nick_link' ? '`Nickname Link`' : '`Tag (@user)`'}\n` +
    `-# ${BULLET_EMOJI} **Avatar Location:** ${cfg.avatarPos === 'author' ? '`Author Icon`' : cfg.avatarPos === 'footer' ? '`Footer Icon`' : cfg.avatarPos === 'image' ? '`Large Image`' : cfg.avatarPos === 'off' ? '`Hidden`' : '`Thumbnail`'}\n` +
    `-# ${BULLET_EMOJI} **Timestamp:** ${cfg.timestamp !== false ? '`Enabled`' : '`Disabled`'}\n` +
    (!isWelcome ? `-# ${BULLET_EMOJI} **Departure Details:** ${cfg.showDetails ? '`Enabled (Created, Joined, Reason)`' : '`Disabled`'}\n\n` : '\n') +
    `-# **__Live Placeholders & Dynamic Variables:__**\n` +
    `-# ${BULLET_EMOJI} **Counts:** \`{membercount}\` • \`{ordinal}\` *(e.g. 1st, 142nd)* • \`{count}\`\n` +
    `-# ${BULLET_EMOJI} **Member:** \`{user}\` *(ping/link)* • \`{username}\` • \`{displayname}\` • \`{tag}\` • \`{userid}\` • \`{avatar}\`\n` +
    `-# ${BULLET_EMOJI} **Server:** \`{server}\` • \`{serverid}\` • \`{server.icon}\` • \`{owner}\` • \`{boosts}\` • \`{roles}\` • \`{channels}\`\n` +
    `-# ${BULLET_EMOJI} **Times & Status:** \`{created}\` *(account age)* • \`{joined}\` *(join date)*${!isWelcome ? ' • `{reason}` *(leave reason)*' : ''}\n` +
    `-# *Click **Placeholders** button below for the full cheat-sheet & copy-paste templates.*`
  );

  const channelSelectRow = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`${prefix}channel`)
      .setPlaceholder('Select a channel to send messages...')
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
  );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${prefix}text`).setLabel('Top Text').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${prefix}author`).setLabel('Author').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${prefix}title`).setLabel('Title').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${prefix}desc`).setLabel('Description').setStyle(ButtonStyle.Secondary)
  );

  const row2Components = [
    new ButtonBuilder().setCustomId(`${prefix}image`).setLabel('Image').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${prefix}footer`).setLabel('Footer').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${prefix}cycle_avatar`).setLabel('Avatar Location').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${prefix}toggle_time`).setLabel('Toggle Time').setStyle(cfg.timestamp !== false ? ButtonStyle.Success : ButtonStyle.Secondary)
  ];

  if (!isWelcome) {
    row2Components.push(
      new ButtonBuilder()
        .setCustomId(`${prefix}toggle_details`)
        .setLabel('Toggle Details')
        .setStyle(cfg.showDetails ? ButtonStyle.Success : ButtonStyle.Secondary)
    );
  }

  const row2 = new ActionRowBuilder().addComponents(row2Components);

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${prefix}status`).setLabel(cfg.enabled ? 'Disable System' : 'Enable System').setStyle(cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${prefix}cycle_name`).setLabel('Name Format').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${prefix}vars`).setLabel('Placeholders').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${prefix}test`).setLabel('Test Message').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`${prefix}reset`).setLabel('Reset All').setStyle(ButtonStyle.Danger)
  );

  if (replyData.components && replyData.components[0] && replyData.components[0].type === 17) {
    replyData.components[0].components.push(
      channelSelectRow.toJSON(),
      row1.toJSON(),
      row2.toJSON(),
      row3.toJSON()
    );
  } else {
    replyData.components.push(channelSelectRow, row1, row2, row3);
  }
  return replyData;
}

export async function executeWelcomeTest(guild, member, type = 'welcome') {
  const isWelcome = type === 'welcome';
  const cfg = (isWelcome ? db.getWelcomeConfig(guild.id) : db.getLeaveConfig(guild.id)) || {};
  if (!cfg.channelId) {
    return { success: false, error: `Please select a ${type} channel from the dropdown first.` };
  }

  let targetChannel = guild.channels.cache.get(cfg.channelId);
  if (!targetChannel) {
    targetChannel = await guild.channels.fetch(cfg.channelId).catch(() => null);
  }

  if (!targetChannel) {
    return { success: false, error: `Configured channel <#${cfg.channelId}> could not be found.` };
  }

  const testExtra = !isWelcome ? { leaveReason: 'Left on will (Test Preview)', isLeave: true } : {};
  let content = cfg.message ? resolve(cfg.message, member, cfg, testExtra) : undefined;
  let testEmbed = buildWelcomeEmbed(member, cfg, testExtra);

  if (!content && !testEmbed) {
    content = isWelcome
      ? `Hey <@${member.id}>, welcome to **${guild.name}**! (Default test preview)`
      : `**${member.user?.tag || member.displayName}** has left the server. (Default test preview)`;
  }

  const sendPayload = {};
  if (content) sendPayload.content = content;
  if (testEmbed) sendPayload.embeds = [testEmbed];

  try {
    await targetChannel.send(sendPayload);
    return { success: true, channelId: targetChannel.id };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ============================================================
// INTERACTION HANDLERS
// ============================================================
export async function handleWelcomeManagerMenu(interaction) {
  if (!isExtraOwnerOrHigher(interaction.user.id, interaction.guild)) {
    return interaction.reply(cv2.asEphemeral(cv2.danger('Access Denied', 'Only the **Server Owner**, **Extra Owners**, and **Bot Owner** can configure this system.')));
  }
  const guildId = interaction.guild.id;
  const isWelcome = interaction.customId.startsWith('welcmgr_');
  const getConfig = isWelcome ? db.getWelcomeConfig.bind(db) : db.getLeaveConfig.bind(db);
  const setConfig = isWelcome ? db.setWelcomeConfig.bind(db) : db.setLeaveConfig.bind(db);
  const typeStr = isWelcome ? 'welcome' : 'leave';

  const cfg = getConfig(guildId) || {};
  const selectedChannel = interaction.values[0];

  setConfig(guildId, { ...cfg, channelId: selectedChannel });
  
  await interaction.update(getManagerPanel(guildId, typeStr));
}

export async function handleWelcomeManagerButton(interaction) {
  if (!isExtraOwnerOrHigher(interaction.user.id, interaction.guild)) {
    return interaction.reply(cv2.asEphemeral(cv2.danger('Access Denied', 'Only the **Server Owner**, **Extra Owners**, and **Bot Owner** can configure this system.')));
  }
  const guildId = interaction.guild.id;
  const customId = interaction.customId;
  const isWelcome = customId.startsWith('welcmgr_');
  const action = isWelcome ? customId.replace('welcmgr_', '') : customId.replace('leavmgr_', '');

  const getConfig = isWelcome ? db.getWelcomeConfig.bind(db) : db.getLeaveConfig.bind(db);
  const setConfig = isWelcome ? db.setWelcomeConfig.bind(db) : db.setLeaveConfig.bind(db);
  const typeStr = isWelcome ? 'welcome' : 'leave';

  const cfg = getConfig(guildId) || {};

  if (action === 'status') {
    setConfig(guildId, { ...cfg, enabled: !cfg.enabled });
    return interaction.update(getManagerPanel(guildId, typeStr));
  }
  
  if (action === 'channel') {
    const selectedChannel = interaction.values[0];
    setConfig(guildId, { ...cfg, channelId: selectedChannel });
    return interaction.update(getManagerPanel(guildId, typeStr));
  }
  
  if (action === 'cycle_avatar') {
    const sequence = ['thumbnail', 'author', 'footer', 'image', 'off'];
    const current = cfg.avatarPos || 'thumbnail';
    const next = sequence[(sequence.indexOf(current) + 1) % sequence.length];
    setConfig(guildId, { ...cfg, avatarPos: next });
    return interaction.update(getManagerPanel(guildId, typeStr));
  }
  
  if (action === 'cycle_name') {
    const sequence = ['tag', 'user_link', 'nick_link'];
    const current = cfg.nameFormat || 'tag';
    const next = sequence[(sequence.indexOf(current) + 1) % sequence.length];
    setConfig(guildId, { ...cfg, nameFormat: next });
    return interaction.update(getManagerPanel(guildId, typeStr));
  }

  if (action === 'toggle_time') {
    setConfig(guildId, { ...cfg, timestamp: !(cfg.timestamp !== false) });
    return interaction.update(getManagerPanel(guildId, typeStr));
  }

  if (action === 'toggle_details') {
    setConfig(guildId, { ...cfg, showDetails: !cfg.showDetails });
    return interaction.update(getManagerPanel(guildId, typeStr));
  }

  if (action === 'reset') {
    setConfig(guildId, {});
    return interaction.update(getManagerPanel(guildId, typeStr));
  }

  if (action === 'vars') {
    return interaction.reply(cv2.asEphemeral(cv2.info(
      'Placeholder & Variable Guide',
      `-# **• Use these dynamic placeholders in your Top Text, Title, Description, Author, or Footer.**\n\n` +
      `### Member Counts & Ordinals\n` +
      `-# ${BULLET_EMOJI} \`{membercount}\` or \`{count}\` — Current server member count (e.g. \`142\`).\n` +
      `-# ${BULLET_EMOJI} \`{ordinal}\` or \`{ordinal_count}\` — Formatted join milestone ordinal (e.g. \`1st\`, \`2nd\`, \`142nd\`).\n\n` +
      `### User Information\n` +
      `-# ${BULLET_EMOJI} \`{user}\` or \`{member}\` — Member ping (\`<@id>\`) or Markdown link based on Name Format.\n` +
      `-# ${BULLET_EMOJI} \`{mention}\` — Literal user ping (\`<@id>\`).\n` +
      `-# ${BULLET_EMOJI} \`{username}\` or \`{name}\` — Clean raw username (e.g. \`gwen\`).\n` +
      `-# ${BULLET_EMOJI} \`{displayname}\` or \`{nickname}\` — Server nickname or display name.\n` +
      `-# ${BULLET_EMOJI} \`{tag}\` or \`{usertag}\` — Full Discord tag.\n` +
      `-# ${BULLET_EMOJI} \`{userid}\` or \`{id}\` — Raw Discord user snowflake ID.\n` +
      `-# ${BULLET_EMOJI} \`{avatar}\` or \`{user.avatar}\` — User avatar CDN URL.\n\n` +
      `### Server Information\n` +
      `-# ${BULLET_EMOJI} \`{server}\` or \`{guild}\` — Server name.\n` +
      `-# ${BULLET_EMOJI} \`{serverid}\` — Server snowflake ID.\n` +
      `-# ${BULLET_EMOJI} \`{server.icon}\` — Server icon CDN URL.\n` +
      `-# ${BULLET_EMOJI} \`{owner}\` — Server Owner mention (\`<@owner_id>\`).\n` +
      `-# ${BULLET_EMOJI} \`{boosts}\` — Server Nitro boost count.\n` +
      `-# ${BULLET_EMOJI} \`{roles}\` — Total server role count.\n` +
      `-# ${BULLET_EMOJI} \`{channels}\` — Total server channel count.\n\n` +
      `### Relative Timestamps & Status\n` +
      `-# ${BULLET_EMOJI} \`{created}\` — Discord relative timestamp for account age.\n` +
      `-# ${BULLET_EMOJI} \`{joined}\` — Discord relative timestamp for guild join date.\n` +
      (!isWelcome ? `-# ${BULLET_EMOJI} \`{reason}\` or \`{leavereason}\` — Departure reason (\`Left on will\`, \`Kicked\`, or \`Banned\`).\n\n` : '\n') +
      `### Example Template\n` +
      `-# Top Text: \`hope you enjoy your stay!\`\n` +
      `-# Title: \`୨ৎ - welcome - ୨ৎ\`\n` +
      `-# Body: \`thank you for joining!\n( ♡ ) {membercount} members [peace]\`\n` +
      `-# Footer: \`Member #{ordinal} • {server}\``
    )));
  }

  if (action === 'test') {
    if (!cfg.channelId) {
      return interaction.reply(cv2.asEphemeral(cv2.warn(
        'Channel Not Set',
        `Please select a ${typeStr} channel from the dropdown menu first.`
      )));
    }
    
    let targetChannel = interaction.guild.channels.cache.get(cfg.channelId);
    if (!targetChannel) {
      targetChannel = await interaction.guild.channels.fetch(cfg.channelId).catch(() => null);
    }

    if (!targetChannel) {
      return interaction.reply(cv2.asEphemeral(cv2.danger(
        'Channel Not Found',
        `The configured channel <#${cfg.channelId}> could not be found in this server.`
      )));
    }

    const testExtra = !isWelcome ? { leaveReason: 'Left on will (Test Preview)', isLeave: true } : {};
    let content = cfg.message ? resolve(cfg.message, interaction.member, cfg, testExtra) : undefined;
    let testEmbed = buildWelcomeEmbed(interaction.member, cfg, testExtra);
    
    if (!content && !testEmbed) {
      content = isWelcome
        ? `Hey <@${interaction.user.id}>, welcome to **${interaction.guild.name}**! (Default test preview)`
        : `**${interaction.user.tag}** has left the server. (Default test preview)`;
    }

    const sendPayload = {};
    if (content) sendPayload.content = content;
    if (testEmbed) sendPayload.embeds = [testEmbed];

    try {
      await targetChannel.send(sendPayload);
      return interaction.reply(cv2.asEphemeral(cv2.success(
        'Test Message Sent',
        `A test ${typeStr} message has been sent to <#${targetChannel.id}>.`
      )));
    } catch (err) {
      return interaction.reply(cv2.asEphemeral(cv2.danger(
        'Delivery Failed',
        `Could not send test message to <#${targetChannel.id}>:\n\`${err.message}\`\nEnsure the bot has permission to send messages and embed links in that channel.`
      )));
    }
  }

  // Modals for everything else
  const prefix = isWelcome ? 'welc_' : 'leav_';

  if (action === 'text') {
    const modal = new ModalBuilder().setCustomId(`${prefix}modal_text`).setTitle('Set Top Text');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('val').setLabel('Message content (above embed)').setPlaceholder('e.g. Welcome {user} to {server}! Member #{membercount}').setStyle(TextInputStyle.Paragraph).setRequired(false).setValue(cfg.message || '')
    ));
    return interaction.showModal(modal);
  }

  if (action === 'author') {
    const modal = new ModalBuilder().setCustomId(`${prefix}modal_author`).setTitle('Set Author (From)');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('val').setLabel('Author Text (e.g. "From {server}")').setPlaceholder('e.g. Welcome to {server}').setStyle(TextInputStyle.Short).setRequired(false).setValue(cfg.from || '')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('icon').setLabel('Author Icon (Supports Pinterest / Image URL)').setPlaceholder('Image URL or Pinterest link (pin.it / pinterest.com)').setStyle(TextInputStyle.Short).setRequired(false).setValue(cfg.fromIcon || ''))
    );
    return interaction.showModal(modal);
  }

  if (action === 'title') {
    const modal = new ModalBuilder().setCustomId(`${prefix}modal_title`).setTitle('Set Embed Title');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('val').setLabel('Embed Title').setPlaceholder('e.g. Welcome {username}!').setStyle(TextInputStyle.Short).setRequired(false).setValue(cfg.title || '')
    ));
    return interaction.showModal(modal);
  }

  if (action === 'desc') {
    const modal = new ModalBuilder().setCustomId(`${prefix}modal_desc`).setTitle('Set Embed Description');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('val').setLabel('Embed Body').setPlaceholder('e.g. Thank you for joining!\n( ♡ ) {membercount} [peace]').setStyle(TextInputStyle.Paragraph).setRequired(false).setValue(cfg.description || '')
    ));
    return interaction.showModal(modal);
  }

  if (action === 'color') {
    return interaction.reply(cv2.asEphemeral(cv2.info('Accent Theme', 'Welcome and Leave embeds automatically use your server\'s accent color configured via `!accent`.')));
  }

  if (action === 'image') {
    const modal = new ModalBuilder().setCustomId(`${prefix}modal_image`).setTitle('Edit Media');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('val').setLabel('Large Image (Supports Pinterest, GIF, MP4)').setPlaceholder('Image URL or Pinterest link (pin.it / pinterest.com)').setStyle(TextInputStyle.Short).setRequired(false).setValue(cfg.image || '')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('thumb').setLabel('Thumbnail (Supports Pinterest, GIF, MP4)').setPlaceholder('Image URL or Pinterest link (pin.it / pinterest.com)').setStyle(TextInputStyle.Short).setRequired(false).setValue(cfg.thumbnailUrl || ''))
    );
    return interaction.showModal(modal);
  }

  if (action === 'footer') {
    const modal = new ModalBuilder().setCustomId(`${prefix}modal_footer`).setTitle('Set Embed Footer');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('val').setLabel('Footer Text').setPlaceholder('e.g. Member #{membercount} • {server}').setStyle(TextInputStyle.Short).setRequired(false).setValue(cfg.footer || '')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('icon').setLabel('Footer Icon (Supports Pinterest / Image URL)').setPlaceholder('Image URL or Pinterest link (pin.it / pinterest.com)').setStyle(TextInputStyle.Short).setRequired(false).setValue(cfg.footerIcon || ''))
    );
    return interaction.showModal(modal);
  }
}

export async function handleWelcomeManagerModal(interaction) {
  if (!isExtraOwnerOrHigher(interaction.user.id, interaction.guild)) {
    return interaction.reply(cv2.asEphemeral(cv2.danger('Access Denied', 'Only the **Server Owner**, **Extra Owners**, and **Bot Owner** can configure this system.')));
  }

  const guildId = interaction.guild.id;
  const customId = interaction.customId;
  const isWelcome = customId.startsWith('welc_');
  const action = isWelcome ? customId.replace('welc_modal_', '') : customId.replace('leav_modal_', '');
  const getConfig = isWelcome ? db.getWelcomeConfig.bind(db) : db.getLeaveConfig.bind(db);
  const setConfig = isWelcome ? db.setWelcomeConfig.bind(db) : db.setLeaveConfig.bind(db);
  const typeStr = isWelcome ? 'welcome' : 'leave';

  const cfg = getConfig(guildId) || {};
  let val = interaction.fields.getTextInputValue('val')?.trim() || null;

  if (action === 'text') cfg.message = val;
  if (action === 'title') cfg.title = val;
  if (action === 'desc') cfg.description = val;
  
  if (action === 'author') {
    cfg.from = val;
    let iconVal = interaction.fields.getTextInputValue('icon')?.trim() || null;
    if (iconVal && isPinterestUrl(iconVal)) {
      iconVal = await resolveMediaUrl(iconVal);
    }
    cfg.fromIcon = iconVal;
  }
  
  if (action === 'footer') {
    cfg.footer = val;
    let iconVal = interaction.fields.getTextInputValue('icon')?.trim() || null;
    if (iconVal && isPinterestUrl(iconVal)) {
      iconVal = await resolveMediaUrl(iconVal);
    }
    cfg.footerIcon = iconVal;
  }

  if (action === 'color') {
    if (val) {
      const hex = val.replace('#', '');
      const int = parseInt(hex, 16);
      if (!isNaN(int)) cfg.color = int;
    } else {
      delete cfg.color;
    }
  }

  if (action === 'image') {
    if (!val || val.toLowerCase() === 'none') {
      delete cfg.image;
    } else {
      if (isPinterestUrl(val)) {
        if (!interaction.deferred) await interaction.deferUpdate();
        val = await resolveMediaUrl(val, { convertToGif: true, interaction });
      }
      if (val && val.toLowerCase().endsWith('.mp4')) {
        if (!interaction.deferred) await interaction.deferUpdate();
        try {
          const gifBuffer = await convertMp4ToGif(val);
          val = await uploadGifToDiscord(interaction, gifBuffer, 'large_image.gif');
        } catch (err) {
          console.error('Failed to convert large image MP4 to GIF:', err);
        }
      }
      cfg.image = val;
    }
    
    let thumbVal = interaction.fields.getTextInputValue('thumb')?.trim() || null;
    if (!thumbVal || thumbVal.toLowerCase() === 'none') {
      delete cfg.thumbnailUrl;
    } else {
      if (isPinterestUrl(thumbVal)) {
        if (!interaction.deferred) await interaction.deferUpdate();
        thumbVal = await resolveMediaUrl(thumbVal, { convertToGif: true, interaction });
      }
      if (thumbVal && thumbVal.toLowerCase().endsWith('.mp4')) {
        if (!interaction.deferred) await interaction.deferUpdate();
        try {
          const gifBuffer = await convertMp4ToGif(thumbVal);
          thumbVal = await uploadGifToDiscord(interaction, gifBuffer, 'thumbnail.gif');
        } catch (err) {
          console.error('Failed to convert thumbnail MP4 to GIF:', err);
        }
      }
      cfg.thumbnailUrl = thumbVal;
    }
  }

  setConfig(guildId, cfg);
  
  if (interaction.deferred) {
    await interaction.editReply(getManagerPanel(guildId, typeStr));
  } else {
    await interaction.update(getManagerPanel(guildId, typeStr));
  }
}

// ============================================================
// COMMANDS
// ============================================================
export const commands = [
  {
    name: 'welcome',
    aliases: ['welcomer', 'greet'],
    description: 'Open the Welcome Message Manager [Extra Owner].',
    category: 'utility',
    permissions: [],
    options: [],
    async executePrefix(message) {
      if (!isExtraOwnerOrHigher(message.author.id, message.guild)) {
        return message.reply(cv2.danger('Access Denied', 'Only the **Server Owner**, **Extra Owners**, and **Bot Owner** can access the Welcome Manager.'));
      }
      return message.reply(getManagerPanel(message.guild.id, 'welcome'));
    },
    async executeSlash(interaction) {
      if (!isExtraOwnerOrHigher(interaction.user.id, interaction.guild)) {
        return interaction.reply(cv2.asEphemeral(cv2.danger('Access Denied', 'Only the **Server Owner**, **Extra Owners**, and **Bot Owner** can access the Welcome Manager.')));
      }
      return interaction.reply(getManagerPanel(interaction.guild.id, 'welcome'));
    }
  },
  {
    name: 'leave',
    aliases: ['goodbye', 'setleave', 'leaveconfig'],
    description: 'Open the Leave Message Manager [Extra Owner].',
    category: 'utility',
    permissions: [],
    options: [],
    async executePrefix(message) {
      if (!isExtraOwnerOrHigher(message.author.id, message.guild)) {
        return message.reply(cv2.danger('Access Denied', 'Only the **Server Owner**, **Extra Owners**, and **Bot Owner** can access the Leave Manager.'));
      }
      return message.reply(getManagerPanel(message.guild.id, 'leave'));
    },
    async executeSlash(interaction) {
      if (!isExtraOwnerOrHigher(interaction.user.id, interaction.guild)) {
        return interaction.reply(cv2.asEphemeral(cv2.danger('Access Denied', 'Only the **Server Owner**, **Extra Owners**, and **Bot Owner** can access the Leave Manager.')));
      }
      return interaction.reply(getManagerPanel(interaction.guild.id, 'leave'));
    }
  }
];
