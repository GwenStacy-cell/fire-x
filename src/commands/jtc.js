import { 
  getRandomHeadingGlyph, 
  BULLET_EMOJI, 
  TICK_EMOJI, 
  WRONG_EMOJI, 
  WARN_EMOJI, 
  UPTIME_EMOJI,
  JTC_EMOJIS,
  PACHA_ARROW
} from '../utils/emojis.js';
import {
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';
import { 
  isBotOwnerSync, 
  isExtraOwnerOrHigher,
  formatUserLink, 
  formatChannelLink, 
  cleanDisplayName 
} from '../utils/helpers.js';
import { markRestorationQueued, markChannelRestoring } from '../utils/antinuke.js';

function getAccent(guild) {
  if (!guild) return 0x5865F2;
  const cfg = db.getGuildConfig(guild.id);
  if (cfg?.accentColor) {
    return parseInt(cfg.accentColor.replace('#', ''), 16);
  }
  return 0x5865F2;
}

const TIER_STATUS_DEFINITIONS = [
  { key: 'solo', label: 'Solo [1]', status: `${PACHA_ARROW} Join 2 Create Solo VC` },
  { key: 'duo', label: 'Duo [2]', status: `${PACHA_ARROW} Join 2 Create Duo VC` },
  { key: 'trio', label: 'Trio [3]', status: `${PACHA_ARROW} Join 2 Create Trio VC` },
  { key: 'squad', label: 'Squad [4]', status: `${PACHA_ARROW} Join 2 Create Squad VC` },
  { key: 'unlimited', label: 'Unlimited [Free]', status: `${PACHA_ARROW} Join 2 Create Unlimited VC` }
];

const STANDARD_JTC_LOBBY_STATUS = `${PACHA_ARROW} Join 2 Create VC`;
const pendingJtcStatusTimers = new Map();

/**
 * Safely sets the Discord Voice Channel Status using the REST API with 429 retry/backoff.
 */
export async function setVoiceChannelStatus(client, channelId, status, maxAttempts = 3) {
  if (!client || !channelId || status === undefined) return false;
  if (typeof client.rest?.put !== 'function') return false;

  const normalizedStatus = status === null ? null : String(status).substring(0, 500);
  if (normalizedStatus === '') return false;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await client.rest.put(`/channels/${channelId}/voice-status`, {
        body: { status: normalizedStatus }
      });
      return true;
    } catch (err) {
      const httpStatus = err?.status ?? err?.rawError?.status;
      const apiCode = err?.code ?? err?.rawError?.code;
      // Do not retry permanent permission or missing-channel errors
      if (apiCode === 10003 || apiCode === 50013 || apiCode === 50001 || httpStatus === 403 || httpStatus === 404) {
        return false;
      }

      const retryAfterSec = Number(err?.rawError?.retry_after ?? err?.data?.retry_after ?? 0);
      const isRetryable = httpStatus === 429 || (typeof httpStatus === 'number' && httpStatus >= 500) || retryAfterSec > 0;
      if (!isRetryable || attempt >= maxAttempts) {
        console.warn(`[JTC Voice Status] Failed on channel ${channelId} (attempt ${attempt}/${maxAttempts}):`, err.message);
        return false;
      }

      const waitMs = retryAfterSec > 0
        ? Math.min(5000, Math.ceil(retryAfterSec * 1000) + 120)
        : 350 * attempt;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  return false;
}

/**
 * Resolves the canonical expected VC status for any configured JTC generator lobby by DB ID.
 */
export function getExpectedJtcLobbyStatus(guildId, channelId) {
  if (!guildId || !channelId) return null;
  const tierInfo = db.getTierInfo(guildId, channelId);
  if (tierInfo) {
    const def = TIER_STATUS_DEFINITIONS.find((d) => d.key === tierInfo.tier);
    return def ? def.status : null;
  }

  const jtcCfg = db.getJtcConfig(guildId);
  if (!jtcCfg) return null;
  if (jtcCfg.lobbyChannelId === channelId || jtcCfg.secondaryLobbyChannelId === channelId) {
    return STANDARD_JTC_LOBBY_STATUS;
  }
  return null;
}

/**
 * Applies/restores Voice Channel Statuses across all DB-tracked Tiered & Standard JTC lobbies.
 */
export async function syncJtcLobbyStatuses(guild, options = {}) {
  if (!guild?.client) return { total: 0, updated: 0, failed: 0, entries: [] };

  const delayMs = typeof options.delayMs === 'number' ? options.delayMs : 280;
  const targets = [];

  const tieredChannels = options.tieredChannels || db.getTieredJtcConfig(guild.id)?.channels;
  if (tieredChannels) {
    for (const def of TIER_STATUS_DEFINITIONS) {
      const chId = tieredChannels[def.key];
      if (chId) targets.push({ key: def.key, label: def.label, channelId: chId, status: def.status });
    }
  }

  if (!options.onlyTiered) {
    const jtcCfg = db.getJtcConfig(guild.id);
    if (jtcCfg?.lobbyChannelId) {
      targets.push({ key: 'standard', label: 'Primary JTC Lobby', channelId: jtcCfg.lobbyChannelId, status: STANDARD_JTC_LOBBY_STATUS });
    }
    if (jtcCfg?.secondaryLobbyChannelId) {
      targets.push({ key: 'secondary', label: 'Secondary JTC Lobby', channelId: jtcCfg.secondaryLobbyChannelId, status: STANDARD_JTC_LOBBY_STATUS });
    }
  }

  let updated = 0;
  let failed = 0;
  const entries = [];

  for (let i = 0; i < targets.length; i++) {
    const item = targets[i];
    const ch = guild.channels.cache.get(item.channelId) || await guild.channels.fetch(item.channelId).catch(() => null);
    if (!ch || !ch.isVoiceBased()) {
      entries.push({ ...item, ok: false, missing: true });
      continue;
    }

    const ok = await setVoiceChannelStatus(guild.client, ch.id, item.status);
    if (ok) updated++;
    else failed++;
    entries.push({ ...item, channel: ch, ok, missing: false });

    if (delayMs > 0 && i < targets.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return { total: targets.length, updated, failed, entries };
}

/**
 * Schedules a debounced per-channel status restore after a member leaves or vacates a JTC lobby
 * (Discord clears voice statuses when a voice channel transitions to empty).
 */
export function scheduleJtcLobbyStatusSync(guild, channelId, delayMs = 1500) {
  if (!guild?.id || !channelId) return;
  const expected = getExpectedJtcLobbyStatus(guild.id, channelId);
  if (!expected) return;

  const timerKey = `${guild.id}:${channelId}`;
  const prevTimer = pendingJtcStatusTimers.get(timerKey);
  if (prevTimer) clearTimeout(prevTimer);

  const timer = setTimeout(async () => {
    pendingJtcStatusTimers.delete(timerKey);
    try {
      const ch = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
      if (!ch || !ch.isVoiceBased()) return;
      await setVoiceChannelStatus(guild.client, ch.id, expected);
    } catch {}
  }, delayMs);
  timer.unref?.();
  pendingJtcStatusTimers.set(timerKey, timer);
}

// ==========================================
// JTC INTERFACE COMPONENT BUILDERS (Centralized)
// ==========================================
function getJtcSettingsOptions() {
  return [
    { label: 'Adjust Bitrate', description: 'Configure audio quality bitrate (8 - 384 kbps)', value: 'jtc_bitrate', emoji: JTC_EMOJIS.ADJUST_BITRATE },
    { label: 'Voice Region', description: 'Change the voice server region', value: 'jtc_region', emoji: JTC_EMOJIS.VOICE_REGION },
    { label: 'Create Temp Text Chat', description: 'Create a private synced text channel', value: 'jtc_text', emoji: JTC_EMOJIS.CREATE_TEMP_TEXT_CHAT },
    { label: 'Toggle NSFW', description: 'Mark room as Age-Restricted (NSFW)', value: 'jtc_nsfw', emoji: JTC_EMOJIS.TOGGLE_NSFW },
    { label: 'Claim Ownership', description: 'Claim owner privileges if previous owner left', value: 'jtc_claim', emoji: JTC_EMOJIS.CLAIM_OWNERSHIP },
    { label: 'Rename Channel', description: 'Change the voice room name', value: 'jtc_name', emoji: JTC_EMOJIS.RENAME_CHANNEL },
    { label: 'Set User Limit', description: 'Change the max member limit (0 = Unlimited)', value: 'jtc_limit', emoji: JTC_EMOJIS.SET_USER_LIMIT },
    { label: 'Set Voice Status', description: 'Set a custom voice room activity status', value: 'jtc_status', emoji: JTC_EMOJIS.SET_VOICE_STATUS },
    { label: 'Sync Game Activity', description: 'Set room name to your currently playing game', value: 'jtc_game', emoji: JTC_EMOJIS.SYNC_GAME_ACTIVITY },
    { label: 'Looking For Members (LFM)', description: 'Broadcast an LFM invite card in text chat', value: 'jtc_lfm', emoji: JTC_EMOJIS.LOOKING_FOR_MEMBERS },
    { label: 'Channel Information', description: 'View real-time statistics and channel metadata', value: 'jtc_info', emoji: JTC_EMOJIS.CHANNEL_INFORMATION }
  ];
}

function getJtcPermsOptions() {
  return [
    { label: 'Lock Channel', description: 'Prevent new members from joining', value: 'jtc_lock', emoji: JTC_EMOJIS.LOCK_CHANNEL },
    { label: 'Unlock Channel', description: 'Reopen room for anyone to join', value: 'jtc_unlock', emoji: JTC_EMOJIS.UNLOCK_CHANNEL },
    { label: 'Ghost Channel', description: 'Hide room completely from other users', value: 'jtc_ghost', emoji: JTC_EMOJIS.GHOST_CHANNEL },
    { label: 'Unghost Channel', description: 'Make room visible again on server list', value: 'jtc_unghost', emoji: JTC_EMOJIS.UNGHOST_CHANNEL },
    { label: 'Permit User', description: 'Whitelist a user to join even when locked/ghosted', value: 'jtc_permit', emoji: JTC_EMOJIS.PERMIT_USER },
    { label: 'Reject / Kick User', description: 'Disconnect and ban a user from this room', value: 'jtc_reject', emoji: JTC_EMOJIS.REJECT_KICK_USER },
    { label: 'DM Direct Invite', description: 'Send a one-time direct join link via DM', value: 'jtc_invite', emoji: JTC_EMOJIS.DM_DIRECT_INVITE },
    { label: 'Transfer Ownership', description: 'Pass room control to another member in VC', value: 'jtc_transfer', emoji: JTC_EMOJIS.TRANSFER_OWNERSHIP }
  ];
}

function getJtcQuickRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('jtc_btn_lock').setLabel('Lock / Unlock').setEmoji(JTC_EMOJIS.LOCK_CHANNEL).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('jtc_btn_ghost').setLabel('Ghost / Visible').setEmoji(JTC_EMOJIS.GHOST_CHANNEL).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('jtc_btn_claim').setLabel('Claim Owner').setEmoji(JTC_EMOJIS.CLAIM_OWNERSHIP).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('jtc_btn_info').setLabel('Room Info').setEmoji(JTC_EMOJIS.CHANNEL_INFORMATION).setStyle(ButtonStyle.Secondary)
  );
}

// ==========================================
// CONTROL PANEL BUILDER (Voice text chat panel)
// Dedicated per active temporary voice room
// ==========================================
export function buildControlPanel(vcChannel, ownerMember, guild = null) {
  const g = guild || vcChannel.guild;
  const userLink = formatUserLink(ownerMember, g);
  const chLink = formatChannelLink(vcChannel, g);
  const glyph = getRandomHeadingGlyph();

  const settingsMenu = new StringSelectMenuBuilder()
    .setCustomId('jtc_settings_menu')
    .setPlaceholder('Channel Settings & Configuration')
    .addOptions(getJtcSettingsOptions());

  const permsMenu = new StringSelectMenuBuilder()
    .setCustomId('jtc_perms_menu')
    .setPlaceholder('Privacy & Access Permissions')
    .addOptions(getJtcPermsOptions());

  const quickRow = getJtcQuickRow();

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# ${glyph} Voice Channel Control Panel | ${TICK_EMOJI}\n\n` +
        `**Manage your temporary voice channel using the menus and quick buttons below.**\n\n` +
        `-# ${BULLET_EMOJI} **Channel:** ${chLink}\n` +
        `-# ${BULLET_EMOJI} **Owner:** ${userLink}\n` +
        `-# ${BULLET_EMOJI} **Limit:** \`${vcChannel.userLimit === 0 ? 'Unlimited' : vcChannel.userLimit}\` • **Bitrate:** \`${Math.round(vcChannel.bitrate / 1000)}kbps\`\n` +
        `-# ${BULLET_EMOJI} **Privacy:** Actions are private to channel managers & room owners.`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Quick Room Controls**`))
    .addActionRowComponents(quickRow)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Channel Settings**`))
    .addActionRowComponents(new ActionRowBuilder().addComponents(settingsMenu))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Channel Permissions**`))
    .addActionRowComponents(new ActionRowBuilder().addComponents(permsMenu));

  return { flags: MessageFlags.IsComponentsV2, components: [container] };
}

// ==========================================
// SHARED INTERFACE PANEL - Persistent message in interface channel
// ==========================================
export function buildSharedPanel(guild) {
  const glyph = getRandomHeadingGlyph();

  const settingsMenu = new StringSelectMenuBuilder()
    .setCustomId('jtc_settings_menu')
    .setPlaceholder('Channel Settings & Configuration')
    .addOptions(getJtcSettingsOptions());

  const permsMenu = new StringSelectMenuBuilder()
    .setCustomId('jtc_perms_menu')
    .setPlaceholder('Privacy & Access Permissions')
    .addOptions(getJtcPermsOptions());

  const quickRow = getJtcQuickRow();

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# ${glyph} Voice Hub Interface Panel | ${TICK_EMOJI}\n\n` +
        `**Welcome to the Voice Channel Control Center.**\n\n` +
        `-# ${BULLET_EMOJI} **Connect:** Join any Join to Create lobby (**Solo [1]**, **Duo [2]**, **Trio [3]**, **Squad [4]**, or **Unlimited**).\n` +
        `-# ${BULLET_EMOJI} **Auto Generation:** Athena instantly creates your private voice channel and moves you in.\n` +
        `-# ${BULLET_EMOJI} **Management:** Use the dropdowns and buttons below while connected to manage your room.\n` +
        `-# ${BULLET_EMOJI} **Private & Secure:** All menu interactions here are ephemeral and completely private.\n` +
        `-# ${BULLET_EMOJI} **Auto Cleanup:** When all members leave your room, Athena automatically cleans it up.`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Quick Room Controls**`))
    .addActionRowComponents(quickRow)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Channel Settings**`))
    .addActionRowComponents(new ActionRowBuilder().addComponents(settingsMenu))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Channel Permissions**`))
    .addActionRowComponents(new ActionRowBuilder().addComponents(permsMenu));

  return { flags: MessageFlags.IsComponentsV2, components: [container] };
}

// Sync panel helper
export async function syncPanel(guild) {
  const cfg = db.getJtcConfig(guild.id);
  if (!cfg?.panelChannelId || !cfg?.panelMessageId) return false;

  const channel = await guild.channels.fetch(cfg.panelChannelId).catch(() => null);
  if (!channel) return false;

  const msg = await channel.messages.fetch(cfg.panelMessageId).catch(() => null);
  if (!msg) return false;

  const newPanel = buildSharedPanel(guild);
  newPanel.embeds = [];
  newPanel.content = '';
  
  await msg.edit(newPanel).catch(() => null);
  return true;
}

// Helper to resolve the user's active temporary JTC voice channel
function resolveUserJtcChannel(interaction) {
  const member = interaction.member;
  const guild = interaction.guild;

  // Direct connected voice channel
  let vcChannel = member.voice?.channel;
  if (vcChannel && db.isJtcChannel(vcChannel.id)) {
    return vcChannel;
  }

  // If connected to a voice channel that might not be cached in memory yet
  if (member.voice?.channelId && db.isJtcChannel(member.voice.channelId)) {
    return guild.channels.cache.get(member.voice.channelId) || null;
  }

  // Check if member is in any active JTC room in this guild
  const allJtc = db.getAllJtcChannels().filter(c => c.guildId === guild.id);
  for (const record of allJtc) {
    const ch = guild.channels.cache.get(record.channelId);
    if (ch && ch.isVoiceBased() && ch.members.has(member.id)) {
      return ch;
    }
  }

  return null;
}

// ==========================================
// QUICK BUTTON HANDLER
// ==========================================
export async function handleJtcButton(interaction) {
  const customId = interaction.customId;
  const member = interaction.member;
  const guild = interaction.guild;

  const vcChannel = resolveUserJtcChannel(interaction);
  if (!vcChannel) {
    return interaction.reply(cv2.e.warn(
      `Voice Channel Required | ${WARN_EMOJI}`,
      `You must be connected to an active Join to Create channel to use these controls.`
    ));
  }

  const jtcData = db.getJtcChannel(vcChannel.id);
  if (!jtcData) {
    return interaction.reply(cv2.e.warn(
      `Not A JTC Channel | ${WARN_EMOJI}`,
      `This channel is not recognized as an active temporary voice channel.`
    ));
  }

  const isBotOwner = isBotOwnerSync(member.id);
  const isServerOwner = member.id === guild.ownerId;
  const isOwner = isBotOwner || isServerOwner || jtcData.ownerId === member.id;

  // ── QUICK LOCK / UNLOCK ──
  if (customId === 'jtc_btn_lock') {
    if (!isOwner) {
      return interaction.reply(cv2.e.danger(
        `Unauthorized | ${WRONG_EMOJI}`,
        `Only the room owner, server owner, or bot owner can lock or unlock this room.`
      ));
    }
    const currentPerm = vcChannel.permissionOverwrites.cache.get(guild.roles.everyone.id);
    const isLocked = currentPerm?.deny.has(PermissionFlagsBits.Connect);

    markChannelRestoring(vcChannel.id, 3000);
    if (isLocked) {
      await vcChannel.permissionOverwrites.edit(guild.roles.everyone.id, { Connect: null });
      return interaction.reply(cv2.e.success(
        `Channel Unlocked | ${TICK_EMOJI}`,
        `Your voice channel is now open for anyone to join.`
      ));
    } else {
      await vcChannel.permissionOverwrites.edit(guild.roles.everyone.id, { Connect: false });
      return interaction.reply(cv2.e.danger(
        `Channel Locked | ${WRONG_EMOJI}`,
        `Your voice channel has been locked. Only whitelisted members can join.`
      ));
    }
  }

  // ── QUICK GHOST / UNGHOST ──
  if (customId === 'jtc_btn_ghost') {
    if (!isOwner) {
      return interaction.reply(cv2.e.danger(
        `Unauthorized | ${WRONG_EMOJI}`,
        `Only the room owner, server owner, or bot owner can hide or reveal this room.`
      ));
    }
    const currentPerm = vcChannel.permissionOverwrites.cache.get(guild.roles.everyone.id);
    const isGhosted = currentPerm?.deny.has(PermissionFlagsBits.ViewChannel);

    markChannelRestoring(vcChannel.id, 3000);
    if (isGhosted) {
      await vcChannel.permissionOverwrites.edit(guild.roles.everyone.id, { ViewChannel: null });
      return interaction.reply(cv2.e.success(
        `Channel Visible | ${TICK_EMOJI}`,
        `Your voice channel is now visible on the server channel list.`
      ));
    } else {
      await vcChannel.permissionOverwrites.edit(guild.roles.everyone.id, { ViewChannel: false });
      return interaction.reply(cv2.e.info(
        `Channel Hidden | ${TICK_EMOJI}`,
        `Your voice channel is now invisible to others. Permitted members can still see and connect.`
      ));
    }
  }

  // ── QUICK CLAIM ──
  if (customId === 'jtc_btn_claim') {
    const ownerInChannel = vcChannel.members.has(jtcData.ownerId);
    if (ownerInChannel) {
      return interaction.reply(cv2.e.warn(
        `Cannot Claim | ${WARN_EMOJI}`,
        `The current room owner is still connected to the voice channel.`
      ));
    }
    db.setJtcOwner(vcChannel.id, member.id);
    await vcChannel.permissionOverwrites.edit(member.id, { 
      Connect: true, 
      ManageChannels: true, 
      ViewChannel: true, 
      MuteMembers: true, 
      DeafenMembers: true 
    }).catch(() => null);

    return interaction.reply(cv2.e.success(
      `Ownership Claimed | ${TICK_EMOJI}`,
      `You are now the registered owner of **${vcChannel.name}**.`
    ));
  }

  // ── QUICK ROOM INFO ──
  if (customId === 'jtc_btn_info') {
    const owner = await guild.members.fetch(jtcData.ownerId).catch(() => null);
    const ownerText = owner ? formatUserLink(owner, guild) : `\`${jtcData.ownerId}\``;
    const chLink = formatChannelLink(vcChannel, guild);
    const memberLinks = vcChannel.members.size > 0 
      ? vcChannel.members.map(m => formatUserLink(m, guild)).join(', ') 
      : 'None';

    return interaction.reply(cv2.e.info(
      `Room Overview | ${TICK_EMOJI}`,
      `-# ${BULLET_EMOJI} **Channel:** ${chLink}\n` +
      `-# ${BULLET_EMOJI} **Owner:** ${ownerText}\n` +
      `-# ${BULLET_EMOJI} **User Limit:** \`${vcChannel.userLimit === 0 ? 'Unlimited' : vcChannel.userLimit}\`\n` +
      `-# ${BULLET_EMOJI} **Audio Bitrate:** \`${Math.round(vcChannel.bitrate / 1000)}kbps\`\n` +
      `-# ${BULLET_EMOJI} **Region:** \`${vcChannel.rtcRegion || 'Automatic'}\`\n` +
      `-# ${BULLET_EMOJI} **Age-Restricted:** \`${vcChannel.nsfw ? 'Yes' : 'No'}\`\n` +
      `-# ${BULLET_EMOJI} **Active Connected:** ${memberLinks}`
    ));
  }
}

// ==========================================
// SELECT MENU HANDLER
// ==========================================
export async function handleJtcSelectMenu(interaction) {
  const value = interaction.values[0];
  const member = interaction.member;
  const guild = interaction.guild;

  const vcChannel = resolveUserJtcChannel(interaction);
  if (!vcChannel) {
    return interaction.reply(cv2.e.warn(
      `Voice Channel Required | ${WARN_EMOJI}`,
      `Could not locate your active voice room. You must be connected to an active Join to Create channel.`
    ));
  }

  const jtcData = db.getJtcChannel(vcChannel.id);
  if (!jtcData) {
    return interaction.reply(cv2.e.warn(
      `Not A JTC Channel | ${WARN_EMOJI}`,
      `This channel is not registered as an active temporary voice room.`
    ));
  }

  // ── CLAIM ──
  if (value === 'jtc_claim') {
    const ownerInChannel = vcChannel.members.has(jtcData.ownerId);
    if (ownerInChannel) {
      return interaction.reply(cv2.e.warn(
        `Cannot Claim | ${WARN_EMOJI}`,
        `The current room owner is still connected to the voice channel.`
      ));
    }
    db.setJtcOwner(vcChannel.id, member.id);
    await vcChannel.permissionOverwrites.edit(member.id, { 
      Connect: true, 
      ManageChannels: true, 
      ViewChannel: true, 
      MuteMembers: true, 
      DeafenMembers: true 
    }).catch(() => null);

    return interaction.reply(cv2.e.success(
      `Ownership Claimed | ${TICK_EMOJI}`,
      `You are now the registered owner of **${vcChannel.name}**.`
    ));
  }

  // ── INFO ──
  if (value === 'jtc_info') {
    const owner = await guild.members.fetch(jtcData.ownerId).catch(() => null);
    const ownerText = owner ? formatUserLink(owner, guild) : `\`${jtcData.ownerId}\``;
    const chLink = formatChannelLink(vcChannel, guild);
    const memberLinks = vcChannel.members.size > 0 
      ? vcChannel.members.map(m => formatUserLink(m, guild)).join(', ') 
      : 'None';

    return interaction.reply(cv2.e.info(
      `Room Overview | ${TICK_EMOJI}`,
      `-# ${BULLET_EMOJI} **Channel:** ${chLink}\n` +
      `-# ${BULLET_EMOJI} **Owner:** ${ownerText}\n` +
      `-# ${BULLET_EMOJI} **User Limit:** \`${vcChannel.userLimit === 0 ? 'Unlimited' : vcChannel.userLimit}\`\n` +
      `-# ${BULLET_EMOJI} **Audio Bitrate:** \`${Math.round(vcChannel.bitrate / 1000)}kbps\`\n` +
      `-# ${BULLET_EMOJI} **Region:** \`${vcChannel.rtcRegion || 'Automatic'}\`\n` +
      `-# ${BULLET_EMOJI} **Age-Restricted:** \`${vcChannel.nsfw ? 'Yes' : 'No'}\`\n` +
      `-# ${BULLET_EMOJI} **Active Connected:** ${memberLinks}`
    ));
  }

  // Owner verification
  const isBotOwner = isBotOwnerSync(member.id);
  const isServerOwner = member.id === guild.ownerId;
  if (!isBotOwner && !isServerOwner && jtcData.ownerId !== member.id) {
    return interaction.reply(cv2.e.danger(
      `Unauthorized | ${WRONG_EMOJI}`,
      `Only the channel owner, server owner, or bot owner can execute this action.`
    ));
  }

  // ── LOCK ──
  if (value === 'jtc_lock') {
    markChannelRestoring(vcChannel.id, 3000);
    await vcChannel.permissionOverwrites.edit(guild.roles.everyone.id, { Connect: false });
    return interaction.reply(cv2.e.danger(
      `Channel Locked | ${WRONG_EMOJI}`,
      `Your channel has been locked. New members cannot connect without permission.`
    ));
  }

  // ── UNLOCK ──
  if (value === 'jtc_unlock') {
    markChannelRestoring(vcChannel.id, 3000);
    await vcChannel.permissionOverwrites.edit(guild.roles.everyone.id, { Connect: null });
    return interaction.reply(cv2.e.success(
      `Channel Unlocked | ${TICK_EMOJI}`,
      `Your voice channel is now open for anyone to join.`
    ));
  }

  // ── GHOST ──
  if (value === 'jtc_ghost') {
    markChannelRestoring(vcChannel.id, 3000);
    await vcChannel.permissionOverwrites.edit(guild.roles.everyone.id, { ViewChannel: false });
    return interaction.reply(cv2.e.info(
      `Channel Hidden | ${TICK_EMOJI}`,
      `Your voice channel is now invisible to others. Permitted users can still view and connect.`
    ));
  }

  // ── UNGHOST ──
  if (value === 'jtc_unghost') {
    markChannelRestoring(vcChannel.id, 3000);
    await vcChannel.permissionOverwrites.edit(guild.roles.everyone.id, { ViewChannel: null });
    return interaction.reply(cv2.e.success(
      `Channel Visible | ${TICK_EMOJI}`,
      `Your voice channel is now visible on the server list again.`
    ));
  }

  // ── NSFW TOGGLE ──
  if (value === 'jtc_nsfw') {
    const current = vcChannel.nsfw;
    await vcChannel.setNSFW(!current).catch(() => null);
    return interaction.reply(cv2.e.success(
      `NSFW Toggled | ${TICK_EMOJI}`,
      `Channel Age-Restricted status has been set to **${!current ? 'Enabled' : 'Disabled'}**.`
    ));
  }

  // ── GAME ACTIVITY SYNC ──
  if (value === 'jtc_game') {
    const activity = member.presence?.activities.find(a => a.type === 0);
    if (!activity) {
      return interaction.reply(cv2.e.warn(
        `No Activity Found | ${WARN_EMOJI}`,
        `Discord does not detect any game or activity on your profile right now.`
      ));
    }
    await vcChannel.setName(activity.name).catch(() => null);
    return interaction.reply(cv2.e.success(
      `Game Name Applied | ${TICK_EMOJI}`,
      `Channel name updated to **${activity.name}**.`
    ));
  }

  // ── LFM BROADCAST ──
  if (value === 'jtc_lfm') {
    const chLink = formatChannelLink(vcChannel, guild);
    const userLink = formatUserLink(member, guild);
    const slots = vcChannel.userLimit === 0 ? 'Unlimited' : Math.max(0, vcChannel.userLimit - vcChannel.members.size);

    const lfmEmbed = new EmbedBuilder()
      .setColor(getAccent(guild))
      .setTitle(`Looking For Members | ${TICK_EMOJI}`)
      .setDescription(
        `${userLink} is looking for members to join their voice channel!\n\n` +
        `-# ${BULLET_EMOJI} **Channel:** ${chLink}\n` +
        `-# ${BULLET_EMOJI} **Available Slots:** \`${slots}\`\n\n` +
        `> Join the channel to play together!`
      )
      .setTimestamp();

    if (interaction.channel && interaction.channel.isTextBased()) {
      await interaction.channel.send({ embeds: [lfmEmbed] }).catch(() => null);
    }
    return interaction.reply(cv2.e.success(
      `LFM Broadcasted | ${TICK_EMOJI}`,
      `Your Looking for Members notice has been posted in this channel.`
    ));
  }

  // ── TEMP TEXT CHANNEL ──
  if (value === 'jtc_text') {
    const jtcCfg = db.getJtcConfig(guild.id);
    const targetParentId = vcChannel.parentId || jtcCfg?.categoryId || null;
    const textChannelName = `${vcChannel.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-')}-text`;

    const existing = guild.channels.cache.find(c => c.name === textChannelName && c.parentId === targetParentId);
    if (existing) {
      return interaction.reply(cv2.e.warn(
        `Already Exists | ${WARN_EMOJI}`,
        `A linked text channel already exists: ${formatChannelLink(existing, guild)}`
      ));
    }

    const textCh = await guild.channels.create({
      name: textChannelName,
      type: ChannelType.GuildText,
      parent: targetParentId,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
      ],
      reason: `JTC Temp Text Channel for ${member.user.tag}`
    });

    db.setJtcTextChannel(vcChannel.id, textCh.id);

    // Permit all current members
    for (const [, m] of vcChannel.members) {
      await textCh.permissionOverwrites.edit(m.id, { ViewChannel: true, SendMessages: true }).catch(() => null);
    }

    return interaction.reply(cv2.e.success(
      `Text Channel Created | ${TICK_EMOJI}`,
      `Temporary text channel created: ${formatChannelLink(textCh, guild)}\n\nOnly members in your voice room have access.`
    ));
  }

  // ── MODAL PROMPTS ──
  if (value === 'jtc_name') {
    const modal = new ModalBuilder().setCustomId('jtc_rename_modal').setTitle('Rename Voice Channel');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('jtc_new_name').setLabel('New Channel Name')
        .setStyle(TextInputStyle.Short).setPlaceholder('e.g. Chill Lounge').setRequired(true).setMaxLength(100)
    ));
    return interaction.showModal(modal);
  }

  if (value === 'jtc_limit') {
    const modal = new ModalBuilder().setCustomId('jtc_limit_modal').setTitle('Set Channel Member Limit');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('jtc_limit_val').setLabel('User Limit (0 = Unlimited, Max 99)')
        .setStyle(TextInputStyle.Short).setPlaceholder('e.g. 4').setRequired(true).setMaxLength(2)
    ));
    return interaction.showModal(modal);
  }

  if (value === 'jtc_status') {
    const modal = new ModalBuilder().setCustomId('jtc_status_modal').setTitle('Set Voice Status');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('jtc_status_val').setLabel('Channel Voice Status')
        .setStyle(TextInputStyle.Short).setPlaceholder('e.g. Grinding Ranked').setRequired(true).setMaxLength(500)
    ));
    return interaction.showModal(modal);
  }

  if (value === 'jtc_bitrate') {
    const modal = new ModalBuilder().setCustomId('jtc_bitrate_modal').setTitle('Adjust Voice Bitrate');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('jtc_bitrate_val').setLabel('Bitrate in kbps (8 - 384)')
        .setStyle(TextInputStyle.Short).setPlaceholder('e.g. 128').setRequired(true).setMaxLength(3)
    ));
    return interaction.showModal(modal);
  }

  if (value === 'jtc_region') {
    const modal = new ModalBuilder().setCustomId('jtc_region_modal').setTitle('Change Voice Region');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('jtc_region_val')
        .setLabel('Region (Leave blank for Automatic)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('brazil / europe / india / japan / singapore / us-east / us-west')
        .setRequired(false).setMaxLength(25)
    ));
    return interaction.showModal(modal);
  }

  if (value === 'jtc_permit') {
    const modal = new ModalBuilder().setCustomId('jtc_permit_modal').setTitle('Permit / Whitelist User');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('jtc_permit_userid').setLabel('Target User ID')
        .setStyle(TextInputStyle.Short).setPlaceholder('Right-click user -> Copy ID').setRequired(true)
    ));
    return interaction.showModal(modal);
  }

  if (value === 'jtc_reject') {
    const modal = new ModalBuilder().setCustomId('jtc_reject_modal').setTitle('Reject / Ban User');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('jtc_reject_userid').setLabel('Target User ID')
        .setStyle(TextInputStyle.Short).setPlaceholder('Right-click user -> Copy ID').setRequired(true)
    ));
    return interaction.showModal(modal);
  }

  if (value === 'jtc_invite') {
    const modal = new ModalBuilder().setCustomId('jtc_invite_modal').setTitle('Send Direct DM Invite');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('jtc_invite_userid').setLabel('Target User ID')
        .setStyle(TextInputStyle.Short).setPlaceholder('Right-click user -> Copy ID').setRequired(true)
    ));
    return interaction.showModal(modal);
  }

  if (value === 'jtc_transfer') {
    const modal = new ModalBuilder().setCustomId('jtc_transfer_modal').setTitle('Transfer Room Ownership');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('jtc_transfer_userid').setLabel('New Owner User ID (Must be in VC)')
        .setStyle(TextInputStyle.Short).setPlaceholder('Right-click user -> Copy ID').setRequired(true)
    ));
    return interaction.showModal(modal);
  }
}

// ==========================================
// MODAL HANDLER
// ==========================================
export async function handleJtcModal(interaction) {
  const customId = interaction.customId;
  const member = interaction.member;
  const guild = interaction.guild;

  const vcChannel = resolveUserJtcChannel(interaction);
  if (!vcChannel) {
    return interaction.reply(cv2.e.warn(
      `Voice Channel Required | ${WARN_EMOJI}`,
      `Could not locate your active voice channel. You must be connected to an active room.`
    ));
  }

  const jtcData = db.getJtcChannel(vcChannel.id);
  const isBotOwner = isBotOwnerSync(member.id);
  const isServerOwner = member.id === guild.ownerId;
  if (!jtcData || (!isBotOwner && !isServerOwner && jtcData.ownerId !== member.id)) {
    return interaction.reply(cv2.e.danger(
      `Unauthorized | ${WRONG_EMOJI}`,
      `Only the channel owner, server owner, or bot owner can configure this channel.`
    ));
  }

  if (customId === 'jtc_rename_modal') {
    let newName = interaction.fields.getTextInputValue('jtc_new_name').trim();
    newName = newName.replace(/@(everyone|here)/gi, '').replace(/discord(?:\.gg|(?:app)?\.com\/invite)\/[a-z0-9]+/gi, '').trim();
    if (!newName) newName = `${member.displayName}'s Room`;
    markChannelRestoring(vcChannel.id, 3000);
    await vcChannel.setName(newName).catch(() => null);
    return interaction.reply(cv2.e.success(
      `Channel Renamed | ${TICK_EMOJI}`,
      `Your channel has been renamed to **${newName}**.`
    ));
  }

  if (customId === 'jtc_limit_modal') {
    const val = parseInt(interaction.fields.getTextInputValue('jtc_limit_val')) || 0;
    const limit = Math.min(Math.max(val, 0), 99);
    await vcChannel.setUserLimit(limit).catch(() => null);
    return interaction.reply(cv2.e.success(
      `Limit Configured | ${TICK_EMOJI}`,
      `User limit set to **${limit === 0 ? 'Unlimited' : limit}**.`
    ));
  }

  if (customId === 'jtc_status_modal') {
    let status = interaction.fields.getTextInputValue('jtc_status_val').trim();
    if (!status.startsWith('<a:') && !status.startsWith('<:') && !status.startsWith('http')) {
      status = `${PACHA_ARROW} ${status}`.substring(0, 500);
    }
    await setVoiceChannelStatus(interaction.client, vcChannel.id, status);
    return interaction.reply(cv2.e.success(
      `Status Configured | ${TICK_EMOJI}`,
      `Voice status set to: **${status}**`
    ));
  }

  if (customId === 'jtc_bitrate_modal') {
    const kbps = Math.min(Math.max(parseInt(interaction.fields.getTextInputValue('jtc_bitrate_val')) || 64, 8), 384);
    await vcChannel.setBitrate(kbps * 1000).catch(() => null);
    return interaction.reply(cv2.e.success(
      `Bitrate Configured | ${TICK_EMOJI}`,
      `Audio bitrate set to **${kbps}kbps**.`
    ));
  }

  if (customId === 'jtc_region_modal') {
    const region = interaction.fields.getTextInputValue('jtc_region_val').trim().toLowerCase() || null;
    await vcChannel.setRTCRegion(region).catch(() => null);
    return interaction.reply(cv2.e.success(
      `Region Configured | ${TICK_EMOJI}`,
      `Voice region set to **${region || 'Automatic'}**.`
    ));
  }

  if (customId === 'jtc_permit_modal') {
    const userId = interaction.fields.getTextInputValue('jtc_permit_userid').trim().replace(/\D/g, '');
    const target = await guild.members.fetch(userId).catch(() => null);
    if (!target) {
      return interaction.reply(cv2.e.warn(
        `User Not Found | ${WARN_EMOJI}`,
        `Could not find that member in this server.`
      ));
    }
    markChannelRestoring(vcChannel.id, 3000);
    await vcChannel.permissionOverwrites.edit(userId, { Connect: true, ViewChannel: true });
    return interaction.reply(cv2.e.success(
      `User Whitelisted | ${TICK_EMOJI}`,
      `${formatUserLink(target, guild)} can now join your room even when locked or hidden.`
    ));
  }

  if (customId === 'jtc_reject_modal') {
    const userId = interaction.fields.getTextInputValue('jtc_reject_userid').trim().replace(/\D/g, '');
    const target = await guild.members.fetch(userId).catch(() => null);
    if (!target) {
      return interaction.reply(cv2.e.warn(
        `User Not Found | ${WARN_EMOJI}`,
        `Could not find that member in this server.`
      ));
    }
    markChannelRestoring(vcChannel.id, 3000);
    if (target.voice?.channelId === vcChannel.id) {
      await target.voice.disconnect().catch(() => null);
    }
    await vcChannel.permissionOverwrites.edit(userId, { Connect: false, ViewChannel: false });
    return interaction.reply(cv2.e.danger(
      `User Rejected | ${WRONG_EMOJI}`,
      `${formatUserLink(target, guild)} has been disconnected and blocked from this channel.`
    ));
  }

  if (customId === 'jtc_invite_modal') {
    const userId = interaction.fields.getTextInputValue('jtc_invite_userid').trim().replace(/\D/g, '');
    const target = await guild.members.fetch(userId).catch(() => null);
    if (!target) {
      return interaction.reply(cv2.e.warn(
        `User Not Found | ${WARN_EMOJI}`,
        `Could not find that member in this server.`
      ));
    }

    const invite = await vcChannel.createInvite({ maxAge: 300, maxUses: 1, reason: 'Athena JTC Direct Invite' }).catch(() => null);
    const userLink = formatUserLink(member, guild);
    const chLink = formatChannelLink(vcChannel, guild);

    const dmEmbed = new EmbedBuilder()
      .setColor(getAccent(guild))
      .setTitle(`Voice Room Invitation | ${TICK_EMOJI}`)
      .setDescription(
        `${userLink} has invited you to join their voice channel in **${guild.name}**.\n\n` +
        `-# ${BULLET_EMOJI} **Channel:** ${chLink}\n` +
        `-# ${BULLET_EMOJI} **Direct Link:** ${invite ? `[Click to Join](${invite.url})` : 'Join the server and open the room'}`
      )
      .setFooter({ text: 'Athena Voice Engine' });

    const dmSent = await target.send({ embeds: [dmEmbed] }).catch(() => null);
    if (!dmSent) {
      return interaction.reply(cv2.e.warn(
        `DM Blocked | ${WARN_EMOJI}`,
        `Could not deliver DM to ${formatUserLink(target, guild)}. Their direct messages may be disabled.`
      ));
    }
    return interaction.reply(cv2.e.success(
      `Invite Dispatched | ${TICK_EMOJI}`,
      `An invite link has been dispatched to ${formatUserLink(target, guild)} via DM.`
    ));
  }

  if (customId === 'jtc_transfer_modal') {
    const userId = interaction.fields.getTextInputValue('jtc_transfer_userid').trim().replace(/\D/g, '');
    const target = await guild.members.fetch(userId).catch(() => null);
    if (!target) {
      return interaction.reply(cv2.e.warn(
        `User Not Found | ${WARN_EMOJI}`,
        `Could not find that user in this server.`
      ));
    }
    if (!vcChannel.members.has(userId)) {
      return interaction.reply(cv2.e.warn(
        `Not Connected | ${WARN_EMOJI}`,
        `That user must be inside your voice channel to receive room ownership.`
      ));
    }

    await vcChannel.permissionOverwrites.edit(member.id, { ManageChannels: false }).catch(() => null);
    await vcChannel.permissionOverwrites.edit(userId, { 
      Connect: true, 
      ViewChannel: true, 
      ManageChannels: true, 
      MuteMembers: true, 
      DeafenMembers: true 
    }).catch(() => null);

    db.setJtcOwner(vcChannel.id, userId);

    return interaction.reply(cv2.e.success(
      `Ownership Transferred | ${TICK_EMOJI}`,
      `${formatUserLink(target, guild)} is now the registered owner of this channel.`
    ));
  }
}

// ==========================================
// TIERED SUITE HELPERS
// ==========================================

async function deployTieredSuite(guild) {
  // Create Category
  const category = await guild.channels.create({
    name: 'Athena Voice Hub',
    type: ChannelType.GuildCategory,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
      },
      {
        id: guild.client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
          PermissionFlagsBits.MoveMembers,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks
        ]
      }
    ],
    reason: 'Athena Tiered JTC Voice Hub Deployment'
  });

  // Create Interface Channel
  const interfaceChannel = await guild.channels.create({
    name: 'voice-controls',
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.CreatePublicThreads,
          PermissionFlagsBits.CreatePrivateThreads,
          PermissionFlagsBits.AddReactions
        ],
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]
      },
      {
        id: guild.client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.ManageMessages
        ]
      }
    ],
    reason: 'Athena Tiered JTC Interface Channel'
  });

  // Post persistent panel
  const sharedPanel = buildSharedPanel(guild);
  const panelMsg = await interfaceChannel.send(sharedPanel);

  // Create 4 generator voice channels
  const soloChannel = await guild.channels.create({
    name: '👤 Solo [1]',
    type: ChannelType.GuildVoice,
    userLimit: 1,
    parent: category.id,
    reason: 'Athena Tiered JTC Solo Lobby'
  });

  const duoChannel = await guild.channels.create({
    name: '👥 Duo [2]',
    type: ChannelType.GuildVoice,
    userLimit: 2,
    parent: category.id,
    reason: 'Athena Tiered JTC Duo Lobby'
  });

  const trioChannel = await guild.channels.create({
    name: '🎮 Trio [3]',
    type: ChannelType.GuildVoice,
    userLimit: 3,
    parent: category.id,
    reason: 'Athena Tiered JTC Trio Lobby'
  });

  const squadChannel = await guild.channels.create({
    name: '🔊 Squad [4]',
    type: ChannelType.GuildVoice,
    userLimit: 4,
    parent: category.id,
    reason: 'Athena Tiered JTC Squad 4 Lobby'
  });

  const unlimitedChannel = await guild.channels.create({
    name: '🌐 Unlimited [Free]',
    type: ChannelType.GuildVoice,
    userLimit: 0,
    parent: category.id,
    reason: 'Athena Tiered JTC Unlimited Lobby'
  });

  // Set Discord Voice Channel Statuses on generator channels cleanly with pacing/429 retry
  await syncJtcLobbyStatuses(guild, {
    onlyTiered: true,
    delayMs: 280,
    tieredChannels: {
      solo: soloChannel.id,
      duo: duoChannel.id,
      trio: trioChannel.id,
      squad: squadChannel.id,
      unlimited: unlimitedChannel.id
    }
  });

  // Mark all created infrastructure in Anti-Nuke deduplication cache
  markRestorationQueued(category.id);
  markRestorationQueued(interfaceChannel.id);
  markRestorationQueued(soloChannel.id);
  markRestorationQueued(duoChannel.id);
  markRestorationQueued(trioChannel.id);
  markRestorationQueued(squadChannel.id);
  markRestorationQueued(unlimitedChannel.id);

  // Store in database strictly by ID
  db.setTieredJtcConfig(guild.id, {
    categoryId: category.id,
    interfaceChannelId: interfaceChannel.id,
    interfaceMessageId: panelMsg.id,
    channels: {
      solo: soloChannel.id,
      duo: duoChannel.id,
      trio: trioChannel.id,
      squad: squadChannel.id,
      unlimited: unlimitedChannel.id
    }
  });

  return {
    category,
    interfaceChannel,
    soloChannel,
    duoChannel,
    trioChannel,
    squadChannel,
    unlimitedChannel
  };
}

async function wipeTieredSuite(guild) {
  const tieredCfg = db.getTieredJtcConfig(guild.id);
  if (!tieredCfg) return false;

  // 1. Delete generator channels by ID
  if (tieredCfg.channels) {
    for (const [key, chId] of Object.entries(tieredCfg.channels)) {
      if (chId) {
        markRestorationQueued(chId);
        const ch = guild.channels.cache.get(chId) || await guild.channels.fetch(chId).catch(() => null);
        if (ch) await ch.delete('Athena: Purging Tiered JTC Generator Channel').catch(() => null);
      }
    }
  }

  // 2. Delete interface channel by ID
  if (tieredCfg.interfaceChannelId) {
    markRestorationQueued(tieredCfg.interfaceChannelId);
    const iface = guild.channels.cache.get(tieredCfg.interfaceChannelId) || await guild.channels.fetch(tieredCfg.interfaceChannelId).catch(() => null);
    if (iface) await iface.delete('Athena: Purging Tiered JTC Interface Channel').catch(() => null);
  }

  // 3. Purge any active temporary channels created under the category
  const allJtc = db.getAllJtcChannels().filter(c => c.guildId === guild.id);
  for (const record of allJtc) {
    markRestorationQueued(record.channelId);
    const ch = guild.channels.cache.get(record.channelId) || await guild.channels.fetch(record.channelId).catch(() => null);
    if (ch && (ch.parentId === tieredCfg.categoryId || record.tier)) {
      if (record.textChannelId) {
        markRestorationQueued(record.textChannelId);
        const textCh = guild.channels.cache.get(record.textChannelId) || await guild.channels.fetch(record.textChannelId).catch(() => null);
        if (textCh) await textCh.delete('Athena: Purging Tiered JTC Temp Text').catch(() => null);
      }
      await ch.delete('Athena: Purging Tiered JTC Temp Channel').catch(() => null);
      db.removeJtcChannel(record.channelId);
    }
  }

  // 4. Delete the category itself by ID
  if (tieredCfg.categoryId) {
    markRestorationQueued(tieredCfg.categoryId);
    const cat = guild.channels.cache.get(tieredCfg.categoryId) || await guild.channels.fetch(tieredCfg.categoryId).catch(() => null);
    if (cat) await cat.delete('Athena: Purging Tiered JTC Category').catch(() => null);
  }

  // 5. Clear DB record
  db.clearTieredJtcConfig(guild.id);
  return true;
}

// ==========================================
// NORMAL / SINGLE JTC DEPLOY HELPER
// ==========================================
async function deployNormalJtc(guild, customCategory = null, customLobby = null, customPanel = null) {
  let category = customCategory;
  if (!category) {
    const existingCfg = db.getJtcConfig(guild.id);
    if (existingCfg?.categoryId) {
      category = guild.channels.cache.get(existingCfg.categoryId) || await guild.channels.fetch(existingCfg.categoryId).catch(() => null);
    }
    if (!category) {
      category = await guild.channels.create({
        name: 'Voice Rooms',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
          },
          {
            id: guild.client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.Connect,
              PermissionFlagsBits.Speak,
              PermissionFlagsBits.MoveMembers,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.EmbedLinks
            ]
          }
        ],
        reason: 'Athena Normal JTC Setup'
      });
    }
  }

  let lobbyChannel = customLobby;
  if (!lobbyChannel) {
    const existingCfg = db.getJtcConfig(guild.id);
    if (existingCfg?.lobbyChannelId) {
      lobbyChannel = guild.channels.cache.get(existingCfg.lobbyChannelId) || await guild.channels.fetch(existingCfg.lobbyChannelId).catch(() => null);
    }
    if (!lobbyChannel) {
      lobbyChannel = await guild.channels.create({
        name: '🔊 Join to Create',
        type: ChannelType.GuildVoice,
        parent: category.id,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
          },
          {
            id: guild.client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.Connect,
              PermissionFlagsBits.MoveMembers
            ]
          }
        ],
        reason: 'Athena Normal JTC Setup'
      });
    }
  }

  markRestorationQueued(category.id);
  markRestorationQueued(lobbyChannel.id);
  await setVoiceChannelStatus(guild.client, lobbyChannel.id, STANDARD_JTC_LOBBY_STATUS);

  const categoryId = category.id;
  const lobbyChannelId = lobbyChannel.id;
  const panelChannelId = customPanel?.id || null;

  if (customPanel) {
    const sharedPanel = buildSharedPanel(guild);
    const sentMsg = await customPanel.send(sharedPanel).catch(() => null);
    if (sentMsg) {
      db.setJtcConfig(guild.id, lobbyChannelId, categoryId, panelChannelId);
      db.setPanelMessageId(guild.id, sentMsg.id);
    } else {
      db.setJtcConfig(guild.id, lobbyChannelId, categoryId, panelChannelId);
    }
  } else {
    db.setJtcConfig(guild.id, lobbyChannelId, categoryId, panelChannelId);
  }

  return { category, lobbyChannel, panelChannel: customPanel };
}

async function buildTieredStatusSyncPayload(guild, isSlash = false) {
  const tieredCfg = db.getTieredJtcConfig(guild.id);
  if (!tieredCfg) {
    const cmdExample = isSlash ? '/jtctiers action: setup' : '!jtctiers setup';
    return cv2.warn(
      `Not Found | ${WARN_EMOJI}`,
      `No active Tiered Voice Hub configuration found for this server. Deploy one with \`${cmdExample}\`.`
    );
  }
  const res = await syncJtcLobbyStatuses(guild, { onlyTiered: true, delayMs: 280 });
  const lines = res.entries.map((e) => {
    const link = e.channel ? formatChannelLink(e.channel, guild) : `\`${e.label}\``;
    const badge = e.ok ? TICK_EMOJI : WRONG_EMOJI;
    return `-# ${BULLET_EMOJI} **${e.label}:** ${link} · ${badge} ${e.ok ? 'Synced' : (e.missing ? 'Missing' : 'Failed')}`;
  });
  return cv2.success(
    `Tier VC Statuses Synchronized | ${TICK_EMOJI}`,
    `Updated Discord Voice Channel Status on **${res.updated}/${res.total}** tier generator lobbies.\n\n${lines.join('\n')}`
  );
}

// ==========================================
// EXPORTED COMMANDS
// ==========================================
export const commands = [
  // ─── DEDICATED NORMAL SINGLE JTC SETUP ───
  {
    name: 'jtcnormal',
    aliases: ['normaljtc', 'jtcsingle', 'singlejtc', 'jtcstandard'],
    description: 'Deploy a single standard Join to Create lobby and category. [Extra Owner]',
    category: 'utility',
    permissions: [PermissionFlagsBits.ManageGuild],
    options: [
      { name: 'channel', description: 'Existing VC to bind as the lobby (optional)', type: 7, required: false, channel_types: [2] },
      { name: 'category', description: 'Existing Category to place rooms in (optional)', type: 7, required: false, channel_types: [4] },
      { name: 'panel_channel', description: 'Text channel for the persistent control panel (optional)', type: 7, required: false, channel_types: [0] }
    ],
    async executePrefix(message, args) {
      if (!isExtraOwnerOrHigher(message.author.id, message.guild)) return;
      const guild = message.guild;

      let customLobby = null;
      let customCat = null;
      let customPanel = null;

      for (const arg of args) {
        const id = arg.replace(/\D/g, '');
        if (!id) continue;
        const ch = await guild.channels.fetch(id).catch(() => null);
        if (!ch) continue;
        if (ch.isVoiceBased()) customLobby = ch;
        else if (ch.type === 4) customCat = ch;
        else if (ch.isTextBased()) customPanel = ch;
      }

      const deployed = await deployNormalJtc(guild, customCat, customLobby, customPanel);
      const lobbyLink = formatChannelLink(deployed.lobbyChannel, guild);
      const catLink = formatChannelLink(deployed.category, guild);
      const panelLink = deployed.panelChannel ? formatChannelLink(deployed.panelChannel, guild) : 'Room Text Chat (Default)';

      return message.reply(cv2.success(
        `Normal JTC System Deployed | ${TICK_EMOJI}`,
        `The single Join to Create lobby has been set up successfully!\n\n` +
        `-# ${BULLET_EMOJI} **Lobby Channel:** ${lobbyLink}\n` +
        `-# ${BULLET_EMOJI} **Category:** ${catLink}\n` +
        `-# ${BULLET_EMOJI} **Control Panel:** ${panelLink}\n\n` +
        `> When members join the lobby, Athena automatically generates a private temporary voice room and moves them in.\n` +
        `> To remove this setup, run \`!jtcdisable standard\`.`
      ));
    },
    async executeSlash(interaction) {
      if (!isExtraOwnerOrHigher(interaction.user.id, interaction.guild)) {
        return interaction.reply({ ...cv2.warn(`Unauthorized | ${WARN_EMOJI}`, 'This command requires Extra Owner clearance.'), flags: MessageFlags.Ephemeral });
      }
      await interaction.deferReply();
      const guild = interaction.guild;
      const customLobby = interaction.options.getChannel('channel');
      const customCat = interaction.options.getChannel('category');
      const customPanel = interaction.options.getChannel('panel_channel');

      const deployed = await deployNormalJtc(guild, customCat, customLobby, customPanel);
      const lobbyLink = formatChannelLink(deployed.lobbyChannel, guild);
      const catLink = formatChannelLink(deployed.category, guild);
      const panelLink = deployed.panelChannel ? formatChannelLink(deployed.panelChannel, guild) : 'Room Text Chat (Default)';

      return interaction.editReply(cv2.success(
        `Normal JTC System Deployed | ${TICK_EMOJI}`,
        `The single Join to Create lobby has been set up successfully!\n\n` +
        `-# ${BULLET_EMOJI} **Lobby Channel:** ${lobbyLink}\n` +
        `-# ${BULLET_EMOJI} **Category:** ${catLink}\n` +
        `-# ${BULLET_EMOJI} **Control Panel:** ${panelLink}\n\n` +
        `> When members join the lobby, Athena automatically generates a private temporary voice room and moves them in.\n` +
        `> To remove this setup, run \`/jtcdisable target: standard\`.`
      ));
    }
  },

  // ─── JTCSETUP ───
  {
    name: 'jtcsetup',
    aliases: ['jtc', 'join2create'],
    description: 'Deploy the Join to Create voice suite (Standard or Tiered). [Extra Owner]',
    category: 'utility',
    permissions: [PermissionFlagsBits.ManageGuild],
    options: [
      {
        name: 'preset',
        description: 'Choose between Standard single lobby or Tiered (Solo, Duo, Trio, Squad) suite',
        type: 3,
        required: false,
        choices: [
          { name: 'Tiered Suite (Solo, Duo, Trio, Squad + Interface)', value: 'tiers' },
          { name: 'Standard Single Lobby', value: 'standard' }
        ]
      },
      { name: 'channel', description: 'Select VC lobby (for standard setup)', type: 7, required: false, channel_types: [2] },
      { name: 'category', description: 'Select Category (for standard setup)', type: 7, required: false, channel_types: [4] },
      { name: 'panel_channel', description: 'Select Panel text channel (for standard setup)', type: 7, required: false, channel_types: [0] }
    ],
    async executePrefix(message, args) {
      if (!isExtraOwnerOrHigher(message.author.id, message.guild)) return;
      const guild = message.guild;

      const subArg = args[0]?.toLowerCase();

      // ── TIERED PRESET DEPLOYMENT ──
      if (subArg === 'tiers' || subArg === 'tier' || subArg === 'suite') {
        const existing = db.getTieredJtcConfig(guild.id);
        if (existing?.categoryId) {
          const existingCat = guild.channels.cache.get(existing.categoryId) || await guild.channels.fetch(existing.categoryId).catch(() => null);
          if (existingCat) {
            return message.reply(cv2.warn(
              `Already Configured | ${WARN_EMOJI}`,
              `The Tiered Voice Hub is already deployed under ${formatChannelLink(existingCat, guild)}.\n\nTo wipe and reset it, run \`!jtcdisable tiers\`.`
            ));
          }
        }

        const deployed = await deployTieredSuite(guild);
        return message.reply(cv2.success(
          `Tiered JTC Suite Activated | ${TICK_EMOJI}`,
          `The Tiered Voice Hub suite has been deployed successfully!\n\n` +
          `-# ${BULLET_EMOJI} **Category:** ${formatChannelLink(deployed.category, guild)}\n` +
          `-# ${BULLET_EMOJI} **Interface:** ${formatChannelLink(deployed.interfaceChannel, guild)} *(Persistent Control Center)*\n` +
          `-# ${BULLET_EMOJI} **Solo [1 Slot]:** ${formatChannelLink(deployed.soloChannel, guild)}\n` +
          `-# ${BULLET_EMOJI} **Duo [2 Slots]:** ${formatChannelLink(deployed.duoChannel, guild)}\n` +
          `-# ${BULLET_EMOJI} **Trio [3 Slots]:** ${formatChannelLink(deployed.trioChannel, guild)}\n` +
          `-# ${BULLET_EMOJI} **Squad [4 Slots]:** ${formatChannelLink(deployed.squadChannel, guild)}\n` +
          `-# ${BULLET_EMOJI} **Unlimited [Free]:** ${formatChannelLink(deployed.unlimitedChannel, guild)}\n\n` +
          `> Admins may freely rename the category and channels anytime in Discord — Athena tracks them by database ID.\n` +
          `> To wipe this entire suite, run \`!jtcdisable tiers\`.`
        ));
      }

      // ── STANDARD / NORMAL SETUP ──
      let customLobby = null;
      let customCat = null;
      let customPanel = null;

      for (const arg of args) {
        const id = arg.replace(/\D/g, '');
        if (!id) continue;
        const ch = await guild.channels.fetch(id).catch(() => null);
        if (!ch) continue;
        if (ch.isVoiceBased()) customLobby = ch;
        else if (ch.type === 4) customCat = ch;
        else if (ch.isTextBased()) customPanel = ch;
      }

      const deployed = await deployNormalJtc(guild, customCat, customLobby, customPanel);
      const lobbyLink = formatChannelLink(deployed.lobbyChannel, guild);
      const catLink = formatChannelLink(deployed.category, guild);
      const panelLink = deployed.panelChannel ? formatChannelLink(deployed.panelChannel, guild) : 'Room Text Chat (Default)';

      return message.reply(cv2.success(
        `JTC System Activated | ${TICK_EMOJI}`,
        `Standard Join to Create system has been configured!\n\n` +
        `-# ${BULLET_EMOJI} **Lobby Channel:** ${lobbyLink}\n` +
        `-# ${BULLET_EMOJI} **Category:** ${catLink}\n` +
        `-# ${BULLET_EMOJI} **Panel Channel:** ${panelLink}\n\n` +
        `> When members connect to the lobby, private temporary channels are automatically created.\n` +
        `> Want Solo/Duo/Trio/Squad presets? Run \`!jtcsetup tiers\` or \`!jtctiers\`.`
      ));
    },
    async executeSlash(interaction) {
      if (!isExtraOwnerOrHigher(interaction.user.id, interaction.guild)) {
        return interaction.reply({ ...cv2.warn(`Unauthorized | ${WARN_EMOJI}`, 'This command requires Extra Owner clearance.'), flags: MessageFlags.Ephemeral });
      }
      await interaction.deferReply();
      const guild = interaction.guild;
      const preset = interaction.options.getString('preset');

      if (preset === 'tiers') {
        const existing = db.getTieredJtcConfig(guild.id);
        if (existing?.categoryId) {
          const existingCat = guild.channels.cache.get(existing.categoryId) || await guild.channels.fetch(existing.categoryId).catch(() => null);
          if (existingCat) {
            return interaction.editReply(cv2.warn(
              `Already Configured | ${WARN_EMOJI}`,
              `The Tiered Voice Hub is already deployed under ${formatChannelLink(existingCat, guild)}.\n\nTo wipe and reset it, run \`/jtcdisable target: tiers\`.`
            ));
          }
        }

        const deployed = await deployTieredSuite(guild);
        return interaction.editReply(cv2.success(
          `Tiered JTC Suite Activated | ${TICK_EMOJI}`,
          `The Tiered Voice Hub suite has been deployed successfully!\n\n` +
          `-# ${BULLET_EMOJI} **Category:** ${formatChannelLink(deployed.category, guild)}\n` +
          `-# ${BULLET_EMOJI} **Interface:** ${formatChannelLink(deployed.interfaceChannel, guild)} *(Persistent Control Center)*\n` +
          `-# ${BULLET_EMOJI} **Solo [1 Slot]:** ${formatChannelLink(deployed.soloChannel, guild)}\n` +
          `-# ${BULLET_EMOJI} **Duo [2 Slots]:** ${formatChannelLink(deployed.duoChannel, guild)}\n` +
          `-# ${BULLET_EMOJI} **Trio [3 Slots]:** ${formatChannelLink(deployed.trioChannel, guild)}\n` +
          `-# ${BULLET_EMOJI} **Squad [4 Slots]:** ${formatChannelLink(deployed.squadChannel, guild)}\n` +
          `-# ${BULLET_EMOJI} **Unlimited [Free]:** ${formatChannelLink(deployed.unlimitedChannel, guild)}\n\n` +
          `> Admins may freely rename the category and channels anytime in Discord — Athena tracks them by database ID.\n` +
          `> To wipe this entire suite, run \`/jtcdisable target: tiers\`.`
        ));
      }

      let customLobby = interaction.options.getChannel('channel');
      let customCat = interaction.options.getChannel('category');
      let customPanel = interaction.options.getChannel('panel_channel');

      const deployed = await deployNormalJtc(guild, customCat, customLobby, customPanel);
      const lobbyLink = formatChannelLink(deployed.lobbyChannel, guild);
      const catLink = formatChannelLink(deployed.category, guild);
      const panelLink = deployed.panelChannel ? formatChannelLink(deployed.panelChannel, guild) : 'Room Text Chat (Default)';

      return interaction.editReply(cv2.success(
        `JTC System Activated | ${TICK_EMOJI}`,
        `Standard Join to Create system has been configured!\n\n` +
        `-# ${BULLET_EMOJI} **Lobby Channel:** ${lobbyLink}\n` +
        `-# ${BULLET_EMOJI} **Category:** ${catLink}\n` +
        `-# ${BULLET_EMOJI} **Panel Channel:** ${panelLink}\n\n` +
        `> When members connect to the lobby, private temporary channels are automatically created.`
      ));
    }
  },

  // ─── TIERED JTC SHORTCUT COMMAND ───
  {
    name: 'jtctiers',
    aliases: ['tieredjtc', 'jtcsuite'],
    description: 'Deploy or manage the Tiered (Solo, Duo, Trio, Squad) Voice Hub suite. [Extra Owner]',
    category: 'utility',
    permissions: [PermissionFlagsBits.ManageGuild],
    options: [
      {
        name: 'action',
        description: 'Action to perform: setup, disable, sync, or info',
        type: 3,
        required: true,
        choices: [
          { name: 'Setup Suite (Create Category & Channels)', value: 'setup' },
          { name: 'Repair & Sync Tier VC Statuses', value: 'sync' },
          { name: 'Disable & Wipe Suite (Delete Category & Channels)', value: 'disable' },
          { name: 'View Suite Status', value: 'info' }
        ]
      }
    ],
    async executePrefix(message, args) {
      if (!isExtraOwnerOrHigher(message.author.id, message.guild)) return;
      const guild = message.guild;
      const action = (args[0] || 'setup').toLowerCase();

      if (action === 'sync' || action === 'fix' || action === 'repair' || action === 'resync' || action === 'vcstatus') {
        return message.reply(await buildTieredStatusSyncPayload(guild, false));
      }

      if (action === 'disable' || action === 'delete' || action === 'wipe' || action === 'off') {
        const tieredCfg = db.getTieredJtcConfig(guild.id);
        if (!tieredCfg) {
          return message.reply(cv2.warn(
            `Not Found | ${WARN_EMOJI}`,
            `No active Tiered Voice Hub configuration found for this server.`
          ));
        }
        await wipeTieredSuite(guild);
        return message.reply(cv2.success(
          `Tiered JTC Suite Wiped | ${TICK_EMOJI}`,
          `The Tiered Voice Hub category, interface channel, generator channels, and active temporary rooms have been completely removed.`
        ));
      }

      if (action === 'info' || action === 'status') {
        const tieredCfg = db.getTieredJtcConfig(guild.id);
        if (!tieredCfg) {
          return message.reply(cv2.info(
            `Tiered Suite Status | ${WARN_EMOJI}`,
            `No Tiered Voice Hub is currently configured. Deploy one with \`!jtctiers setup\`.`
          ));
        }
        const catLink = tieredCfg.categoryId ? formatChannelLink(tieredCfg.categoryId, guild) : 'None';
        const ifaceLink = tieredCfg.interfaceChannelId ? formatChannelLink(tieredCfg.interfaceChannelId, guild) : 'None';
        const soloLink = tieredCfg.channels?.solo ? formatChannelLink(tieredCfg.channels.solo, guild) : 'None';
        const duoLink = tieredCfg.channels?.duo ? formatChannelLink(tieredCfg.channels.duo, guild) : 'None';
        const trioLink = tieredCfg.channels?.trio ? formatChannelLink(tieredCfg.channels.trio, guild) : 'None';
        const squadLink = tieredCfg.channels?.squad ? formatChannelLink(tieredCfg.channels.squad, guild) : (tieredCfg.channels?.unlimited ? formatChannelLink(tieredCfg.channels.unlimited, guild) : 'None');
        const unlimitedLink = tieredCfg.channels?.unlimited ? formatChannelLink(tieredCfg.channels.unlimited, guild) : 'None';

        return message.reply(cv2.info(
          `Tiered Suite Status | ${TICK_EMOJI}`,
          `-# ${BULLET_EMOJI} **Category:** ${catLink}\n` +
          `-# ${BULLET_EMOJI} **Interface:** ${ifaceLink}\n` +
          `-# ${BULLET_EMOJI} **Solo [1]:** ${soloLink}\n` +
          `-# ${BULLET_EMOJI} **Duo [2]:** ${duoLink}\n` +
          `-# ${BULLET_EMOJI} **Trio [3]:** ${trioLink}\n` +
          `-# ${BULLET_EMOJI} **Squad [4]:** ${squadLink}\n` +
          `-# ${BULLET_EMOJI} **Unlimited [Free]:** ${unlimitedLink}`
        ));
      }

      // Default: Setup
      const existing = db.getTieredJtcConfig(guild.id);
      if (existing?.categoryId) {
        const existingCat = guild.channels.cache.get(existing.categoryId) || await guild.channels.fetch(existing.categoryId).catch(() => null);
        if (existingCat) {
          return message.reply(cv2.warn(
            `Already Configured | ${WARN_EMOJI}`,
            `The Tiered Voice Hub is already deployed under ${formatChannelLink(existingCat, guild)}.\n\nTo wipe and reset it, run \`!jtctiers disable\`.`
          ));
        }
      }

      const deployed = await deployTieredSuite(guild);
      return message.reply(cv2.success(
        `Tiered JTC Suite Activated | ${TICK_EMOJI}`,
        `The Tiered Voice Hub suite has been deployed successfully!\n\n` +
        `-# ${BULLET_EMOJI} **Category:** ${formatChannelLink(deployed.category, guild)}\n` +
        `-# ${BULLET_EMOJI} **Interface:** ${formatChannelLink(deployed.interfaceChannel, guild)} *(Persistent Control Center)*\n` +
        `-# ${BULLET_EMOJI} **Solo [1 Slot]:** ${formatChannelLink(deployed.soloChannel, guild)}\n` +
        `-# ${BULLET_EMOJI} **Duo [2 Slots]:** ${formatChannelLink(deployed.duoChannel, guild)}\n` +
        `-# ${BULLET_EMOJI} **Trio [3 Slots]:** ${formatChannelLink(deployed.trioChannel, guild)}\n` +
        `-# ${BULLET_EMOJI} **Squad [4 Slots]:** ${formatChannelLink(deployed.squadChannel, guild)}\n` +
        `-# ${BULLET_EMOJI} **Unlimited [Free]:** ${formatChannelLink(deployed.unlimitedChannel, guild)}\n\n` +
        `> Admins may freely rename the category and channels anytime in Discord — Athena tracks them by database ID.\n` +
        `> To wipe this entire suite, run \`!jtctiers disable\`.`
      ));
    },
    async executeSlash(interaction) {
      if (!isExtraOwnerOrHigher(interaction.user.id, interaction.guild)) {
        return interaction.reply({ ...cv2.warn(`Unauthorized | ${WARN_EMOJI}`, 'This command requires Extra Owner clearance.'), flags: MessageFlags.Ephemeral });
      }
      await interaction.deferReply();
      const guild = interaction.guild;
      const action = interaction.options.getString('action');

      if (action === 'sync') {
        return interaction.editReply(await buildTieredStatusSyncPayload(guild, true));
      }

      if (action === 'disable') {
        const tieredCfg = db.getTieredJtcConfig(guild.id);
        if (!tieredCfg) {
          return interaction.editReply(cv2.warn(
            `Not Found | ${WARN_EMOJI}`,
            `No active Tiered Voice Hub configuration found for this server.`
          ));
        }
        await wipeTieredSuite(guild);
        return interaction.editReply(cv2.success(
          `Tiered JTC Suite Wiped | ${TICK_EMOJI}`,
          `The Tiered Voice Hub category, interface channel, generator channels, and active temporary rooms have been completely removed.`
        ));
      }

      if (action === 'info') {
        const tieredCfg = db.getTieredJtcConfig(guild.id);
        if (!tieredCfg) {
          return interaction.editReply(cv2.info(
            `Tiered Suite Status | ${WARN_EMOJI}`,
            `No Tiered Voice Hub is currently configured. Deploy one with \`/jtctiers action: setup\`.`
          ));
        }
        const catLink = tieredCfg.categoryId ? formatChannelLink(tieredCfg.categoryId, guild) : 'None';
        const ifaceLink = tieredCfg.interfaceChannelId ? formatChannelLink(tieredCfg.interfaceChannelId, guild) : 'None';
        const soloLink = tieredCfg.channels?.solo ? formatChannelLink(tieredCfg.channels.solo, guild) : 'None';
        const duoLink = tieredCfg.channels?.duo ? formatChannelLink(tieredCfg.channels.duo, guild) : 'None';
        const trioLink = tieredCfg.channels?.trio ? formatChannelLink(tieredCfg.channels.trio, guild) : 'None';
        const squadLink = tieredCfg.channels?.squad ? formatChannelLink(tieredCfg.channels.squad, guild) : (tieredCfg.channels?.unlimited ? formatChannelLink(tieredCfg.channels.unlimited, guild) : 'None');
        const unlimitedLink = tieredCfg.channels?.unlimited ? formatChannelLink(tieredCfg.channels.unlimited, guild) : 'None';

        return interaction.editReply(cv2.info(
          `Tiered Suite Status | ${TICK_EMOJI}`,
          `-# ${BULLET_EMOJI} **Category:** ${catLink}\n` +
          `-# ${BULLET_EMOJI} **Interface:** ${ifaceLink}\n` +
          `-# ${BULLET_EMOJI} **Solo [1]:** ${soloLink}\n` +
          `-# ${BULLET_EMOJI} **Duo [2]:** ${duoLink}\n` +
          `-# ${BULLET_EMOJI} **Trio [3]:** ${trioLink}\n` +
          `-# ${BULLET_EMOJI} **Squad [4]:** ${squadLink}\n` +
          `-# ${BULLET_EMOJI} **Unlimited [Free]:** ${unlimitedLink}`
        ));
      }

      // Default: Setup
      const existing = db.getTieredJtcConfig(guild.id);
      if (existing?.categoryId) {
        const existingCat = guild.channels.cache.get(existing.categoryId) || await guild.channels.fetch(existing.categoryId).catch(() => null);
        if (existingCat) {
          return interaction.editReply(cv2.warn(
            `Already Configured | ${WARN_EMOJI}`,
            `The Tiered Voice Hub is already deployed under ${formatChannelLink(existingCat, guild)}.\n\nTo wipe and reset it, run \`/jtctiers action: disable\`.`
          ));
        }
      }

      const deployed = await deployTieredSuite(guild);
      return interaction.editReply(cv2.success(
        `Tiered JTC Suite Activated | ${TICK_EMOJI}`,
        `The Tiered Voice Hub suite has been deployed successfully!\n\n` +
        `-# ${BULLET_EMOJI} **Category:** ${formatChannelLink(deployed.category, guild)}\n` +
        `-# ${BULLET_EMOJI} **Interface:** ${formatChannelLink(deployed.interfaceChannel, guild)} *(Persistent Control Center)*\n` +
        `-# ${BULLET_EMOJI} **Solo [1 Slot]:** ${formatChannelLink(deployed.soloChannel, guild)}\n` +
        `-# ${BULLET_EMOJI} **Duo [2 Slots]:** ${formatChannelLink(deployed.duoChannel, guild)}\n` +
        `-# ${BULLET_EMOJI} **Trio [3 Slots]:** ${formatChannelLink(deployed.trioChannel, guild)}\n` +
        `-# ${BULLET_EMOJI} **Squad [4 Slots]:** ${formatChannelLink(deployed.squadChannel, guild)}\n` +
        `-# ${BULLET_EMOJI} **Unlimited [Free]:** ${formatChannelLink(deployed.unlimitedChannel, guild)}\n\n` +
        `> Admins may freely rename the category and channels anytime in Discord — Athena tracks them by database ID.\n` +
        `> To wipe this entire suite, run \`/jtctiers action: disable\`.`
      ));
    }
  },

  // ─── SECONDARY JTC SETUP ───
  {
    name: 'secondaryjtc',
    aliases: ['jtc2', 'secondjtc'],
    description: 'Set up a secondary Join to Create lobby. [Extra Owner]',
    category: 'utility',
    permissions: [PermissionFlagsBits.ManageGuild],
    options: [
      { name: 'channel', description: 'Select VC lobby (or use channel_id)', type: 7, required: false, channel_types: [2] }
    ],
    async executePrefix(message, args) {
      if (!isExtraOwnerOrHigher(message.author.id, message.guild)) return;
      const guild = message.guild;

      let lobbyChannel = null;
      for (const arg of args) {
        const id = arg.replace(/\D/g, '');
        if (!id) continue;
        const ch = await guild.channels.fetch(id).catch(() => null);
        if (ch && ch.isVoiceBased()) {
          lobbyChannel = ch;
          break;
        }
      }

      if (!lobbyChannel) {
        const jtcConfig = db.getJtcConfig(guild.id);
        const parentId = jtcConfig?.categoryId || null;
        lobbyChannel = await guild.channels.create({ 
          name: '➕ Secondary JTC', 
          type: ChannelType.GuildVoice, 
          parent: parentId, 
          reason: 'Athena Secondary JTC Setup' 
        });
      }

      db.setSecondaryJtcConfig(guild.id, lobbyChannel.id);

      return message.reply(cv2.success(
        `Secondary JTC Activated | ${TICK_EMOJI}`,
        `Secondary Join to Create lobby is ready!\n\n` +
        `-# ${BULLET_EMOJI} **Secondary Lobby:** ${formatChannelLink(lobbyChannel, guild)}`
      ));
    },
    async executeSlash(interaction) {
      if (!isExtraOwnerOrHigher(interaction.user.id, interaction.guild)) {
        return interaction.reply({ ...cv2.warn(`Unauthorized | ${WARN_EMOJI}`, 'This command requires Extra Owner clearance.'), flags: MessageFlags.Ephemeral });
      }
      await interaction.deferReply();
      const guild = interaction.guild;
      let lobbyChannel = interaction.options.getChannel('channel');

      if (!lobbyChannel) {
        const jtcConfig = db.getJtcConfig(guild.id);
        const parentId = jtcConfig?.categoryId || null;
        lobbyChannel = await guild.channels.create({ 
          name: '➕ Secondary JTC', 
          type: ChannelType.GuildVoice, 
          parent: parentId, 
          reason: 'Athena Secondary JTC Setup' 
        });
      }

      db.setSecondaryJtcConfig(guild.id, lobbyChannel.id);

      return interaction.editReply(cv2.success(
        `Secondary JTC Activated | ${TICK_EMOJI}`,
        `Secondary Join to Create lobby is ready!\n\n` +
        `-# ${BULLET_EMOJI} **Secondary Lobby:** ${formatChannelLink(lobbyChannel, guild)}`
      ));
    }
  },

  // ─── JTCDISABLE ───
  {
    name: 'jtcdisable',
    aliases: ['jtcoff', 'jtcstop'],
    description: 'Disable Join to Create system (Standard or Tiered). [Extra Owner]',
    category: 'utility',
    permissions: [PermissionFlagsBits.ManageGuild],
    options: [
      {
        name: 'target',
        description: 'Choose which JTC configuration to disable and remove',
        type: 3,
        required: false,
        choices: [
          { name: 'Tiered Suite (Wipes Category & All Generator Channels)', value: 'tiers' },
          { name: 'Standard JTC Lobby', value: 'standard' },
          { name: 'All JTC Configurations', value: 'all' }
        ]
      }
    ],
    async executePrefix(message, args) {
      if (!isExtraOwnerOrHigher(message.author.id, message.guild)) return;
      const guild = message.guild;
      const target = args[0]?.toLowerCase();

      const standardCfg = db.getJtcConfig(guild.id);
      const tieredCfg = db.getTieredJtcConfig(guild.id);

      if (!standardCfg?.lobbyChannelId && !tieredCfg) {
        return message.reply(cv2.warn(
          `Not Found | ${WARN_EMOJI}`,
          `No active Join to Create system was found configured for this server.`
        ));
      }

      // If user specifically requested 'tiers'
      if (target === 'tiers' || target === 'tier' || target === 'suite') {
        if (!tieredCfg) {
          return message.reply(cv2.warn(`Not Found | ${WARN_EMOJI}`, 'No active Tiered Voice Hub found to disable.'));
        }
        await wipeTieredSuite(guild);
        return message.reply(cv2.success(
          `Tiered JTC Suite Removed | ${TICK_EMOJI}`,
          `The Tiered Voice Hub category, interface channel, and generator channels have been wiped completely.`
        ));
      }

      // If user specifically requested 'standard' or 'normal' or 'single'
      if (target === 'standard' || target === 'normal' || target === 'single') {
        if (!standardCfg?.lobbyChannelId) {
          return message.reply(cv2.warn(`Not Found | ${WARN_EMOJI}`, 'No active Standard JTC lobby found to disable.'));
        }
        // Attempt to clean up the lobby channel and category if desired
        if (standardCfg.lobbyChannelId) {
          const lobby = guild.channels.cache.get(standardCfg.lobbyChannelId) || await guild.channels.fetch(standardCfg.lobbyChannelId).catch(() => null);
          if (lobby) await lobby.delete('Athena: Standard JTC disabled').catch(() => null);
        }
        if (standardCfg.categoryId) {
          const cat = guild.channels.cache.get(standardCfg.categoryId) || await guild.channels.fetch(standardCfg.categoryId).catch(() => null);
          if (cat && cat.children?.cache?.size === 0) {
            await cat.delete('Athena: Empty JTC category cleanup').catch(() => null);
          }
        }
        db.clearJtcConfig(guild.id);
        return message.reply(cv2.danger(
          `Standard JTC Disabled | ${WRONG_EMOJI}`,
          `The Standard Join to Create system has been turned off and cleaned up.`
        ));
      }

      // If user specifically requested 'all'
      if (target === 'all') {
        if (tieredCfg) await wipeTieredSuite(guild);
        if (standardCfg?.lobbyChannelId) {
          const lobby = guild.channels.cache.get(standardCfg.lobbyChannelId) || await guild.channels.fetch(standardCfg.lobbyChannelId).catch(() => null);
          if (lobby) await lobby.delete('Athena: Purging JTC').catch(() => null);
        }
        db.clearJtcConfig(guild.id);
        return message.reply(cv2.danger(
          `All JTC Systems Disabled | ${WRONG_EMOJI}`,
          `All Join to Create configurations and tiered voice channels have been disabled and purged.`
        ));
      }

      // No argument passed: intelligent detection
      if (tieredCfg && !standardCfg?.lobbyChannelId) {
        await wipeTieredSuite(guild);
        return message.reply(cv2.success(
          `Tiered JTC Suite Removed | ${TICK_EMOJI}`,
          `The Tiered Voice Hub category, interface channel, and generator channels have been wiped completely.`
        ));
      }

      if (!tieredCfg && standardCfg?.lobbyChannelId) {
        if (standardCfg.lobbyChannelId) {
          const lobby = guild.channels.cache.get(standardCfg.lobbyChannelId) || await guild.channels.fetch(standardCfg.lobbyChannelId).catch(() => null);
          if (lobby) await lobby.delete('Athena: Standard JTC disabled').catch(() => null);
        }
        db.clearJtcConfig(guild.id);
        return message.reply(cv2.danger(
          `Standard JTC Disabled | ${WRONG_EMOJI}`,
          `The Standard Join to Create system has been turned off.`
        ));
      }

      // Both are active: prompt user with clear choices
      return message.reply(cv2.info(
        `Specify Target | ${WARN_EMOJI}`,
        `You have multiple JTC systems active. Please specify what you wish to disable:\n\n` +
        `-# ${BULLET_EMOJI} \`!jtcdisable tiers\` - Wipes the Tiered Voice Hub category & channels\n` +
        `-# ${BULLET_EMOJI} \`!jtcdisable standard\` - Turns off the Standard JTC lobby\n` +
        `-# ${BULLET_EMOJI} \`!jtcdisable all\` - Disables and purges both systems`
      ));
    },
    async executeSlash(interaction) {
      if (!isExtraOwnerOrHigher(interaction.user.id, interaction.guild)) {
        return interaction.reply({ ...cv2.warn(`Unauthorized | ${WARN_EMOJI}`, 'This command requires Extra Owner clearance.'), flags: MessageFlags.Ephemeral });
      }
      await interaction.deferReply();
      const guild = interaction.guild;
      const target = interaction.options.getString('target') || 'tiers';

      const standardCfg = db.getJtcConfig(guild.id);
      const tieredCfg = db.getTieredJtcConfig(guild.id);

      if (target === 'tiers') {
        if (!tieredCfg) {
          return interaction.editReply(cv2.warn(`Not Found | ${WARN_EMOJI}`, 'No active Tiered Voice Hub found to disable.'));
        }
        await wipeTieredSuite(guild);
        return interaction.editReply(cv2.success(
          `Tiered JTC Suite Removed | ${TICK_EMOJI}`,
          `The Tiered Voice Hub category, interface channel, and generator channels have been wiped completely.`
        ));
      }

      if (target === 'standard') {
        if (!standardCfg?.lobbyChannelId) {
          return interaction.editReply(cv2.warn(`Not Found | ${WARN_EMOJI}`, 'No active Standard JTC lobby found to disable.'));
        }
        if (standardCfg.lobbyChannelId) {
          const lobby = guild.channels.cache.get(standardCfg.lobbyChannelId) || await guild.channels.fetch(standardCfg.lobbyChannelId).catch(() => null);
          if (lobby) await lobby.delete('Athena: Standard JTC disabled').catch(() => null);
        }
        db.clearJtcConfig(guild.id);
        return interaction.editReply(cv2.danger(
          `Standard JTC Disabled | ${WRONG_EMOJI}`,
          `The Standard Join to Create system has been turned off.`
        ));
      }

      if (target === 'all') {
        if (tieredCfg) await wipeTieredSuite(guild);
        if (standardCfg?.lobbyChannelId) {
          const lobby = guild.channels.cache.get(standardCfg.lobbyChannelId) || await guild.channels.fetch(standardCfg.lobbyChannelId).catch(() => null);
          if (lobby) await lobby.delete('Athena: Purging JTC').catch(() => null);
        }
        db.clearJtcConfig(guild.id);
        return interaction.editReply(cv2.danger(
          `All JTC Systems Disabled | ${WRONG_EMOJI}`,
          `All Join to Create configurations and tiered voice channels have been disabled and purged.`
        ));
      }
    }
  },

  // ─── VC QUICK ACTIONS ───
  {
    name: 'vc',
    aliases: ['voicechannel', 'myvc'],
    description: 'Voice channel quick actions and information.',
    category: 'utility',
    permissions: [],
    options: [
      { name: 'claim', description: 'Claim ownership of the channel if the owner left', type: 1 },
      { name: 'info', description: 'Show your voice channel details and statistics', type: 1 }
    ],
    async executePrefix(message, args) {
      const sub = args[0]?.toLowerCase();
      const member = message.member;
      const guild = message.guild;
      const vcChannel = member.voice?.channel;

      if (!vcChannel) {
        return message.reply(cv2.warn(
          `Not In Voice | ${WARN_EMOJI}`,
          `You must be connected to a voice channel to use this.`
        ));
      }
      const jtcData = db.getJtcChannel(vcChannel.id);
      if (!jtcData) {
        return message.reply(cv2.warn(
          `Not A JTC Channel | ${WARN_EMOJI}`,
          `This command only operates in an active Join to Create channel.`
        ));
      }

      if (sub === 'claim') {
        if (vcChannel.members.has(jtcData.ownerId)) {
          return message.reply(cv2.warn(
            `Cannot Claim | ${WARN_EMOJI}`,
            `The channel owner is still connected to the voice room.`
          ));
        }
        db.setJtcOwner(vcChannel.id, member.id);
        await vcChannel.permissionOverwrites.edit(member.id, { 
          Connect: true, 
          ManageChannels: true, 
          ViewChannel: true, 
          MuteMembers: true, 
          DeafenMembers: true 
        }).catch(() => null);

        return message.reply(cv2.success(
          `Ownership Claimed | ${TICK_EMOJI}`,
          `You are now the owner of **${vcChannel.name}**.`
        ));
      }

      // Default: Info
      const owner = await guild.members.fetch(jtcData.ownerId).catch(() => null);
      const ownerText = owner ? formatUserLink(owner, guild) : `\`${jtcData.ownerId}\``;
      const chLink = formatChannelLink(vcChannel, guild);
      const memberLinks = vcChannel.members.size > 0 
        ? vcChannel.members.map(m => formatUserLink(m, guild)).join(', ') 
        : 'None';

      return message.reply(cv2.info(
        `Channel Overview | ${TICK_EMOJI}`,
        `-# ${BULLET_EMOJI} **Channel:** ${chLink}\n` +
        `-# ${BULLET_EMOJI} **Owner:** ${ownerText}\n` +
        `-# ${BULLET_EMOJI} **User Limit:** \`${vcChannel.userLimit === 0 ? 'Unlimited' : vcChannel.userLimit}\`\n` +
        `-# ${BULLET_EMOJI} **Audio Bitrate:** \`${Math.round(vcChannel.bitrate / 1000)}kbps\`\n` +
        `-# ${BULLET_EMOJI} **Region:** \`${vcChannel.rtcRegion || 'Automatic'}\`\n` +
        `-# ${BULLET_EMOJI} **Age-Restricted:** \`${vcChannel.nsfw ? 'Yes' : 'No'}\`\n` +
        `-# ${BULLET_EMOJI} **Active Connected:** ${memberLinks}`
      ));
    },
    async executeSlash(interaction) {
      const sub = interaction.options.getSubcommand();
      const member = interaction.member;
      const guild = interaction.guild;
      const vcChannel = member.voice?.channel;

      if (!vcChannel) {
        return interaction.reply(cv2.warn(
          `Not In Voice | ${WARN_EMOJI}`,
          `You must be in a voice channel to use this.`
        ));
      }
      const jtcData = db.getJtcChannel(vcChannel.id);
      if (!jtcData) {
        return interaction.reply(cv2.warn(
          `Not A JTC Channel | ${WARN_EMOJI}`,
          `This only works in a Join to Create channel.`
        ));
      }

      if (sub === 'claim') {
        if (vcChannel.members.has(jtcData.ownerId)) {
          return interaction.reply(cv2.warn(
            `Cannot Claim | ${WARN_EMOJI}`,
            `The owner is still in the channel.`
          ));
        }
        db.setJtcOwner(vcChannel.id, member.id);
        await vcChannel.permissionOverwrites.edit(member.id, { 
          Connect: true, 
          ManageChannels: true, 
          ViewChannel: true, 
          MuteMembers: true, 
          DeafenMembers: true 
        }).catch(() => null);

        return interaction.reply(cv2.success(
          `Ownership Claimed | ${TICK_EMOJI}`,
          `You are now the owner of **${vcChannel.name}**.`
        ));
      }

      if (sub === 'info') {
        const owner = await guild.members.fetch(jtcData.ownerId).catch(() => null);
        const ownerText = owner ? formatUserLink(owner, guild) : `\`${jtcData.ownerId}\``;
        const chLink = formatChannelLink(vcChannel, guild);
        const memberLinks = vcChannel.members.size > 0 
          ? vcChannel.members.map(m => formatUserLink(m, guild)).join(', ') 
          : 'None';

        return interaction.reply(cv2.info(
          `Channel Overview | ${TICK_EMOJI}`,
          `-# ${BULLET_EMOJI} **Channel:** ${chLink}\n` +
          `-# ${BULLET_EMOJI} **Owner:** ${ownerText}\n` +
          `-# ${BULLET_EMOJI} **User Limit:** \`${vcChannel.userLimit === 0 ? 'Unlimited' : vcChannel.userLimit}\`\n` +
          `-# ${BULLET_EMOJI} **Audio Bitrate:** \`${Math.round(vcChannel.bitrate / 1000)}kbps\`\n` +
          `-# ${BULLET_EMOJI} **Region:** \`${vcChannel.rtcRegion || 'Automatic'}\`\n` +
          `-# ${BULLET_EMOJI} **Age-Restricted:** \`${vcChannel.nsfw ? 'Yes' : 'No'}\`\n` +
          `-# ${BULLET_EMOJI} **Active Connected:** ${memberLinks}`
        ));
      }
    }
  },

  // ─── JTC PERMIT & CHIME ───
  {
    name: 'jtc',
    aliases: ['jointocreate', 'tempvc'],
    description: 'Join to Create quick permit and chime configuration.',
    category: 'utility',
    permissions: [],
    options: [
      {
        name: 'add',
        description: 'Permit a user to join your locked JTC channel',
        type: 1,
        options: [
          { name: 'user', description: 'The user to permit', type: 6, required: true }
        ]
      },
      {
        name: 'chime',
        description: 'Toggle entrance chime sound alerts when members enter your voice room',
        type: 1,
        options: [
          {
            name: 'status',
            description: 'Enable or disable entrance chime',
            type: 3,
            required: true,
            choices: [
              { name: 'Enable Chime', value: 'on' },
              { name: 'Disable Chime', value: 'off' }
            ]
          }
        ]
      }
    ],
    async executePrefix(message, args) {
      if (args && args.length > 0) {
        const action = args[0].toLowerCase();
        if (action === 'add') {
          const targetUser = message.mentions.users.first();
          if (!targetUser) {
            return message.reply(cv2.warn(
              `Missing User | ${WARN_EMOJI}`,
              `Please mention a member: \`!jtc add @user\``
            ));
          }
          const vcChannel = message.member?.voice?.channel;
          if (!vcChannel) {
            return message.reply(cv2.warn(
              `Not In Voice | ${WARN_EMOJI}`,
              `You must be in a voice channel to use this.`
            ));
          }
          const jtcData = db.getJtcChannel(vcChannel.id);
          if (!jtcData) {
            return message.reply(cv2.warn(
              `Not A JTC Channel | ${WARN_EMOJI}`,
              `This only works in a Join to Create channel.`
            ));
          }
          if (jtcData.ownerId !== message.author.id && !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply(cv2.warn(
              `Unauthorized | ${WARN_EMOJI}`,
              `Only the channel owner or an administrator can permit users.`
            ));
          }
          await vcChannel.permissionOverwrites.edit(targetUser.id, { Connect: true, ViewChannel: true });
          const userLink = formatUserLink(targetUser, message.guild);
          return message.reply(cv2.success(
            `User Permitted | ${TICK_EMOJI}`,
            `${userLink} can now join your channel even when locked or hidden.`
          ));
        }

        if (action === 'chime') {
          const enable = args[1]?.toLowerCase() === 'on';
          const vcChannel = message.member?.voice?.channel;
          const jtcData = vcChannel ? db.getJtcChannel(vcChannel.id) : null;
          if (jtcData) {
            if (jtcData.ownerId !== message.author.id && !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
              return message.reply(cv2.warn(
                `Unauthorized | ${WARN_EMOJI}`,
                `Only the channel owner can configure channel chimes.`
              ));
            }
            if (!db.cache.jtcChannels[vcChannel.id]) db.cache.jtcChannels[vcChannel.id] = {};
            db.cache.jtcChannels[vcChannel.id].chime = enable;
            db.save();
            return message.reply(cv2.success(
              `Welcome Chime Updated | ${TICK_EMOJI}`,
              `Entrance welcome chimes have been **${enable ? 'enabled' : 'disabled'}** for **${vcChannel.name}**.`
            ));
          } else {
            if (!isExtraOwnerOrHigher(message.author.id, message.guild)) {
              return message.reply(cv2.warn(
                `Unauthorized | ${WARN_EMOJI}`,
                `You need Extra Owner clearance to toggle server-wide JTC chimes.`
              ));
            }
            db.updateGuildConfig(message.guild.id, { jtcChime: enable });
            return message.reply(cv2.success(
              `Welcome Chime Configured | ${TICK_EMOJI}`,
              `Server-wide JTC entrance welcome chime set to **${enable ? 'ON' : 'OFF'}**.`
            ));
          }
        }
      }

      return message.reply(cv2.info(
        `Join to Create Hub | ${TICK_EMOJI}`,
        `-# ${BULLET_EMOJI} \`!jtcnormal\` - Deploy single standard Join to Create lobby & category\n` +
        `-# ${BULLET_EMOJI} \`!jtctiers setup\` - Deploy 4-tier Voice Hub suite (Solo, Duo, Trio, Squad)\n` +
        `-# ${BULLET_EMOJI} \`!jtcdisable standard\` - Turn off and remove standard JTC\n` +
        `-# ${BULLET_EMOJI} \`!jtcdisable tiers\` - Wipe and purge Tiered Voice Hub\n` +
        `-# ${BULLET_EMOJI} \`!jtc add @user\` - Whitelist user into locked VC\n` +
        `-# ${BULLET_EMOJI} \`!jtc chime on|off\` - Toggle entrance sound chime`
      ));
    },
    async executeSlash(interaction) {
      const sub = interaction.options.getSubcommand();
      const member = interaction.member;
      const vcChannel = member.voice?.channel;

      if (sub === 'add') {
        if (!vcChannel) {
          return interaction.reply(cv2.warn(
            `Not In Voice | ${WARN_EMOJI}`,
            `You must be in a voice channel to use this.`
          ));
        }
        const jtcData = db.getJtcChannel(vcChannel.id);
        if (!jtcData) {
          return interaction.reply(cv2.warn(
            `Not A JTC Channel | ${WARN_EMOJI}`,
            `This only works in a Join to Create channel.`
          ));
        }
        if (jtcData.ownerId !== member.id && !member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply(cv2.warn(
            `Unauthorized | ${WARN_EMOJI}`,
            `Only the channel owner can permit users.`
          ));
        }
        const targetUser = interaction.options.getUser('user');
        await vcChannel.permissionOverwrites.edit(targetUser.id, { Connect: true, ViewChannel: true });
        const userLink = formatUserLink(targetUser, interaction.guild);
        return interaction.reply(cv2.success(
          `User Permitted | ${TICK_EMOJI}`,
          `${userLink} can now join your channel even when locked or hidden.`
        ));
      }

      if (sub === 'chime') {
        const enable = interaction.options.getString('status') === 'on';
        const jtcData = vcChannel ? db.getJtcChannel(vcChannel.id) : null;
        if (jtcData) {
          if (jtcData.ownerId !== member.id && !member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply(cv2.warn(
              `Unauthorized | ${WARN_EMOJI}`,
              `Only the channel owner can configure channel chimes.`
            ));
          }
          if (!db.cache.jtcChannels[vcChannel.id]) db.cache.jtcChannels[vcChannel.id] = {};
          db.cache.jtcChannels[vcChannel.id].chime = enable;
          db.save();
          return interaction.reply(cv2.success(
            `Welcome Chime Updated | ${TICK_EMOJI}`,
            `Entrance welcome chimes have been **${enable ? 'enabled' : 'disabled'}** for **${vcChannel.name}**.`
          ));
        } else {
          if (!isExtraOwnerOrHigher(member.id, interaction.guild)) {
            return interaction.reply(cv2.warn(
              `Unauthorized | ${WARN_EMOJI}`,
              `You need Extra Owner clearance to toggle server-wide JTC chimes.`
            ));
          }
          db.updateGuildConfig(interaction.guild.id, { jtcChime: enable });
          return interaction.reply(cv2.success(
            `Welcome Chime Configured | ${TICK_EMOJI}`,
            `Server-wide JTC entrance welcome chime set to **${enable ? 'ON' : 'OFF'}**.`
          ));
        }
      }
    }
  }
];
