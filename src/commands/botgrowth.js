import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType } from 'discord.js';
import db from '../database.js';

export const commands = [
  {
    name: 'bjoins',
    aliases: ['bjoin', 'botjoins', 'bleaves', 'bleave', 'botleaves', 'bservers', 'bsummary'],
    description: 'Interactive Bot Growth Manager.',
    category: 'utilities',
    permissions: [],
    async executePrefix(message, args) {
      const client = message.client;
      const stats = db.cache.botAnalytics || { joins: 0, leaves: 0, cmds: {} };
      const cfg = db.getGuildConfig(message.guild?.id || '0');
      const accentInt = cfg.accentColor ? parseInt(cfg.accentColor.replace('#', ''), 16) : 0x2b2d31;

      // Ensure lists exist
      if (!stats.recentJoins) stats.recentJoins = [];
      if (!stats.recentLeaves) stats.recentLeaves = [];

      const generateEmbed = (type) => {
        const e = new EmbedBuilder().setColor(accentInt);
        
        if (type === 'current') {
            const servers = [...client.guilds.cache.values()].sort((a,b) => b.memberCount - a.memberCount).slice(0, 15);
            let desc = '<:emoji_16:1533860111704002665> **Top 15 Live Servers (by Member Count):**\n\n';
            servers.forEach((g, i) => {
                desc += `**${i+1}.** ${g.name} (\`${g.id}\`) - ${g.memberCount} members\n`;
            });
            desc += `\n**Total Servers:** ${client.guilds.cache.size} | **Total Users:** ${client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0)}`;
            e.setDescription(desc);
        }
        else if (type === 'joins') {
            let desc = '<a:AnyaYay:1537513785718476850> **Recent Joins (Last 20):**\n\n';
            if (stats.recentJoins.length === 0) desc += '**No recent joins recorded.**\n';
            stats.recentJoins.forEach((g, i) => {
                desc += `**${i+1}.** ${g.name} (\`${g.id}\`) - ${g.memberCount || '?'} members | By: ${g.addedBy || 'Unknown'}\n`;
            });
            e.setDescription(desc);
        }
        else if (type === 'leaves') {
            let desc = '<:emoji_16:1533860111704002665> **Recent Leaves (Last 20):**\n\n';
            if (stats.recentLeaves.length === 0) desc += '**No recent leaves recorded.**\n';
            stats.recentLeaves.forEach((g, i) => {
                desc += `**${i+1}.** ${g.name} (\`${g.id}\`)\n`;
            });
            e.setDescription(desc);
        }
        return e;
      };

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('growth_select')
        .setPlaceholder('Select a list to view...')
        .addOptions(
          { label: 'Current Live Servers', value: 'current' },
          { label: 'Recent Joins', value: 'joins' },
          { label: 'Recent Leaves', value: 'leaves' }
        );

      const banBtn = new ButtonBuilder()
        .setCustomId('ban_server_btn')
        .setLabel('Ban a Server')
        .setStyle(ButtonStyle.Danger);

      const row1 = new ActionRowBuilder().addComponents(selectMenu);
      const row2 = new ActionRowBuilder().addComponents(banBtn);

      const msg = await message.reply({ embeds: [generateEmbed('current')], components: [row1, row2] });

      const collector = msg.createMessageComponentCollector({ filter: i => i.user.id === message.author.id, time: 120000 });

      collector.on('collect', async i => {
          if (i.isStringSelectMenu()) {
              await i.update({ embeds: [generateEmbed(i.values[0])] });
          } else if (i.isButton()) {
              const modal = new ModalBuilder()
                .setCustomId('ban_server_modal')
                .setTitle('Ban Server');
              
              const serverIdInput = new TextInputBuilder()
                .setCustomId('server_id')
                .setLabel('Server ID to Ban:')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder('e.g. 123456789012345678');
                
              modal.addComponents(new ActionRowBuilder().addComponents(serverIdInput));
              await i.showModal(modal);
          }
      });
    }
  },
  {
    name: 'bcmds',
    aliases: ['bcmd', 'botcmds', 'btopcmds', 'btop', 'bcmdusers'],
    description: 'View command usage analytics & top executed commands.',
    category: 'utilities',
    permissions: [],
    async executePrefix(message, args) {
      const stats = db.cache.botAnalytics?.cmds || {};
      const sortedCmds = Object.entries(stats).sort((a, b) => b[1] - a[1]).slice(0, 10);
      
      let lines = [];
      let total = 0;
      for (const val of Object.values(stats)) total += val;

      if (sortedCmds.length === 0) {
        lines.push('**No commands executed yet.**');
      } else {
        sortedCmds.forEach(([cmd, count], i) => {
          lines.push(`**${i + 1}.** \`${cmd}\` — ${count} uses`);
        });
      }

      const cfg = db.getGuildConfig(message.guild?.id || '0');
      const accentInt = cfg.accentColor ? parseInt(cfg.accentColor.replace('#', ''), 16) : 0x2b2d31;

      const e = new EmbedBuilder()
        .setColor(accentInt)
        .setDescription(`<a:AnyaYay:1537513785718476850> **Top 10 Executed Commands:**\n\n${lines.join('\n')}\n\n**Total Commands Executed:** ${total}`);

      await message.reply({ embeds: [e] });
    }
  }
];
