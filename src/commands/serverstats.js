import { PermissionFlagsBits, ChannelType, ApplicationCommandOptionType, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';
import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI, WARN_EMOJI } from '../utils/emojis.js';

export async function updateServerStatsChannels(guild, stats) {
  await guild.members.fetch().catch(() => null);
  const total = guild.memberCount;
  const bots = guild.members.cache.filter(member => member.user.bot).size;
  const humans = total - bots;
  
  const totalCh = guild.channels.cache.get(stats.totalId);
  const humansCh = guild.channels.cache.get(stats.humansId);
  const botsCh = guild.channels.cache.get(stats.botsId);
  
  const e = stats.emoji || '🔊';
  const f = stats.font || 'standard';

  const tName = formatServerStatChannelName('USERS', total, e, f);
  const hName = formatServerStatChannelName('MEMBERS', humans, e, f);
  const bName = formatServerStatChannelName('BOTS', bots, e, f);

  console.log(`[ServerStats] Attempting to rename channels in ${guild.name} to font: ${f}`);

  let lastErr = null;
  if (totalCh && totalCh.name !== tName) await totalCh.setName(tName).catch(err => { lastErr = err; });
  if (humansCh && humansCh.name !== hName) await humansCh.setName(hName).catch(err => { lastErr = err; });
  if (botsCh && botsCh.name !== bName) await botsCh.setName(bName).catch(err => { lastErr = err; });
  
  if (lastErr) throw lastErr;
}

export function formatServerStatChannelName(type, count, prefixEmoji = '🔊', fontStyle = 'standard') {
    const fonts = {
      standard: { USERS: 'USERS', MEMBERS: 'MEMBERS', BOTS: 'BOTS' },
      bold: { USERS: '𝗨𝗦𝗘𝗥𝗦', MEMBERS: '𝗠𝗘𝗠𝗕𝗘𝗥𝗦', BOTS: '𝗕𝗢𝗧𝗦' },
      italic: { USERS: '𝘜𝘚𝘌𝘙𝘚', MEMBERS: '𝘔𝘌𝘔𝘉𝘌𝘙𝘚', BOTS: '𝘉𝘖𝘛𝘚' },
      smallcaps: { USERS: 'ᴜsᴇʀs', MEMBERS: 'ᴍᴇᴍʙᴇʀs', BOTS: 'ʙᴏᴛs' },
      serif: { USERS: '𝐔𝐒𝐄𝐑𝐒', MEMBERS: '𝐌𝐄𝐌𝐁𝐄𝐑𝐒', BOTS: '𝐁𝐎𝐓𝐒' },
      script: { USERS: '𝒰𝒮𝐸𝑅𝒮', MEMBERS: '𝑀𝐸𝑀𝐵𝐸𝑅𝒮', BOTS: '𝐵𝒪𝒯𝒮' },
      gothic: { USERS: '𝔘𝔖𝔈ℜ𝔖', MEMBERS: '𝔐𝔈𝔐𝔅𝔈ℜ𝔖', BOTS: '𝔅𝔒𝔗𝔖' },
      mono: { USERS: '𝚄𝚂𝙴𝚁𝚂', MEMBERS: '𝙼𝙴𝙼𝙱𝙴𝚁𝚂', BOTS: '𝙱𝙾𝚃𝚂' }
    };
    
    const selectedFont = fonts[fontStyle.toLowerCase()] || fonts.standard;
    const word = selectedFont[type] || fonts.standard[type];
    
    return `${prefixEmoji}・${word}: ${count}`;
}

export const commands = [
  {
    name: 'serverstats',
    description: 'Manage server stats voice channels',
    permissions: [PermissionFlagsBits.Administrator],
    category: 'utility',
    options: [
      {
        name: 'setup',
        description: 'Create live auto-updating Member Count VCs',
        type: 1 // SUB_COMMAND
      },
      {
        name: 'config',
        description: 'Configure the font and emoji prefix for server stats',
        type: 1, // SUB_COMMAND
        options: [
          {
            name: 'emoji',
            description: 'The emoji prefix to use (e.g. ðŸ“Š or custom emoji)',
            type: ApplicationCommandOptionType.String,
            required: false
          },
          {
            name: 'font',
            description: 'The font style to use',
            type: ApplicationCommandOptionType.String,
            required: false,
            choices: [
              { name: 'Standard', value: 'standard' },
              { name: 'Bold', value: 'bold' },
              { name: 'Small Caps', value: 'smallcaps' },
              { name: 'Serif', value: 'serif' },
              { name: 'Script', value: 'script' },
              { name: 'Gothic', value: 'gothic' },
              { name: 'Monospace', value: 'mono' }
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
    aliases: ['statsetup', 'serverstat', 'statsconfig'],
    executePrefix: async (message, args) => {
      const action = args[0]?.toLowerCase();
      
      if (action === 'disable') {
        const stats = db.getServerStats(message.guild.id);
        if (!stats) return message.reply(cv2.warn('Not Setup', 'Server stats are not currently set up.'));
        
        const m = await message.reply(cv2.info('Processing...', 'Disabling server stats and deleting channels...'));
        
        for (const id of [stats.categoryId, stats.totalId, stats.humansId, stats.botsId]) {
          const ch = message.guild.channels.cache.get(id);
          if (ch) await ch.delete().catch(() => null);
        }
        
        db.deleteServerStats(message.guild.id);
        return m.edit({ content: '', ...cv2.success('Disabled', 'Server stats channels have been deleted.') });
      }
      
      if (action === 'config') {
        const stats = db.getServerStats(message.guild.id);
        if (!stats) return message.reply(cv2.warn('Not Setup', 'Server stats are not currently set up. Please run `!serverstats setup` first.'));
        
        let newEmoji = args[1];
        let newFont = args[2]?.toLowerCase();
        
        // Handle if user only provided font
        const validFonts = ['standard', 'bold', 'italic', 'smallcaps', 'serif', 'script', 'gothic', 'mono'];
        if (args[1] && validFonts.includes(args[1].toLowerCase())) {
          newFont = args[1].toLowerCase();
          newEmoji = undefined;
        }

        if (!newEmoji && !newFont) {
          const fontSelect = new StringSelectMenuBuilder()
            .setCustomId('serverstats_font')
            .setPlaceholder('Select a Font Style')
            .addOptions([
              { label: 'Standard', value: 'standard' },
              { label: 'Bold', value: 'bold' },
              { label: 'Small Caps', value: 'smallcaps' },
              { label: 'Serif', value: 'serif' },
              { label: 'Script', value: 'script' },
              { label: 'Gothic', value: 'gothic' },
              { label: 'Monospace', value: 'mono' }
            ]);

          const emojiBtn = new ButtonBuilder()
            .setCustomId('serverstats_emoji')
            .setLabel('Set Custom Emoji')
            .setStyle(ButtonStyle.Primary);

          const row1 = new ActionRowBuilder().addComponents(fontSelect);
          const row2 = new ActionRowBuilder().addComponents(emojiBtn);

          const cv2Reply = cv2.info('Server Stats Configuration', 'Please select a font style from the dropdown below, or click the button to set a custom emoji prefix for your voice channels.\n\n<a:warning:1540656124313993247> **Note:** Discord limits voice channel renames to **2 times every 10 minutes**. If your changes don\'t apply immediately, please wait a few minutes for the rate limit to expire.');
          if (cv2Reply.components && cv2Reply.components[0] && cv2Reply.components[0].type === 17) {
            cv2Reply.components[0].components.push(row1.toJSON(), row2.toJSON());
          } else {
            cv2Reply.components.push(row1, row2);
          }
          const setupMsg = await message.reply(cv2Reply);

          const collector = setupMsg.createMessageComponentCollector({ filter: i => i.user.id === message.author.id, time: 120000 });
          
          collector.on('collect', async i => {
            if (i.customId === 'serverstats_font') {
              const selected = i.values[0];
              const updated = db.getServerStats(message.guild.id);
              updated.font = selected;
              db.saveServerStats(message.guild.id, updated);
              
              await i.deferReply();
              try {
                await updateServerStatsChannels(message.guild, updated);
                await i.editReply({ content: `<a:uptime:1552608831060844575> Font updated to **${selected}**!` });
              } catch (err) {
                await i.editReply({ content: `<a:warning:1540656124313993247> Discord rejected the channel rename! Error: \`${err.message}\`\n\nYour font choice **${selected}** has been saved. Please wait ~10 minutes without touching the config, and it will magically apply in the background.` });
              }
            } else if (i.customId === 'serverstats_emoji') {
              const modal = new ModalBuilder()
                .setCustomId('serverstats_emoji_modal')
                .setTitle('Set Custom Emoji');
                
              const input = new TextInputBuilder()
                .setCustomId('emoji_input')
                .setLabel('Enter your emoji (e.g. <a:name:id>)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);
                
              const modalRow = new ActionRowBuilder().addComponents(input);
              modal.addComponents(modalRow);
              await i.showModal(modal);
              
              try {
                const modalSubmit = await i.awaitModalSubmit({ time: 60000, filter: m => m.user.id === message.author.id });
                await modalSubmit.deferReply();
                const emojiVal = modalSubmit.fields.getTextInputValue('emoji_input');
                const updated = db.getServerStats(message.guild.id);
                updated.emoji = emojiVal;
                db.saveServerStats(message.guild.id, updated);
                
                try {
                  await updateServerStatsChannels(message.guild, updated);
                  await modalSubmit.editReply({ content: `<a:uptime:1552608831060844575> Emoji updated to ${emojiVal}!` });
                } catch (err) {
                  await modalSubmit.editReply({ content: `<a:warning:1540656124313993247> Discord rejected the channel rename! Error: \`${err.message}\`\n\nYour emoji choice **${emojiVal}** has been saved. Please wait ~10 minutes without touching the config, and it will magically apply in the background.` });
                }
              } catch(err) {}
            }
          });
          return;
        }

        const updatedStats = { ...stats };
        if (newEmoji) updatedStats.emoji = newEmoji;
        if (newFont) updatedStats.font = newFont;
        
        db.saveServerStats(message.guild.id, updatedStats);
        
        try {
          await updateServerStatsChannels(message.guild, updatedStats);
          return message.reply(cv2.success('Stats Configured', `Server stats font/emoji updated to **${newFont || 'standard'}** with emoji **${newEmoji || 'none'}**!`));
        } catch (err) {
          return message.reply(cv2.warn('Stats Configured, but Discord Ratelimited', `Server stats config updated!\n\n<a:warning:1540656124313993247> **Discord rejected the immediate channel rename!**\nError: \`${err.message}\`\n\nYour choices are saved and will automatically apply in ~10 minutes.`));
        }
      }

      if (action === 'setup') {
        const m = await message.reply(cv2.info('Processing...', 'Setting up server stats channels. This may take a moment...'));
        
        // Count members
        await message.guild.members.fetch().catch(() => null);
        const total = message.guild.memberCount;
        const bots = message.guild.members.cache.filter(member => member.user.bot).size;
        const humans = total - bots;
        
        // Deny connect to everyone
        const permissionOverwrites = [
          {
            id: message.guild.id, // @everyone
            deny: [PermissionFlagsBits.Connect],
            allow: [PermissionFlagsBits.ViewChannel]
          }
        ];
        
        try {
          const category = await message.guild.channels.create({
            name: 'SERVER STATS',
            type: ChannelType.GuildCategory
          });
          
          const totalCh = await message.guild.channels.create({
            name: formatServerStatChannelName('USERS', total),
            type: ChannelType.GuildVoice,
            parent: category.id,
            permissionOverwrites
          });
          
          const humansCh = await message.guild.channels.create({
            name: formatServerStatChannelName('MEMBERS', humans),
            type: ChannelType.GuildVoice,
            parent: category.id,
            permissionOverwrites
          });
          
          const botsCh = await message.guild.channels.create({
            name: formatServerStatChannelName('BOTS', bots),
            type: ChannelType.GuildVoice,
            parent: category.id,
            permissionOverwrites
          });
          
          db.saveServerStats(message.guild.id, {
            categoryId: category.id,
            totalId: totalCh.id,
            humansId: humansCh.id,
            botsId: botsCh.id,
            emoji: '🔊',
            font: 'standard'
          });
          
          return m.edit({ content: '', ...cv2.success('Setup Complete', 'Server stats channels have been created and will automatically update every 6 minutes!') });
        } catch (err) {
          console.error(err);
          return m.edit({ content: '', ...cv2.danger('Error', 'Failed to create channels. Ensure the bot has `Manage Channels` permission.') });
        }
      }
      
      if (action === 'test') {
        const stats = db.getServerStats(message.guild.id);
        if (!stats) return message.reply(cv2.warn('Error', 'Stats not setup.'));
        const totalCh = message.guild.channels.cache.get(stats.totalId);
        if (!totalCh) return message.reply(cv2.warn('Error', 'Channel not found in cache.'));
        try {
          await totalCh.setName(totalCh.name + '1');
          await totalCh.setName(totalCh.name.slice(0, -1));
          return message.reply(cv2.success('Success', 'I can rename the channel.'));
        } catch (err) {
          return message.reply(cv2.danger('Rename Failed', `Discord rejected the rename! Error: \`${err.message}\``));
        }
      }
      
      const existing = db.getServerStats(message.guild.id);
      const isConfigured = Boolean(existing && (message.guild.channels.cache.has(existing.totalId) || message.guild.channels.cache.has(existing.categoryId)));

      const infoContainer = {
        type: 17,
        accent_color: 0x5865F2,
        components: [
          {
            type: 10,
            content: `# ${getRandomHeadingGlyph()} Server Stats Voice Channels | <a:03_tick_circle:1565665642084827206>`
          },
          { type: 14, divider: true },
          {
            type: 10,
            content:
              `> -# <a:uptime:1552608831060844575> **Status:** \`${isConfigured ? 'Active & Auto-Updating' : 'Not Configured'}\`\n` +
              (isConfigured ? `> -# <a:target_blink:1565667466984554588> **Total Members VC:** <#${existing.totalId}>\n` +
                              `> -# <a:target_blink:1565667466984554588> **Humans VC:** <#${existing.humansId}>\n` +
                              `> -# <a:target_blink:1565667466984554588> **Bots VC:** <#${existing.botsId}>\n` +
                              `> -# <a:target_blink:1565667466984554588> **Font:** \`${existing.font || 'standard'}\` | **Emoji:** \`${existing.emoji || 'Standard'}\`\n\n` : '') +
              `> -# **__Usage Commands:__**\n` +
              `> <a:target_blink:1565667466984554588> \`!serverstats setup\` — Create auto-updating Member Count VCs.\n` +
              `> <a:target_blink:1565667466984554588> \`!serverstats config\` — Configure custom font style and emoji prefix.\n` +
              `> <a:target_blink:1565667466984554588> \`!serverstats disable\` — Remove all server stats voice channels.\n` +
              `> <a:target_blink:1565667466984554588> \`!serveroverview\` / \`!stats\` — View Statbot-style graphical Server Overview.`
          },
          { type: 14, divider: true },
          {
            type: 1,
            components: [
              new ButtonBuilder()
                .setCustomId('so_tab:overview:7d')
                .setLabel('View Server Overview')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('<a:01_home_beat:1567037361810833428>')
                .toJSON()
            ]
          },
          { type: 14, divider: true },
          {
            type: 10,
            content: `-# **Athena Bulletproof Security Matrix • V1.0.0**`
          }
        ]
      };
      return message.reply({ components: [infoContainer], flags: MessageFlags.IsComponentsV2 });
    },
    executeSlash: async (interaction) => {
      await interaction.deferReply();
      const action = interaction.options.getSubcommand();
      
      if (action === 'disable') {
        const stats = db.getServerStats(interaction.guild.id);
        if (!stats) return interaction.editReply(cv2.warn('Not Setup', 'Server stats are not currently set up.'));
        
        for (const id of [stats.categoryId, stats.totalId, stats.humansId, stats.botsId]) {
          const ch = interaction.guild.channels.cache.get(id);
          if (ch) await ch.delete().catch(() => null);
        }
        
        db.deleteServerStats(interaction.guild.id);
        return interaction.editReply(cv2.success('Disabled', 'Server stats channels have been deleted.'));
      }
      
      if (action === 'config') {
        const stats = db.getServerStats(interaction.guild.id);
        if (!stats) return interaction.editReply(cv2.warn('Not Setup', 'Server stats are not currently set up.'));
        
        const newEmoji = interaction.options.getString('emoji');
        const newFont = interaction.options.getString('font');
        
        if (!newEmoji && !newFont) {
           return interaction.editReply(cv2.info('No Changes', 'You must provide either an emoji or a font to configure.'));
        }

        const updatedStats = { ...stats };
        if (newEmoji) updatedStats.emoji = newEmoji;
        if (newFont) updatedStats.font = newFont;
        
        db.saveServerStats(interaction.guild.id, updatedStats);
        
        // Trigger manual update right away
        await updateServerStatsChannels(interaction.guild, updatedStats);

        return interaction.editReply(cv2.success('Stats Configured', `Server stats font/emoji updated to **${updatedStats.font}** with emoji **${updatedStats.emoji}**!`));
      }

      if (action === 'setup') {
        await interaction.guild.members.fetch().catch(() => null);
        const total = interaction.guild.memberCount;
        const bots = interaction.guild.members.cache.filter(member => member.user.bot).size;
        const humans = total - bots;
        
        const permissionOverwrites = [
          {
            id: interaction.guild.id,
            deny: [PermissionFlagsBits.Connect],
            allow: [PermissionFlagsBits.ViewChannel]
          }
        ];
        
        try {
          const category = await interaction.guild.channels.create({
            name: 'SERVER STATS',
            type: ChannelType.GuildCategory
          });
          
          const totalCh = await interaction.guild.channels.create({
            name: formatServerStatChannelName('USERS', total),
            type: ChannelType.GuildVoice,
            parent: category.id,
            permissionOverwrites
          });
          
          const humansCh = await interaction.guild.channels.create({
            name: formatServerStatChannelName('MEMBERS', humans),
            type: ChannelType.GuildVoice,
            parent: category.id,
            permissionOverwrites
          });
          
          const botsCh = await interaction.guild.channels.create({
            name: formatServerStatChannelName('BOTS', bots),
            type: ChannelType.GuildVoice,
            parent: category.id,
            permissionOverwrites
          });
          
          db.saveServerStats(interaction.guild.id, {
            categoryId: category.id,
            totalId: totalCh.id,
            humansId: humansCh.id,
            botsId: botsCh.id,
            emoji: '🔊',
            font: 'standard'
          });
          
          return interaction.editReply(cv2.success('Setup Complete', 'Server stats channels have been created and will automatically update every 6 minutes!'));
        } catch (err) {
          console.error(err);
          return interaction.editReply(cv2.danger('Error', 'Failed to create channels. Ensure the bot has `Manage Channels` permission.'));
        }
      }
    }
  }
];
