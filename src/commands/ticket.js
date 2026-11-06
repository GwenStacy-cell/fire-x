import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI, WRONG_EMOJI, WARN_EMOJI, UPTIME_EMOJI, DELETE_BEAT_EMOJI } from '../utils/emojis.js';
import {
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder
} from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';
import { isBotOwnerSync } from '../utils/helpers.js';
import { generateTicketTriage, buildTicketTriageContainer } from '../utils/ai.js';
import {
  dispatchTicketExports,
  fetchTicketMessages,
  generateHtmlTranscript,
  generateTextTranscript
} from '../utils/ticketTranscript.js';

export const commands = [
  {
    name: 'ticket',
    aliases: ['newticket'],
    description: 'Configure and manage the Athena server support ticket system',
    type: 1, // CHAT_INPUT
    default_member_permissions: String(PermissionFlagsBits.Administrator),
    options: [
      {
        name: 'setup',
        description: 'Deploy the ticket panel to the current channel',
        type: 1, // SUB_COMMAND
        options: [
          {
            name: 'category',
            description: 'The category to create tickets under',
            type: 7, // CHANNEL
            channel_types: [ChannelType.GuildCategory],
            required: true
          },
          {
            name: 'staff_role',
            description: 'The primary role that handles support tickets',
            type: 8, // ROLE
            required: true
          },
          {
            name: 'staff_role_2',
            description: 'Additional staff role',
            type: 8,
            required: false
          },
          {
            name: 'staff_role_3',
            description: 'Additional staff role',
            type: 8,
            required: false
          },
          {
            name: 'staff_role_4',
            description: 'Additional staff role',
            type: 8,
            required: false
          },
          {
            name: 'ai_triage',
            description: 'Enable Smart Ban Appeals & AI Ticket Triage (Default: False)',
            type: 5, // BOOLEAN
            required: false
          }
        ]
      },
      {
        name: 'ai',
        description: 'Toggle Smart Ban Appeals & AI Ticket Triage',
        type: 1, // SUB_COMMAND
        options: [
          {
            name: 'enabled',
            description: 'Enable or disable AI Ticket Triage',
            type: 5, // BOOLEAN
            required: true
          }
        ]
      },
      {
        name: 'log',
        description: 'Set the dedicated log channel where closed ticket transcripts will be archived',
        type: 1, // SUB_COMMAND
        options: [
          {
            name: 'channel',
            description: 'The text channel for ticket transcripts',
            type: 7,
            channel_types: [ChannelType.GuildText],
            required: true
          }
        ]
      },
      {
        name: 'export',
        description: 'Export conversation transcript of the active ticket on demand',
        type: 1
      }
    ],
    async executeSlash(interaction) {
      const subcommand = interaction.options.getSubcommand();
      const guildId = interaction.guild.id;

      if (subcommand === 'ai') {
        const enabled = interaction.options.getBoolean('enabled');
        db.updateTicketConfig(guildId, { aiTriage: enabled });
        return interaction.reply(cv2.success('Smart Ticket Triage | <a:03_tick_circle:1565665642084827206>', enabled ? 'Smart Ban Appeals & Ticket Triage has been enabled. User inquiries will be categorized and summarized automatically for staff.' : 'Smart Ban Appeals & Ticket Triage has been disabled.'));
      }

      if (subcommand === 'log') {
        const channel = interaction.options.getChannel('channel');
        db.updateTicketConfig(guildId, { logChannelId: channel.id });
        return interaction.reply(cv2.success('Ticket Log Channel Configured | <a:03_tick_circle:1565665642084827206>', `All closed ticket conversation transcripts and resolution cards will automatically be exported to <#${channel.id}>.`));
      }

      if (subcommand === 'export') {
        return executeTicketExport(interaction.guild, interaction.channel, interaction.member, (p) => interaction.reply(p));
      }

      if (subcommand === 'setup') {
        await interaction.deferReply();

        const category = interaction.options.getChannel('category');
        const role1 = interaction.options.getRole('staff_role');
        const role2 = interaction.options.getRole('staff_role_2');
        const role3 = interaction.options.getRole('staff_role_3');
        const role4 = interaction.options.getRole('staff_role_4');
        const aiTriageOpt = interaction.options.getBoolean('ai_triage');

        const staffRoles = [role1, role2, role3, role4].filter(r => r !== null).map(r => r.id);

        const container = {
          type: 17,
          components: [
            { type: 10, content: `# ${getRandomHeadingGlyph()} **Support Tickets**` },
            { type: 14, divider: true },
            { type: 10, content: 'Need help? Click the button below to open a private ticket. A text and voice channel will be created for you.' },
            { type: 14, divider: true },
            { type: 10, content: '-# **Athena Prime Support System \u2022 V1.0.0**' }
          ]
        };

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('ticket_open_general')
            .setLabel('Open Ticket')
            .setStyle(ButtonStyle.Primary)
        );

        container.components.push(row.toJSON());
        await interaction.channel.send({ components: [container], flags: 32768 });

        const ticketConfig = {
          categoryId: category.id,
          staffRoleIds: staffRoles,
          panelChannelId: interaction.channel.id
        };
        if (aiTriageOpt !== null) {
          ticketConfig.aiTriage = aiTriageOpt;
        }
        db.updateTicketConfig(guildId, ticketConfig);

        const roleMentions = staffRoles.map(id => `<@&${id}>`).join(', ');
        await interaction.editReply(cv2.success('Ticket System Deployed | <a:03_tick_circle:1565665642084827206>', `The ticket panel has been deployed successfully. Tickets will be created under ${category} and ${roleMentions} will be pinged.${aiTriageOpt ? '\n-# **Smart Ticket Triage:** Enabled' : ''}`));
      }
    },
    async executePrefix(message, args) {
      const sub = (args[0] || '').toLowerCase();

      // Check if command is run inside an active ticket channel for action shortcuts
      const activeTickets = db.getTickets(message.guild.id).activeTickets || {};
      const isInsideTicket = message.channel && (message.channel.name.startsWith('ticket-') || Object.values(activeTickets).some(t => t.textId === message.channel.id));

      if (sub === 'close') {
        return executeTicketClose(message.guild, message.channel, message.member, (p) => message.reply(p));
      }

      if (sub === 'export' || sub === 'transcript') {
        return executeTicketExport(message.guild, message.channel, message.member, (p) => message.reply(p));
      }

      if (sub === 'claim') {
        return executeTicketClaim(message.guild, message.channel, message.member, (p) => message.reply(p));
      }

      if (sub === 'lock' || sub === 'unlock') {
        return executeTicketLockToggle(message.guild, message.channel, message.member, sub === 'lock', (p) => message.reply(p));
      }

      if (sub === 'add') {
        const target = message.mentions.members.first() || message.guild.members.cache.get(args[1]?.replace(/[<@!>]/g, ''));
        if (!target) return message.reply(cv2.warn('Missing Member | <a:exclamation_outline1:1565666739356827759>', 'Please mention a valid member or provide their user ID.\nUsage: `!ticket add @user`'));
        return executeTicketAddUser(message.guild, message.channel, message.member, target, (p) => message.reply(p));
      }

      if (sub === 'remove' || sub === 'rem') {
        const target = message.mentions.members.first() || message.guild.members.cache.get(args[1]?.replace(/[<@!>]/g, ''));
        if (!target) return message.reply(cv2.warn('Missing Member | <a:exclamation_outline1:1565666739356827759>', 'Please mention a valid member or provide their user ID.\nUsage: `!ticket remove @user`'));
        return executeTicketRemoveUser(message.guild, message.channel, message.member, target, (p) => message.reply(p));
      }

      if (sub === 'info') {
        return executeTicketInfo(message.guild, message.channel, message.member, (p) => message.reply(p));
      }

      // Admin permission required for management actions below
      if (!message.member.permissions.has(PermissionFlagsBits.Administrator) && !isBotOwnerSync(message.author.id)) {
        return message.reply(cv2.error('Missing Permission | <a:04_cross_circle:1565665644806934639>', 'You need Administrator permissions to configure the ticket system.'));
      }

      if (sub === 'log' || sub === 'logs') {
        const targetChannel = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]?.replace(/[<#>]/g, ''));
        if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
          return message.reply(cv2.info('Ticket Transcript Logging', 'Usage: `!ticket log <#channel>`\nSpecifies where complete conversation transcripts & resolution cards are automatically sent upon ticket close.'));
        }
        db.updateTicketConfig(message.guild.id, { logChannelId: targetChannel.id });
        return message.reply(cv2.success('Ticket Log Channel Configured | <a:03_tick_circle:1565665642084827206>', `All closed ticket conversation transcripts and resolution summaries will automatically be exported to <#${targetChannel.id}>.`));
      }

      if (sub === 'ai' || sub === 'triage') {
        const current = db.getTickets(message.guild.id).aiTriage === true;
        let turnOn = !current;
        if (args[1]) {
          const a1 = args[1].toLowerCase();
          if (a1 === 'on' || a1 === 'enable' || a1 === 'true') turnOn = true;
          else if (a1 === 'off' || a1 === 'disable' || a1 === 'false') turnOn = false;
        }
        db.updateTicketConfig(message.guild.id, { aiTriage: turnOn });
        return message.reply(cv2.success('Smart Ticket Triage | <a:03_tick_circle:1565665642084827206>', turnOn ? 'Smart Ban Appeals & Ticket Triage has been enabled. User inquiries will be categorized and summarized automatically for staff.' : 'Smart Ban Appeals & Ticket Triage has been disabled.'));
      }

      if (sub === 'setup') {
        const categoryId = message.mentions.channels.first()?.id || args[1]?.replace(/[<#>]/g, '');
        const staffRoles = message.mentions.roles.map(r => r.id);

        if (!categoryId || staffRoles.length === 0) {
          return message.reply(cv2.info('Ticket Setup', 'Usage: `!ticket setup <#category> <@staffRole> [@additionalRoles...] [ai_on]`\nToggle AI Triage: `!ticket ai on|off`\nConfigure Transcripts: `!ticket log <#channel>`'));
        }

        const category = message.guild.channels.cache.get(categoryId);
        if (!category || category.type !== ChannelType.GuildCategory) {
          return message.reply(cv2.error('Invalid Category | <a:04_cross_circle:1565665644806934639>', 'Please provide a valid category.'));
        }

        const config = db.getTickets(message.guild.id);

        if (config.panelChannelId && config.panelMessageId) {
          try {
            const oldChannel = await message.guild.channels.fetch(config.panelChannelId);
            if (oldChannel) {
              const oldMessage = await oldChannel.messages.fetch(config.panelMessageId);
              if (oldMessage) await oldMessage.delete();
            }
          } catch (err) {}
        }

        const container = {
          type: 17,
          components: [
            { type: 10, content: `# ${getRandomHeadingGlyph()} **Support Tickets**` },
            { type: 14, divider: true },
            { type: 10, content: 'Need help? Click the button below to open a private ticket. A text and voice channel will be created for you.' },
            { type: 14, divider: true },
            { type: 10, content: '-# **Athena Prime Support System \u2022 V1.0.0**' }
          ]
        };

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('ticket_open_general')
            .setLabel('Open Ticket')
            .setStyle(ButtonStyle.Primary)
        );

        container.components.push(row.toJSON());
        const panelMsg = await message.channel.send({ components: [container], flags: 32768 });

        const aiTriageEnabled = args.some(a => /^(ai_on|ai:on|ai=on|triage_on)$/i.test(a));
        const ticketUpdate = {
          categoryId: category.id,
          staffRoleIds: staffRoles,
          panelChannelId: message.channel.id,
          panelMessageId: panelMsg.id
        };
        if (aiTriageEnabled) {
          ticketUpdate.aiTriage = true;
        }
        db.updateTicketConfig(message.guild.id, ticketUpdate);

        const roleMentions = staffRoles.map(id => `<@&${id}>`).join(', ');
        await message.reply(cv2.success('Ticket System Deployed | <a:03_tick_circle:1565665642084827206>', `Tickets will be created under <#${category.id}> and ${roleMentions} will be pinged.${aiTriageEnabled ? '\n-# **Smart Ticket Triage:** Enabled' : ''}`));
      } else {
        return message.reply(cv2.info('Ticket Control Matrix',
          `**Commands & Usage:**\n` +
          `<a:target_blink:1565667466984554588> \`!ticket setup <#category> <@staffRole> [ai_on]\` - Deploy public ticket panel\n` +
          `<a:target_blink:1565667466984554588> \`!ticket log <#channel>\` - Set automatic transcript archive channel\n` +
          `<a:target_blink:1565667466984554588> \`!ticket ai on|off\` - Toggle Smart AI Triage & Ban Appeals\n` +
          `<a:target_blink:1565667466984554588> \`!ticket export\` - Export live HTML & TXT transcript of current ticket\n` +
          `<a:target_blink:1565667466984554588> \`!ticket claim\` - Claim ownership of active ticket (awards Staff Pulse quota)\n` +
          `<a:target_blink:1565667466984554588> \`!ticket lock | unlock\` - Lock/unlock member messaging in ticket\n` +
          `<a:target_blink:1565667466984554588> \`!ticket add @user\` - Grant member access to ticket\n` +
          `<a:target_blink:1565667466984554588> \`!ticket remove @user\` - Revoke member access from ticket\n` +
          `<a:target_blink:1565667466984554588> \`!close\` - Resolve ticket & auto-export transcripts to Owner & Staff\n` +
          `<a:target_blink:1565667466984554588> \`!rename <new-name>\` - Rename active ticket channel\n\n` +
          `*For advanced interactive customization (dropdown reasons, image banners, Pinterest media), use \`!ticketpanel\`!*`
        ));
      }
    }
  },

  // --- CLOSE COMMAND ---
  {
    name: 'close',
    description: 'Resolve and close the current support ticket, auto-exporting conversation transcripts.',
    category: 'tickets',
    aliases: ['ticketclose', 'resolve'],
    permissions: [],
    options: [],
    async executePrefix(message) {
      return executeTicketClose(message.guild, message.channel, message.member, (p) => message.reply(p));
    },
    async executeSlash(interaction) {
      return executeTicketClose(interaction.guild, interaction.channel, interaction.member, (p) => interaction.reply(p));
    }
  },

  // --- RENAME COMMAND ---
  {
    name: 'rename',
    description: 'Rename the current support ticket channel.',
    category: 'tickets',
    aliases: ['ticketrename'],
    permissions: [],
    options: [
      { name: 'name', description: 'New name for the ticket', type: 3, required: true }
    ],
    async executePrefix(message, args) {
      const newName = args.join('-').trim();
      if (!newName) return message.reply(cv2.warn('Missing Name | <a:exclamation_outline1:1565666739356827759>', 'Usage: `!rename <new-name>`'));
      return executeTicketRename(message.guild, message.channel, message.member, newName, (p) => message.reply(p));
    },
    async executeSlash(interaction) {
      const newName = interaction.options.getString('name');
      return executeTicketRename(interaction.guild, interaction.channel, interaction.member, newName, (p) => interaction.reply(p));
    }
  },

  // --- CLAIM COMMAND ---
  {
    name: 'claim',
    description: 'Claim the current support ticket and award Staff Pulse activity credit.',
    category: 'tickets',
    aliases: ['ticketclaim'],
    permissions: [],
    options: [],
    async executePrefix(message) {
      return executeTicketClaim(message.guild, message.channel, message.member, (p) => message.reply(p));
    },
    async executeSlash(interaction) {
      return executeTicketClaim(interaction.guild, interaction.channel, interaction.member, (p) => interaction.reply(p));
    }
  },

  // --- TICKET EXPORT COMMAND ---
  {
    name: 'ticketexport',
    description: 'Export live HTML and plain text transcripts of the current ticket without closing it.',
    category: 'tickets',
    aliases: ['tickettranscript', 'transcript'],
    permissions: [],
    options: [],
    async executePrefix(message) {
      return executeTicketExport(message.guild, message.channel, message.member, (p) => message.reply(p));
    },
    async executeSlash(interaction) {
      return executeTicketExport(interaction.guild, interaction.channel, interaction.member, (p) => interaction.reply(p));
    }
  }
];

/**
 * Checks if a channel is an active ticket.
 */
function getTicketData(guild, channel) {
  if (!channel) return null;
  const config = db.getTickets(guild.id);
  const active = config.activeTickets || {};

  // Check matching textId
  for (const [tId, data] of Object.entries(active)) {
    if (data.textId === channel.id) {
      return { ticketId: tId, data, config };
    }
  }

  // Fallback to name pattern
  if (channel.name && channel.name.startsWith('ticket-')) {
    const tId = channel.name.replace('ticket-', '');
    return { ticketId: tId, data: active[tId] || {}, config };
  }

  return null;
}

/**
 * End-to-end Ticket Closure Engine:
 * 1. Verifies channel & closer permissions.
 * 2. Compiles forensic HTML and UTF-8 TXT transcripts.
 * 3. Dispatches transcripts to Server Owner, Claimed Staff, Closer, Member, and Dedicated Log Channel.
 * 4. Awards quota in Staff Pulse matrix (`db.recordStaffAction`).
 * 5. Archives metadata in database and cleanly deletes ticket text and voice channels.
 */
export async function executeTicketClose(guild, channel, closerMemberOrUser, replyFn) {
  const ticketInfo = getTicketData(guild, channel);
  if (!ticketInfo) {
    return replyFn(cv2.warn('Invalid Channel | <a:exclamation_outline1:1565666739356827759>', 'This command can only be executed inside an active ticket channel.'));
  }

  const { ticketId, data: tData, config } = ticketInfo;
  const closerId = closerMemberOrUser?.id || 'Unknown';
  const closerMember = closerMemberOrUser?.roles ? closerMemberOrUser : guild.members.cache.get(closerId);

  // Permission Verification
  const isGuildOwner = guild.ownerId === closerId;
  const isOwnerSync = isBotOwnerSync(closerId);
  const isAdmin = closerMember?.permissions?.has(PermissionFlagsBits.Administrator);
  const isStaff = config.staffRoleIds?.some(id => closerMember?.roles?.cache?.has(id));
  const isTicketOpener = tData.ownerId === closerId;

  if (config.closeTicketRoleIds && config.closeTicketRoleIds.length > 0) {
    const hasCloseRole = closerMember?.roles?.cache?.some(r => config.closeTicketRoleIds.includes(r.id));
    if (!hasCloseRole && !isGuildOwner && !isOwnerSync && !isAdmin) {
      return replyFn(cv2.danger('Permission Denied | <a:04_cross_circle:1565665642084827206>', 'You do not hold the required authorization role to close support tickets.'));
    }
  } else {
    // If no specific closing roles configured, allow Staff, Admins, Guild Owner, Bot Owner, or the Ticket Opener
    if (!isGuildOwner && !isOwnerSync && !isAdmin && !isStaff && !isTicketOpener) {
      return replyFn(cv2.danger('Permission Denied | <a:04_cross_circle:1565665642084827206>', 'You do not have permission to close this ticket.'));
    }
  }

  // Immediate notification in channel
  await replyFn({
    content: `<a:uptime:1552608831060844575> **Compiling forensic transcript and auto-exporting archives... Ticket #${ticketId} will close shortly.**`
  }).catch(() => null);

  // Perform full export dispatch
  let exportResult;
  try {
    exportResult = await dispatchTicketExports({
      guild,
      channel,
      ticketId,
      ticketData: tData,
      closedBy: closerMemberOrUser
    });
  } catch (err) {
    console.error('[executeTicketClose] Export error:', err);
  }

  // Graceful 3-second delay for Discord file transfers to finish cleanly
  setTimeout(async () => {
    // Voice channel cleanup
    let voiceChannel = null;
    if (tData.voiceId) {
      voiceChannel = guild.channels.cache.get(tData.voiceId) || (await guild.channels.fetch(tData.voiceId).catch(() => null));
    }
    if (!voiceChannel) {
      const vcName = `Ticket ${ticketId} VC`;
      voiceChannel = guild.channels.cache.find(c => c.name === vcName && c.parentId === channel.parentId);
    }
    if (voiceChannel) {
      await voiceChannel.delete('Ticket resolved and closed').catch(() => null);
    }

    // Text channel cleanup
    await channel.delete('Ticket resolved and closed').catch(() => null);

    // Database closure and archival
    if (db.closeTicket) {
      db.closeTicket(guild.id, ticketId, {
        closedBy: closerId,
        messageCount: exportResult?.messageCount || 0,
        duration: exportResult?.durationStr || 'Unknown'
      });
    }
  }, 3500);
}

/**
 * On-demand transcript export without closing the ticket.
 */
export async function executeTicketExport(guild, channel, member, replyFn) {
  const ticketInfo = getTicketData(guild, channel);
  if (!ticketInfo) {
    return replyFn(cv2.warn('Invalid Channel | <a:exclamation_outline1:1565666739356827759>', 'This command can only be used inside an active ticket channel.'));
  }

  const { ticketId, data: tData } = ticketInfo;
  await replyFn({ content: '<a:uptime:1552608831060844575> **Compiling live conversation transcripts...**' }).catch(() => null);

  const messages = await fetchTicketMessages(channel, 1000);
  const htmlBuffer = generateHtmlTranscript({ guild, channel, ticketId, ticketData: tData, messages, closedBy: member });
  const txtBuffer = generateTextTranscript({ guild, channel, ticketId, ticketData: tData, messages, closedBy: member });

  const container = {
    type: 17,
    components: [
      { type: 10, content: `# ${getRandomHeadingGlyph()} **Ticket #${ticketId} Live Transcript** | <a:03_tick_circle:1565665642084827206>` },
      { type: 14, divider: true },
      {
        type: 10,
        content:
          `<a:target_blink:1565667466984554588> **Ticket ID:** \`#${ticketId}\`\n` +
          `<a:target_blink:1565667466984554588> **Channel:** <#${channel.id}>\n` +
          `<a:target_blink:1565667466984554588> **Messages Captured:** \`${messages.length}\`\n` +
          `<a:target_blink:1565667466984554588> **Generated By:** <@${member.id}>\n\n` +
          `Interactive HTML viewer and UTF-8 plain text archive are attached below.`
      },
      { type: 14, divider: true },
      { type: 10, content: '-# **Athena Prime Forensic Transcript System \u2022 Live Snap**' }
    ]
  };

  return channel.send({
    components: [container],
    files: [
      new AttachmentBuilder(htmlBuffer, { name: `ticket-${ticketId}-live-transcript.html` }),
      new AttachmentBuilder(txtBuffer, { name: `ticket-${ticketId}-live-transcript.txt` })
    ],
    flags: 32768
  }).catch(() => null);
}

/**
 * Claim an active ticket and award Staff Pulse activity credit.
 */
export async function executeTicketClaim(guild, channel, member, replyFn) {
  const ticketInfo = getTicketData(guild, channel);
  if (!ticketInfo) {
    return replyFn(cv2.warn('Invalid Channel | <a:exclamation_outline1:1565666739356827759>', 'This command can only be executed inside an active ticket channel.'));
  }

  const { ticketId, data: tData, config } = ticketInfo;
  const isStaff = config.staffRoleIds?.some(id => member.roles.cache.has(id)) ||
                  member.permissions.has(PermissionFlagsBits.ManageChannels) ||
                  member.permissions.has(PermissionFlagsBits.Administrator) ||
                  isBotOwnerSync(member.id);

  if (!isStaff) {
    return replyFn(cv2.danger('Permission Denied | <a:04_cross_circle:1565665644806934639>', 'Only authorized support staff can claim tickets.'));
  }

  tData.claimedBy = member.id;
  db.save();

  // Award staff pulse activity credit
  db.recordStaffAction(guild.id, member.id, 'tickets');

  // Update channel topic
  const ownerMention = tData.ownerId ? `<@${tData.ownerId}>` : 'Member';
  await channel.setTopic(`Ticket #${ticketId} | Owner: ${ownerMention} | Claimed by: ${member.user.tag}`).catch(() => null);

  const container = {
    type: 17,
    components: [
      { type: 10, content: `# ${getRandomHeadingGlyph()} **Ticket #${ticketId} Claimed** | <a:03_tick_circle:1565665642084827206>` },
      { type: 14, divider: true },
      {
        type: 10,
        content:
          `<a:target_blink:1565667466984554588> **Support Agent:** <@${member.id}> (\`${member.user.tag}\`)\n` +
          `<a:target_blink:1565667466984554588> **Status:** Staff assigned & in progress\n` +
          `<a:target_blink:1565667466984554588> **Staff Activity Quota:** Recorded in Staff Pulse matrix.`
      },
      { type: 14, divider: true },
      { type: 10, content: '-# **Athena Prime Support Matrix \u2022 Active Agent Assigned**' }
    ]
  };

  return replyFn({ components: [container], flags: 32768 });
}

/**
 * Toggle lock/unlock state for the ticket opener.
 */
export async function executeTicketLockToggle(guild, channel, member, shouldLock, replyFn) {
  const ticketInfo = getTicketData(guild, channel);
  if (!ticketInfo) {
    return replyFn(cv2.warn('Invalid Channel | <a:exclamation_outline1:1565666739356827759>', 'This command can only be executed inside an active ticket channel.'));
  }

  const { ticketId, data: tData, config } = ticketInfo;
  const isStaff = config.staffRoleIds?.some(id => member.roles.cache.has(id)) ||
                  member.permissions.has(PermissionFlagsBits.ManageChannels) ||
                  member.permissions.has(PermissionFlagsBits.Administrator) ||
                  isBotOwnerSync(member.id);

  if (!isStaff) {
    return replyFn(cv2.danger('Permission Denied | <a:04_cross_circle:1565665644806934639>', 'Only authorized staff members can lock or unlock tickets.'));
  }

  const ownerId = tData.ownerId;
  if (ownerId) {
    await channel.permissionOverwrites.edit(ownerId, { SendMessages: !shouldLock }).catch(() => null);
  }

  tData.isLocked = shouldLock;
  db.save();

  if (shouldLock) {
    return replyFn(cv2.warn('Ticket Locked | <a:exclamation_outline1:1565666739356827759>', `Ticket #${ticketId} has been locked by <@${member.id}>. The member can no longer send messages until unlocked.`));
  } else {
    return replyFn(cv2.success('Ticket Unlocked | <a:03_tick_circle:1565665642084827206>', `Ticket #${ticketId} has been unlocked by <@${member.id}>. The member may send messages again.`));
  }
}

/**
 * Add a member to the active ticket channel.
 */
export async function executeTicketAddUser(guild, channel, executor, targetMember, replyFn) {
  const ticketInfo = getTicketData(guild, channel);
  if (!ticketInfo) {
    return replyFn(cv2.warn('Invalid Channel | <a:exclamation_outline1:1565666739356827759>', 'This command can only be executed inside an active ticket channel.'));
  }

  await channel.permissionOverwrites.edit(targetMember.id, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true
  }).catch(() => null);

  const { ticketId, data: tData } = ticketInfo;
  if (tData.voiceId) {
    const vc = guild.channels.cache.get(tData.voiceId) || (await guild.channels.fetch(tData.voiceId).catch(() => null));
    if (vc) {
      await vc.permissionOverwrites.edit(targetMember.id, {
        ViewChannel: true,
        Connect: true,
        Speak: true
      }).catch(() => null);
    }
  }

  return replyFn(cv2.success('Access Granted | <a:03_tick_circle:1565665642084827206>', `<@${targetMember.id}> (\`${targetMember.user.tag}\`) has been added to ticket #${ticketId} by <@${executor.id}>.`));
}

/**
 * Remove a member from the active ticket channel.
 */
export async function executeTicketRemoveUser(guild, channel, executor, targetMember, replyFn) {
  const ticketInfo = getTicketData(guild, channel);
  if (!ticketInfo) {
    return replyFn(cv2.warn('Invalid Channel | <a:exclamation_outline1:1565666739356827759>', 'This command can only be executed inside an active ticket channel.'));
  }

  const { ticketId, data: tData } = ticketInfo;
  if (tData.ownerId === targetMember.id) {
    return replyFn(cv2.warn('Invalid Target | <a:exclamation_outline1:1565666739356827759>', 'You cannot remove the ticket creator from their own ticket. Use `!close` to terminate the ticket.'));
  }

  await channel.permissionOverwrites.delete(targetMember.id).catch(() => null);

  if (tData.voiceId) {
    const vc = guild.channels.cache.get(tData.voiceId) || (await guild.channels.fetch(tData.voiceId).catch(() => null));
    if (vc) {
      await vc.permissionOverwrites.delete(targetMember.id).catch(() => null);
    }
  }

  return replyFn(cv2.success('Access Revoked | <a:03_tick_circle:1565665642084827206>', `<@${targetMember.id}> (\`${targetMember.user.tag}\`) has been removed from ticket #${ticketId} by <@${executor.id}>.`));
}

/**
 * Displays rich ticket info card.
 */
export async function executeTicketInfo(guild, channel, member, replyFn) {
  const ticketInfo = getTicketData(guild, channel);
  if (!ticketInfo) {
    return replyFn(cv2.warn('Invalid Channel | <a:exclamation_outline1:1565666739356827759>', 'This command can only be executed inside an active ticket channel.'));
  }

  const { ticketId, data: tData } = ticketInfo;
  const ownerMention = tData.ownerId ? `<@${tData.ownerId}> (\`${tData.ownerId}\`)` : '`Unknown`';
  const claimedMention = tData.claimedBy ? `<@${tData.claimedBy}>` : '`Unclaimed`';
  const createdTimestamp = tData.createdAt ? Math.floor(tData.createdAt / 1000) : Math.floor(channel.createdTimestamp / 1000);
  const vcMention = tData.voiceId ? `<#${tData.voiceId}>` : '`None`';
  const statusStr = tData.isLocked ? '`Locked (Member Restricted)`' : '`Active & Open`';

  const container = {
    type: 17,
    components: [
      { type: 10, content: `# ${getRandomHeadingGlyph()} **Ticket #${ticketId} Forensic Dossier**` },
      { type: 14, divider: true },
      {
        type: 10,
        content:
          `<a:target_blink:1565667466984554588> **Ticket ID:** \`#${ticketId}\`\n` +
          `<a:target_blink:1565667466984554588> **Opened By:** ${ownerMention}\n` +
          `<a:target_blink:1565667466984554588> **Assigned Staff:** ${claimedMention}\n` +
          `<a:target_blink:1565667466984554588> **Voice Channel:** ${vcMention}\n` +
          `<a:target_blink:1565667466984554588> **Status:** ${statusStr}\n` +
          `<a:target_blink:1565667466984554588> **Created At:** <t:${createdTimestamp}:F> (<t:${createdTimestamp}:R>)`
      },
      { type: 14, divider: true },
      { type: 10, content: '-# **Athena Prime Support & Security Matrix \u2022 V1.0.0**' }
    ]
  };

  return replyFn({ components: [container], flags: 32768 });
}

async function executeTicketRename(guild, channel, member, newName, replyFn) {
  const ticketInfo = getTicketData(guild, channel);
  if (!ticketInfo) {
    return replyFn(cv2.warn('Invalid Channel | <a:exclamation_outline1:1565666739356827759>', 'This command can only be used inside a ticket channel.'));
  }
  const clean = newName.replace(/[^a-zA-Z0-9_\-]/g, '').toLowerCase().slice(0, 30);
  const finalName = `ticket-${clean || 'named'}`;
  await channel.setName(finalName, `Ticket renamed by ${member.user.tag}`).catch(() => null);
  return replyFn(cv2.success('Ticket Renamed | <a:03_tick_circle:1565665642084827206>', `Ticket channel has been renamed to \`${finalName}\`.`));
}

/**
 * Robust Ticket Channel Provisioner:
 * Automatically provisions BOTH a private text channel AND a private associated voice channel
 * under the configured category with synchronized permissions for user and staff.
 * Features built-in auto-healing if categoryId or staffRoleIds were not explicitly set.
 */
export async function createTicketChannels({ guild, user, reason = 'General Support', interactionChannel = null }) {
  const config = db.getTickets(guild.id);

  // 1. Resolve or Auto-Provision Category
  let category = null;
  if (config.categoryId) {
    category = guild.channels.cache.get(config.categoryId) || (await guild.channels.fetch(config.categoryId).catch(() => null));
  }

  if (!category) {
    // Check if the interaction channel is in a category
    if (interactionChannel?.parentId) {
      category = guild.channels.cache.get(interactionChannel.parentId) || (await guild.channels.fetch(interactionChannel.parentId).catch(() => null));
    }
    // Check if configured target deployment channel has a category
    if (!category && config.targetChannelId) {
      const tc = guild.channels.cache.get(config.targetChannelId);
      if (tc?.parentId) {
        category = guild.channels.cache.get(tc.parentId) || (await guild.channels.fetch(tc.parentId).catch(() => null));
      }
    }
    // Search for any existing category with tickets/support in name
    if (!category) {
      category = guild.channels.cache.find
        ? guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && /tickets?|support/i.test(c.name))
        : Array.from(guild.channels.cache.values()).find(c => c.type === ChannelType.GuildCategory && /tickets?|support/i.test(c.name));
    }
    // Auto-create "Support Tickets" category if still not found
    if (!category) {
      try {
        category = await guild.channels.create({
          name: 'Support Tickets',
          type: ChannelType.GuildCategory,
          permissionOverwrites: [
            { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: guild.members?.me?.id || guild.client?.user?.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles] }
          ]
        });
      } catch (err) {
        console.warn('[Ticket Auto-Provision] Could not create category:', err.message);
      }
    }
    if (category) {
      config.categoryId = category.id;
      db.save();
    }
  }

  // 2. Resolve or Auto-Heal Staff Roles
  if (!Array.isArray(config.staffRoleIds)) config.staffRoleIds = [];
  config.staffRoleIds = config.staffRoleIds.filter(id => guild.roles.cache.has(id));

  if (config.staffRoleIds.length === 0) {
    // Check closeTicketRoleIds if configured
    if (Array.isArray(config.closeTicketRoleIds) && config.closeTicketRoleIds.length > 0) {
      config.staffRoleIds = config.closeTicketRoleIds.filter(id => guild.roles.cache.has(id));
    }
    // Auto-detect any staff/support/moderator role
    if (config.staffRoleIds.length === 0) {
      const allRoles = guild.roles.cache.values ? Array.from(guild.roles.cache.values()) : [];
      const detectedStaff = allRoles.filter(r =>
        !r.managed && r.id !== guild.id &&
        (r.permissions?.has(PermissionFlagsBits.ManageChannels) ||
         r.permissions?.has(PermissionFlagsBits.ModerateMembers) ||
         /staff|support|mod|admin|helper/i.test(r.name))
      );
      if (detectedStaff.length > 0) {
        const sorted = [...detectedStaff].sort((a, b) => (b.position || 0) - (a.position || 0));
        config.staffRoleIds = sorted.slice(0, 3).map(r => r.id);
      }
    }
    db.save();
  }

  config.ticketCount = (config.ticketCount || 0) + 1;
  const ticketId = config.ticketCount.toString().padStart(4, '0');

  // Text Channel Overwrites
  const textOverwrites = [
    {
      id: guild.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    },
    {
      id: guild.members.me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageRoles,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    }
  ];

  // Associated Voice Channel Overwrites
  const voiceOverwrites = [
    {
      id: guild.id,
      deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect]
    },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
        PermissionFlagsBits.Stream,
        PermissionFlagsBits.UseVAD
      ]
    },
    {
      id: guild.members.me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.MuteMembers,
        PermissionFlagsBits.DeafenMembers,
        PermissionFlagsBits.MoveMembers
      ]
    }
  ];

  for (const roleId of config.staffRoleIds) {
    textOverwrites.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    });
    voiceOverwrites.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
        PermissionFlagsBits.Stream,
        PermissionFlagsBits.UseVAD,
        PermissionFlagsBits.MuteMembers,
        PermissionFlagsBits.MoveMembers
      ]
    });
  }

  // 1. Create text channel
  const textChannel = await guild.channels.create({
    name: `ticket-${ticketId}`,
    type: ChannelType.GuildText,
    parent: category ? category.id : undefined,
    topic: `Ticket #${ticketId} | Owner: <@${user.id}> (${user.tag}) | Reason: ${reason}`,
    permissionOverwrites: textOverwrites
  });

  // 2. Create associated voice channel
  const voiceChannel = await guild.channels.create({
    name: `Ticket ${ticketId} VC`,
    type: ChannelType.GuildVoice,
    parent: category ? category.id : undefined,
    permissionOverwrites: voiceOverwrites
  });

  // 3. Save to activeTickets
  if (!config.activeTickets) config.activeTickets = {};
  config.activeTickets[ticketId] = {
    textId: textChannel.id,
    voiceId: voiceChannel.id,
    ownerId: user.id,
    createdAt: Date.now(),
    reason
  };
  db.save();

  return { ticketId, textChannel, voiceChannel, config };
}

/**
 * Handles all button interactions starting with `ticket_`.
 */
export async function handleTicketButtons(interaction) {
  const { customId, guild, user, member } = interaction;

  // OPEN TICKET (General / Default)
  if (customId === 'ticket_open' || customId === 'ticket_open_general') {
    const config = db.getTickets(guild.id);

    // Rate Limit: Check if user already has an active ticket
    let alreadyOpen = false;
    if (config.activeTickets) {
      for (const [id, data] of Object.entries(config.activeTickets)) {
        if (data.ownerId === user.id) alreadyOpen = true;
      }
    }

    if (alreadyOpen) {
      return interaction.reply({ content: '-# **Rate Limit:** You already have an open ticket in this server!', flags: 64 }).catch(() => null);
    }

    await interaction.reply({ content: '-# <a:loading:1542155051286396938> **Creating your secure text & voice ticket channels...**', flags: 64 }).catch(() => null);

    try {
      const { ticketId, textChannel, voiceChannel, config: ticketConfig } = await createTicketChannels({
        guild,
        user,
        reason: 'General Support',
        interactionChannel: interaction.channel
      });

      const rolePings = (ticketConfig.staffRoleIds || []).map(id => `<@&${id}>`).join(' ');
      const pings = `<@${user.id}>${rolePings ? ' ' + rolePings : ''}`;
      const container = {
        type: 17,
        components: [
          { type: 10, content: `# ${getRandomHeadingGlyph()} **Support Ticket #${ticketId}**` },
          { type: 14, divider: true },
          {
            type: 10,
            content:
              `${pings}\n\n` +
              `**Welcome <@${user.id}>!** Please describe your request or issue below.\n` +
              `A staff member will assist you shortly.\n\n` +
              `<a:target_blink:1565667466984554588> **Dedicated Voice Room:** <#${voiceChannel.id}>\n` +
              `<a:target_blink:1565667466984554588> **Associated Text Channel:** <#${textChannel.id}>\n` +
              `<a:target_blink:1565667466984554588> **Forensic Archival:** Live conversation will be exported upon closure.`
          },
          { type: 14, divider: true },
          { type: 10, content: '-# **Athena Prime Support & Security Matrix \u2022 V1.0.0**' }
        ]
      };

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim Ticket').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_close').setLabel('Close Ticket').setEmoji(DELETE_BEAT_EMOJI).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ticket_lock').setLabel('Lock Ticket').setStyle(ButtonStyle.Secondary)
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_add_user').setLabel('Add User').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_rem_user').setLabel('Remove User').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_info').setLabel('Ticket Info').setStyle(ButtonStyle.Secondary)
      );

      await textChannel.send({
        components: [container, row1, row2],
        flags: 32768
      });

      if (ticketConfig.aiTriage) {
        try {
          const triage = await generateTicketTriage({ title: 'General Support', inquiry: 'General member assistance ticket opened.', user });
          const triageCard = buildTicketTriageContainer({ ...triage, user });
          await textChannel.send({ components: [triageCard], flags: 32768 }).catch(() => null);
        } catch (err) {
          console.warn('[Ticket AI Triage] Failed to send general triage card:', err.message);
        }
      }

      await interaction.editReply({
        content: `-# <a:03_tick_circle:1565665642084827206> **Ticket Channels Created:** Text <#${textChannel.id}> | Voice <#${voiceChannel.id}>`
      }).catch(() => null);
    } catch (error) {
      console.error('[Ticket Create]', error);
      await interaction.editReply({ content: `-# **Error:** ${error.message || 'Failed to create ticket channels. Ensure I have Manage Channels permission.'}` }).catch(() => null);
    }
    return;
  }

  // CLAIM TICKET
  if (customId === 'ticket_claim') {
    return executeTicketClaim(guild, interaction.channel, member, (p) => interaction.reply(p));
  }

  // LOCK / UNLOCK TICKET
  if (customId === 'ticket_lock') {
    const ticketInfo = getTicketData(guild, interaction.channel);
    const currentlyLocked = ticketInfo?.data?.isLocked || false;
    return executeTicketLockToggle(guild, interaction.channel, member, !currentlyLocked, (p) => interaction.reply(p));
  }

  // TICKET INFO
  if (customId === 'ticket_info') {
    return executeTicketInfo(guild, interaction.channel, member, (p) => interaction.reply({ ...p, flags: 64 }));
  }

  // ADD USER MODAL
  if (customId === 'ticket_add_user') {
    const modal = new ModalBuilder()
      .setCustomId('ticket_modal_adduser')
      .setTitle('Add Member to Ticket');

    const input = new TextInputBuilder()
      .setCustomId('user_id')
      .setLabel('Member ID or @Mention')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g. 123456789012345678 or @username')
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  // REMOVE USER MODAL
  if (customId === 'ticket_rem_user') {
    const modal = new ModalBuilder()
      .setCustomId('ticket_modal_remuser')
      .setTitle('Remove Member from Ticket');

    const input = new TextInputBuilder()
      .setCustomId('user_id')
      .setLabel('Member ID or @Mention')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g. 123456789012345678 or @username')
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  // ADD ROLE MODAL
  if (customId === 'ticket_add_role') {
    const modal = new ModalBuilder()
      .setCustomId('ticket_modal_addrole')
      .setTitle('Add Role to Ticket');

    const input = new TextInputBuilder()
      .setCustomId('role_id')
      .setLabel('Role ID or @Role')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g. 123456789012345678')
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  // CLOSE TICKET BUTTON
  if (customId === 'ticket_close') {
    return executeTicketClose(guild, interaction.channel, member, (p) => interaction.reply(p));
  }
}

/**
 * Handles dropdown select menus on ticket panels.
 */
export async function handleTicketSelectMenu(interaction) {
  const { customId, guild, user, values } = interaction;

  if (customId === 'ticket_select_option') {
    const config = db.getTickets(guild.id);
    let alreadyOpen = false;
    if (config.activeTickets) {
      for (const [id, data] of Object.entries(config.activeTickets)) {
        if (data.ownerId === user.id) alreadyOpen = true;
      }
    }
    if (alreadyOpen) return interaction.reply({ content: '-# **Rate Limit:** You already have an open ticket in this server!', flags: 64 }).catch(() => null);

    const reason = values[0];

    const modal = new ModalBuilder().setCustomId('ticket_modal_submit_' + encodeURIComponent(reason)).setTitle(reason.slice(0, 45) + ' Inquiry');

    const inquiryInput = new TextInputBuilder()
      .setCustomId('inquiry')
      .setLabel('Nature of Inquiry')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Brief description of your issue')
      .setRequired(true);

    const docsInput = new TextInputBuilder()
      .setCustomId('docs')
      .setLabel('Checked Server Rules / FAQs?')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Yes / No')
      .setRequired(true);

    const detailsInput = new TextInputBuilder()
      .setCustomId('details')
      .setLabel('Detailed Explanation')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Please provide full context and relevant details...')
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(inquiryInput),
      new ActionRowBuilder().addComponents(docsInput),
      new ActionRowBuilder().addComponents(detailsInput)
    );
    return interaction.showModal(modal);
  }
}

/**
 * Handles all modal submissions starting with `ticket_modal_`.
 */
export async function handleTicketModals(interaction) {
  const { customId, guild, user, member, fields } = interaction;

  // Add User Modal
  if (customId === 'ticket_modal_adduser') {
    const rawInput = fields.getTextInputValue('user_id').replace(/[<@!>]/g, '').trim();
    const targetMember = guild.members.cache.get(rawInput) || (await guild.members.fetch(rawInput).catch(() => null));
    if (!targetMember) {
      return interaction.reply({ content: '-# **Error:** Could not find that member in this server.', flags: 64 }).catch(() => null);
    }
    return executeTicketAddUser(guild, interaction.channel, member, targetMember, (p) => interaction.reply(p));
  }

  // Remove User Modal
  if (customId === 'ticket_modal_remuser') {
    const rawInput = fields.getTextInputValue('user_id').replace(/[<@!>]/g, '').trim();
    const targetMember = guild.members.cache.get(rawInput) || (await guild.members.fetch(rawInput).catch(() => null));
    if (!targetMember) {
      return interaction.reply({ content: '-# **Error:** Could not find that member in this server.', flags: 64 }).catch(() => null);
    }
    return executeTicketRemoveUser(guild, interaction.channel, member, targetMember, (p) => interaction.reply(p));
  }

  // Add Role Modal
  if (customId === 'ticket_modal_addrole') {
    const rawInput = fields.getTextInputValue('role_id').replace(/[<@&>]/g, '').trim();
    const targetRole = guild.roles.cache.get(rawInput) || (await guild.roles.fetch(rawInput).catch(() => null));
    if (!targetRole) {
      return interaction.reply({ content: '-# **Error:** Could not find that role in this server.', flags: 64 }).catch(() => null);
    }
    await interaction.channel.permissionOverwrites.edit(targetRole.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true
    }).catch(() => null);

    const ticketInfo = getTicketData(guild, interaction.channel);
    if (ticketInfo?.data?.voiceId) {
      const vc = guild.channels.cache.get(ticketInfo.data.voiceId) || (await guild.channels.fetch(ticketInfo.data.voiceId).catch(() => null));
      if (vc) {
        await vc.permissionOverwrites.edit(targetRole.id, {
          ViewChannel: true,
          Connect: true,
          Speak: true
        }).catch(() => null);
      }
    }

    return interaction.reply(cv2.success('Role Access Granted | <a:03_tick_circle:1565665642084827206>', `Role <@&${targetRole.id}> (\`${targetRole.name}\`) has been given access to this ticket.`));
  }

  // Reason Modal Submission
  if (customId.startsWith('ticket_modal_submit_')) {
    const reason = decodeURIComponent(customId.replace('ticket_modal_submit_', ''));

    await interaction.reply({ content: '-# <a:loading:1542155051286396938> **Creating your secure text & voice ticket channels...**', flags: 64 }).catch(() => null);

    try {
      const { ticketId, textChannel, voiceChannel, config: ticketConfig } = await createTicketChannels({
        guild,
        user,
        reason,
        interactionChannel: interaction.channel
      });

      const inquiry = fields.getTextInputValue('inquiry');
      const docs = fields.getTextInputValue('docs');
      const details = fields.getTextInputValue('details');
      const nowStr = new Date().toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

      const rolePings = (ticketConfig.staffRoleIds || []).map(id => `<@&${id}>`).join(' ');
      const pings = `<@${user.id}>${rolePings ? ' ' + rolePings : ''}`;
      const infoContent =
        `${pings}\n\n` +
        `**Welcome <@${user.id}>!** Your support ticket has been created.\nA staff member will assist you shortly.\n\n` +
        `<a:target_blink:1565667466984554588> **Dedicated Voice Room:** <#${voiceChannel.id}>\n` +
        `<a:target_blink:1565667466984554588> **Associated Text Channel:** <#${textChannel.id}>\n` +
        `<a:target_blink:1565667466984554588> **Created By:** <@${user.id}>\n` +
        `<a:target_blink:1565667466984554588> **Inquiry Type:** \`${reason}\`\n` +
        `<a:target_blink:1565667466984554588> **Timestamp:** \`${nowStr}\`\n\n` +
        `**Dossier Provided:**\n` +
        `> **Nature of Inquiry:** ${inquiry}\n` +
        `> **Checked Documentation?:** ${docs}\n` +
        `> **Additional Context:**\n\`\`\`\n${details}\n\`\`\``;

      const container = {
        type: 17,
        components: [
          { type: 10, content: `# ${getRandomHeadingGlyph()} **${reason} Ticket #${ticketId}**` },
          { type: 14, divider: true },
          { type: 10, content: infoContent },
          { type: 14, divider: true },
          { type: 10, content: '-# **Athena Prime Support & Security Matrix \u2022 V1.0.0**' }
        ]
      };

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim Ticket').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_close').setLabel('Close Ticket').setEmoji(DELETE_BEAT_EMOJI).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ticket_lock').setLabel('Lock Ticket').setStyle(ButtonStyle.Secondary)
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_add_user').setLabel('Add User').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_rem_user').setLabel('Remove User').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_info').setLabel('Ticket Info').setStyle(ButtonStyle.Secondary)
      );

      await textChannel.send({
        components: [container, row1, row2],
        flags: 32768
      });

      if (ticketConfig.aiTriage) {
        try {
          const triage = await generateTicketTriage({ title: reason, inquiry, docs, details, user });
          const triageCard = buildTicketTriageContainer({ ...triage, user });
          await textChannel.send({ components: [triageCard], flags: 32768 }).catch(() => null);
        } catch (err) {
          console.warn('[Ticket AI Triage] Failed to send modal triage card:', err.message);
        }
      }

      await interaction.editReply({
        content: `-# <a:03_tick_circle:1565665642084827206> **Ticket Channels Created:** Text <#${textChannel.id}> | Voice <#${voiceChannel.id}>`
      }).catch(() => null);
    } catch (error) {
      console.error('[Ticket Modal Create]', error);
      await interaction.editReply({ content: `-# **Error:** ${error.message || 'Failed to create ticket channels.'}` }).catch(() => null);
    }
  }
}
