import { AttachmentBuilder } from 'discord.js';
import db from '../database.js';
import statsDB from '../statsDB.js';
import { generateInviteTopImage } from '../utils/statCanvas.js';
import cv2 from '../cv2.js';

export const commands = [
  {
    name: 'invitelb',
    slashHidden: true,
    description: 'View the top inviters in this server',
    aliases: ['topinvites', 'invitetop'],
    category: 'utility',
    options: [],

    async executePrefix(message, args) {
      const waitMsg = await message.reply(cv2.info('<a:loading:1542155051286396938> Loading...', 'Building invite leaderboard...'));

      try {
        const rawInvites = statsDB.getTopInvites(message.guild.id, 10) || [];

        if (rawInvites.length === 0) {
          return waitMsg.edit(cv2.info('No Data', 'No invite data found for this server yet.'));
        }

        const resolveMembers = async (rawTop) => {
          return Promise.all(rawTop.map(async (row) => {
            try {
              const member = await message.guild.members.fetch(row.user_id).catch(() => null);
              const username = member?.user?.username
                || member?.displayName
                || (await message.client.users.fetch(row.user_id).catch(() => null))?.username
                || `User ${row.user_id.slice(-4)}`;
              return { user_id: row.user_id, username, net: row.net };
            } catch {
              return { user_id: row.user_id, username: `User ${row.user_id.slice(-4)}`, net: row.net };
            }
          }));
        };

        const topInvites = await resolveMembers(rawInvites);

        const cfg = db.getGuildConfig(message.guild.id); const lastSync = cfg.lastInviteSync || null; const buffer = await generateInviteTopImage(message.guild, topInvites, lastSync);
        const attachment = new AttachmentBuilder(buffer, { name: 'top-invites.png' });

        await waitMsg.delete().catch(() => null);
        await message.channel.send({ files: [attachment] });
      } catch (e) {
        console.error('Invite leaderboard error:', e);
        await waitMsg.edit(cv2.danger('Error', 'An error occurred while generating the leaderboard.')).catch(() => null);
      }
    }

  },
  {
    name: 'syncinvites',
    slashHidden: true,
    description: 'Retroactively syncs invite data from active Discord invite links.',
    category: 'utility',
    options: [],
    
    async executePrefix(message, args) {
      if (!message.member.permissions.has('Administrator')) {
        return message.reply(cv2.danger('Access Denied', 'Only administrators, Extra Owners, or the Server Owner can run this command.'));
      }

      const waitMsg = await message.reply(cv2.info('Syncing...', 'Fetching past invite data from Discord...'));
      
      try {
        const invites = await message.guild.invites.fetch().catch(() => new Map());
        const inviterMap = new Map();
        
        for (const [code, invite] of invites) {
          if (invite.inviter && invite.uses > 0) {
            const currentUses = inviterMap.get(invite.inviter.id) || 0;
            inviterMap.set(invite.inviter.id, currentUses + invite.uses);
          }
        }
        
        if (inviterMap.size === 0) {
          return waitMsg.edit(cv2.warn('No Invites', 'There are no active invites with uses to sync.'));
        }
        
        for (const [inviterId, uses] of inviterMap.entries()) {
          statsDB.syncRetroactiveInvites(message.guild.id, inviterId, uses);
        }
        
        const cfg = db.getGuildConfig(message.guild.id); cfg.lastInviteSync = Date.now(); db.save(); await waitMsg.edit(cv2.success('Sync Complete', `Successfully synced **${inviterMap.size}** users' past invites into the database! You can now view the leaderboard.`));
      } catch (err) {
        console.error(err);
        await waitMsg.edit(cv2.danger('Error', 'Failed to sync invites. Ensure I have the Manage Server permission to read invites.'));
      }
    }
  }
];
