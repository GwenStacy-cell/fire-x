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
import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI, WARN_EMOJI } from '../utils/emojis.js';

export function formatServerStatChannelName(type, count, customEmoji = null, fontStyle = 'standard') {
  const fonts = {
    standard: { MEMBERS: 'Members', BOTS: 'Bots', BOOSTER: 'Server Booster', USERS: 'All Members' },
    bold: { MEMBERS: '𝗠𝗲𝗺𝗯𝗲𝗿𝘀', BOTS: '𝗕𝗼𝘁𝘀', BOOSTER: '𝗦𝗲𝗿𝘃𝗲𝗿 𝗕𝗼𝗼𝘀𝘁𝗲𝗿', USERS: '𝗔𝗹𝗹 𝗠𝗲𝗺𝗯𝗲𝗿𝘀' },
    italic: { MEMBERS: '𝘔𝘦𝘮𝘣𝘦𝘳𝘴', BOTS: '𝘉𝘰𝘵𝘴', BOOSTER: '𝘚𝘦𝘳𝘷𝘦𝘳 𝘉𝘰𝘰𝘴𝘵𝘦𝘳', USERS: '𝘈𝘭𝘭 𝘔𝘦𝘮𝘣𝘦𝘳𝘴' },
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

export async function updateServerStatsChannels(guild, stats) {
  if (!guild || !stats) return;
  await guild.members.fetch().catch(() => null);
  const total = guild.memberCount;
  const bots = guild.members.cache.filter(member => member.user?.bot).size;
  const humans = total - bots;
  const boosters = guild.premiumSubscriptionCount || 0;

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

export async function setupServerStatsChannels(guild, existingStats = null) {
  await guild.members.fetch().catch(() => null);
  const total = guild.memberCount;
  const bots = guild.members.cache.filter(member => member.user?.bot).size;
  const humans = total - bots;
  const boosters = guild.premiumSubscriptionCount || 0;

  const font = existingStats?.font || 'standard';

  // Deny connect to everyone (Locked voice channels)
  const permissionOverwrites = [
    {
      id: guild.id, // @everyone
      deny: [PermissionFlagsBits.Connect],
      allow: [PermissionFlagsBits.ViewChannel]
    }
  ];

  // 1. Category: ╭・Statistics
  let category = existingStats?.categoryId
    ? guild.channels.cache.get(existingStats.categoryId) || await guild.channels.fetch(existingStats.categoryId).catch(() => null)
    : null;

  if (!category) {
    category = await guild.channels.create({
      name: '╭・Statistics',
      type: ChannelType.GuildCategory
    });
  } else if (category.name !== '╭・Statistics') {
    await category.setName('╭・Statistics').catch(() => null);
  }

  // 2. Members Channel: 🌐 . Members: {humans}
  const hName = formatServerStatChannelName('MEMBERS', humans, null, font);
  let humansCh = existingStats?.humansId
    ? guild.channels.cache.get(existingStats.humansId) || await guild.channels.fetch(existingStats.humansId).catch(() => null)
    : null;

  if (!humansCh) {
    humansCh = await guild.channels.create({
      name: hName,
      type: ChannelType.GuildVoice,
      parent: category.id,
      permissionOverwrites
    });
  } else {
    if (humansCh.parentId !== category.id) await humansCh.setParent(category.id).catch(() => null);
    if (humansCh.name !== hName) await humansCh.setName(hName).catch(() => null);
  }

  // 3. Bots Channel: 🤖 . Bots: {bots}
  const bName = formatServerStatChannelName('BOTS', bots, null, font);
  let botsCh = existingStats?.botsId
    ? guild.channels.cache.get(existingStats.botsId) || await guild.channels.fetch(existingStats.botsId).catch(() => null)
    : null;

  if (!botsCh) {
    botsCh = await guild.channels.create({
      name: bName,
      type: ChannelType.GuildVoice,
      parent: category.id,
      permissionOverwrites
    });
  } else {
    if (botsCh.parentId !== category.id) await botsCh.setParent(category.id).catch(() => null);
    if (botsCh.name !== bName) await botsCh.setName(bName).catch(() => null);
  }

  // 4. Server Booster Channel: 🚀 . Server Booster: {boosters}
  const sName = formatServerStatChannelName('BOOSTER', boosters, null, font);
  let boosterCh = existingStats?.boosterId
    ? guild.channels.cache.get(existingStats.boosterId) || await guild.channels.fetch(existingStats.boosterId).catch(() => null)
    : null;

  if (!boosterCh) {
    boosterCh = await guild.channels.create({
      name: sName,
      type: ChannelType.GuildVoice,
      parent: category.id,
      permissionOverwrites
    });
  } else {
    if (boosterCh.parentId !== category.id) await boosterCh.setParent(category.id).catch(() => null);
    if (boosterCh.name !== sName) await boosterCh.setName(sName).catch(() => null);
  }

  const savedData = {
    categoryId: category.id,
    humansId: humansCh.id,
    botsId: botsCh.id,
    boosterId: boosterCh.id,
    font,
    lastSyncedAt: Date.now()
  };

  db.saveServerStats(guild.id, savedData);
  return { savedData, humans, bots, boosters, category, humansCh, botsCh, boosterCh };
}

export function buildServerStatsPanel(guild, stats, note = null) {
  const existing = stats || db.getServerStats(guild.id);
  const isConfigured = Boolean(
    existing && 
    (guild.channels.cache.has(existing.humansId) || 
     guild.channels.cache.has(existing.botsId) || 
     guild.channels.cache.has(existing.boosterId) || 
     guild.channels.cache.has(existing.categoryId))
  );

  const total = guild.memberCount;
  const bots = guild.members.cache.filter(member => member.user?.bot).size;
  const humans = total - bots;
  const boosters = guild.premiumSubscriptionCount || 0;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('serverstats_refresh')
      .setLabel('Refresh / Reset')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('<a:01_home_beat:1567037361810833428>'),
    new ButtonBuilder()
      .setCustomId('serverstats_config_btn')
      .setLabel('Configure Font')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('<a:uptime:1552608831060844575>'),
    new ButtonBuilder()
      .setCustomId('serverstats_disable_btn')
      .setLabel('Delete Counters')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('<a:02_delete_beat:1567037365547962449>'),
    new ButtonBuilder()
      .setCustomId('so_tab:overview:7d')
      .setLabel('Server Overview HUD')
      .setStyle(ButtonStyle.Secondary)
  );

  const noteText = note ? `> -# <a:03_tick_circle:1565665642084827206> **Status Note:** ${note}\n` : '';

  const container = {
    type: 17,
    accent_color: 0x5865F2,
    components: [
      {
        type: 10,
        content: `# ${getRandomHeadingGlyph()} Statistics Channels Matrix | <a:03_tick_circle:1565665642084827206>`
      },
      { type: 14, divider: true },
      {
        type: 10,
        content:
          noteText +
          `> -# <a:uptime:1552608831060844575> **Deployment:** \`${isConfigured ? 'Active & Auto-Updating' : 'Not Configured'}\`\n` +
          `> -# <a:target_blink:1565667466984554588> **Category:** \`╭・Statistics\`\n` +
          (isConfigured && existing.humansId ? `> -# <a:target_blink:1565667466984554588> **Members Channel:** <#${existing.humansId}> (\`🌐 . Members: ${humans}\`)\n` : '') +
          (isConfigured && existing.botsId ? `> -# <a:target_blink:1565667466984554588> **Bots Channel:** <#${existing.botsId}> (\`🤖 . Bots: ${bots}\`)\n` : '') +
          (isConfigured && existing.boosterId ? `> -# <a:target_blink:1565667466984554588> **Booster Channel:** <#${existing.boosterId}> (\`🚀 . Server Booster: ${boosters}\`)\n` : '') +
          `> -# <a:target_blink:1565667466984554588> **Typography:** \`${existing?.font || 'standard'}\`\n\n` +
          `> -# **__Commands & Actions:__**\n` +
          `> <a:target_blink:1565667466984554588> \`!serverstats setup\` — Re-build \`╭・Statistics\` category and all 3 locked counters.\n` +
          `> <a:target_blink:1565667466984554588> \`!serverstats refresh\` (or button below) — Immediately reset & update numbers to live count.\n` +
          `> <a:target_blink:1565667466984554588> \`!serverstats config\` — Switch typographical font styles.\n` +
          `> <a:target_blink:1565667466984554588> \`!serverstats disable\` — Remove all statistics counter channels.`
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
        const setupRes = await setupServerStatsChannels(guild);
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

  if (customId === 'serverstats_disable_btn') {
    await interaction.deferUpdate().catch(() => null);
    const stats = db.getServerStats(guild.id);
    if (!stats) {
      return interaction.editReply(cv2.warn('Not Setup', 'Server stats are not currently set up.')).catch(() => null);
    }

    for (const id of [stats.categoryId, stats.totalId, stats.humansId, stats.botsId, stats.boosterId]) {
      if (!id) continue;
      const ch = guild.channels.cache.get(id);
      if (ch) await ch.delete().catch(() => null);
    }

    db.deleteServerStats(guild.id);
    const successMsg = cv2.success('Counters Deleted', 'Server stats voice channels have been deleted.');
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
        { label: 'Serif (𝐌𝐞𝐦𝐛𝐞𝐫𝐬 / 𝐁𝐨𝐭𝐬 / 𝐒𝐞𝐫𝐯𝐞𝐫 𝐁𝐨𝐨𝐬𝐭𝐞𝐫)', value: 'serif' },
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
          content: `# ${getRandomHeadingGlyph()} Statistics Typography Configuration | <a:03_tick_circle:1565665642084827206>`
        },
        { type: 14, divider: true },
        {
          type: 10,
          content:
            `> -# <a:uptime:1552608831060844575> **Select your preferred typographical font style from the menu below.**\n` +
            `> -# <a:target_blink:1565667466984554588> Athena will automatically apply the font across all \`╭・Statistics\` channels.\n` +
            `> -# <a:exclamation_outline1:1565666739356827759> **Rate Limits:** Discord limits channel renames to 2 updates every 10 minutes per channel.`
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
    description: 'Manage live auto-updating statistics voice channels (Members, Bots, Boosters)',
    permissions: [PermissionFlagsBits.Administrator],
    category: 'utility',
    options: [
      {
        name: 'setup',
        description: 'Create live auto-updating Statistics voice channels (╭・Statistics)',
        type: 1 // SUB_COMMAND
      },
      {
        name: 'refresh',
        description: 'Immediately refresh & reset channel names to live counts',
        type: 1 // SUB_COMMAND
      },
      {
        name: 'config',
        description: 'Configure typography font style for Statistics channels',
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
              { name: 'Serif (𝐌𝐞𝐦𝐛𝐞𝐫𝐬 / 𝐁𝐨𝐭𝐬 / 𝐁𝐨𝐨𝐬𝐭𝐞𝐫)', value: 'serif' },
              { name: 'Script (𝑀𝑒𝓂𝒷𝑒𝓇𝓈 / 𝐵𝑜𝓉𝓈 / 𝐵𝑜𝑜𝓈𝓉𝑒𝓇)', value: 'script' },
              { name: 'Gothic (𝔐𝔢𝔪𝔟𝔢𝔯𝔰 / 𝔅𝔬𝔱𝔰 / 𝔅𝔬𝔬𝔰𝔱𝔢𝔯)', value: 'gothic' },
              { name: 'Monospace (𝙼𝚎𝚖𝚋𝚎𝚛𝚜 / 𝙱𝚘𝚝𝚜 / 𝙱𝚘𝚘𝚜𝚝𝚎𝚛)', value: 'mono' }
            ]
          }
        ]
      },
      {
        name: 'disable',
        description: 'Disable and delete the Server Stats channels',
        type: 1 // SUB_COMMAND
      }
    ],
    aliases: ['statsetup', 'serverstat', 'statsconfig', 'vcstats'],
    executePrefix: async (message, args) => {
      const action = args[0]?.toLowerCase();
      
      if (action === 'disable' || action === 'delete' || action === 'remove') {
        const stats = db.getServerStats(message.guild.id);
        if (!stats) return message.reply(cv2.warn('Not Setup', 'Server stats are not currently set up.'));
        
        const m = await message.reply(cv2.info('Processing...', 'Disabling server stats and deleting channels...'));
        
        for (const id of [stats.categoryId, stats.totalId, stats.humansId, stats.botsId, stats.boosterId]) {
          if (!id) continue;
          const ch = message.guild.channels.cache.get(id);
          if (ch) await ch.delete().catch(() => null);
        }
        
        db.deleteServerStats(message.guild.id);
        return m.edit({ content: '', ...cv2.success('Disabled', 'Server stats channels have been deleted.') });
      }

      if (action === 'refresh' || action === 'reset' || action === 'sync') {
        const m = await message.reply(cv2.info('Syncing...', 'Refreshing server stats channels with live telemetry...'));
        const stats = db.getServerStats(message.guild.id);
        
        if (!stats) {
          try {
            const { savedData } = await setupServerStatsChannels(message.guild);
            return m.edit(buildServerStatsPanel(message.guild, savedData, 'Channels created and synchronized to live counts!'));
          } catch (err) {
            console.error('[ServerStats] Setup error during refresh:', err);
            return m.edit({ content: '', ...cv2.danger('Error', 'Failed to create channels. Ensure the bot has `Manage Channels` permission.') });
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
        if (!stats) return message.reply(cv2.warn('Not Setup', 'Server stats are not currently set up. Please run `!serverstats setup` first.'));
        
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
            { label: 'Serif (𝐌𝐞𝐦𝐛𝐞𝐫𝐬 / 𝐁𝐨𝐭𝐬 / 𝐒𝐞𝐫𝐯𝐞𝐫 𝐁𝐨𝐨𝐬𝐭𝐞ʀ)', value: 'serif' },
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
              content: `# ${getRandomHeadingGlyph()} Statistics Typography Configuration | <a:03_tick_circle:1565665642084827206>`
            },
            { type: 14, divider: true },
            {
              type: 10,
              content:
                `> -# <a:uptime:1552608831060844575> **Select your preferred typographical font style from the menu below.**\n` +
                `> -# <a:target_blink:1565667466984554588> Athena will automatically apply the font across all \`╭・Statistics\` channels.\n` +
                `> -# <a:exclamation_outline1:1565666739356827759> **Rate Limits:** Discord limits channel renames to 2 updates every 10 minutes per channel.`
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

      if (action === 'setup' || action === 'create') {
        const m = await message.reply(cv2.info('Processing...', 'Setting up Stats Bot style `╭・Statistics` channels. This may take a moment...'));
        
        try {
          const existing = db.getServerStats(message.guild.id);
          const { savedData } = await setupServerStatsChannels(message.guild, existing);
          return m.edit(buildServerStatsPanel(message.guild, savedData, '`╭・Statistics` category and channels deployed successfully!'));
        } catch (err) {
          console.error('[ServerStats] Setup error:', err);
          return m.edit({ content: '', ...cv2.danger('Error', 'Failed to create channels. Ensure the bot has `Manage Channels` permission.') });
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
        if (!stats) return interaction.editReply(cv2.warn('Not Setup', 'Server stats are not currently set up.'));
        
        for (const id of [stats.categoryId, stats.totalId, stats.humansId, stats.botsId, stats.boosterId]) {
          if (!id) continue;
          const ch = interaction.guild.channels.cache.get(id);
          if (ch) await ch.delete().catch(() => null);
        }
        
        db.deleteServerStats(interaction.guild.id);
        return interaction.editReply(cv2.success('Disabled', 'Server stats channels have been deleted.'));
      }

      if (action === 'refresh') {
        const stats = db.getServerStats(interaction.guild.id);
        if (!stats) {
          try {
            const { savedData } = await setupServerStatsChannels(interaction.guild);
            return interaction.editReply(buildServerStatsPanel(interaction.guild, savedData, 'Channels created and synchronized to live counts!'));
          } catch (err) {
            console.error('[ServerStats] Setup error:', err);
            return interaction.editReply(cv2.danger('Error', 'Failed to create channels. Ensure the bot has `Manage Channels` permission.'));
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
        if (!stats) return interaction.editReply(cv2.warn('Not Setup', 'Server stats are not currently set up. Please run `/serverstats setup` first.'));
        
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
        try {
          const existing = db.getServerStats(interaction.guild.id);
          const { savedData } = await setupServerStatsChannels(interaction.guild, existing);
          return interaction.editReply(buildServerStatsPanel(interaction.guild, savedData, '`╭・Statistics` category and channels deployed successfully!'));
        } catch (err) {
          console.error('[ServerStats] Slash setup error:', err);
          return interaction.editReply(cv2.danger('Error', 'Failed to create channels. Ensure the bot has `Manage Channels` permission.'));
        }
      }
    }
  }
];
