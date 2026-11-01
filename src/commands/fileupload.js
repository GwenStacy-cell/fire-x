import { 
  PermissionFlagsBits, 
  MessageFlags, 
  ApplicationCommandOptionType, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} from 'discord.js';
import cv2 from '../cv2.js';
import db from '../database.js';
import { isBotOwnerSync, isExtraOwner } from '../utils/helpers.js';
import { TICK_EMOJI, BULLET_EMOJI, getRandomHeadingGlyph } from '../utils/emojis.js';

/**
 * Awaits either a message from authorId in channel OR a button interaction on promptMsg.
 * Times out after timeout ms (default 120000 = 2 minutes).
 */
function awaitStepResponse(channel, promptMsg, authorId, timeout = 120000) {
  return new Promise((resolve) => {
    let finished = false;

    const msgCollector = channel.createMessageCollector({
      filter: m => m.author.id === authorId,
      time: timeout,
      max: 1
    });

    const btnCollector = promptMsg && promptMsg.createMessageComponentCollector
      ? promptMsg.createMessageComponentCollector({
          filter: i => i.user.id === authorId,
          time: timeout,
          max: 1
        })
      : null;

    function finish(result) {
      if (!finished) {
        finished = true;
        try { msgCollector.stop(); } catch {}
        try { btnCollector?.stop(); } catch {}
        resolve(result);
      }
    }

    msgCollector.on('collect', (m) => {
      finish({ type: 'message', message: m });
    });

    btnCollector?.on('collect', async (i) => {
      try { await i.deferUpdate(); } catch {}
      finish({ type: 'interaction', interaction: i, customId: i.customId });
    });

    msgCollector.on('end', (collected, reason) => {
      if (!finished && reason === 'time') {
        finish(null);
      }
    });

    btnCollector?.on('end', (collected, reason) => {
      if (!finished && reason === 'time') {
        finish(null);
      }
    });
  });
}

/**
 * Step-by-step interactive file upload wizard:
 * 1. Upload File (.exe, .zip, .json, etc.)
 * 2. Choose Title / Note (Optional, can skip to use file name)
 * 3. Choose Target Channel via #channel or Channel ID (or designated / current)
 * 4. Publish inside CV2 Accentborderless Container
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
      return message.reply(cv2.success('Designated Channel Configured', `Files uploaded via \`${prefix}fileupload\` will default to <#${chan.id}>.`));
    }

    const currentId = db.getFileUploadChannel(message.guild.id);
    if (currentId) {
      return message.reply(cv2.info('Designated Upload Channel', `Currently designated upload channel: <#${currentId}>\nUse \`${prefix}fileupload channel <#channel>\` to change it.`));
    }
    return message.reply(cv2.info('Designated Upload Channel', `No designated channel configured yet. Files will post to the target channel you specify during upload.\n\nUse \`${prefix}fileupload channel <#channel>\` to set one.`));
  }

  // --- STEP 1: UPLOAD FILE ---
  let attachments = [];
  if (message.attachments && message.attachments.size > 0) {
    attachments = Array.from(message.attachments.values());
  } else {
    const cancelBtn1 = new ButtonBuilder()
      .setCustomId('fu_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger);
    const row1 = new ActionRowBuilder().addComponents(cancelBtn1);

    const step1Payload = cv2.info(
      'File Upload [Step 1/3]',
      `Please upload/attach your file (**.exe**, **.zip**, **.json**, etc.) in your next message.\n\n` +
      `> -# ${BULLET_EMOJI} **Supported Formats:** .exe, .zip, .json, .rar, .7z, or any code / asset archive.\n` +
      `> -# ${BULLET_EMOJI} **Cancel:** Type \`cancel\` or click **Cancel** below.\n` +
      `> -# ${BULLET_EMOJI} **Window:** You have 2 minutes to upload your file.`
    );
    if (step1Payload.components?.[0]?.components) {
      step1Payload.components[0].components.push({ type: 14, divider: true }, row1.toJSON());
    }

    const prompt1 = await message.reply(step1Payload);
    const res1 = await awaitStepResponse(message.channel, prompt1, message.author.id, 120000);

    if (!res1) {
      return message.channel.send(cv2.warn('Upload Timed Out', 'File upload timed out. No file was received within 2 minutes.'));
    }

    if (res1.type === 'interaction' && res1.customId === 'fu_cancel') {
      return message.channel.send(cv2.danger('Upload Cancelled', 'File upload wizard has been cancelled.'));
    }

    if (res1.type === 'message') {
      const content = res1.message.content.trim().toLowerCase();
      if (content === 'cancel') {
        return message.channel.send(cv2.danger('Upload Cancelled', 'File upload wizard has been cancelled.'));
      }
      if (!res1.message.attachments || res1.message.attachments.size === 0) {
        return message.channel.send(cv2.danger('No File Attached', 'No file attachment was detected in your message. Please run `!fileupload` again and attach your file.'));
      }
      attachments = Array.from(res1.message.attachments.values());
    }
  }

  if (attachments.length === 0) {
    return message.channel.send(cv2.danger('No File Attached', 'No file attachments detected. Setup cancelled.'));
  }

  // --- STEP 2: CHOOSE TITLE (OPTIONAL) ---
  const primaryFile = attachments[0];
  const defaultTitle = primaryFile.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');

  const skipBtn = new ButtonBuilder()
    .setCustomId('fu_skip_title')
    .setLabel('Skip (Use File Name)')
    .setStyle(ButtonStyle.Primary);
  const cancelBtn2 = new ButtonBuilder()
    .setCustomId('fu_cancel')
    .setLabel('Cancel')
    .setStyle(ButtonStyle.Danger);
  const row2 = new ActionRowBuilder().addComponents(skipBtn, cancelBtn2);

  const step2Payload = cv2.info(
    'File Upload [Step 2/3]',
    `File received: \`${primaryFile.name}\` (${(primaryFile.size / 1024).toFixed(2)} KB)\n\n` +
    `Now enter a **Title or Note** to display on top of this file.\n\n` +
    `> -# ${BULLET_EMOJI} **Custom Title:** Type your title or note in chat.\n` +
    `> -# ${BULLET_EMOJI} **Optional / Skip:** Type \`skip\` or click **Skip (Use File Name)** to use default: \`${defaultTitle}\`.\n` +
    `> -# ${BULLET_EMOJI} **Cancel:** Type \`cancel\` to abort.\n` +
    `> -# ${BULLET_EMOJI} **Window:** You have 2 minutes.`
  );
  if (step2Payload.components?.[0]?.components) {
    step2Payload.components[0].components.push({ type: 14, divider: true }, row2.toJSON());
  }

  const prompt2 = await message.channel.send(step2Payload);
  const res2 = await awaitStepResponse(message.channel, prompt2, message.author.id, 120000);

  if (!res2) {
    return message.channel.send(cv2.warn('Upload Timed Out', 'File upload timed out waiting for title selection. Setup cancelled.'));
  }

  let chosenTitle = defaultTitle;

  if (res2.type === 'interaction') {
    if (res2.customId === 'fu_cancel') {
      return message.channel.send(cv2.danger('Upload Cancelled', 'File upload wizard has been cancelled.'));
    }
    if (res2.customId === 'fu_skip_title') {
      chosenTitle = defaultTitle;
    }
  } else if (res2.type === 'message') {
    const text = res2.message.content.trim();
    if (text.toLowerCase() === 'cancel') {
      return message.channel.send(cv2.danger('Upload Cancelled', 'File upload wizard has been cancelled.'));
    }
    if (['skip', 'none', 'default', 'pass', 'no'].includes(text.toLowerCase())) {
      chosenTitle = defaultTitle;
    } else if (text) {
      chosenTitle = text;
    }
  }

  // --- STEP 3: CHOOSE CHANNEL VIA #CHANNEL OR CHANNEL ID ---
  const designatedId = db.getFileUploadChannel(message.guild.id);
  let designatedChan = null;
  if (designatedId) {
    designatedChan = message.guild.channels.cache.get(designatedId) ||
                     await message.guild.channels.fetch(designatedId).catch(() => null);
  }

  const chanButtons = [];
  if (designatedChan && designatedChan.isTextBased()) {
    chanButtons.push(
      new ButtonBuilder()
        .setCustomId('fu_use_designated')
        .setLabel(`Use Designated (#${designatedChan.name.slice(0, 20)})`)
        .setStyle(ButtonStyle.Primary)
    );
  }
  chanButtons.push(
    new ButtonBuilder()
      .setCustomId('fu_use_current')
      .setLabel(`Use Current (#${message.channel.name.slice(0, 20)})`)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('fu_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
  );
  const row3 = new ActionRowBuilder().addComponents(chanButtons);

  const designatedLine = designatedChan 
    ? `> -# ${BULLET_EMOJI} **Designated Channel:** <#${designatedChan.id}>\n` 
    : '';

  const step3Payload = cv2.info(
    'File Upload [Step 3/3]',
    `Title selected: **${chosenTitle}**\n\n` +
    `Now choose the **Target Channel** where this file should be posted:\n\n` +
    `> -# ${BULLET_EMOJI} **Mention or ID:** Mention a channel (e.g. \`#channel\`) or enter the **Channel ID** in chat.\n` +
    `> -# ${BULLET_EMOJI} **Current Channel:** Type \`here\` or click **Use Current**.\n` +
    designatedLine +
    `> -# ${BULLET_EMOJI} **Cancel:** Type \`cancel\` to abort.\n` +
    `> -# ${BULLET_EMOJI} **Window:** You have 2 minutes.`
  );
  if (step3Payload.components?.[0]?.components) {
    step3Payload.components[0].components.push({ type: 14, divider: true }, row3.toJSON());
  }

  const prompt3 = await message.channel.send(step3Payload);
  const res3 = await awaitStepResponse(message.channel, prompt3, message.author.id, 120000);

  if (!res3) {
    return message.channel.send(cv2.warn('Upload Timed Out', 'File upload timed out waiting for channel selection. Setup cancelled.'));
  }

  let targetChannel = null;

  if (res3.type === 'interaction') {
    if (res3.customId === 'fu_cancel') {
      return message.channel.send(cv2.danger('Upload Cancelled', 'File upload wizard has been cancelled.'));
    }
    if (res3.customId === 'fu_use_designated' && designatedChan) {
      targetChannel = designatedChan;
    } else if (res3.customId === 'fu_use_current') {
      targetChannel = message.channel;
    }
  } else if (res3.type === 'message') {
    const rawContent = res3.message.content.trim();
    if (rawContent.toLowerCase() === 'cancel') {
      return message.channel.send(cv2.danger('Upload Cancelled', 'File upload wizard has been cancelled.'));
    }

    if (['here', 'current', 'this'].includes(rawContent.toLowerCase())) {
      targetChannel = message.channel;
    } else if (['default', 'designated'].includes(rawContent.toLowerCase()) && designatedChan) {
      targetChannel = designatedChan;
    } else {
      // 1. Check channel mentions
      const mentioned = res3.message.mentions.channels.first();
      if (mentioned && mentioned.isTextBased()) {
        targetChannel = mentioned;
      } else {
        // 2. Extract digits / channel ID
        const match = rawContent.match(/\b\d{17,20}\b/) || rawContent.replace(/[<#>]/g, '').trim().split(/\s+/);
        const chanId = match ? (typeof match === 'string' ? match : match[0]) : null;
        if (chanId) {
          const fetched = message.guild.channels.cache.get(chanId) || 
                          await message.guild.channels.fetch(chanId).catch(() => null);
          if (fetched && fetched.isTextBased()) {
            targetChannel = fetched;
          }
        }
      }
    }
  }

  if (!targetChannel || !targetChannel.isTextBased()) {
    return message.channel.send(cv2.danger('Invalid Channel', 'Could not resolve a valid text channel with that mention or ID. File upload cancelled.'));
  }

  // Permission check in targetChannel
  const botPerms = targetChannel.permissionsFor(message.client.user);
  if (botPerms && (!botPerms.has(PermissionFlagsBits.ViewChannel) || !botPerms.has(PermissionFlagsBits.SendMessages) || !botPerms.has(PermissionFlagsBits.AttachFiles))) {
    return message.channel.send(cv2.danger('Missing Permissions', `The bot lacks permissions to post in <#${targetChannel.id}>. Ensure the bot has **View Channel**, **Send Messages**, and **Attach Files** permissions in that channel.`));
  }

  // --- STEP 4: PUBLISH INSIDE CV2 ACCENTBORDERLESS CONTAINER ---
  const published = [];

  for (const attachment of attachments) {
    const noteText = (attachments.length > 1) 
      ? `${chosenTitle} — ${attachment.name}` 
      : chosenTitle;

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
        description: 'Title or note above the file (optional)',
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
          ...cv2.warn('File Required', 'Please provide a file attachment to publish, or use `!fileupload` in text chat for the step-by-step interactive wizard.'),
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
