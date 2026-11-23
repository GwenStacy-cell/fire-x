import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';
import { enqueue, buildAddedToQueueMsg } from '../utils/musicManager.js';

export const commands = [
  {
    name: 'setupmusic',
    aliases: ['musicsetup', 'ms'],
    description: 'Set up the Compact Music Player channel',
    category: 'music',
    permissions: [PermissionFlagsBits.ManageGuild],
    
    slashDef: new SlashCommandBuilder()
      .setName('setupmusic')
      .setDescription('Create the Compact Music Player channel')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addStringOption(opt => opt
        .setName('image_url')
        .setDescription('Custom cover image or GIF URL for the music player embed')
        .setRequired(false)
      ),
      
    async executePrefix(message, args) {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return message.reply(cv2.danger('Permission Denied', 'You need `ManageGuild` permissions to setup the music player.'));
      }
      await setupMusicChannel(message.guild, message.channel, args[0]);
    },
    
    async executeSlash(interaction) {
      await interaction.deferReply();
      const imageUrl = interaction.options.getString('image_url');
      await setupMusicChannel(interaction.guild, interaction.channel, imageUrl, interaction);
    }
  },
  
  {
    name: 'play',
    aliases: [],
    description: 'Play a song in your voice channel',
    category: 'music',
    permissions: [],
    
    slashDef: new SlashCommandBuilder()
      .setName('play')
      .setDescription('Search for a song or play a URL')
      .addStringOption(opt => opt
        .setName('query')
        .setDescription('Song name, YouTube URL, or Spotify URL')
        .setRequired(true)
        .setAutocomplete(true)
      ),
      
    async autocomplete(interaction) {
      const focusedValue = interaction.options.getFocused();
      if (!focusedValue || focusedValue.length < 3) return interaction.respond([]);
      
      try {
        if (!focusedValue.startsWith('http')) {
          const shoukaku = global.client?.shoukaku;
          if (!shoukaku) return interaction.respond([]);
          
          const node = shoukaku.options.nodeResolver(shoukaku.nodes);
          if (!node) return interaction.respond([]);
          
          let result = await node.rest.resolve(`ytmsearch:${focusedValue}`);
          if (!result || (result.loadType !== 'search' && result.loadType !== 'track')) {
            result = await node.rest.resolve(`spsearch:${focusedValue}`);
          }
          if (!result || (result.loadType !== 'search' && result.loadType !== 'track')) {
            result = await node.rest.resolve(`ytsearch:${focusedValue}`);
          }
          if (result && (result.loadType === 'search' || result.loadType === 'track')) {
             const tracks = result.loadType === 'search' ? result.data : [result.data];
             const choices = tracks.slice(0, 5).map(r => {
                const ms = r.info.length;
                const mins = Math.floor(ms / 60000);
                const secs = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
                const duration = `${mins}:${secs}`;
                
                return {
                  name: `${r.info.title} [${duration}]`.substring(0, 100),
                  value: r.info.uri
                };
             });
             await interaction.respond(choices);
          } else {
             await interaction.respond([]);
          }
        } else {
          await interaction.respond([]);
        }
      } catch (error) {
        await interaction.respond([]);
      }
    },
      
    async executePrefix(message, args) {
      if (!args.length) return message.reply(cv2.warn('Invalid Usage', 'Please provide a song name or URL.'));
      const query = args.join(' ');
      const res = await enqueue(message.guild, message.member, query);
      
      if (res.success) {
        const { default: db } = await import("../database.js");
        const cfg = db.getGuildConfig(message.guild.id);
        let replyPayload = cv2.success('Track Queued', res.message);
        if (cfg.musicChannelId && message.channel.id !== cfg.musicChannelId) {
          // Can't push raw EmbedBuilder to cv2.success since cv2 doesn't use embeds. Wait! cv2 might support embeds field if mixed? 
          // Actually, cv2 is pure components + flags.
          // Is it safe to just append an embed? Yes, if we want. But Discord allows both.
          // Wait, cv2 result is { components: [...], flags: 8192 }. Discord allows embeds with IsComponentsV2 flag? No, Discord completely ignores embeds if IsComponentsV2 is set.
          // Wait, if it ignores embeds, how do we add the redirect text? We can just append to the description of cv2.success!
          replyPayload = cv2.success('Track Queued', res.message + `\n\n-# **[Control Playback Here](https://discord.com/channels/${message.guild.id}/${cfg.musicChannelId})**\n-# If you want to pause, skip, or change volume, head over to <#${cfg.musicChannelId}>!`);
        }
        message.reply(replyPayload);
      } else {
        message.reply(cv2.danger('Error', res.message));
      }
    },
    
    async executeSlash(interaction) {
      await interaction.deferReply({ ephemeral: false });
      const query = interaction.options.getString('query');
      
      const res = await enqueue(interaction.guild, interaction.member, query);
      
      if (res.success) {
        const cfg = db.getGuildConfig(interaction.guildId);
        let replyPayload = cv2.success('Track Queued', res.message);
        if (cfg.musicChannelId && interaction.channelId !== cfg.musicChannelId) {
          replyPayload = cv2.success('Track Queued', res.message + `\n\n-# **[Control Playback Here](https://discord.com/channels/${interaction.guild.id}/${cfg.musicChannelId})**\n-# If you want to pause, skip, or change volume, head over to <#${cfg.musicChannelId}>!`);
        }
        interaction.editReply(replyPayload);
      } else {
        interaction.editReply(cv2.danger('Error', res.message));
      }
    }
  }
];

async function setupMusicChannel(guild, commandChannel, imageUrl, interaction = null) {
  try {
    const channel = await guild.channels.create({
      name: 'music-requests',
      type: ChannelType.GuildText,
      topic: 'Type a song name or URL to play music. Do not chat here.'
    });
    
    const cfg = db.getGuildConfig(guild.id);
    const coverImage = imageUrl || 'https://i.imgur.com/8Qj85vP.gif'; // Default aesthetic GIF
    
    const playerEmbed = new EmbedBuilder()
      .setColor(cfg.accentColor || '#ff0000')
      .setAuthor({ name: 'Compact Music Player', iconURL: global.client?.user?.displayAvatarURL() })
      .setImage(coverImage);
      
    let desc = '⸻ Welcome to the Athena Prime Music Console, your dedicated gateway to a seamless, premium, and uninterrupted high-fidelity audio experience. ⸻\n\n';
    desc += '**⸻ CORE CAPABILITIES**\n\n';
    desc += '• **Instant Playback:** Lightning-fast audio streaming initialization.\n';
    desc += '• **Unrestricted Access:** Unlimited song requests and playlist support.\n';
    desc += '• **High-Fidelity Audio:** Crystal-clear streaming resolution.\n';
    desc += '• **Advanced Queue Management:** Organize, skip, and manage your tracks.\n';
    desc += '• **Interactive Interface:** Complete control via tactile dashboard buttons.\n';
    desc += '• **Seamless Integration:** Automatic synchronization with your Voice Channels.\n\n';
    desc += '**⸻ INSTRUCTIONS**\n\n';
    desc += '» **Join** any active voice channel.\n';
    desc += '» **Search** by typing a song name or pasting a URL directly in this channel.\n';
    desc += '» **Control** your playback using the module below.\n\n';
    desc += '**Status:** ⸻ Ready to play';
    
    playerEmbed.setDescription(desc);
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('music_play').setLabel('Play').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('music_pause').setLabel('Pause').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('music_skip').setLabel('Skip').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('music_queue').setLabel('Queue').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('music_stop').setLabel('Stop').setStyle(ButtonStyle.Secondary)
    );
    
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('music_repeat').setLabel('Repeat: OFF').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('music_lyrics').setLabel('Lyrics').setStyle(ButtonStyle.Secondary)
    );
    
    const message = await channel.send({ embeds: [playerEmbed], components: [row, row2] });
    
    db.updateGuildConfig(guild.id, {
      musicChannelId: channel.id,
      musicMessageId: message.id,
      musicCoverImage: coverImage
    });
    
    const successPayload = cv2.success('Music Setup Complete', `Created ${channel} and posted the Compact Music Player interface.`);
    if (interaction) {
      await interaction.editReply(successPayload);
    } else {
      await commandChannel.send(successPayload);
    }
    
  } catch (err) {
    console.error('Setup music error:', err);
    const failPayload = cv2.danger('<:off:1533844858983157851> Failed', 'Could not create the channel. Please check my permissions.');
    if (interaction) {
      await interaction.editReply(failPayload);
    } else {
      await commandChannel.send(failPayload);
    }
  }
}
