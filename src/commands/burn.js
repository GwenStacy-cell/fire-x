import { 
  PermissionFlagsBits, 
  ChannelType, 
  MessageFlags, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';
import { 
  getRandomHeadingGlyph, 
  TICK_EMOJI, 
  WRONG_EMOJI, 
  WARN_EMOJI, 
  BULLET_EMOJI, 
  UPTIME_EMOJI 
} from '../utils/emojis.js';
import { isBotOwnerSync } from '../utils/helpers.js';

export function isAuthorized(guild, member, userId) {
  if (isBotOwnerSync(userId)) return true;
  if (guild.ownerId === userId) return true;
  if (db.isExtraOwner(guild.id, userId)) return true;
  if (member?.permissions?.has(PermissionFlagsBits.ManageChannels)) return true;
  return false;
}

// Background ticker to auto-destruct expired burn rooms
let burnTickerStarted = false;

export function ensureBurnTicker(client) {
  if (burnTickerStarted) return;
  burnTickerStarted = true;

  setInterval(async () => {
    try {
      const allRooms = db.getBurnRooms();
      const now = Date.now();

      for (const room of allRooms) {
        if (now >= room.expiresAt) {
          const guild = client.guilds.cache.get(room.guildId);
          if (guild) {
            const channel = guild.channels.cache.get(room.channelId);
            if (channel && channel.deletable) {
              await channel.delete('[Athena Burn Room] Self-destruct timer expired').catch(() => null);
            }
          }
          db.removeBurnRoom(room.channelId);
        }
      }
    } catch {}
  }, 15000);
}

export async function createBurnRoom(guild, creator, invitedUsers = [], durationMinutes = 10) {
  const botMe = guild.members.me || (guild.members.fetchMe ? await guild.members.fetchMe().catch(() => null) : null);
  if (!botMe?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return { success: false, error: 'Athena lacks the `Manage Channels` permission to create Burn Rooms.' };
  }

  const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
  const channelName = `burn-${roomCode.toLowerCase()}`;

  const permissionOverwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
    },
    {
      id: botMe.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    },
    {
      id: creator.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles
      ]
    }
  ];

  for (const u of invitedUsers) {
    if (u.id !== creator.id && u.id !== botMe.id) {
      permissionOverwrites.push({
        id: u.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles
        ]
      });
    }
  }

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    topic: `Athena Prime Ephemeral Burn Room #${roomCode} | Auto-purges in ${durationMinutes}m`,
    permissionOverwrites,
    reason: `Burn-after-reading room created by ${creator.tag || creator.id}`
  }).catch(() => null);

  if (!channel) {
    return { success: false, error: 'Failed to create burn room channel. Check channel limit.' };
  }

  // Register in DB
  const roomRecord = db.addBurnRoom(channel.id, {
    guildId: guild.id,
    creatorId: creator.id,
    durationMinutes
  });

  // Ensure destruction ticker is running
  if (guild.client) ensureBurnTicker(guild.client);

  // Send initial briefing inside the burn channel
  const participantMentions = [
    `<@${creator.id}>`,
    ...invitedUsers.map(u => `<@${u.id}>`)
  ].join('  \u00b7  ');

  const fields = [
    {
      name: 'Room Code',
      value: `\`#${roomCode}\``,
      inline: true
    },
    {
      name: 'Self-Destruct Timer',
      value: `<t:${Math.floor(roomRecord.expiresAt / 1000)}:R>`,
      inline: true
    },
    {
      name: 'Channel ID',
      value: `\`${channel.id}\``,
      inline: true
    },
    {
      name: 'Authorized Participants',
      value: participantMentions,
      inline: false
    },
    {
      name: 'Security Protocol',
      value: '`Zero Audit Residuals (Complete physical obliteration on expiration)`',
      inline: false
    }
  ];

  const burnCard = cv2.card(
    `Burn-After-Reading Containment Room | ${TICK_EMOJI}`,
    `> -# <a:uptime:1552608831060844575> **Isolated End-to-End Ephemeral Channel Active.**\n` +
    `> -# All discussions, logs, and attachments inside this room will be **permanently wiped** when the countdown finishes or when the button below is triggered.`,
    fields,
    'Athena Prime Security Suite • Ephemeral Burn Protocol'
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`burn_destruct_${channel.id}`)
      .setLabel('Self-Destruct Now')
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({
    content: participantMentions,
    ...burnCard,
    components: [...burnCard.components, row.toJSON()]
  }).catch(() => null);

  return { success: true, channelId: channel.id, roomCode, expiresAt: roomRecord.expiresAt };
}

export const commands = [
  {
    name: 'burn',
    aliases: ['whisper', 'burnroom', 'ephemeralroom', 'secretroom'],
    description: 'Self-Destructing Burn-After-Reading Rooms - Ephemeral private channels that auto-purge after a timer.',
    category: 'Security',
    async execute(message, args) {
      const guild = message.guild;
      if (!guild) return;

      if (!isAuthorized(guild, message.member, message.author.id)) {
        return message.reply(cv2.danger(
          `Access Denied | ${WRONG_EMOJI}`,
          'Only Server Owners, Extra Owners, and Channel Managers can deploy Ephemeral Burn Rooms.'
        )).catch(() => null);
      }

      const sub = (args[0] || '').toLowerCase();

      // Immediate destruction command from within channel
      if (sub === 'end' || sub === 'kill' || sub === 'destroy') {
        const room = db.cache.burnRooms?.[message.channel.id];
        if (!room) {
          return message.reply(cv2.warn(`Not a Burn Room | ${WARN_EMOJI}`, 'This channel is not an active Burn Room.')).catch(() => null);
        }

        db.removeBurnRoom(message.channel.id);
        await message.reply(cv2.danger(`Self-Destructing | ${TICK_EMOJI}`, 'Obliterating room in 3 seconds...')).catch(() => null);
        setTimeout(() => {
          message.channel.delete('[Athena Burn Room] Manual self-destruction requested').catch(() => null);
        }, 3000);
        return;
      }

      // List active burn rooms
      if (sub === 'list') {
        const rooms = db.getBurnRooms(guild.id);
        if (rooms.length === 0) {
          return message.reply(cv2.info(`Active Burn Rooms | ${UPTIME_EMOJI}`, 'No active Burn Rooms currently running in this server.')).catch(() => null);
        }

        const fields = rooms.map(r => ({
          name: `Channel: <#${r.channelId}>`,
          value: `**Creator:** <@${r.creatorId}>\n**Self-Destruct:** <t:${Math.floor(r.expiresAt / 1000)}:R>`,
          inline: false
        }));

        const panel = cv2.card(
          `Active Burn Rooms | ${TICK_EMOJI}`,
          `> -# <a:uptime:1552608831060844575> **${rooms.length} Active Ephemeral Chambers:**`,
          fields,
          'Athena Prime Security Suite • Burn Protocol'
        );
        return message.reply(panel).catch(() => null);
      }

      // Default: Create burn room
      // Parse duration: find last argument if numeric
      let durationMinutes = 10;
      const lastArg = args[args.length - 1];
      if (lastArg && !isNaN(parseInt(lastArg, 10)) && !lastArg.includes('<@')) {
        const parsed = parseInt(lastArg, 10);
        if (parsed >= 1 && parsed <= 120) {
          durationMinutes = parsed;
        }
      }

      const invitedUsers = message.mentions?.users ? Array.from(message.mentions.users.values()) : [];
      const res = await createBurnRoom(guild, message.author, invitedUsers, durationMinutes);

      if (!res.success) {
        return message.reply(cv2.danger(`Burn Room Deployment Failed | ${WRONG_EMOJI}`, res.error)).catch(() => null);
      }

      return message.reply(cv2.success(
        `Ephemeral Burn Room Deployed | ${TICK_EMOJI}`,
        `> -# **Private Room:** <#${res.channelId}>\n` +
        `> -# **Code:** \`#${res.roomCode}\`\n` +
        `> -# **Destruction Countdown:** <t:${Math.floor(res.expiresAt / 1000)}:R>\n` +
        `> -# The channel will self-destruct automatically when the timer reaches zero.`
      )).catch(() => null);
    }
  }
];
