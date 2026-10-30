import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI, WRONG_EMOJI, WARN_EMOJI } from '../utils/emojis.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';
import { isServerAdmin } from '../utils/helpers.js';

export const commands = [
  {
    name: 'app',
    description: 'Manage the Staff Application system.',
    category: 'utilities',
    options: [],
    async executePrefix(message, args) {
      if (!isServerAdmin(message.member, message.guild)) {
        return message.reply(cv2.danger('Access Denied', 'Only Extra Owners or the Server Owner can manage applications.'));
      }

      const subcommand = args[0]?.toLowerCase();

      if (subcommand === 'setlog') {
        const targetChannel = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
        if (!targetChannel) return message.reply(cv2.warn('Usage', '`!app setlog <#channel>`'));
        db.updateAppConfig(message.guild.id, { logChannel: targetChannel.id });
        return message.reply(cv2.success('App Log Bound', `Submitted applications will now be sent to <#${targetChannel.id}> for review.`));
      }

      if (subcommand === 'deploy') {
        const targetChannel = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
        if (!targetChannel) return message.reply(cv2.warn('Usage', '`!app deploy <#channel>`'));
        
        const config = db.getAppConfig(message.guild.id);
        if (!config.logChannel) {
          return message.reply(cv2.warn('Missing Log Channel', 'You must set a log channel using `!app setlog <#channel>` before deploying the apply button!'));
        }

        const applyBtn = new ButtonBuilder().setCustomId('btn_app_apply').setLabel('Apply for Staff').setStyle(ButtonStyle.Success);
        const row = new ActionRowBuilder().addComponents(applyBtn);

        const embed = {
          type: 17,
          components: [
            { type: 10, content: '# Staff Application' },
            { type: 14, divider: true },
            { type: 10, content: 'We are currently looking for dedicated and active members to join our staff team. If you think you have what it takes, click the button below to fill out the application form!' },
            { type: 10, content: '> Please answer all questions honestly. Trolling or submitting joke applications will result in a ban.' },
            { type: 14, divider: true },
            row.toJSON()
          ]
        };
        
        await targetChannel.send({ components: [embed], flags: MessageFlags.IsComponentsV2 });
        return message.reply(cv2.success('Deployed', `The Staff Application button has been deployed to <#${targetChannel.id}>!`));
      }

      // Interactive Manager
      const config = db.getAppConfig(message.guild.id);
      
      const embed = {
        type: 17,
        components: [
          { type: 10, content: '# Interactive App Manager' },
          { type: 14, divider: true },
          { type: 9, components: [{ type: 10, content: '**Configure the questions users must answer when applying.**' }], accessory: { type: 11, media: { url: 'https://cdn.discordapp.com/emojis/1533860039213842565.png' } } },
          { type: 10, content: '### Instructions:' },
          { type: 10, content: '1. Use **Add Question** to add a new question to the application.' },
          { type: 10, content: '2. Discord enforces a strict limit of **5 questions max** per application.' },
          { type: 10, content: '3. Use **Clear All** to start over.' },
          { type: 10, content: '4. Once you are done, use `!app setlog #channel` and `!app deploy #channel` to activate the system!' },
          { type: 14, divider: true }
        ]
      };

      if (config.questions.length > 0) {
        embed.components.push({ type: 10, content: '### Current Questions:' });
        config.questions.forEach((q, i) => {
          embed.components.push({ type: 10, content: `**${i + 1}.** ${q}` });
        });
        embed.components.push({ type: 14, divider: true });
      }

      const btnAdd = new ButtonBuilder().setCustomId('app_mngr_add').setLabel('Add Question').setStyle(ButtonStyle.Primary).setDisabled(config.questions.length >= 5);
      const btnClear = new ButtonBuilder().setCustomId('app_mngr_clear').setLabel('Clear All Questions').setStyle(ButtonStyle.Danger);
      const btnClose = new ButtonBuilder().setCustomId('app_mngr_close').setLabel('Save & Close').setStyle(ButtonStyle.Secondary);
      
      const row = new ActionRowBuilder().addComponents(btnAdd, btnClear, btnClose);

      embed.components.push(row.toJSON());
      const reply = await message.reply({ components: [embed], flags: MessageFlags.IsComponentsV2 });
      
      const collector = reply.createMessageComponentCollector({ time: 300000 });

      collector.on('collect', async i => {
        if (i.user.id !== message.author.id) return i.reply({ content: 'Only the command executor can use this panel.', ephemeral: true });

        if (i.customId === 'app_mngr_close') {
          await i.message.delete().catch(() => null);
          return;
        }

        if (i.customId === 'app_mngr_clear') {
          db.updateAppConfig(message.guild.id, { questions: [] });
          // Update message
          embed.components = embed.components.filter(c => !c.content?.startsWith('### Current') && !c.content?.match(/^\**\**\d+\.\**\**/) && c.type !== 1);
          row.components[0].setDisabled(false);
          embed.components.push(row.toJSON());
          await i.update({ components: [embed] });
          return;
        }

        if (i.customId === 'app_mngr_add') {
          const modal = new ModalBuilder().setCustomId('modal_app_add_q').setTitle('Add Question');
          const input = new TextInputBuilder().setCustomId('q_text').setLabel('Question Text').setStyle(TextInputStyle.Short).setRequired(true);
          modal.addComponents(new ActionRowBuilder().addComponents(input));
          return i.showModal(modal);
        }
      });
    }
  }
];

export async function handleAppManagerModals(interaction) {
  if (interaction.customId === 'modal_app_add_q') {
    const qText = interaction.fields.getTextInputValue('q_text');
    const config = db.getAppConfig(interaction.guild.id);
    if (config.questions.length >= 5) {
      return interaction.reply({ content: 'You can only have 5 questions maximum!', ephemeral: true });
    }
    config.questions.push(qText);
    db.updateAppConfig(interaction.guild.id, { questions: config.questions });
    
    await interaction.reply(cv2.success('Question Added', `Successfully added: **${qText}**\n**Please run \`!app\` again to see the updated panel.**`));
    await interaction.message.delete().catch(() => null);
  }
}
