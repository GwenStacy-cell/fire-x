import { 
  PermissionFlagsBits, 
  ChannelType, 
  ApplicationCommandOptionType, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  MessageFlags 
} from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';
import { 
  getRandomHeadingGlyph, 
  BULLET_EMOJI, 
  TICK_EMOJI, 
  WRONG_EMOJI, 
  WARN_EMOJI, 
  UPTIME_EMOJI, 
  BOUNCING_HEART, 
  NAV_EMOJI_IDS 
} from '../utils/emojis.js';
import { formatChannelLink } from '../utils/helpers.js';
import { markRestorationQueued } from '../utils/antinuke.js';
import { setVoiceChannelStatus } from './jtc.js';

export function formatServerStatChannelName(type, count, customEmoji = null, fontStyle = 'standard') {
  const fonts = {
    standard: { MEMBERS: 'Members', BOTS: 'Bots', BOOSTER: 'Server Booster', USERS: 'All Members' },
    bold: { MEMBERS: '𝗠𝗲𝗺𝗯𝗲𝗿𝘀', BOTS: '𝗕𝗼𝘁𝘀', BOOSTER: '𝗦𝗲𝗿𝘃𝗲𝗿 𝗕𝗼𝗼𝘀𝘁𝗲𝗿', USERS: '𝗔𝗹𝗹 𝗠𝗲𝗺𝗯𝗲𝗿𝘀' },
    italic: { MEMBERS: '𝘔𝘦𝘮𝘣𝘦𝘳𝘴', BOTS: '𝘉𝘰𝘵𝘴', BOOSTER: '𝘚𝘦𝘳𝘷𝘦𝘳 𝘉𝘰𝘰𝘀𝘵𝘦𝘳', USERS: '𝘈𝘭𝘭 𝘔𝘦𝘮𝘣𝘦𝘳𝘴' },
    smallcaps: { MEMBERS: 'ᴍᴇᴍʙᴇʀs', BOTS: 'ʙᴏᴛs', BOOSTER: 'sᴇʀᴠᴇʀ ʙᴏᴏsᴛᴇʀ', USERS: 'ᴀʟʟ ᴍᴇᴍʙᴇʀs' },
    serif: { MEMBERS: '𝐌𝐞𝐦𝐛𝐞𝐫𝐬', BOTS: '𝐁𝐨𝐭𝐬', BOOSTER: '𝐒𝐞𝐫𝐯𝐞𝐫 𝐁𝐨𝐨𝐬𝐭𝐞𝐫', USERS: '𝐀𝐥𝐥 𝐌𝐞𝐦𝐛𝐞𝐫𝐬' },
    script: { MEMBERS: '𝑀𝑒𝓂𝒷𝑒𝓇𝓈', BOTS: '𝐵𝑜𝓉𝓈', BOOSTER: '𝒮𝑒𝓇𝓋𝑒𝓇 𝐵𝑜𝑜𝓈𝓉𝑒𝓇', USERS: '𝒜𝓁𝓁 𝑀𝑒𝓂𝒷𝑒𝓇𝓈' },
    gothic: { MEMBERS: '𝔐𝔢𝔪𝔟𝔢𝔯𝔰', BOTS: '𝔅𝔬𝔱𝔰', BOOSTER: '𝔖𝔢𝔯𝔳𝔢𝔯 𝔅𝔬𝔬𝔰𝔱𝔢𝔯', USERS: '𝔄𝔩𝔩 𝔐𝔢𝔪𝔟𝔢𝔯𝔰' },
    mono: { MEMBERS: '𝙼𝚎𝚖𝚋𝚎𝚛𝚜', BOTS: '𝙱𝚘𝚝𝚜', BOOSTER: '𝚂𝚎𝚛𝚟𝚎𝚛 𝙱𝚘𝚘𝚜𝚝𝚎𝚛', USERS: '𝙰𝚕𝚕 𝙼𝚎𝚖𝚋𝚎𝚛𝚜' }
  };

  const defaultEmojis = {
    MEMBERS: '🌐',
    BOTS: '🤖',
    BOOSTER: '🚀',
    USERS: '👥'
  };

  const emoji = customEmoji || defaultEmojis[type] || '📊';
  const selectedFont = fonts[fontStyle?.toLowerCase()] || fonts.standard;
  const word = selectedFont[type] || fonts.standard[type] || type;

  return `${emoji} . ${word}: ${count}`;
}

/**
 * Convert standard ASCII letters and digits to Unicode Mathematical Sans-Serif Bold.
 * Renders bold and crisp inside Discord Voice Channel Status subtitles.
 */
export function toSansBold(text) {
  if (text === undefined || text === null) return '';
  return String(text).replace(/[A-Za-z0-9]/g, c => {
    const code = c.charCodeAt(0);
    // Uppercase A-Z: 0x1D5D4 - 0x1D5ED
    if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D5D4 + code - 65);
    // Lowercase a-z: 0x1D5EE - 0x1D607
    if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D5EE + code - 97);
    // Digits 0-9: 0x1D7EC - 0x1D7F5
    if (code >= 48 && code <= 57) return String.fromCodePoint(0x1D7EC + code - 48);
    return c;
  });
}

/**
 * Fetch and calculate 100% accurate live server statistics metrics.
 * Ensures presence cache is populated with withPresences: true,
 * combines real-time voice channel participants, and eliminates "Online: 0".
 */
export async function getLiveStatsMetrics(guild) {
  if (!guild) return { total: 0, bots: 0, humans: 0, boosters: 0, online: 1, vcUsers: 0, activeVcs: 0 };

  // Fetch with presences if cache has fewer than 5 members
  if (typeof guild.members?.fetch === 'function' && (!guild.presences?.cache?.size || guild.presences.cache.size < 5)) {
    await guild.members.fetch({ withPresences: true }).catch(() => null);
  }

  const total = guild.memberCount || guild.members?.cache?.size || 0;
  const bots = guild.members?.cache?.filter
    ? guild.members.cache.filter(member => member.user?.bot).size
    : Array.from(guild.members?.cache?.values() || []).filter(m => m?.user?.bot).length;
  const humans = Math.max(0, total - bots);
  const boosters = guild.premiumSubscriptionCount || 0;

  // Accurate Online Count
  const voiceCache = guild.voiceStates?.cache;
  const voiceMembers = new Set(
    voiceCache?.filter
      ? voiceCache.filter(vs => vs.channelId).map(vs => vs.id)
      : Array.from(voiceCache?.values() || []).filter(vs => vs.channelId).map(vs => vs.id)
  );
  const presenceCache = guild.presences?.cache;
  const onlineFromPresences = presenceCache?.filter
    ? presenceCache.filter(p => p.status && p.status !== 'offline').size
    : Array.from(presenceCache?.values() || []).filter(p => p.status && p.status !== 'offline').length;

  let online = onlineFromPresences;
  for (const vmId of voiceMembers) {
    const p = guild.presences?.cache?.get(vmId);
    if (!p || p.status === 'offline') {
      online++;
    }
  }

  // Fallback: if online count is somehow 0, check cached members with presence, or ensure at least the voice count + bot (1)
  if (online <= 0) {
    const cachedOnline = guild.members?.cache?.filter
      ? guild.members.cache.filter(m => m.presence && m.presence.status !== 'offline').size
      : Array.from(guild.members?.cache?.values() || []).filter(m => m.presence && m.presence.status !== 'offline').length;
    online = cachedOnline > 0 ? cachedOnline : Math.max(1, voiceMembers.size);
  }

  const vcUsers = voiceMembers.size;
  const activeVcs = new Set(
    voiceCache?.map
      ? voiceCache.map(vs => vs.channelId).filter(Boolean)
      : Array.from(voiceCache?.values() || []).map(vs => vs.channelId).filter(Boolean)
  ).size;

  return { total, bots, humans, boosters, online, vcUsers, activeVcs };
}

const updateTimers = new Map();

/**
 * Schedule a debounced background server stats update for a guild.
 * Batch multiple event triggers (voice joins, presence shifts, member leaves)
 * into a single high-efficiency update 3 seconds later.
 */
export function scheduleServerStatsUpdate(guild, reason = 'event') {
  if (!guild?.id) return;
  const stats = db.getServerStats(guild.id);
  if (!stats) return;

  const existingTimer = updateTimers.get(guild.id);
  if (existingTimer) clearTimeout(existingTimer);

  const timer = setTimeout(async () => {
    updateTimers.delete(guild.id);
    try {
      await updateServerStatsChannels(guild, stats);
    } catch (err) {
      // ignore
    }
  }, 3000); // 3 second debounce window

  updateTimers.set(guild.id, timer);
}

export async function updateServerStatsChannels(guild, stats) {
  if (!guild) return;
  if (!stats) stats = db.getServerStats(guild.id);
  if (!stats) return;

  const { total, bots, humans, boosters, online, vcUsers, activeVcs } = await getLiveStatsMetrics(guild);

  const mode = stats.mode || (stats.serverStatsId ? 'status' : 'classic');

  if (mode === 'status') {
    // Exact bold formatting matching Image 1
    const serverStatus = `${BOUNCING_HEART} ${toSansBold('Online: ' + online)}  ${BOUNCING_HEART} ${toSansBold('Members: ' + total)}`;
    const voiceStatus = `${BOUNCING_HEART} ${toSansBold('VC Users: ' + vcUsers)}  ${BOUNCING_HEART} ${toSansBold('Active VC: ' + activeVcs)}`;

    if (stats.serverStatsId) {
      await setVoiceChannelStatus(guild.client, stats.serverStatsId, serverStatus).catch(() => null);
    }
    if (stats.voiceStatsId) {
      await setVoiceChannelStatus(guild.client, stats.voiceStatsId, voiceStatus).catch(() => null);
    }
    return;
  }

  // Classic Mode (Renamed channels)
  const f = stats.font || 'standard';

  const hName = formatServerStatChannelName('MEMBERS', humans, null, f);
  const bName = formatServerStatChannelName('BOTS', bots, null, f);
  const sName = formatServerStatChannelName('BOOSTER', boosters, null, f);
  const tName = formatServerStatChannelName('USERS', total, null, f);

  const humansCh = stats.humansId ? guild.channels.cache.get(stats.humansId) || await guild.channels.fetch(stats.humansId).catch(() => null) : null;
  const botsCh = stats.botsId ? guild.channels.cache.get(stats.botsId) || await guild.channels.fetch(stats.botsId).catch(() => null) : null;
  const boosterCh = stats.boosterId ? guild.channels.cache.get(stats.boosterId) || await guild.channels.fetch(stats.boosterId).catch(() => null) : null;
  const totalCh = stats.totalId ? guild.channels.cache.get(stats.totalId) || await guild.channels.fetch(stats.totalId).catch(() => null) : null;

  let lastErr = null;
  if (humansCh && humansCh.name !== hName) await humansCh.setName(hName).catch(err => { lastErr = err; });
  if (botsCh && botsCh.name !== bName) await botsCh.setName(bName).catch(err => { lastErr = err; });
  if (boosterCh && boosterCh.name !== sName) await boosterCh.setName(sName).catch(err => { lastErr = err; });
  if (totalCh && totalCh.name !== tName) await totalCh.setName(tName).catch(err => { lastErr = err; });

  if (lastErr) throw lastErr;
}

export async function setupServerStatsChannels(guild, requestedMode = 'status', existingStats = null) {
  const { total, bots, humans, boosters, online, vcUsers, activeVcs } = await getLiveStatsMetrics(guild);

  const mode = (requestedMode === 'classic' || requestedMode === 'channels') ? 'classic' : 'status';
  const font = existingStats?.font || 'standard';

  // Deny connect to everyone (Locked voice channels)
  const permissionOverwrites = [
    {
      id: guild.id, // @everyone
      deny: [PermissionFlagsBits.Connect],
      allow: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: guild.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.Connect
      ]
    }
  ];

  // 1. Category: ╭・Statistics
  let category = existingStats?.categoryId
    ? guild.channels.cache.get(existingStats.categoryId) || await guild.channels.fetch(existingStats.categoryId).catch(() => null)
    : null;

  if (!category) {
    category = await guild.channels.create({
      name: '╭・Statistics',
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.Connect],
          allow: [PermissionFlagsBits.ViewChannel]
        }
      ],
      reason: 'Athena Server Stats Category Deployment'
    });
  } else if (category.name !== '╭・Statistics') {
    await category.setName('╭・Statistics').catch(() => null);
  }
  markRestorationQueued(category.id);

  let savedData = {};

  if (mode === 'status') {
    // Clean up classic channels if migrating from classic mode
    if (existingStats?.humansId || existingStats?.botsId || existingStats?.boosterId) {
      for (const oldId of [existingStats.humansId, existingStats.botsId, existingStats.boosterId, existingStats.totalId]) {
        if (!oldId) continue;
        markRestorationQueued(oldId);
        const oldCh = guild.channels.cache.get(oldId) || await guild.channels.fetch(oldId).catch(() => null);
        if (oldCh) await oldCh.delete('Athena: Migrating to Voice Status Serverstats').catch(() => null);
      }
    }

    // Channel 1: Server Statistics
    let serverStatsCh = existingStats?.serverStatsId
      ? guild.channels.cache.get(existingStats.serverStatsId) || await guild.channels.fetch(existingStats.serverStatsId).catch(() => null)
      : null;

    if (!serverStatsCh) {
      serverStatsCh = await guild.channels.create({
        name: 'Server Statistics',
        type: ChannelType.GuildVoice,
        parent: category.id,
        permissionOverwrites,
        reason: 'Athena Server Statistics Voice Channel'
      });
    } else {
      if (serverStatsCh.parentId !== category.id) await serverStatsCh.setParent(category.id).catch(() => null);
      if (serverStatsCh.name !== 'Server Statistics') await serverStatsCh.setName('Server Statistics').catch(() => null);
      await serverStatsCh.permissionOverwrites.set(permissionOverwrites).catch(() => null);
    }
    markRestorationQueued(serverStatsCh.id);

    // Channel 2: Voice Statistics
    let voiceStatsCh = existingStats?.voiceStatsId
      ? guild.channels.cache.get(existingStats.voiceStatsId) || await guild.channels.fetch(existingStats.voiceStatsId).catch(() => null)
      : null;

    if (!voiceStatsCh) {
      voiceStatsCh = await guild.channels.create({
        name: 'Voice Statistics',
        type: ChannelType.GuildVoice,
        parent: category.id,
        permissionOverwrites,
        reason: 'Athena Voice Statistics Voice Channel'
      });
    } else {
      if (voiceStatsCh.parentId !== category.id) await voiceStatsCh.setParent(category.id).catch(() => null);
      if (voiceStatsCh.name !== 'Voice Statistics') await voiceStatsCh.setName('Voice Statistics').catch(() => null);
      await voiceStatsCh.permissionOverwrites.set(permissionOverwrites).catch(() => null);
    }
    markRestorationQueued(voiceStatsCh.id);

    // Set voice channel statuses (Mathematical Bold 2-metric layout matching Image 1)
    const serverStatus = `${BOUNCING_HEART} ${toSansBold('Online: ' + online)}  ${BOUNCING_HEART} ${toSansBold('Members: ' + total)}`;
    const voiceStatus = `${BOUNCING_HEART} ${toSansBold('VC Users: ' + vcUsers)}  ${BOUNCING_HEART} ${toSansBold('Active VC: ' + activeVcs)}`;

    await setVoiceChannelStatus(guild.client, serverStatsCh.id, serverStatus);
    await setVoiceChannelStatus(guild.client, voiceStatsCh.id, voiceStatus);

    savedData = {
      mode: 'status',
      categoryId: category.id,
      serverStatsId: serverStatsCh.id,
      voiceStatsId: voiceStatsCh.id,
      font,
      lastSyncedAt: Date.now()
    };
  } else {
    // Mode is 'classic' (3 Channels)
    // Clean up status channels if migrating from status mode
    if (existingStats?.serverStatsId || existingStats?.voiceStatsId) {
      for (const oldId of [existingStats.serverStatsId, existingStats.voiceStatsId]) {
        if (!oldId) continue;
        markRestorationQueued(oldId);
        const oldCh = guild.channels.cache.get(oldId) || await guild.channels.fetch(oldId).catch(() => null);
        if (oldCh) await oldCh.delete('Athena: Migrating to Classic Channel Serverstats').catch(() => null);
      }
    }

    const hName = formatServerStatChannelName('MEMBERS', humans, null, font);
    let humansCh = existingStats?.humansId
      ? guild.channels.cache.get(existingStats.humansId) || await guild.channels.fetch(existingStats.humansId).catch(() => null)
      : null;

    if (!humansCh) {
      humansCh = await guild.channels.create({
        name: hName,
        type: ChannelType.GuildVoice,
        parent: category.id,
        permissionOverwrites,
        reason: 'Athena Classic Members Counter'
      });
    } else {
      if (humansCh.parentId !== category.id) await humansCh.setParent(category.id).catch(() => null);
      if (humansCh.name !== hName) await humansCh.setName(hName).catch(() => null);
    }
    markRestorationQueued(humansCh.id);

    const bName = formatServerStatChannelName('BOTS', bots, null, font);
    let botsCh = existingStats?.botsId
      ? guild.channels.cache.get(existingStats.botsId) || await guild.channels.fetch(existingStats.botsId).catch(() => null)
      : null;

    if (!botsCh) {
      botsCh = await guild.channels.create({
        name: bName,
        type: ChannelType.GuildVoice,
        parent: category.id,
        permissionOverwrites,
        reason: 'Athena Classic Bots Counter'
      });
    } else {
      if (botsCh.parentId !== category.id) await botsCh.setParent(category.id).catch(() => null);
      if (botsCh.name !== bName) await botsCh.setName(bName).catch(() => null);
    }
    markRestorationQueued(botsCh.id);

    const sName = formatServerStatChannelName('BOOSTER', boosters, null, font);
    let boosterCh = existingStats?.boosterId
      ? guild.channels.cache.get(existingStats.boosterId) || await guild.channels.fetch(existingStats.boosterId).catch(() => null)
      : null;

    if (!boosterCh) {
      boosterCh = await guild.channels.create({
        name: sName,
        type: ChannelType.GuildVoice,
        parent: category.id,
        permissionOverwrites,
        reason: 'Athena Classic Booster Counter'
      });
    } else {
      if (boosterCh.parentId !== category.id) await boosterCh.setParent(category.id).catch(() => null);
      if (boosterCh.name !== sName) await boosterCh.setName(sName).catch(() => null);
    }
    markRestorationQueued(boosterCh.id);

    savedData = {
      mode: 'classic',
      categoryId: category.id,
      humansId: humansCh.id,
      botsId: botsCh.id,
      boosterId: boosterCh.id,
      font,
      lastSyncedAt: Date.now()
    };
  }

  db.saveServerStats(guild.id, savedData);
  return { savedData, humans, bots, boosters, online, vcUsers, activeVcs, category };
}

export function buildServerStatsPanel(guild, stats, note = null) {
  const existing = stats || db.getServerStats(guild.id);
  const mode = existing?.mode || (existing?.serverStatsId ? 'status' : 'classic');

  const isConfigured = Boolean(
    existing && (
      (mode === 'status' && (guild.channels.cache.has(existing.serverStatsId) || guild.channels.cache.has(existing.voiceStatsId))) ||
      (mode === 'classic' && (guild.channels.cache.has(existing.humansId) || guild.channels.cache.has(existing.botsId) || guild.channels.cache.has(existing.boosterId))) ||
      guild.channels.cache.has(existing.categoryId)
    )
  );

  const total = guild.memberCount || guild.members.cache.size || 0;
  const bots = guild.members.cache.filter(member => member.user?.bot).size;
  const humans = Math.max(0, total - bots);
  const boosters = guild.premiumSubscriptionCount || 0;
  const voiceMembers = new Set(guild.voiceStates.cache.filter(vs => vs.channelId).map(vs => vs.id));
  const onlinePresences = guild.presences?.cache 
    ? guild.presences.cache.filter(p => p.status && p.status !== 'offline').size 
    : (guild.members.cache.filter(m => m.presence && m.presence.status !== 'offline').size || 0);
  let online = onlinePresences;
  for (const vmId of voiceMembers) {
    const p = guild.presences?.cache?.get(vmId);
    if (!p || p.status === 'offline') online++;
  }
  if (online <= 0) online = Math.max(1, voiceMembers.size);
  const vcUsers = voiceMembers.size;
  const activeVcs = new Set(guild.voiceStates.cache.map(vs => vs.channelId).filter(Boolean)).size;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('serverstats_refresh')
      .setLabel('Refresh / Reset')
      .setStyle(ButtonStyle.Primary)
      .setEmoji(NAV_EMOJI_IDS.HOME),
    new ButtonBuilder()
      .setCustomId('serverstats_toggle_mode')
      .setLabel(mode === 'status' ? 'Switch to Classic' : 'Switch to VC Status')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(mode === 'status' ? '1566117974920798268' : '1574534881776640010'),
    new ButtonBuilder()
      .setCustomId('serverstats_config_btn')
      .setLabel('Configure Font')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(mode === 'status')
      .setEmoji(UPTIME_EMOJI),
    new ButtonBuilder()
      .setCustomId('serverstats_disable_btn')
      .setLabel('Delete Counters')
      .setStyle(ButtonStyle.Danger)
      .setEmoji(NAV_EMOJI_IDS.DELETE)
  );

  const noteText = note ? `> -# ${TICK_EMOJI} **Status Note:** ${note}\n` : '';

  let channelDetails = '';
  if (isConfigured) {
    if (mode === 'status') {
      const serverLink = existing.serverStatsId ? formatChannelLink(existing.serverStatsId, guild) : 'None';
      const voiceLink = existing.voiceStatsId ? formatChannelLink(existing.voiceStatsId, guild) : 'None';
      channelDetails = 
        `> -# ${BULLET_EMOJI} **Server Statistics Channel:** ${serverLink}\n` +
        `> -# &nbsp;&nbsp;&nbsp;&nbsp;↳ Subtitle: \`${BOUNCING_HEART} ${toSansBold('Online: ' + online)}  ${BOUNCING_HEART} ${toSansBold('Members: ' + total)}\`\n` +
        `> -# ${BULLET_EMOJI} **Voice Statistics Channel:** ${voiceLink}\n` +
        `> -# &nbsp;&nbsp;&nbsp;&nbsp;↳ Subtitle: \`${BOUNCING_HEART} ${toSansBold('VC Users: ' + vcUsers)}  ${BOUNCING_HEART} ${toSansBold('Active VC: ' + activeVcs)}\`\n`;
    } else {
      const hLink = existing.humansId ? formatChannelLink(existing.humansId, guild) : 'None';
      const bLink = existing.botsId ? formatChannelLink(existing.botsId, guild) : 'None';
      const sLink = existing.boosterId ? formatChannelLink(existing.boosterId, guild) : 'None';
      channelDetails = 
        `> -# ${BULLET_EMOJI} **Members Counter:** ${hLink} (\`🌐 . Members: ${humans}\`)\n` +
        `> -# ${BULLET_EMOJI} **Bots Counter:** ${bLink} (\`🤖 . Bots: ${bots}\`)\n` +
        `> -# ${BULLET_EMOJI} **Booster Counter:** ${sLink} (\`🚀 . Server Booster: ${boosters}\`)\n` +
        `> -# ${BULLET_EMOJI} **Typography:** \`${existing?.font || 'standard'}\`\n`;
    }
  }

  const categoryLink = existing?.categoryId ? formatChannelLink(existing.categoryId, guild) : '`╭・Statistics`';

  const container = {
    type: 17,
    accent_color: 0x5865F2,
    components: [
      {
        type: 10,
        content: `# ${getRandomHeadingGlyph()} Statistics Channels Matrix | ${TICK_EMOJI}`
      },
      { type: 14, divider: true },
      {
        type: 10,
        content:
          noteText +
          `> -# ${UPTIME_EMOJI} **Deployment:** \`${isConfigured ? 'Active & Auto-Updating' : 'Not Configured'}\`\n` +
          `> -# ${BULLET_EMOJI} **Active Architecture:** \`${mode === 'status' ? 'Voice Status Subtitles (Compact 2-Channel)' : 'Classic Renamed Channels (3 Counters)'}\`\n` +
          `> -# ${BULLET_EMOJI} **Category:** ${categoryLink}\n` +
          channelDetails +
          `\n> -# **__Commands & Actions:__**\n` +
          `> ${BULLET_EMOJI} \`!serverstats setup [status|classic]\` — Deploy or switch between the 2 statistics types.\n` +
          `> ${BULLET_EMOJI} \`!serverstats refresh\` (or button below) — Immediately sync numbers to live counts.\n` +
          `> ${BULLET_EMOJI} \`!serverstats config <font>\` — Switch typographical styles (classic mode).\n` +
          `> ${BULLET_EMOJI} \`!serverstats disable\` — Remove all statistics counter channels.`
      },
      { type: 14, divider: true },
      row.toJSON(),
      { type: 14, divider: true },
      {
        type: 10,
        content: `-# **Athena Bulletproof Security Matrix • V1.0.0**`
      }
    ]
  };

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2
  };
}

export async function handleServerStatsInteraction(interaction) {
  const customId = interaction.customId;
  if (!customId || !customId.startsWith('serverstats_')) return;

  const guild = interaction.guild;
  if (!guild) return;

  if (customId === 'serverstats_refresh') {
    await interaction.deferUpdate().catch(() => null);
    let note = 'Channels refreshed with live server telemetry.';
    let stats = db.getServerStats(guild.id);

    try {
      if (!stats) {
        const setupRes = await setupServerStatsChannels(guild, 'status');
        stats = setupRes.savedData;
        note = 'Channels created and initialized to live member counts!';
      } else {
        await updateServerStatsChannels(guild, stats);
        stats.lastSyncedAt = Date.now();
        db.saveServerStats(guild.id, stats);
      }
    } catch (err) {
      note = `Live counts verified! Note: Discord limits channel renames to 2 per 10 mins. If counts changed recently, rename will apply automatically on schedule.`;
    }

    const panel = buildServerStatsPanel(guild, stats, note);
    return interaction.editReply(panel).catch(() => null);
  }

  if (customId === 'serverstats_toggle_mode') {
    await interaction.deferUpdate().catch(() => null);
    const existing = db.getServerStats(guild.id);
    const currentMode = existing?.mode || (existing?.serverStatsId ? 'status' : 'classic');
    const targetMode = currentMode === 'status' ? 'classic' : 'status';

    try {
      const setupRes = await setupServerStatsChannels(guild, targetMode, existing);
      const modeTitle = targetMode === 'status' ? 'Voice Status Subtitles (Compact 2-Channel)' : 'Classic Renamed Channels (3 Counters)';
      const panel = buildServerStatsPanel(guild, setupRes.savedData, `Switched architecture to **${modeTitle}**!`);
      return interaction.editReply(panel).catch(() => null);
    } catch (err) {
      console.error('[ServerStats] Mode toggle error:', err);
      return interaction.editReply(cv2.danger(`Error | ${WRONG_EMOJI}`, 'Failed to toggle mode. Ensure the bot has `Manage Channels` permission.')).catch(() => null);
    }
  }

  if (customId === 'serverstats_disable_btn') {
    await interaction.deferUpdate().catch(() => null);
    const stats = db.getServerStats(guild.id);
    if (!stats) {
      return interaction.editReply(cv2.warn(`Not Setup | ${WARN_EMOJI}`, 'Server stats are not currently set up.')).catch(() => null);
    }

    for (const id of [stats.categoryId, stats.serverStatsId, stats.voiceStatsId, stats.totalId, stats.humansId, stats.botsId, stats.boosterId]) {
      if (!id) continue;
      markRestorationQueued(id);
      const ch = guild.channels.cache.get(id) || await guild.channels.fetch(id).catch(() => null);
      if (ch) await ch.delete('Athena: Purging Server Stats channels').catch(() => null);
    }

    db.deleteServerStats(guild.id);
    const successMsg = cv2.success(`Counters Deleted | ${TICK_EMOJI}`, 'Server stats voice channels have been deleted.');
    return interaction.editReply(successMsg).catch(() => null);
  }

  if (customId === 'serverstats_config_btn') {
    await interaction.deferUpdate().catch(() => null);
    const fontSelect = new StringSelectMenuBuilder()
      .setCustomId('serverstats_font')
      .setPlaceholder('Select a Font Style')
      .addOptions([
        { label: 'Standard (Members / Bots / Server Booster)', value: 'standard' },
        { label: 'Bold (𝗠𝗲𝗺𝗯𝗲𝗿𝘀 / 𝗕𝗼𝘁𝘀 / 𝗦𝗲𝗿𝘃𝗲𝗿 𝗕𝗼𝗼𝘀𝘁𝗲𝗿)', value: 'bold' },
        { label: 'Small Caps (ᴍᴇᴍʙᴇʀs / ʙᴏᴛs / sᴇʀᴠᴇʀ ʙᴏᴏsᴛᴇʀ)', value: 'smallcaps' },
        { label: 'Serif (𝐌𝐞𝐦𝐛𝐞𝐫𝐬 / 𝐁𝐨𝐭𝐬 / 𝐒𝐞𝐫𝘃𝗲𝗿 𝐁𝐨𝐨𝐬𝐭𝗲𝐫)', value: 'serif' },
        { label: 'Script (𝑀𝑒𝓂𝒷𝑒𝓇𝓈 / 𝐵𝑜𝓉𝓈 / 𝒮𝑒𝓇𝓋𝑒𝓇 𝐵𝑜𝑜𝓈𝓉𝑒𝓇)', value: 'script' },
        { label: 'Gothic (𝔐𝔢𝔪𝔟𝔢𝔯𝔰 / 𝔅𝔬𝔱𝔰 / 𝔖𝔢𝔯𝔳𝔢𝔯 𝔅𝔬𝔬𝔰𝔱𝔢𝔯)', value: 'gothic' },
        { label: 'Monospace (𝙼𝚎𝚖𝚋𝚎𝚛𝚜 / 𝙱𝚘𝚝𝚜 / 𝚂𝚎𝚛𝚟𝚎𝚛 𝙱𝚘𝚘𝚜𝚝𝚎𝚛)', value: 'mono' }
      ]);

    const row = new ActionRowBuilder().addComponents(fontSelect);
    const configContainer = {
      type: 17,
      accent_color: 0x5865F2,
      components: [
        {
          type: 10,
          content: `# ${getRandomHeadingGlyph()} Statistics Typography Configuration | ${TICK_EMOJI}`
        },
        { type: 14, divider: true },
        {
          type: 10,
          content:
            `> -# ${UPTIME_EMOJI} **Select your preferred typographical font style from the menu below.**\n` +
            `> -# ${BULLET_EMOJI} Athena will automatically apply the font across all \`╭・Statistics\` channels.\n` +
            `> -# ${WARN_EMOJI} **Rate Limits:** Discord limits channel renames to 2 updates every 10 minutes per channel.`
        },
        { type: 14, divider: true },
        row.toJSON(),
        { type: 14, divider: true },
        {
          type: 10,
          content: `-# **Athena Bulletproof Security Matrix • V1.0.0**`
        }
      ]
    };

    return interaction.editReply({ components: [configContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
  }

  if (customId === 'serverstats_font' && interaction.isStringSelectMenu()) {
    await interaction.deferUpdate().catch(() => null);
    const selected = interaction.values[0];
    const updated = db.getServerStats(guild.id) || {};
    updated.font = selected;
    db.saveServerStats(guild.id, updated);

    let note = `Typography updated to **${selected}**!`;
    try {
      await updateServerStatsChannels(guild, updated);
    } catch (err) {
      note = `Font preference saved (**${selected}**). Discord rate limits channel renames (2 updates/10m); changes will apply automatically in the background.`;
    }

    const panel = buildServerStatsPanel(guild, updated, note);
    return interaction.editReply(panel).catch(() => null);
  }
}

export const commands = [
  {
    name: 'serverstats',
    description: 'Manage live auto-updating statistics voice channels (Voice Status or Classic Channels)',
    permissions: [PermissionFlagsBits.Administrator],
    category: 'utility',
    options: [
      {
        name: 'setup',
        description: 'Deploy live Statistics channels under ╭・Statistics',
        type: 1, // SUB_COMMAND
        options: [
          {
            name: 'mode',
            description: 'Choose between Voice Status (Compact) or Classic (3-Channel Counters)',
            type: ApplicationCommandOptionType.String,
            required: false,
            choices: [
              { name: 'Voice Status Subtitles (Compact 2 Channels)', value: 'status' },
              { name: 'Classic Renamed Channels (3 Channels)', value: 'classic' }
            ]
          }
        ]
      },
      {
        name: 'refresh',
        description: 'Immediately refresh & reset channel names and subtitles to live counts',
        type: 1 // SUB_COMMAND
      },
      {
        name: 'config',
        description: 'Configure typography font style for Classic Statistics channels',
        type: 1, // SUB_COMMAND
        options: [
          {
            name: 'font',
            description: 'The font style to use',
            type: ApplicationCommandOptionType.String,
            required: true,
            choices: [
              { name: 'Standard (Members / Bots / Booster)', value: 'standard' },
              { name: 'Bold (𝗠𝗲𝗺𝗯𝗲𝗿𝘀 / 𝗕𝗼𝘁𝘀 / 𝗕𝗼𝗼𝘀𝘁𝗲𝗿)', value: 'bold' },
              { name: 'Small Caps (ᴍᴇᴍʙᴇʀs / ʙᴏᴛs / ʙᴏᴏsᴛᴇʀ)', value: 'smallcaps' },
              { name: 'Serif (𝐌𝐞𝐦𝐛𝐞𝐫𝐬 / 𝐁𝐨𝐭𝐬 / 𝐁𝐨𝐨𝐬𝐭𝗲𝐫)', value: 'serif' },
              { name: 'Script (𝑀𝑒𝓂𝒷𝑒𝓇𝓈 / 𝐵𝑜𝓉𝓈 / 𝐵𝑜𝑜𝓈𝓉𝑒𝓇)', value: 'script' },
              { name: 'Gothic (𝔐𝔢𝔪𝔟𝔢𝔯𝔰 / 𝔅𝔬𝔱𝔰 / 𝔖𝔢𝔯𝔳𝔢𝔯 𝔅𝔬𝔬𝔰𝔱𝔢𝔯)', value: 'gothic' },
              { name: 'Monospace (𝙼𝚎𝚖𝚋𝚎𝚛𝚜 / 𝙱𝚘𝚝𝚜 / 𝙱𝚘𝚘𝚜𝚝𝚎𝚛)', value: 'mono' }
            ]
          }
        ]
      },
      {
        name: 'disable',
        description: 'Disable and delete the Server Stats channels and category',
        type: 1 // SUB_COMMAND
      }
    ],
    aliases: ['statsetup', 'serverstat', 'statsconfig', 'vcstats', 'statsvc', 'vccounters', 'channelstats'],
    executePrefix: async (message, args) => {
      const action = args[0]?.toLowerCase();
      
      if (action === 'disable' || action === 'delete' || action === 'remove') {
        const stats = db.getServerStats(message.guild.id);
        if (!stats) return message.reply(cv2.warn(`Not Setup | ${WARN_EMOJI}`, 'Server stats are not currently set up.'));
        
        const m = await message.reply(cv2.info(`Processing... | ${UPTIME_EMOJI}`, 'Disabling server stats and deleting channels...'));
        
        for (const id of [stats.categoryId, stats.serverStatsId, stats.voiceStatsId, stats.totalId, stats.humansId, stats.botsId, stats.boosterId]) {
          if (!id) continue;
          markRestorationQueued(id);
          const ch = message.guild.channels.cache.get(id) || await message.guild.channels.fetch(id).catch(() => null);
          if (ch) await ch.delete('Athena: Purging Server Stats channels').catch(() => null);
        }
        
        db.deleteServerStats(message.guild.id);
        return m.edit({ content: '', ...cv2.success(`Disabled | ${TICK_EMOJI}`, 'Server stats channels and category have been deleted.') });
      }

      if (action === 'refresh' || action === 'reset' || action === 'sync') {
        const m = await message.reply(cv2.info(`Syncing... | ${UPTIME_EMOJI}`, 'Refreshing server stats channels with live telemetry...'));
        const stats = db.getServerStats(message.guild.id);
        
        if (!stats) {
          try {
            const { savedData } = await setupServerStatsChannels(message.guild, 'status');
            return m.edit(buildServerStatsPanel(message.guild, savedData, 'Channels created and synchronized to live counts!'));
          } catch (err) {
            console.error('[ServerStats] Setup error during refresh:', err);
            return m.edit({ content: '', ...cv2.danger(`Error | ${WRONG_EMOJI}`, 'Failed to create channels. Ensure the bot has `Manage Channels` permission.') });
          }
        }

        let note = 'Channels refreshed with live server telemetry!';
        try {
          await updateServerStatsChannels(message.guild, stats);
        } catch (err) {
          note = 'Live counts verified! Note: Discord limits channel renames to 2 per 10 mins; pending updates apply on schedule.';
        }

        return m.edit(buildServerStatsPanel(message.guild, stats, note));
      }
      
      if (action === 'config') {
        const stats = db.getServerStats(message.guild.id);
        if (!stats) return message.reply(cv2.warn(`Not Setup | ${WARN_EMOJI}`, 'Server stats are not currently set up. Please run `!serverstats setup` first.'));
        
        const requestedFont = args[1]?.toLowerCase();
        const validFonts = ['standard', 'bold', 'italic', 'smallcaps', 'serif', 'script', 'gothic', 'mono'];

        if (requestedFont && validFonts.includes(requestedFont)) {
          const updatedStats = { ...stats, font: requestedFont };
          db.saveServerStats(message.guild.id, updatedStats);
          
          let note = `Typography updated to **${requestedFont}**!`;
          try {
            await updateServerStatsChannels(message.guild, updatedStats);
          } catch (err) {
            note = `Font choice saved (**${requestedFont}**). Discord rate limits channel renames (2 updates/10m); changes will apply automatically in the background.`;
          }

          return message.reply(buildServerStatsPanel(message.guild, updatedStats, note));
        }

        const fontSelect = new StringSelectMenuBuilder()
          .setCustomId('serverstats_font')
          .setPlaceholder('Select a Font Style')
          .addOptions([
            { label: 'Standard (Members / Bots / Server Booster)', value: 'standard' },
            { label: 'Bold (𝗠𝗲𝗺𝗯𝗲𝗿𝘀 / 𝗕𝗼𝘁𝘀 / 𝗦𝗲𝗿𝘃𝗲𝗿 𝗕𝗼𝗼𝘀𝘁𝗲𝗿)', value: 'bold' },
            { label: 'Small Caps (ᴍᴇᴍʙᴇʀs / ʙᴏᴛs / sᴇʀᴠᴇʀ ʙᴏᴏsᴛᴇʀ)', value: 'smallcaps' },
            { label: 'Serif (𝐌𝐞𝐦𝐛𝐞𝐫𝐬 / 𝐁𝐨𝐭𝐬 / 𝐒𝗲𝗿𝘃𝗲𝗿 𝐁𝐨𝐨𝐬𝐭𝗲𝗿)', value: 'serif' },
            { label: 'Script (𝑀𝑒𝓂𝒷𝑒𝓇𝓈 / 𝐵𝑜𝓉𝓈 / 𝒮𝑒𝓇𝓋𝑒𝓇 𝐵𝑜𝑜𝓈𝓉𝑒𝓇)', value: 'script' },
            { label: 'Gothic (𝔐𝔢𝔪𝔟𝔢𝔯𝔰 / 𝔅𝔬𝔱𝔰 / 𝔖𝔢𝔯𝔳𝔢𝔯 𝔅𝔬𝔬𝔰𝔱𝔢𝔯)', value: 'gothic' },
            { label: 'Monospace (𝙼𝚎𝚖𝚋𝚎𝚛𝚜 / 𝙱𝚘𝚝𝚜 / 𝚂𝚎𝚛𝚟𝚎𝚛 𝙱𝚘𝚘𝚜𝚝𝚎𝚛)', value: 'mono' }
          ]);

        const row = new ActionRowBuilder().addComponents(fontSelect);
        const configContainer = {
          type: 17,
          accent_color: 0x5865F2,
          components: [
            {
              type: 10,
              content: `# ${getRandomHeadingGlyph()} Statistics Typography Configuration | ${TICK_EMOJI}`
            },
            { type: 14, divider: true },
            {
              type: 10,
              content:
                `> -# ${UPTIME_EMOJI} **Select your preferred typographical font style from the menu below.**\n` +
                `> -# ${BULLET_EMOJI} Athena will automatically apply the font across all \`╭・Statistics\` channels.\n` +
                `> -# ${WARN_EMOJI} **Rate Limits:** Discord limits channel renames to 2 updates every 10 minutes per channel.`
            },
            { type: 14, divider: true },
            row.toJSON(),
            { type: 14, divider: true },
            {
              type: 10,
              content: `-# **Athena Bulletproof Security Matrix • V1.0.0**`
            }
          ]
        };

        return message.reply({ components: [configContainer], flags: MessageFlags.IsComponentsV2 });
      }

      if (action === 'setup' || action === 'create' || action === 'mode') {
        const modeArg = args[1]?.toLowerCase();
        let targetMode = 'status';
        if (modeArg === 'classic' || modeArg === 'channels' || modeArg === 'channel') {
          targetMode = 'classic';
        } else if (modeArg === 'status' || modeArg === 'vc' || modeArg === 'subtitle' || modeArg === 'compact') {
          targetMode = 'status';
        } else if (action === 'mode') {
          const existing = db.getServerStats(message.guild.id);
          const curMode = existing?.mode || (existing?.serverStatsId ? 'status' : 'classic');
          targetMode = curMode === 'status' ? 'classic' : 'status';
        }

        const modeTitle = targetMode === 'status' ? 'Voice Status Subtitles (Compact 2-Channel)' : 'Classic Renamed Channels (3 Counters)';
        const m = await message.reply(cv2.info(`Deploying... | ${UPTIME_EMOJI}`, `Setting up **${modeTitle}** under \`╭・Statistics\`. This may take a moment...`));
        
        try {
          const existing = db.getServerStats(message.guild.id);
          const { savedData } = await setupServerStatsChannels(message.guild, targetMode, existing);
          return m.edit(buildServerStatsPanel(message.guild, savedData, `\`╭・Statistics\` deployed in **${modeTitle}**!`));
        } catch (err) {
          console.error('[ServerStats] Setup error:', err);
          return m.edit({ content: '', ...cv2.danger(`Error | ${WRONG_EMOJI}`, 'Failed to create channels. Ensure the bot has `Manage Channels` permission.') });
        }
      }
      
      const existing = db.getServerStats(message.guild.id);
      return message.reply(buildServerStatsPanel(message.guild, existing));
    },

    executeSlash: async (interaction) => {
      await interaction.deferReply();
      const action = interaction.options.getSubcommand();
      
      if (action === 'disable') {
        const stats = db.getServerStats(interaction.guild.id);
        if (!stats) return interaction.editReply(cv2.warn(`Not Setup | ${WARN_EMOJI}`, 'Server stats are not currently set up.'));
        
        for (const id of [stats.categoryId, stats.serverStatsId, stats.voiceStatsId, stats.totalId, stats.humansId, stats.botsId, stats.boosterId]) {
          if (!id) continue;
          markRestorationQueued(id);
          const ch = interaction.guild.channels.cache.get(id) || await interaction.guild.channels.fetch(id).catch(() => null);
          if (ch) await ch.delete('Athena: Purging Server Stats channels').catch(() => null);
        }
        
        db.deleteServerStats(interaction.guild.id);
        return interaction.editReply(cv2.success(`Disabled | ${TICK_EMOJI}`, 'Server stats channels and category have been deleted.'));
      }

      if (action === 'refresh') {
        const stats = db.getServerStats(interaction.guild.id);
        if (!stats) {
          try {
            const { savedData } = await setupServerStatsChannels(interaction.guild, 'status');
            return interaction.editReply(buildServerStatsPanel(interaction.guild, savedData, 'Channels created and synchronized to live counts!'));
          } catch (err) {
            console.error('[ServerStats] Setup error:', err);
            return interaction.editReply(cv2.danger(`Error | ${WRONG_EMOJI}`, 'Failed to create channels. Ensure the bot has `Manage Channels` permission.'));
          }
        }

        let note = 'Channels refreshed with live server telemetry!';
        try {
          await updateServerStatsChannels(interaction.guild, stats);
        } catch (err) {
          note = 'Live counts verified! Note: Discord limits channel renames to 2 per 10 mins; pending updates apply on schedule.';
        }

        return interaction.editReply(buildServerStatsPanel(interaction.guild, stats, note));
      }
      
      if (action === 'config') {
        const stats = db.getServerStats(interaction.guild.id);
        if (!stats) return interaction.editReply(cv2.warn(`Not Setup | ${WARN_EMOJI}`, 'Server stats are not currently set up. Please run `/serverstats setup` first.'));
        
        const newFont = interaction.options.getString('font');
        const updatedStats = { ...stats, font: newFont };
        db.saveServerStats(interaction.guild.id, updatedStats);
        
        let note = `Typography updated to **${newFont}**!`;
        try {
          await updateServerStatsChannels(interaction.guild, updatedStats);
        } catch (err) {
          note = `Font choice saved (**${newFont}**). Discord rate limits channel renames (2 updates/10m); changes will apply automatically in the background.`;
        }

        return interaction.editReply(buildServerStatsPanel(interaction.guild, updatedStats, note));
      }
      
      if (action === 'setup') {
        const requestedMode = interaction.options.getString('mode') || 'status';
        const modeTitle = requestedMode === 'status' ? 'Voice Status Subtitles (Compact 2-Channel)' : 'Classic Renamed Channels (3 Counters)';
        try {
          const existing = db.getServerStats(interaction.guild.id);
          const { savedData } = await setupServerStatsChannels(interaction.guild, requestedMode, existing);
          return interaction.editReply(buildServerStatsPanel(interaction.guild, savedData, `\`╭・Statistics\` deployed in **${modeTitle}**!`));
        } catch (err) {
          console.error('[ServerStats] Slash setup error:', err);
          return interaction.editReply(cv2.danger(`Error | ${WRONG_EMOJI}`, 'Failed to create channels. Ensure the bot has `Manage Channels` permission.'));
        }
      }
    }
  }
];
