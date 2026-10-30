import { AttachmentBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { generateQuoteBuffer } from '../utils/canvasQuote.js';
import cv2 from '../cv2.js';

function formatDiscordTimestamp(date) {
  const d = new Date(date);
  let hours = d.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const minutes = d.getMinutes().toString().padStart(2, '0');
  // Simple approximation for 'Today' vs date
  const now = new Date();
  if (d.getDate() === now.getDate() && d.getMonth() === now.getMonth()) {
    return `Today at ${hours}:${minutes} ${ampm}`;
  }
  return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;
}

export const commands = [
  {
    name: 'quote',
    aliases: ['q', 'setquote', 'quotechannel', 'quotemaker'],
    description: 'Generate an aesthetic image quote of a message. Use !quote setchannel <#channel|none> to bind auto-quote channel [Public / Extra Owner for setchannel].',
    category: 'community',
    options: [],
    async executePrefix(message, args) {
      const invoked = message.content.trim().split(/ +/)[0].toLowerCase().replace(/^!/, '');
      const isSetquoteAlias = invoked === 'setquote' || invoked === 'quotechannel';

      if (args.length === 0 && !isSetquoteAlias) {
        return message.reply(cv2.warn('Quote System', `\`!quote <message_id> [dark|light|transparent]\`\n\`!quote @user <custom text>\`\n\`!quotemaker\`\n\`!quote setchannel <#channel|none>\``));
      }

      // Check for Admin/Extra Owner setchannel Route
      const sub = (args[0] || '').toLowerCase();
      if (isSetquoteAlias || sub === 'setchannel' || sub === 'channel' || sub === 'set' || sub === 'bind') {
        const { isExtraOwnerOrHigher } = await import('../utils/helpers.js');
        if (!isExtraOwnerOrHigher(message.author.id, message.guild)) {
          return message.reply(cv2.danger('Access Denied', 'Only the **Server Owner**, **Extra Owners**, and **Bot Owner** can bind the Auto-Quote channel.'));
        }
        
        const channelArg = isSetquoteAlias ? args[0] : args[1];
        if (!channelArg || channelArg.toLowerCase() === 'status') {
          const { default: db } = await import('../database.js');
          const cfg = db.getGuildConfig(message.guild.id);
          const current = cfg?.quoteChannelId ? `<#${cfg.quoteChannelId}> (\`${cfg.quoteChannelId}\`)` : '`None (Disabled)`';
          return message.reply(cv2.info(
            `Auto-Quote Channel Status | <a:atheNATICK:1557841381630681106>`,
            `**Current Bound Channel:** ${current}\n\n` +
            `> -# • **Set Channel:** \`!quote setchannel <#channel>\` or \`!setquote <#channel>\`\n` +
            `> -# • **Disable:** \`!quote setchannel none\` or \`!setquote none\`\n` +
            `> -# • **Clearance:** \`[Extra Owner]\``
          ));
        }

        const lowerChannelArg = channelArg.toLowerCase();
        if (lowerChannelArg === 'none' || lowerChannelArg === 'off' || lowerChannelArg === 'disable' || lowerChannelArg === 'reset') {
          const { default: db } = await import('../database.js');
          db.updateGuildConfig(message.guild.id, { quoteChannelId: null });
          return message.reply(cv2.success('Auto-Quote Disabled | <a:atheNATICK:1557841381630681106>', 'The dedicated Auto-Quote channel has been disabled.'));
        }
        
        const channelInput = (isSetquoteAlias ? args.join(' ') : args.slice(1).join(' ')).trim();
        const rawId = channelInput.replace(/[<#>]/g, '').trim();
        const targetChannel = message.mentions.channels.first() 
          || message.guild.channels.cache.get(rawId)
          || message.guild.channels.cache.find(c => c.name.toLowerCase() === channelInput.replace(/^#/, '').toLowerCase());
        
        if (!targetChannel || !targetChannel.isTextBased()) return message.reply(cv2.warn('Usage', '`!quote setchannel <#channel>` or `!quote setchannel none`'));
        
        const { default: db } = await import('../database.js');
        db.updateGuildConfig(message.guild.id, { quoteChannelId: targetChannel.id });
        return message.reply(cv2.success('Auto-Quote Channel Bound | <a:atheNATICK:1557841381630681106>', `Any message typed in <#${targetChannel.id}> will now be automatically converted into an aesthetic canvas quote image!`));
      }

      // Check for Mention Route: !quote @user <text>
      const targetUser = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
      if (targetUser && args.length > 1) {
        const text = args.slice(1).join(' ');
        const buffer = await generateQuoteBuffer(
          targetUser.displayName || targetUser.user.username,
          targetUser.user.displayAvatarURL({ extension: 'png', size: 128 }),
          text,
          formatDiscordTimestamp(Date.now()),
          'dark',
          targetUser.displayHexColor,
          targetUser.user.username
        );
        const attachment = new AttachmentBuilder(buffer, { name: 'quote.png' });
        return message.reply({ files: [attachment] });
      }

      // Check for Message ID Route: !quote <message_id> [theme]
      const msgId = args[0];
      const theme = ['dark', 'light', 'transparent'].includes(args[1]?.toLowerCase()) ? args[1].toLowerCase() : 'dark';

      try {
        const targetMsg = await message.channel.messages.fetch(msgId);
        if (!targetMsg || (!targetMsg.content && targetMsg.embeds.length === 0)) {
          return message.reply(cv2.warn('Error', 'Message not found or has no text content.'));
        }

        const textContent = targetMsg.content || (targetMsg.embeds[0] ? targetMsg.embeds[0].description : 'No text content.');
        const member = targetMsg.member;
        
        const buffer = await generateQuoteBuffer(
          member ? member.displayName : targetMsg.author.username,
          targetMsg.author.displayAvatarURL({ extension: 'png', size: 128 }),
          textContent,
          formatDiscordTimestamp(targetMsg.createdTimestamp),
          theme,
          member ? member.displayHexColor : '#FFFFFF',
        targetMsg.author.username
        );

        const attachment = new AttachmentBuilder(buffer, { name: 'quote.png' });
        return message.reply({ files: [attachment] });

      } catch (err) {
        return message.reply(cv2.warn('Error', 'Could not find that message. Make sure the ID is valid and in this channel.'));
      }
    }
  },
  {
    name: 'quotemaker',
    description: 'Launch the interactive Canvas Quote Generator dashboard.',
    category: 'community',
    async executePrefix(message) {
      const embed = {
        type: 17,
        components: [
          { type: 10, content: '# Canvas Quote Generator' },
          { type: 14, divider: true },
          { type: 9, components: [{ type: 10, content: '**Generate beautiful, aesthetic image quotes of Discord messages instantly.**' }], accessory: { type: 11, media: { url: 'https://cdn.discordapp.com/emojis/1533860039213842565.png' } } },
          { type: 10, content: '> Use the buttons below to create a custom forged quote, or paste a Message ID to quote a real message from this channel.' },
          { type: 14, divider: true }
        ]
      };

      const btnCustom = new ButtonBuilder().setCustomId('quote_custom').setLabel('Forge Custom Quote').setStyle(ButtonStyle.Primary).setEmoji('<:pencil:1523770653528817835>');
      const btnId = new ButtonBuilder().setCustomId('quote_id').setLabel('Quote by ID').setStyle(ButtonStyle.Secondary).setEmoji('<:search:1523770607706308658>');
      const btnTheme = new ButtonBuilder().setCustomId('quote_theme').setLabel('Cycle Theme').setStyle(ButtonStyle.Secondary);
      
      const row = new ActionRowBuilder().addComponents(btnCustom, btnId, btnTheme);
      embed.components.push(row.toJSON());

      const reply = await message.reply({ components: [embed], flags: MessageFlags.IsComponentsV2 });
      
      // Store local state
      let currentTheme = 'dark';
      const collector = reply.createMessageComponentCollector({ time: 300000 });

      collector.on('collect', async i => {
        if (i.user.id !== message.author.id) return i.reply({ content: 'Only the command executor can use this panel.', ephemeral: true });
        
        if (i.customId === 'quote_theme') {
          if (currentTheme === 'dark') currentTheme = 'light';
          else if (currentTheme === 'light') currentTheme = 'transparent';
          else currentTheme = 'dark';
          
          return i.reply({ content: `Theme changed to **${currentTheme.toUpperCase()}**! Next quotes will use this theme.`, ephemeral: true });
        }

        if (i.customId === 'quote_id') {
          const modal = new ModalBuilder().setCustomId('modal_quote_id').setTitle('Quote Message by ID');
          const input = new TextInputBuilder().setCustomId('msg_id').setLabel('Message ID').setStyle(TextInputStyle.Short).setRequired(true);
          modal.addComponents(new ActionRowBuilder().addComponents(input));
          return i.showModal(modal);
        }

        if (i.customId === 'quote_custom') {
          const modal = new ModalBuilder().setCustomId('modal_quote_custom').setTitle('Forge Custom Quote');
          const target = new TextInputBuilder().setCustomId('target_id').setLabel('User ID or Mention (e.g. 123456)').setStyle(TextInputStyle.Short).setRequired(true);
          const text = new TextInputBuilder().setCustomId('quote_text').setLabel('Quote Text').setStyle(TextInputStyle.Paragraph).setRequired(true);
          modal.addComponents(new ActionRowBuilder().addComponents(target), new ActionRowBuilder().addComponents(text));
          return i.showModal(modal);
        }
      });
    }
  },
  {
    name: 'setquote',
    description: 'Bind Auto-Quote channel to turn typed messages into quotes.',
    category: 'community',
    async executePrefix(message, args) {
      return commands[0].executePrefix(message, ['setchannel', ...args]);
    }
  },
  {
    name: 'unsetquote',
    description: 'Disable Auto-Quote channel.',
    category: 'community',
    async executePrefix(message) {
      return commands[0].executePrefix(message, ['setchannel', 'none']);
    }
  }
];

export async function handleQuoteModals(interaction) {
  if (interaction.customId === 'modal_quote_id') {
    const msgId = interaction.fields.getTextInputValue('msg_id');
    try {
      const targetMsg = await interaction.channel.messages.fetch(msgId);
      if (!targetMsg) return interaction.reply({ content: 'Message not found.', ephemeral: true });
      const textContent = targetMsg.content || (targetMsg.embeds[0] ? targetMsg.embeds[0].description : 'No text content.');
      const member = targetMsg.member;
      
      await interaction.deferReply();
      const buffer = await generateQuoteBuffer(
        member ? member.displayName : targetMsg.author.username,
        targetMsg.author.displayAvatarURL({ extension: 'png', size: 128 }),
        textContent,
        formatDiscordTimestamp(targetMsg.createdTimestamp),
        'dark',
        member ? member.displayHexColor : '#FFFFFF', targetMsg.author.username);
      return interaction.editReply({ files: [new AttachmentBuilder(buffer, { name: 'quote.png' })] });
    } catch (e) {
      return interaction.reply({ content: 'Invalid message ID or message not in this channel.', ephemeral: true });
    }
  }

  if (interaction.customId === 'modal_quote_custom') {
    const targetIdRaw = interaction.fields.getTextInputValue('target_id').replace(/[<@!>]/g, '');
    const text = interaction.fields.getTextInputValue('quote_text');
    
    try {
      const targetUser = await interaction.guild.members.fetch(targetIdRaw);
      await interaction.deferReply();
      const buffer = await generateQuoteBuffer(
        targetUser.displayName,
        targetUser.user.displayAvatarURL({ extension: 'png', size: 128 }),
        text,
        formatDiscordTimestamp(Date.now()),
        'dark',
        targetUser.displayHexColor, targetUser.user.username);
      return interaction.editReply({ files: [new AttachmentBuilder(buffer, { name: 'quote.png' })] });
    } catch (e) {
      return interaction.reply({ content: 'User not found. Please provide a valid User ID.', ephemeral: true });
    }
  }
}
