import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI, WRONG_EMOJI, WARN_EMOJI } from '../utils/emojis.js';
import { 
  PermissionFlagsBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ChannelSelectMenuBuilder, 
  ChannelType, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle 
} from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';
import { isBotOwnerSync } from '../utils/helpers.js';


export const EMOJI_STATUS = '<a:uptime:1552608831060844575>';

/**
 * Checks whether member has admin / management permissions for counting engine
 */
function hasCountingAdminPerms(member, guild) {
  if (!member || !guild) return false;
  if (isBotOwnerSync(member.id)) return true;
  if (guild.ownerId === member.id) return true;
  if (db.isExtraOwner(guild.id, member.id)) return true;
  return member.permissions.has(PermissionFlagsBits.Administrator) || 
         member.permissions.has(PermissionFlagsBits.ManageGuild) || 
         member.permissions.has(PermissionFlagsBits.ManageChannels);
}

/**
 * Generates the Components V2 Counting Engine Control Panel
 */
export function getCountingPanel(guildId) {
  const cfg = db.getCounting(guildId);
  const channelDisplay = cfg.channelId ? `<#${cfg.channelId}>` : '`Not Configured`';
  const statusDisplay = cfg.channelId ? `${EMOJI_STATUS} **Active**` : '`Disabled / Not Set`';
  const totalCounters = Object.keys(cfg.users || {}).length;

  const desc = 
    `### Athena Counting Engine Matrix\n` +
    `-# **Status:** ${statusDisplay}\n` +
    `-# **Bound Channel:** ${channelDisplay}\n` +
    `-# **Current Count:** **${cfg.currentCount || 0}** (Next: **${(cfg.currentCount || 0) + 1}**)\n` +
    `-# **All-Time Record:** **${cfg.highScore || 0}**\n` +
    `-# **Server Saves:** **${cfg.saves ?? 2}** / **${cfg.maxSaves ?? 2}**\n` +
    `-# **Math Expressions:** ${cfg.allowMath !== false ? `${EMOJI_STATUS} \`Enabled\`` : '`Disabled`'}\n` +
    `-# **Auto-Topic Sync:** ${cfg.autoTopic !== false ? `${EMOJI_STATUS} \`Enabled\`` : '`Disabled`'}\n` +
    `-# **Total Counters:** **${totalCounters}** Members\n\n` +
    `-# Select a text channel below to bind or move the counting engine, or use the quick action buttons to configure server rules.`;

  const replyData = cv2.info('Counting Engine Dashboard', desc);

  const channelRow = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId('counting_select_channel')
      .setPlaceholder('Select a channel for counting...')
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
  );

  const btnReset = new ButtonBuilder()
    .setCustomId('counting_btn_reset')
    .setLabel('Reset Count')
    .setStyle(ButtonStyle.Secondary);

  const btnSaves = new ButtonBuilder()
    .setCustomId('counting_btn_setsaves')
    .setLabel(`Set Saves (${cfg.saves ?? 2})`)
    .setStyle(ButtonStyle.Secondary);

  const btnMath = new ButtonBuilder()
    .setCustomId('counting_btn_togglemath')
    .setLabel(cfg.allowMath !== false ? 'Math: ON' : 'Math: OFF')
    .setStyle(cfg.allowMath !== false ? ButtonStyle.Success : ButtonStyle.Secondary);

  const btnTopic = new ButtonBuilder()
    .setCustomId('counting_btn_toggletopic')
    .setLabel(cfg.autoTopic !== false ? 'Auto-Topic: ON' : 'Auto-Topic: OFF')
    .setStyle(cfg.autoTopic !== false ? ButtonStyle.Success : ButtonStyle.Secondary);

  const btnRow1 = new ActionRowBuilder().addComponents(btnReset, btnSaves, btnMath, btnTopic);

  const btnLb = new ButtonBuilder()
    .setCustomId('counting_btn_lb')
    .setLabel('Leaderboard')
    .setStyle(ButtonStyle.Primary);

  const btnDisable = new ButtonBuilder()
    .setCustomId('counting_btn_disable')
    .setLabel('Disable System')
    .setStyle(ButtonStyle.Danger)
    .setDisabled(!cfg.channelId);

  const btnRow2 = new ActionRowBuilder().addComponents(btnLb, btnDisable);

  if (replyData.components && replyData.components[0] && replyData.components[0].type === 17) {
    replyData.components[0].components.push(
      channelRow.toJSON(),
      btnRow1.toJSON(),
      btnRow2.toJSON()
    );
  } else {
    replyData.components.push(channelRow, btnRow1, btnRow2);
  }

  return replyData;
}

/**
 * Builds the Leaderboard Components V2 Container
 */
export function buildCountingLeaderboard(guild, countingCfg) {
  const users = countingCfg.users || {};
  const sorted = Object.entries(users)
    .map(([userId, data]) => ({ userId, count: data.count || 0, ruins: data.ruins || 0 }))
    .sort((a, b) => b.count - a.count);

  let desc = `### Server Counting Records\n`;
  desc += `-# **Current Count:** **${countingCfg.currentCount || 0}** (Next: **${(countingCfg.currentCount || 0) + 1}**)\n`;
  desc += `-# **High Score:** **${countingCfg.highScore || 0}**\n`;
  desc += `-# **Server Saves:** **${countingCfg.saves ?? 2}** / **${countingCfg.maxSaves ?? 2}**\n\n`;
  desc += `### Top Counters\n`;

  if (sorted.length === 0) {
    desc += `-# *No numbers have been counted yet. Start counting in the bound channel!*`;
  } else {
    const top10 = sorted.slice(0, 10);
    top10.forEach((item, idx) => {
      const rank = `${idx + 1}.`;
      desc += `-# **${rank}** <@${item.userId}> — **${item.count}** counts (Ruined **${item.ruins}** times)\n`;
    });
  }

  return cv2.info('Counting Leaderboard', desc);
}

/**
 * Button Interaction Handler
 */
export async function handleCountingButton(interaction) {
  const customId = interaction.customId;
  const guild = interaction.guild;
  if (!guild) return;

  const cfg = db.getCounting(guild.id);

  // Leaderboard button is public for all server members
  if (customId === 'counting_btn_lb') {
    return interaction.reply(cv2.asEphemeral(buildCountingLeaderboard(guild, cfg)));
  }

  // All other buttons require admin permissions
  if (!hasCountingAdminPerms(interaction.member, guild)) {
    return interaction.reply(cv2.asEphemeral(cv2.danger('Permission Denied', 'You need Administrator or Manage Channels permissions to modify counting settings.')));
  }

  if (customId === 'counting_btn_reset') {
    db.resetCounting(guild.id);
    const updated = db.getCounting(guild.id);
    
    // Announce in channel if bound
    if (updated.channelId) {
      const channel = guild.channels.cache.get(updated.channelId) || await guild.channels.fetch(updated.channelId).catch(() => null);
      if (channel) {
        channel.send({
          components: [{
            type: 17,
            components: [
              { type: 10, content: `# ${getRandomHeadingGlyph()} Count Reset | <a:03_tick_circle:1565665642084827206>` },
              { type: 14, divider: true },
              { type: 10, content: `-# The count was reset back to **0** by ${interaction.user}.\n-# Next count is **1**!` }
            ]
          }],
          flags: 32768
        }).catch(() => null);
      }
    }

    return interaction.update(getCountingPanel(guild.id));
  }

  if (customId === 'counting_btn_setsaves') {
    const modal = new ModalBuilder()
      .setCustomId('counting_modal_saves')
      .setTitle('Set Server Counting Saves');

    const input = new TextInputBuilder()
      .setCustomId('counting_modal_saves_input')
      .setLabel('Number of Saves (0 - 10)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g. 2')
      .setMinLength(1)
      .setMaxLength(2)
      .setRequired(true)
      .setValue(String(cfg.saves ?? 2));

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  if (customId === 'counting_btn_togglemath') {
    const newState = !(cfg.allowMath !== false);
    db.updateCounting(guild.id, { allowMath: newState });
    return interaction.update(getCountingPanel(guild.id));
  }

  if (customId === 'counting_btn_toggletopic') {
    const newState = !(cfg.autoTopic !== false);
    db.updateCounting(guild.id, { autoTopic: newState });
    return interaction.update(getCountingPanel(guild.id));
  }

  if (customId === 'counting_btn_disable') {
    db.updateCounting(guild.id, { channelId: null });
    return interaction.update(getCountingPanel(guild.id));
  }
}

/**
 * Select Menu Interaction Handler
 */
export async function handleCountingMenu(interaction) {
  const customId = interaction.customId;
  const guild = interaction.guild;
  if (!guild) return;

  if (customId === 'counting_select_channel') {
    if (!hasCountingAdminPerms(interaction.member, guild)) {
      return interaction.reply(cv2.asEphemeral(cv2.danger('Permission Denied', 'You need Administrator or Manage Channels permissions to bind the counting channel.')));
    }

    const selectedChannelId = interaction.values[0];
    const channel = guild.channels.cache.get(selectedChannelId) || await guild.channels.fetch(selectedChannelId).catch(() => null);
    if (!channel) {
      return interaction.reply(cv2.asEphemeral(cv2.error('Channel Error', 'Could not access the selected channel. Please ensure the bot has View and Send permissions.')));
    }

    const cfg = db.getCounting(guild.id);
    db.updateCounting(guild.id, { channelId: selectedChannelId });

    // Send introduction container to the designated channel
    const welcomeContainer = {
      type: 17,
      components: [
        { type: 10, content: `# ${getRandomHeadingGlyph()} Counting Channel Active | <a:03_tick_circle:1565665642084827206>` },
        { type: 14, divider: true },
        { 
          type: 10, 
          content: 
            `-# This channel has been designated as the server's official **Counting Channel**!\n\n` +
            `-# **Current Count:** **${cfg.currentCount || 0}**\n` +
            `-# **Next Number:** **${(cfg.currentCount || 0) + 1}**\n` +
            `-# **Server Saves:** **${cfg.saves ?? 2}**\n\n` +
            `-# **Rules:**\n` +
            `-# 1. Count consecutively starting from **${(cfg.currentCount || 0) + 1}**.\n` +
            `-# 2. You cannot count twice in a row.\n` +
            `-# 3. Non-numeric chat messages will be automatically cleared.`
        },
        { type: 14, divider: true },
        { type: 10, content: `-# **Type \`${(cfg.currentCount || 0) + 1}\` below to start counting!**` }
      ]
    };

    await channel.send({ components: [welcomeContainer], flags: 32768 }).catch(() => null);
    return interaction.update(getCountingPanel(guild.id));
  }
}

/**
 * Modal Submit Interaction Handler
 */
export async function handleCountingModal(interaction) {
  const customId = interaction.customId;
  const guild = interaction.guild;
  if (!guild) return;

  if (customId === 'counting_modal_saves') {
    if (!hasCountingAdminPerms(interaction.member, guild)) {
      return interaction.reply(cv2.asEphemeral(cv2.danger('Permission Denied', 'You need Administrator permissions to modify counting saves.')));
    }

    const raw = interaction.fields.getTextInputValue('counting_modal_saves_input').trim();
    const val = parseInt(raw, 10);
    if (isNaN(val) || val < 0 || val > 20) {
      return interaction.reply(cv2.asEphemeral(cv2.error('Invalid Saves', 'Please enter a valid number of saves between 0 and 20.')));
    }

    db.updateCounting(guild.id, { saves: val, maxSaves: Math.max(val, 2) });
    return interaction.reply(cv2.asEphemeral(cv2.success('Saves Updated', `Server saves have been set to **${val}**.`)));
  }
}

export const commands = [
  {
    name: 'counting',
    aliases: ['count', 'countinggame'],
    description: 'Configure and manage the Athena Counting Engine',
    category: 'community',
    permissions: [],
    async executePrefix(message, args) {
      if (!message.guild) {
        return message.reply(cv2.error('Guild Only', 'This command can only be used inside a Discord server.'));
      }

      const sub = (args[0] || '').toLowerCase();
      const isAdmin = hasCountingAdminPerms(message.member, message.guild);

      // Default: Open Interactive Dashboard
      if (!sub || sub === 'panel' || sub === 'dashboard' || sub === 'config') {
        if (!isAdmin) {
          return message.reply(cv2.danger('Permission Denied', 'You need Administrator or Manage Channels permissions to view the Counting Dashboard.'));
        }
        return message.channel.send(getCountingPanel(message.guild.id));
      }

      // Leaderboard (Public)
      if (sub === 'lb' || sub === 'leaderboard' || sub === 'top') {
        return message.channel.send(buildCountingLeaderboard(message.guild, db.getCounting(message.guild.id)));
      }

      // Admin subcommands below
      if (!isAdmin) {
        return message.reply(cv2.danger('Permission Denied', 'You need Administrator or Manage Channels permissions to execute counting subcommands.'));
      }

      // Subcommand: Setup / Bind Channel
      if (sub === 'setup' || sub === 'set' || sub === 'channel' || sub === 'bind') {
        const targetRaw = args[1];
        let targetChannel = null;

        if (message.mentions.channels.first()) {
          targetChannel = message.mentions.channels.first();
        } else if (targetRaw) {
          const cleanId = targetRaw.replace(/<#|>/g, '');
          targetChannel = message.guild.channels.cache.get(cleanId) || await message.guild.channels.fetch(cleanId).catch(() => null);
        }

        if (!targetChannel) {
          return message.reply(cv2.error('Invalid Channel', 'Please mention a valid text channel or provide its ID: `!counting setup #channel`'));
        }

        db.updateCounting(message.guild.id, { channelId: targetChannel.id });
        const cfg = db.getCounting(message.guild.id);

        const welcomeContainer = {
          type: 17,
          components: [
            { type: 10, content: `# ${getRandomHeadingGlyph()} Counting Channel Active | <a:03_tick_circle:1565665642084827206>` },
            { type: 14, divider: true },
            { 
              type: 10, 
              content: 
                `-# This channel has been designated as the server's official **Counting Channel**!\n\n` +
                `-# **Current Count:** **${cfg.currentCount || 0}**\n` +
                `-# **Next Number:** **${(cfg.currentCount || 0) + 1}**\n` +
                `-# **Server Saves:** **${cfg.saves ?? 2}**\n\n` +
                `-# **Rules:**\n` +
                `-# 1. Count consecutively starting from **${(cfg.currentCount || 0) + 1}**.\n` +
                `-# 2. You cannot count twice in a row.\n` +
                `-# 3. Non-numeric chat messages will be automatically cleared.`
            },
            { type: 14, divider: true },
            { type: 10, content: `-# **Type \`${(cfg.currentCount || 0) + 1}\` below to start counting!**` }
          ]
        };

        await targetChannel.send({ components: [welcomeContainer], flags: 32768 }).catch(() => null);
        return message.reply(cv2.success('Counting Channel Configured', `The counting engine has been successfully bound to <#${targetChannel.id}>.`));
      }

      // Subcommand: Reset Count
      if (sub === 'reset') {
        db.resetCounting(message.guild.id);
        const cfg = db.getCounting(message.guild.id);
        if (cfg.channelId) {
          const ch = message.guild.channels.cache.get(cfg.channelId) || await message.guild.channels.fetch(cfg.channelId).catch(() => null);
          if (ch) {
            ch.send({
              components: [{
                type: 17,
                components: [
                  { type: 10, content: `# ${getRandomHeadingGlyph()} Count Reset | <a:03_tick_circle:1565665642084827206>` },
                  { type: 14, divider: true },
                  { type: 10, content: `-# The count was reset back to **0** by ${message.author}.\n-# Next count is **1**!` }
                ]
              }],
              flags: 32768
            }).catch(() => null);
          }
        }
        return message.reply(cv2.success('Count Reset', 'The server count has been reset back to **0**. The next number is **1**.'));
      }

      // Subcommand: Set Saves
      if (sub === 'setsaves' || sub === 'saves') {
        const val = parseInt(args[1], 10);
        if (isNaN(val) || val < 0 || val > 20) {
          return message.reply(cv2.error('Invalid Saves', 'Please enter a valid number of server saves between 0 and 20: `!counting setsaves <number>`'));
        }
        db.updateCounting(message.guild.id, { saves: val, maxSaves: Math.max(val, 2) });
        return message.reply(cv2.success('Server Saves Set', `Server saves have been updated to **${val}**.`));
      }

      // Subcommand: Math Mode Toggle
      if (sub === 'math') {
        const opt = (args[1] || '').toLowerCase();
        let enable = true;
        if (opt === 'off' || opt === 'disable' || opt === 'false') enable = false;
        else if (opt === 'on' || opt === 'enable' || opt === 'true') enable = true;
        else {
          const curr = db.getCounting(message.guild.id);
          enable = !(curr.allowMath !== false);
        }
        db.updateCounting(message.guild.id, { allowMath: enable });
        return message.reply(cv2.success('Math Arithmetic Updated', `Counting arithmetic expressions are now **${enable ? 'Enabled' : 'Disabled'}**.`));
      }

      // Subcommand: Auto-Topic Sync Toggle
      if (sub === 'autotopic' || sub === 'topic') {
        const opt = (args[1] || '').toLowerCase();
        let enable = true;
        if (opt === 'off' || opt === 'disable' || opt === 'false') enable = false;
        else if (opt === 'on' || opt === 'enable' || opt === 'true') enable = true;
        else {
          const curr = db.getCounting(message.guild.id);
          enable = !(curr.autoTopic !== false);
        }
        db.updateCounting(message.guild.id, { autoTopic: enable });
        return message.reply(cv2.success('Auto-Topic Updated', `Channel topic automatic synchronization is now **${enable ? 'Enabled' : 'Disabled'}**.`));
      }

      // Subcommand: Disable
      if (sub === 'disable' || sub === 'off') {
        db.updateCounting(message.guild.id, { channelId: null });
        return message.reply(cv2.success('Counting Disabled', 'The counting system has been disabled for this server.'));
      }

      // Subcommand: Help
      const helpDesc =
        `### Counting Commands Overview\n` +
        `-# \`!counting\` - Open the interactive Counting Control Panel \`[Extra Owner]\`\n` +
        `-# \`!counting setup <#channel>\` - Bind counting to a specific channel \`[Extra Owner]\`\n` +
        `-# \`!counting reset\` - Reset the current count back to 0 \`[Extra Owner]\`\n` +
        `-# \`!counting setsaves <0-20>\` - Set available server saves \`[Extra Owner]\`\n` +
        `-# \`!counting math <on|off>\` - Toggle arithmetic math expressions \`[Extra Owner]\`\n` +
        `-# \`!counting autotopic <on|off>\` - Toggle auto-updating channel topic \`[Extra Owner]\`\n` +
        `-# \`!counting disable\` - Disable the counting system \`[Extra Owner]\`\n` +
        `-# \`!countlb\` - Display the server counting leaderboard \`[Public]\``;

      return message.reply(cv2.info('Counting Help Guide', helpDesc));
    }
  },
  {
    name: 'countlb',
    aliases: ['countinglb', 'countingleaderboard'],
    description: 'Display the server Counting Leaderboard',
    category: 'community',
    permissions: [],
    async executePrefix(message) {
      if (!message.guild) {
        return message.reply(cv2.error('Guild Only', 'This command can only be used inside a Discord server.'));
      }
      return message.channel.send(buildCountingLeaderboard(message.guild, db.getCounting(message.guild.id)));
    }
  }
];
