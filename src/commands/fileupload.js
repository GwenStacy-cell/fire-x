import { PermissionFlagsBits, MessageFlags, ApplicationCommandOptionType } from 'discord.js';
import cv2 from '../cv2.js';
import db from '../database.js';
import { isBotOwnerSync, isExtraOwner } from '../utils/helpers.js';
import { TICK_EMOJI, BULLET_EMOJI, getRandomHeadingGlyph } from '../utils/emojis.js';

/**
 * Handles uploading a .exe, .json, .zip or any file using the bot to the designated
 * channel with a note/title above formatted inside a CV2 accentborderless container.
 */
export async function handleFileUploadPublish(message, args = []) {
  if (!message.guild) {
    return message.reply(cv2.warn('Guild Only', 'This command can only be used in a server.'));
  }

  const isOwner = (message.guild && message.guild.ownerId === message.author.id) ||
                  isBotOwnerSync(message.author.id) ||
                  isExtraOwner(message.guild.id, message.author.id);
  const hasPerm = message.member?.permissions?.has(PermissionFlagsBits.ManageMessages) ||
                  message.member?.permissions?.has(PermissionFlagsBits.Administrator);

  if (!isOwner && !hasPerm) {
    return message.reply(cv2.danger('Access Denied', 'This command is strictly reserved for the **Server Owner**, designated **Extra Owners**, or **Administrators**.'));
  }

  const prefix = db.getPrefix(message.guild.id);
  const sub = (args[0] || '').toLowerCase();

  // Subcommand: set / view designated upload channel
  if (sub === 'channel' || sub === 'setchannel') {
    if (args[1]) {
      const channelId = args[1].replace(/[<#>]/g, '');
      const chan = message.mentions.channels.first() ||
                   message.guild.channels.cache.get(channelId) ||
                   await message.guild.channels.fetch(channelId).catch(() => null);

      if (!chan || !chan.isTextBased()) {
        return message.reply(cv2.warn('Invalid Channel', 'Please specify a valid text channel to designate for uploads.'));
      }

      db.setFileUploadChannel(message.guild.id, chan.id);
      return message.reply(cv2.success('Designated Channel Configured', `Files uploaded via \`${prefix}fileupload\` will now be published to <#${chan.id}>.`));
    }

    const currentId = db.getFileUploadChannel(message.guild.id);
    if (currentId) {
      return message.reply(cv2.info('Designated Upload Channel', `Currently designated upload channel: <#${currentId}>\nUse \`${prefix}fileupload channel <#channel>\` to change it.`));
    }
    return message.reply(cv2.info('Designated Upload Channel', `No designated channel configured yet. Files will post to the current channel or target channel you specify.\n\nUse \`${prefix}fileupload channel <#channel>\` to set one.`));
  }

  let uploadMsg = message;
  let titleArgs = (sub === 'upload') ? args.slice(1) : [...args];

  // If no attachment in command message, prompt user and await their upload
  if (!message.attachments || message.attachments.size === 0) {
    const designatedId = db.getFileUploadChannel(message.guild.id);
    const targetHint = designatedId ? `<#${designatedId}>` : 'this channel';

    await message.reply(cv2.info('File Upload',
      `Please upload/attach your file (**.exe**, **.zip**, **.json**, etc.) in your next message.\n\n` +
      `> -# ${BULLET_EMOJI} **Title / Note:** Type your title or note in the message text.\n` +
      `> -# ${BULLET_EMOJI} **Target Channel:** Posts to ${targetHint} (or mention a specific \`#channel\`).\n` +
      `> -# ${BULLET_EMOJI} **Window:** You have 2 minutes to upload.`
    ));

    const filter = m => m.author.id === message.author.id;
    const collected = await message.channel.awaitMessages({ filter, max: 1, time: 120000, errors: ['time'] }).catch(() => null);

    if (!collected || collected.size === 0) {
      return message.channel.send(cv2.warn('Upload Timed Out', 'Upload timed out. Please run the command again and attach your file.'));
    }

    uploadMsg = collected.first();
    if (uploadMsg.content) {
      titleArgs = uploadMsg.content.trim().split(/\s+/);
    }
  }

  if (!uploadMsg.attachments || uploadMsg.attachments.size === 0) {
    return message.channel.send(cv2.warn('Upload Timed Out', 'No attachments detected. Please run the command again and attach your file.'));
  }

  // Resolve target channel
  let targetChannel = uploadMsg.mentions?.channels?.first() || message.mentions?.channels?.first();

  if (!targetChannel && titleArgs.length > 0) {
    const potentialId = titleArgs[0].replace(/[<#>]/g, '');
    const found = message.guild.channels.cache.get(potentialId) || await message.guild.channels.fetch(potentialId).catch(() => null);
    if (found && found.isTextBased()) {
      targetChannel = found;
      titleArgs.shift();
    }
  } else if (targetChannel) {
    titleArgs = titleArgs.filter(a => a !== `<#${targetChannel.id}>`);
  }

  if (!targetChannel) {
    const designatedId = db.getFileUploadChannel(message.guild.id);
    if (designatedId) {
      targetChannel = message.guild.channels.cache.get(designatedId) || await message.guild.channels.fetch(designatedId).catch(() => null);
    }
  }

  if (!targetChannel) {
    targetChannel = message.channel;
  }

  const rawTitle = titleArgs.join(' ').trim();
  const published = [];

  for (const attachment of uploadMsg.attachments.values()) {
    const noteText = rawTitle || attachment.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');

    // CV2 Accentborderless Container (NO accent_color property)
    // Renders as a pure sleek dark rounded box without any colored left border
    const container = {
      type: 17,
      components: [
        { type: 10, content: noteText },
        { type: 14, divider: true },
        {
          type: 13,
          file: {
            url: `attachment://${attachment.name}`
          }
        }
      ]
    };

    try {
      await targetChannel.send({
        components: [container],
        files: [attachment],
        flags: MessageFlags.IsComponentsV2
      });
      published.push({ name: attachment.name, title: noteText, size: attachment.size });
    } catch (err) {
      console.error('[File Upload Error]:', err);
      return message.reply(cv2.danger('Dispatch Failed', `Failed to send file to <#${targetChannel.id}>: \`${err.message}\`. Please ensure the bot has **Send Messages** and **Attach Files** permissions in that channel.`));
    }
  }

  const desc = published.map(p => 
    `-# ${BULLET_EMOJI} **File:** \`${p.name}\` (${(p.size / 1024).toFixed(2)} KB)\n` +
    `-# ${BULLET_EMOJI} **Title / Note:** ${p.title}\n` +
    `-# ${BULLET_EMOJI} **Published to:** <#${targetChannel.id}>`
  ).join('\n\n');

  return message.reply(cv2.success('File Published', desc));
}

export const commands = [
  {
    name: 'fileupload',
    aliases: ['file-upload', 'uploadfile', 'upload-file', 'file', 'files'],
    description: 'Upload any .exe, .zip, or .json file to the designated channel inside an accentborderless container.',
    category: 'utility',
    options: [
      {
        name: 'file',
        description: 'The file to upload (.exe, .zip, .json, etc.)',
        type: ApplicationCommandOptionType.Attachment,
        required: false
      },
      {
        name: 'title',
        description: 'Title or note above the file',
        type: ApplicationCommandOptionType.String,
        required: false
      },
      {
        name: 'channel',
        description: 'Target channel to publish the file to (defaults to designated channel)',
        type: ApplicationCommandOptionType.Channel,
        required: false
      }
    ],

    async executePrefix(message, args) {
      const sub = (args[0] || '').toLowerCase();
      if (sub === 'upload') {
        return handleFileUploadPublish(message, args.slice(1));
      }
      return handleFileUploadPublish(message, args);
    },

    async executeSlash(interaction) {
      if (!interaction.guild) {
        return interaction.reply({ ...cv2.warn('Guild Only', 'This command can only be used in a server.'), flags: MessageFlags.Ephemeral });
      }

      const isOwner = (interaction.guild.ownerId === interaction.user.id) ||
                      isBotOwnerSync(interaction.user.id) ||
                      isExtraOwner(interaction.guild.id, interaction.user.id);
      const hasPerm = interaction.member?.permissions?.has(PermissionFlagsBits.ManageMessages) ||
                      interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);

      if (!isOwner && !hasPerm) {
        return interaction.reply({ ...cv2.danger('Access Denied', 'This command is strictly reserved for the **Server Owner**, designated **Extra Owners**, or **Administrators**.'), flags: MessageFlags.Ephemeral });
      }

      const fileAttachment = interaction.options.getAttachment('file');
      const customTitle = interaction.options.getString('title');
      const targetChannelOption = interaction.options.getChannel('channel');

      let targetChannel = targetChannelOption;
      if (!targetChannel) {
        const designatedId = db.getFileUploadChannel(interaction.guild.id);
        if (designatedId) {
          targetChannel = interaction.guild.channels.cache.get(designatedId) || await interaction.guild.channels.fetch(designatedId).catch(() => null);
        }
      }
      if (!targetChannel) {
        targetChannel = interaction.channel;
      }

      if (!fileAttachment) {
        return interaction.reply({
          ...cv2.warn('File Required', 'Please provide a file attachment to publish, or use `!fileupload` in text chat for the interactive 2-minute uploader.'),
          flags: MessageFlags.Ephemeral
        });
      }

      const noteText = customTitle || fileAttachment.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');

      // Accentborderless container (NO accent_color)
      const container = {
        type: 17,
        components: [
          { type: 10, content: noteText },
          { type: 14, divider: true },
          {
            type: 13,
            file: {
              url: `attachment://${fileAttachment.name}`
            }
          }
        ]
      };

      try {
        await targetChannel.send({
          components: [container],
          files: [fileAttachment],
          flags: MessageFlags.IsComponentsV2
        });

        const successDesc =
          `-# ${BULLET_EMOJI} **File:** \`${fileAttachment.name}\` (${(fileAttachment.size / 1024).toFixed(2)} KB)\n` +
          `-# ${BULLET_EMOJI} **Title / Note:** ${noteText}\n` +
          `-# ${BULLET_EMOJI} **Published to:** <#${targetChannel.id}>`;

        return interaction.reply({ ...cv2.success('File Published', successDesc), flags: MessageFlags.Ephemeral });
      } catch (err) {
        console.error('[File Upload Slash Error]:', err);
        return interaction.reply({
          ...cv2.danger('Dispatch Failed', `Failed to send file to <#${targetChannel.id}>: \`${err.message}\`.`),
          flags: MessageFlags.Ephemeral
        });
      }
    }
  }
];

export default {
  handleFileUploadPublish,
  commands
};
