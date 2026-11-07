import { MessageFlags } from 'discord.js';
import cv2 from '../cv2.js';
import db from '../database.js';
import { 
  TICK_EMOJI, 
  WRONG_EMOJI, 
  WARN_EMOJI, 
  BULLET_EMOJI, 
  UPTIME_EMOJI, 
  getRandomHeadingGlyph 
} from '../utils/emojis.js';
import { 
  playSoundEffect, 
  startRadioStream, 
  stopVoicePlayback, 
  buildSoundboardPanel, 
  BUILTIN_SFX, 
  RADIO_STATIONS 
} from '../utils/soundboardEngine.js';

export const commands = [
  // --- SOUNDBOARD PANEL ---
  {
    name: 'soundboard',
    aliases: ['sfxdeck', 'sounds'],
    description: 'Open the interactive voice soundboard control deck with 1-click sound triggers',
    category: 'voice',

    async executePrefix(message) {
      const payload = buildSoundboardPanel(message.guild);
      return message.reply(payload);
    },

    async executeSlash(interaction) {
      const payload = buildSoundboardPanel(interaction.guild);
      return interaction.reply(payload);
    }
  },

  // --- PLAY SFX ---
  {
    name: 'sfx',
    aliases: ['playsound', 'playsfx'],
    description: 'Play a short sound effect into your current voice channel',
    category: 'voice',
    options: [
      { name: 'sound', description: 'Name of the sound (e.g. airhorn, vineboom, bruh, fbi)', type: 3, required: true }
    ],

    async executePrefix(message, args) {
      const voiceChannel = message.member?.voice?.channel;
      if (!voiceChannel) {
        return message.reply(cv2.warn(
          `Voice Channel Required | ${WARN_EMOJI}`,
          `You must join a voice channel so Athena can play the sound effect!`
        ));
      }

      const soundName = args[0];
      if (!soundName) {
        const list = Object.keys(BUILTIN_SFX).map(k => `\`${k}\``).join(', ');
        return message.reply(cv2.panel(
          `Available Sound Effects | ${TICK_EMOJI}`,
          `**Usage:** \`!sfx <name>\`\n\n` +
          `**__Built-in SFX:__**\n${list}\n\n` +
          `Or open the full interactive deck with \`!soundboard\`!`
        ));
      }

      const res = await playSoundEffect(voiceChannel, soundName);
      if (!res.success) {
        return message.reply(cv2.warn(
          `Sound Not Found | ${WARN_EMOJI}`,
          `Could not locate sound effect \`${soundName}\`. Run \`!sfx\` to view available sounds.`
        ));
      }

      return message.reply({
        content: `-# <a:03_tick_circle:1565665642084827206> Playing **${res.sound.name}** in <#${voiceChannel.id}>!`
      });
    },

    async executeSlash(interaction) {
      const voiceChannel = interaction.member?.voice?.channel;
      if (!voiceChannel) {
        return interaction.reply({
          ...cv2.warn(`Voice Channel Required | ${WARN_EMOJI}`, `You must join a voice channel so Athena can play the sound effect!`),
          flags: MessageFlags.Ephemeral
        });
      }

      const soundName = interaction.options.getString('sound');
      await interaction.deferReply();
      const res = await playSoundEffect(voiceChannel, soundName);
      if (!res.success) {
        return interaction.editReply(
          cv2.warn(`Sound Not Found | ${WARN_EMOJI}`, `Could not locate sound effect \`${soundName}\`. Run \`!sfx\` to view available sounds.`)
        );
      }

      return interaction.editReply({
        content: `-# <a:03_tick_circle:1565665642084827206> Playing **${res.sound.name}** in <#${voiceChannel.id}>!`
      });
    }
  },

  // --- RADIO / LO-FI ---
  {
    name: 'radio',
    aliases: ['lofi', 'synthwave'],
    description: 'Stream continuous 24/7 Lo-Fi, Synthwave, or Anime OST radio in your voice channel',
    category: 'voice',
    options: [
      { name: 'station', description: 'Station name (lofi, synthwave, anime, chill)', type: 3, required: false }
    ],

    async executePrefix(message, args) {
      const voiceChannel = message.member?.voice?.channel;
      if (!voiceChannel) {
        return message.reply(cv2.warn(
          `Voice Channel Required | ${WARN_EMOJI}`,
          `You must join a voice channel to start the radio stream!`
        ));
      }

      const stationKey = (args[0] || 'lofi').toLowerCase();
      const res = await startRadioStream(voiceChannel, stationKey);

      return message.reply(cv2.success(
        `Radio Streaming | ${TICK_EMOJI}`,
        `Now streaming **${res.station.name}** in <#${voiceChannel.id}>!\n` +
        `Enjoy 24/7 background beats. Run \`!stopsound\` to disconnect.`
      ));
    },

    async executeSlash(interaction) {
      const voiceChannel = interaction.member?.voice?.channel;
      if (!voiceChannel) {
        return interaction.reply({
          ...cv2.warn(`Voice Channel Required | ${WARN_EMOJI}`, `You must join a voice channel to start the radio stream!`),
          flags: MessageFlags.Ephemeral
        });
      }

      const stationKey = (interaction.options.getString('station') || 'lofi').toLowerCase();
      await interaction.deferReply();
      const res = await startRadioStream(voiceChannel, stationKey);

      return interaction.editReply(cv2.success(
        `Radio Streaming | ${TICK_EMOJI}`,
        `Now streaming **${res.station.name}** in <#${voiceChannel.id}>!\n` +
        `Enjoy 24/7 background beats. Run \`!stopsound\` to disconnect.`
      ));
    }
  },

  // --- UPLOAD CUSTOM SOUND ---
  {
    name: 'uploadsound',
    aliases: ['addsound'],
    description: 'Upload a custom server sound effect (.mp3 or URL) to the server soundboard',
    category: 'voice',
    options: [
      { name: 'name', description: 'Name identifier for the sound', type: 3, required: true },
      { name: 'url', description: 'Direct audio URL (or attach an .mp3)', type: 3, required: false }
    ],

    async executePrefix(message, args) {
      const name = args[0];
      if (!name) {
        return message.reply(cv2.warn(
          `Name Required | ${WARN_EMOJI}`,
          `Usage: \`!uploadsound <name> [url/attachment]\`.`
        ));
      }

      let audioUrl = args[1];
      if (!audioUrl && message.attachments.first()) {
        audioUrl = message.attachments.first().url;
      }

      if (!audioUrl || !/^https?:\/\//i.test(audioUrl)) {
        return message.reply(cv2.warn(
          `Audio File Required | ${WARN_EMOJI}`,
          `Please provide a valid direct audio URL or attach an \`.mp3\`/\`.wav\` file!`
        ));
      }

      const sound = db.addServerSound(message.guild.id, name, audioUrl, message.author.id);
      return message.reply(cv2.success(
        `Sound Added | ${TICK_EMOJI}`,
        `Successfully added custom sound **\`${sound.name}\`** to the server soundboard!\n` +
        `Play it anytime with \`!sfx ${sound.name}\`.`
      ));
    },

    async executeSlash(interaction) {
      const name = interaction.options.getString('name');
      const audioUrl = interaction.options.getString('url');

      if (!audioUrl || !/^https?:\/\//i.test(audioUrl)) {
        return interaction.reply({
          ...cv2.warn(`Audio URL Required | ${WARN_EMOJI}`, `Please provide a valid direct audio URL (\`.mp3\`/\`.wav\`).`),
          flags: MessageFlags.Ephemeral
        });
      }

      const sound = db.addServerSound(interaction.guild.id, name, audioUrl, interaction.user.id);
      return interaction.reply(cv2.success(
        `Sound Added | ${TICK_EMOJI}`,
        `Successfully added custom sound **\`${sound.name}\`** to the server soundboard!\n` +
        `Play it anytime with \`!sfx ${sound.name}\`.`
      ));
    }
  },

  // --- STOP SOUND / RADIO ---
  {
    name: 'stopsound',
    aliases: ['stopsfx', 'stopradio'],
    description: 'Stop any active soundboard SFX or radio stream and disconnect Athena from voice',
    category: 'voice',

    async executePrefix(message) {
      const stopped = stopVoicePlayback(message.guild.id);
      if (!stopped) {
        return message.reply(cv2.warn(`Not Active | ${WARN_EMOJI}`, `Athena is not currently playing audio in any voice channel.`));
      }

      return message.reply(cv2.success(`Voice Stopped | ${TICK_EMOJI}`, `Stopped voice playback and disconnected from voice channel.`));
    },

    async executeSlash(interaction) {
      const stopped = stopVoicePlayback(interaction.guild.id);
      if (!stopped) {
        return interaction.reply({
          ...cv2.warn(`Not Active | ${WARN_EMOJI}`, `Athena is not currently playing audio in any voice channel.`),
          flags: MessageFlags.Ephemeral
        });
      }

      return interaction.reply(cv2.success(`Voice Stopped | ${TICK_EMOJI}`, `Stopped voice playback and disconnected from voice channel.`));
    }
  }
];

export default { commands };
