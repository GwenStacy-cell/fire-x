import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';
import { isBotOwnerSync } from '../utils/helpers.js';
import { generateTicketTriage, buildTicketTriageContainer } from '../utils/ai.js';

export const commands = [
  {
    name: 'ticket',
    aliases: ['newticket', 'ticketpanel'],
    description: 'Configure the server support ticket system',
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
            { type: 10, content: '## **Support Tickets**' },
            { type: 14, divider: true },
            { type: 10, content: 'Need help? Click the button below to open a private ticket. A text and voice channel will be created for you.' },
            { type: 14, divider: true },
            { type: 10, content: '-# **Athena Prime Support System \u2022 V1.0.0**' }
          ]
        };

        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('ticket_open_general')
              .setLabel('Open Ticket')
              .setEmoji('<:139707ticket:1533859896620089485>')
              .setStyle(ButtonStyle.Primary)
          );

        container.components.push(row.toJSON());
        await interaction.channel.send({ components: [container], flags: 32768 });

        const ticketConfig = {
          categoryId: category.id,
          staffRoleIds: staffRoles
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
      if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.reply(cv2.error('Missing Permission', 'You need Administrator permissions to use this command.'));
      }

      if (args[0]?.toLowerCase() === 'ai' || args[0]?.toLowerCase() === 'triage') {
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

      if (args[0]?.toLowerCase() === 'setup') {
        const categoryId = message.mentions.channels.first()?.id || args[1]?.replace(/[<#>]/g, '');
        const staffRoles = message.mentions.roles.map(r => r.id);

        if (!categoryId || staffRoles.length === 0) {
          return message.reply(cv2.info('Ticket Setup', 'Usage: `!ticket setup <#category> <@staffRole> [@additionalRoles...] [ai_on]`\nToggle AI Triage: `!ticket ai on|off`'));
        }

        const category = message.guild.channels.cache.get(categoryId);
        if (!category || category.type !== ChannelType.GuildCategory) {
          return message.reply(cv2.error('Invalid Category', 'Please provide a valid category.'));
        }

        const config = db.getTickets(message.guild.id);
        const guildConfig = db.getGuildConfig(message.guild.id);
        const accentColor = guildConfig.accentColor || '#3b82f6';

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
            { type: 10, content: '## **Support Tickets**' },
            { type: 14, divider: true },
            { type: 10, content: 'Need help? Click the button below to open a private ticket. A text and voice channel will be created for you.' },
            { type: 14, divider: true },
            { type: 10, content: '-# **Athena Prime Support System \u2022 V1.0.0**' }
          ]
        };

        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('ticket_open_general')
              .setLabel('Open Ticket')
              .setEmoji('<:139707ticket:1533859896620089485>') 
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
      } else if (args[0]?.toLowerCase() === 'close') {
        return executeTicketClose(message.guild, message.channel, message.member, (p) => message.reply(p));
      } else {
        return message.reply(cv2.info('Ticket Setup', 'Usage: `!ticket setup <#category> <@staffRole> [@additionalRoles...] [ai_on]`\nToggle AI Triage: `!ticket ai on|off`\n\nFor advanced customization (dropdowns, images, etc.), use the `!ticketpanel` command!'));
      }
    }
  },

  // --- CLOSE COMMAND ---
  {
    name: 'close',
    description: 'Close the current support ticket.',
    category: 'tickets',
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
    permissions: [],
    options: [
      { name: 'name', description: 'New name for the ticket', type: 3, required: true }
    ],
    async executePrefix(message, args) {
      const newName = args.join('-').trim();
      if (!newName) return message.reply(cv2.warn('Missing Name', 'Usage: `!rename <new-name>`'));
      return executeTicketRename(message.guild, message.channel, message.member, newName, (p) => message.reply(p));
    },
    async executeSlash(interaction) {
      const newName = interaction.options.getString('name');
      return executeTicketRename(interaction.guild, interaction.channel, interaction.member, newName, (p) => interaction.reply(p));
    }
  }
];

async function executeTicketClose(guild, channel, member, replyFn) {
  const isTicket = channel && (channel.name.startsWith('ticket-') || (db.getTickets(guild.id).activeTickets && Object.values(db.getTickets(guild.id).activeTickets).some(t => t.textId === channel.id)));
  if (!isTicket) {
    return replyFn(cv2.warn('Invalid Channel', 'This command can only be used inside a ticket channel.'));
  }

  const config = db.getTickets(guild.id);
  if (config.closeTicketRoleIds && config.closeTicketRoleIds.length > 0) {
    const hasRole = member.roles.cache.some(r => config.closeTicketRoleIds.includes(r.id));
    if (!hasRole && !member.permissions.has(PermissionFlagsBits.Administrator) && !isBotOwnerSync(member.id)) {
      return replyFn(cv2.danger('Permission Denied', 'You do not have permission to close tickets.'));
    }
  }

  await replyFn({ content: '-# **Closing ticket in 5 seconds...**' });

  setTimeout(async () => {
    const tId = channel.name.replace('ticket-', '');
    let vId = null;
    if (config.activeTickets && config.activeTickets[tId]) {
      vId = config.activeTickets[tId].voiceId;
    }
    if (vId) {
      const voiceChannel = guild.channels.cache.get(vId) || await guild.channels.fetch(vId).catch(() => null);
      if (voiceChannel) await voiceChannel.delete().catch(() => null);
    } else {
      const vcName = `Ticket ${tId} VC`;
      const voiceChannel = guild.channels.cache.find(c => c.name === vcName && c.parentId === channel.parentId);
      if (voiceChannel) await voiceChannel.delete().catch(() => null);
    }
    await channel.delete().catch(() => null);
    if (db.closeTicket) {
      db.closeTicket(guild.id, tId);
    }
  }, 5000);
}

async function executeTicketRename(guild, channel, member, newName, replyFn) {
  const isTicket = channel && (channel.name.startsWith('ticket-') || (db.getTickets(guild.id).activeTickets && Object.values(db.getTickets(guild.id).activeTickets).some(t => t.textId === channel.id)));
  if (!isTicket) {
    return replyFn(cv2.warn('Invalid Channel', 'This command can only be used inside a ticket channel.'));
  }
  const clean = newName.replace(/[^a-zA-Z0-9_\-]/g, '').toLowerCase().slice(0, 30);
  const finalName = `ticket-${clean || 'named'}`;
  await channel.setName(finalName, `Ticket renamed by ${member.user.tag}`).catch(() => null);
  return replyFn(cv2.success('Ticket Renamed | <a:03_tick_circle:1565665642084827206>', `Ticket channel has been renamed to \`${finalName}\`.`));
}

export async function handleTicketButtons(interaction) {
  const { customId, guild, user } = interaction;
  
  if (customId === 'ticket_open' || customId === 'ticket_open_general') {
    const config = db.getTickets(guild.id);
    if (!config || !config.categoryId || !config.staffRoleIds || config.staffRoleIds.length === 0) {
      return interaction.reply({ content: '-# **Configuration Error:** Ticket system is not fully configured.', flags: 64 }).catch(()=>null);
    }
    
    const category = guild.channels.cache.get(config.categoryId);
    if (!category) return interaction.reply({ content: '-# **Configuration Error:** Ticket category not found.', flags: 64 }).catch(()=>null);
    
    // Check if user already has an open ticket
    let alreadyOpen = false;
    if (config.activeTickets) {
      for (const [id, data] of Object.entries(config.activeTickets)) {
         if (data.ownerId === user.id) alreadyOpen = true;
      }
    }
    
    if (alreadyOpen) {
      return interaction.reply({ content: '-# **Rate Limit:** You already have an open ticket!', flags: 64 }).catch(()=>null);
    }
    
    await interaction.reply({ content: '-# <a:loading:1542155051286396938> **Creating your ticket...**', flags: 64 }).catch(()=>null);
    
    try {
      // First generate the ID
      config.ticketCount = (config.ticketCount || 0) + 1;
      const ticketId = config.ticketCount.toString().padStart(4, '0');
      
      const permissionOverwrites = [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles] }
      ];
      
      for (const roleId of config.staffRoleIds) {
        permissionOverwrites.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
      }
      
      const textChannel = await guild.channels.create({
        name: `ticket-${ticketId}`,
        type: 0, // GuildText
        parent: category.id,
        permissionOverwrites
      });
      
      const voiceChannel = await guild.channels.create({
        name: `Ticket ${ticketId} VC`,
        type: 2, // GuildVoice
        parent: category.id,
        permissionOverwrites: permissionOverwrites.map(p => {
          return { ...p, allow: p.allow.filter(a => a !== PermissionFlagsBits.SendMessages).concat([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]) };
        })
      });
      
      if (db.createTicket) {
        if (!config.activeTickets) config.activeTickets = {};
        config.activeTickets[ticketId] = {
          textId: textChannel.id,
          voiceId: voiceChannel.id,
          ownerId: user.id,
          createdAt: Date.now()
        };
        db.save();
      }
      const pings = `<@${user.id}> ${config.staffRoleIds.map(id => `<@&${id}>`).join(' ')}`;
      const container = {
        type: 17,
        components: [
          { type: 10, content: '## **Support Ticket**' },
          { type: 14, divider: true },
          { type: 10, content: `${pings}\n\n**Welcome <@${user.id}>!** Please describe your issue.\nSupport will be with you shortly.\n\n-# **Voice Channel:** <#${voiceChannel.id}>` },
          { type: 14, divider: true },
          { type: 10, content: '-# **Athena Prime Support \u2022 V1.0.0**' }
        ]
      };
        
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_close').setLabel('Close Ticket').setStyle(ButtonStyle.Danger)
      );
      
      container.components.push(row.toJSON());
      
      await textChannel.send({
        components: [container],
        flags: 32768
      });
      
      if (config.aiTriage) {
        try {
          const triage = await generateTicketTriage({ title: 'General Support', inquiry: 'General member assistance ticket opened.', user });
          const triageCard = buildTicketTriageContainer({ ...triage, user });
          await textChannel.send({ components: [triageCard], flags: 32768 }).catch(() => null);
        } catch (err) {
          console.warn('[Ticket AI Triage] Failed to send general triage card:', err.message);
        }
      }
      
      await interaction.editReply({ content: `-# **Ticket created:** <#${textChannel.id}>` }).catch(()=>null);
      
    } catch (error) {
      console.error(error);
      await interaction.editReply({ content: '-# **Error:** Failed to create ticket channels. Ensure I have Manage Channels permission.' }).catch(()=>null);
    }
  }
  
  
  if (customId === 'ticket_claim') {
    return interaction.reply({ content: `<a:uptime:1552608831060844575> **Ticket claimed by <@${interaction.user.id}>.**` });
  }

  if (customId === 'ticket_lock') {
    const textChannel = interaction.channel;
    const tId = textChannel.name.replace('ticket-', '');
    const config = db.getTickets(guild.id);
    const ownerId = config?.activeTickets?.[tId]?.ownerId;
    if (ownerId) {
      await textChannel.permissionOverwrites.edit(ownerId, { SendMessages: false }).catch(() => null);
    }
    return interaction.reply({ content: `<a:uptime:1552608831060844575> **Ticket locked by <@${interaction.user.id}>.**` });
  }

  if (customId === 'ticket_info') {
    const textChannel = interaction.channel;
    const tId = textChannel.name.replace('ticket-', '');
    const config = db.getTickets(guild.id);
    const tData = config?.activeTickets?.[tId];
    const infoText = tData
      ? `**Ticket ID:** #${tId}\n**Owner:** <@${tData.ownerId}>\n**Created:** <t:${Math.floor((tData.createdAt || Date.now()) / 1000)}:R>\n**Voice Channel:** ${tData.voiceId ? `<#${tData.voiceId}>` : 'None'}`
      : `**Ticket Channel:** <#${textChannel.id}>`;
    return interaction.reply({ content: infoText, flags: 64 });
  }

  if (['ticket_add_user', 'ticket_rem_user', 'ticket_add_role'].includes(customId)) {
    return interaction.reply({ content: '-# <a:uptime:1552608831060844575> **Use Discord channel permissions to manage additional access.**', flags: 64 }).catch(() => null);
  }

  if (customId === 'ticket_close') {
    // Check if user has permission to close
    const config = db.getTickets(guild.id);
    if (config.closeTicketRoleIds && config.closeTicketRoleIds.length > 0) {
      const hasRole = interaction.member.roles.cache.some(r => config.closeTicketRoleIds.includes(r.id));
      if (!hasRole && !interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: '-# **Permission Denied:** You do not have permission to close tickets.', flags: 64 }).catch(()=>null);
      }
    }
    
    await interaction.reply({ content: '-# <a:loading:1542155051286396938> **Closing ticket in 5 seconds...**' }).catch(()=>null);
    
    setTimeout(async () => {
      const textChannel = interaction.channel;
      const tId = textChannel.name.replace('ticket-', '');
      
      let vId = null;
      if (config.activeTickets && config.activeTickets[tId]) {
         vId = config.activeTickets[tId].voiceId;
      }
      
      if (vId) {
         const voiceChannel = guild.channels.cache.get(vId);
         if (voiceChannel) await voiceChannel.delete().catch(()=>null);
      } else {
         const vcName = `Ticket ${tId} VC`;
         const voiceChannel = guild.channels.cache.find(c => c.name === vcName && c.parentId === textChannel.parentId);
         if (voiceChannel) await voiceChannel.delete().catch(()=>null);
      }
      
      await textChannel.delete().catch(()=>null);
      
      if (db.closeTicket) {
        db.closeTicket(guild.id, tId);
      }
    }, 5000);
  }
}

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
    if (alreadyOpen) return interaction.reply({ content: '-# **Rate Limit:** You already have an open ticket!', flags: 64 }).catch(()=>null);
    
    const reason = values[0];
    
    // Show Modal to Ask Questions
    const modal = new ModalBuilder().setCustomId('ticket_modal_submit_' + encodeURIComponent(reason)).setTitle(reason + ' Form');
    
    const inquiryInput = new TextInputBuilder()
      .setCustomId('inquiry')
      .setLabel('Nature of Inquiry')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Query ( e.g. one doubt )')
      .setRequired(true);
      
    const docsInput = new TextInputBuilder()
      .setCustomId('docs')
      .setLabel('Checked Documentation?')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Yes / No')
      .setRequired(true);
      
    const detailsInput = new TextInputBuilder()
      .setCustomId('details')
      .setLabel('Additional Details')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Please provide as much context as possible.')
      .setRequired(true);
      
    modal.addComponents(new ActionRowBuilder().addComponents(inquiryInput), new ActionRowBuilder().addComponents(docsInput), new ActionRowBuilder().addComponents(detailsInput));
    return interaction.showModal(modal);
  }
}

export async function handleTicketModals(interaction) {
  const { customId, guild, user, fields } = interaction;
  
  if (customId.startsWith('ticket_modal_submit_')) {
    const reason = decodeURIComponent(customId.replace('ticket_modal_submit_', ''));
    
    const config = db.getTickets(guild.id);
    if (!config || !config.categoryId || !config.staffRoleIds || config.staffRoleIds.length === 0) {
      return interaction.reply({ content: '-# **Configuration Error:** Ticket system is not fully configured.', flags: 64 }).catch(()=>null);
    }
    
    const category = guild.channels.cache.get(config.categoryId);
    if (!category) return interaction.reply({ content: '-# **Configuration Error:** Ticket category not found.', flags: 64 }).catch(()=>null);
    
    await interaction.reply({ content: '-# <a:loading:1542155051286396938> **Creating your ticket...**', flags: 64 }).catch(()=>null);
    
    try {
      config.ticketCount = (config.ticketCount || 0) + 1;
      const ticketId = config.ticketCount.toString().padStart(4, '0');
      
      const permissionOverwrites = [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles] }
      ];
      
      for (const roleId of config.staffRoleIds) {
        permissionOverwrites.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
      }
      
      const textChannel = await guild.channels.create({
        name: `ticket-${ticketId}`,
        type: 0,
        parent: category.id,
        permissionOverwrites
      });
      
      const voiceChannel = await guild.channels.create({
        name: `Ticket ${ticketId} VC`,
        type: 2,
        parent: category.id,
        permissionOverwrites: permissionOverwrites.map(p => {
          return { ...p, allow: p.allow.filter(a => a !== PermissionFlagsBits.SendMessages).concat([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]) };
        })
      });
      
      if (!config.activeTickets) config.activeTickets = {};
      config.activeTickets[ticketId] = {
         textId: textChannel.id,
         voiceId: voiceChannel.id,
         ownerId: user.id,
         createdAt: Date.now()
      };
      db.save();
      
      const inquiry = fields.getTextInputValue('inquiry');
      const docs = fields.getTextInputValue('docs');
      const details = fields.getTextInputValue('details');
      const nowStr = new Date().toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      
      const pings = `<@${user.id}> ${config.staffRoleIds.map(id => `<@&${id}>`).join(' ')}`;
      const infoContent =
        `${pings}\n\n` +
        `**Welcome <@${user.id}>!** Your ticket has been created.\nA staff member will assist you shortly.\n-# **Voice Channel:** <#${voiceChannel.id}>\n\n` +
        `**Ticket Information:**\n` +
        `\u2022 **Created by:** <@${user.id}>\n` +
        `\u2022 **Type:** ${reason}\n` +
        `\u2022 **Created at:** \`${nowStr}\`\n\n` +
        `**Information Provided:**\n` +
        `\u2022 **Nature of Inquiry:**\n\`\`\`\n${inquiry}\n\`\`\`\n` +
        `\u2022 **Checked Documentation?:**\n\`\`\`\n${docs}\n\`\`\`\n` +
        `\u2022 **Additional Details:**\n\`\`\`\n${details}\n\`\`\``;

      const container = {
        type: 17,
        components: [
          { type: 10, content: `## <:emoji_30:1527715694240731177> **${reason} Ticket**` },
          { type: 14, divider: true },
          { type: 10, content: infoContent },
          { type: 14, divider: true },
          { type: 10, content: '-# **Athena Prime Support System \u2022 V1.0.0**' }
        ]
      };
        
      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim Ticket').setEmoji('<:Hand:1537877232230469733>').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_close').setLabel('Close Ticket').setEmoji('<:133036close:1533858021183209594>').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_lock').setLabel('Lock Ticket').setEmoji('<:584347lock:1533858039302721546>').setStyle(ButtonStyle.Secondary)
      );
      
      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_add_user').setLabel('Add User').setEmoji('<:1614_Plus_Light:1534958611116232704>').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_rem_user').setLabel('Remove User').setEmoji('<:Minus_Light:1534958569835888642>').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_add_role').setLabel('Add Role').setEmoji('<:502575calendar:1533858169145671752>').setStyle(ButtonStyle.Secondary)
      );
      
      const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_info').setLabel('Ticket Info').setEmoji('<:info:1538520779774365778>').setStyle(ButtonStyle.Secondary)
      );
      
      await textChannel.send({
        components: [container, row1, row2, row3],
        flags: 32768
      });
      
      if (config.aiTriage) {
        try {
          const triage = await generateTicketTriage({ title: reason, inquiry, docs, details, user });
          const triageCard = buildTicketTriageContainer({ ...triage, user });
          await textChannel.send({ components: [triageCard], flags: 32768 }).catch(() => null);
        } catch (err) {
          console.warn('[Ticket AI Triage] Failed to send modal triage card:', err.message);
        }
      }
      
      await interaction.editReply({ content: `-# **Ticket created:** <#${textChannel.id}>` }).catch(()=>null);
    } catch (error) {
      console.error(error);
      await interaction.editReply({ content: '-# **Error:** Failed to create ticket channels.' }).catch(()=>null);
    }
  }
}
