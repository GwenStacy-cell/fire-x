import { PermissionFlagsBits, ChannelType } from 'discord.js';
import cv2 from '../cv2.js';
import db from '../database.js';

export const commands = [
  {
    name: 'buildserver',
    aliases: ['bserver', 'serversetup'],
    description: 'Auto-builds an aesthetic support server layout for the bot.',
    type: 1,
    async executePrefix(message, args) {
      if (message.author.id !== process.env.OWNER_ID && message.author.id !== message.guild.ownerId) {
        return message.reply(cv2.danger('Access Denied', 'Only the **Bot Owner** or **Server Owner** can use this command.'));
      }

      if (args[0] !== 'confirm') {
        return message.reply(cv2.warn(
          'Confirm Server Build',
          'This will **DELETE ALL EXISTING CHANNELS** and rebuild the server with the aesthetic support layout.\n\nTo proceed, type: `!buildserver confirm`'
        ));
      }

      const m = await message.reply(cv2.info('Building Server...', '<a:loading:1533844850000000000> Wiping existing channels and preparing layout...'));

      try {
        // 1. Delete all channels
        const channels = message.guild.channels.cache;
        for (const [id, channel] of channels) {
          try {
            await channel.delete('Auto-building server');
          } catch (e) {
            // Ignore channels we can't delete
          }
        }

        // Helper to format names exactly as the user requested
        
        // 2. Create Aesthetic Roles
        const formatRole = (name) => '.        ' + name + '         .';
        const randomColor = () => '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
        const roleDefinitions = [
          { name: formatRole('The Overlords'), color: randomColor(), permissions: [PermissionFlagsBits.Administrator] },
          { name: formatRole('High Council'), color: randomColor(), permissions: [PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ManageMessages] },
          { name: formatRole('Ban Hammers'), color: randomColor(), permissions: [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ManageMessages] },
          { name: formatRole('Trial Interns'), color: randomColor(), permissions: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.MuteMembers] },
          { name: formatRole('Sugar Daddies'), color: randomColor(), permissions: [] }, // Boosters/VIPs
          { name: formatRole('No Lifers'), color: randomColor(), permissions: [] }, // Level 10+
          { name: formatRole('Verified Humans'), color: randomColor(), permissions: [] }, // Base Members
          { name: formatRole('Giveaway Addicts'), color: randomColor(), permissions: [] }, // Ping Role
          { name: formatRole('Event Crashers'), color: randomColor(), permissions: [] }, // Ping Role
          { name: formatRole('In Quarantine'), color: '#2b2d31', permissions: [] } // Hidden/Grey
        ];

        for (const roleDef of roleDefinitions) {
          try {
            await message.guild.roles.create({
              name: roleDef.name,
              color: roleDef.color,
              permissions: roleDef.permissions,
              reason: 'Auto-building server aesthetic roles'
            });
          } catch (e) {
            console.error('Failed to create role:', roleDef.name);
          }
        }

        const formatName = (name) => `.       ${name.toLowerCase()}`;
        const formatCategory = (name) => `.       ${name.toUpperCase()}`;

        const createLayout = async () => {
          // ====================
          // WELCOME & INFO
          // ====================
          const catInfo = await message.guild.channels.create({
            name: formatCategory('welcome & info'),
            type: ChannelType.GuildCategory
          });
          await message.guild.channels.create({ name: formatName('welcome'), type: ChannelType.GuildText, parent: catInfo.id });
          await message.guild.channels.create({ name: formatName('leaves'), type: ChannelType.GuildText, parent: catInfo.id });
          await message.guild.channels.create({ name: formatName('verification'), type: ChannelType.GuildText, parent: catInfo.id });
          await message.guild.channels.create({ name: formatName('rules'), type: ChannelType.GuildText, parent: catInfo.id });
          await message.guild.channels.create({ name: formatName('announcements'), type: ChannelType.GuildText, parent: catInfo.id });

          // ====================
          // SUPPORT & TICKETS
          // ====================
          const catSupport = await message.guild.channels.create({
            name: formatCategory('support & tickets'),
            type: ChannelType.GuildCategory
          });
          await message.guild.channels.create({ name: formatName('support-tickets'), type: ChannelType.GuildText, parent: catSupport.id });
          await message.guild.channels.create({ name: formatName('feedback'), type: ChannelType.GuildText, parent: catSupport.id });

          // ====================
          // COMMUNITY HUB
          // ====================
          const catCommunity = await message.guild.channels.create({
            name: formatCategory('community hub'),
            type: ChannelType.GuildCategory
          });
          const generalChat = await message.guild.channels.create({ name: formatName('general-chat'), type: ChannelType.GuildText, parent: catCommunity.id });
          await message.guild.channels.create({ name: formatName('quotes'), type: ChannelType.GuildText, parent: catCommunity.id });
          await message.guild.channels.create({ name: formatName('auto-react'), type: ChannelType.GuildText, parent: catCommunity.id });

          // ====================
          // FEATURES & TOOLS
          // ====================
          const catFeatures = await message.guild.channels.create({
            name: formatCategory('features & tools'),
            type: ChannelType.GuildCategory
          });
          await message.guild.channels.create({ name: formatName('reaction-roles'), type: ChannelType.GuildText, parent: catFeatures.id });
          await message.guild.channels.create({ name: formatName('bot-commands'), type: ChannelType.GuildText, parent: catFeatures.id });

          // ====================
          // VOICE & MEDIA
          // ====================
          const catVoice = await message.guild.channels.create({
            name: formatCategory('voice & media'),
            type: ChannelType.GuildCategory
          });
          await message.guild.channels.create({ name: formatName('music-player'), type: ChannelType.GuildText, parent: catVoice.id });
          await message.guild.channels.create({ name: formatName('Join To Create'), type: ChannelType.GuildVoice, parent: catVoice.id });
          await message.guild.channels.create({ name: formatName('General Voice'), type: ChannelType.GuildVoice, parent: catVoice.id });

          // ====================
          // STAFF & LOGS
          // ====================
          const staffPerms = [
            {
              id: message.guild.id,
              deny: [PermissionFlagsBits.ViewChannel] // Deny @everyone
            },
            {
              id: message.guild.ownerId,
              allow: [PermissionFlagsBits.ViewChannel]
            }
          ];

          const catStaff = await message.guild.channels.create({
            name: formatCategory('staff & logs'),
            type: ChannelType.GuildCategory,
            permissionOverwrites: staffPerms
          });
          await message.guild.channels.create({ name: formatName('staff-chat'), type: ChannelType.GuildText, parent: catStaff.id, permissionOverwrites: staffPerms });
          await message.guild.channels.create({ name: formatName('bot-logs'), type: ChannelType.GuildText, parent: catStaff.id, permissionOverwrites: staffPerms });
          
          return generalChat;
        };

        const newGeneral = await createLayout();

        if (newGeneral) {
          await newGeneral.send(cv2.success('Server Build Complete', 'Successfully deployed the **Athena Support Server** aesthetic layout.\n\nAll features (Welcome, JTC, Tickets, etc) now have designated channels.'));
        }
        
      } catch (err) {
        console.error(err);
        // Fallback if message is somehow deleted
        try {
          message.author.send(`An error occurred while building the server: \`${err.message}\``).catch(()=>null);
        } catch (e) {}
      }
    },
    async executeSlash(interaction) {
      return interaction.reply({ content: 'Please use the prefix command `!buildserver` to execute this action.', ephemeral: true });
    }
  }
];
