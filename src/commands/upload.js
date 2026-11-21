import { PermissionFlagsBits, AttachmentBuilder } from 'discord.js';
import cv2 from '../cv2.js';
import db from '../database.js';

const isBotOwnerSync = (id) => id === '1509084068619489331';

export default {
  name: 'upload',
  aliases: ['up', 'host'],
  description: 'Commands the bot to mirror and upload a file from a direct URL.',
  permissions: [PermissionFlagsBits.ManageMessages],
  async executePrefix(message, args) {
    const isServerOwner = message.guild.ownerId === message.author.id;
    const isBotOwner = isBotOwnerSync(message.author.id);
    const isExtraOwner = db.isExtraOwner(message.guild.id, message.author.id);

    if (!isServerOwner && !isBotOwner && !isExtraOwner && !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply(cv2.e.error('Access Denied', 'You must be a Server Administrator or Owner to use the upload command.'));
    }

        let targetUrl = null;
    let targetFilename = null;
    let contentText = '';

    if (message.reference && message.reference.messageId) {
      try {
        const referencedMessage = await message.channel.messages.fetch(message.reference.messageId);
        const attachment = referencedMessage.attachments.first();
        if (attachment) {
          targetUrl = attachment.url;
          targetFilename = attachment.name;
        }
      } catch (e) {}
    }

    if (!targetUrl) {
      if (args.length < 1) {
        return message.reply(cv2.e.warn('Invalid Syntax', `Please provide a direct URL, or **reply** to a message containing a file!\n\n**Usage:**\n\`!upload <url> [optional_filename.exe]\`\n\`!upload [new_filename.exe]\` (While replying to a file)`));
      }
      
      const fullArgs = args.join(' ');
      let [fileInfo, ...contentParts] = fullArgs.split('|');
      contentText = contentParts.join('|').trim();

      const infoArgs = fileInfo.trim().split(' ');
      targetUrl = infoArgs[0];
      targetFilename = infoArgs.slice(1).join(' ') || 'downloaded_file';
    } else {
      const fullArgs = args.join(' ');
      let [fileInfo, ...contentParts] = fullArgs.split('|');
      contentText = contentParts.join('|').trim();
      
      if (fileInfo.trim()) {
        targetFilename = fileInfo.trim();
      }
    }

    const msg = await message.reply(cv2.info('Uploading...', `Fetching \`${targetFilename}\` from the provided URL... This may take a moment depending on the file size.`));

    try {
      const attachment = new AttachmentBuilder(targetUrl, { name: targetFilename });
      
      const payload = { files: [attachment] };
      if (contentText) {
        payload.content = contentText;
      }

      await message.channel.send(payload);
      
      await msg.edit(cv2.success('Upload Complete', `Successfully uploaded **\${targetFilename}** to this channel.`));
      
      // Clean up the status messages
      setTimeout(() => {
        msg.delete().catch(() => {});
        message.delete().catch(() => {});
      }, 3000);

    } catch (error) {
      console.error(error);
      await msg.edit(cv2.e.error('<:off:1533844858983157851> Failed', `Failed to upload the file. Make sure the URL is a direct download link and the file size does not exceed the server's boost limit.\n\n**Error:** \`${error.message}\``));
    }
  }
};
