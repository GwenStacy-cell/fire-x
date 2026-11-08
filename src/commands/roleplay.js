import { 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder,
  MessageFlags 
} from 'discord.js';
import db from '../database.js';
import { 
  TICK_EMOJI, 
  WRONG_EMOJI, 
  WARN_EMOJI, 
  BULLET_EMOJI, 
  getRandomHeadingGlyph 
} from '../utils/emojis.js';
import { 
  ROLEPLAY_ACTIONS, 
  ACTION_MAP, 
  buildRoleplayPayload, 
  buildDuoAffinityPayload, 
  buildUserProfilePayload, 
  buildLeaderboardPayload, 
  buildCatalogPayload, 
  buildRoutesStatusPayload,
  handleRoleplayButton as engineHandleButton 
} from '../utils/roleplayEngine.js';

export const handleRoleplayButton = engineHandleButton;

// =========================================================================
// 1. MAIN ROLEPLAY MASTER COMMAND (`!rp` / `/rp`)
// =========================================================================
const masterRoleplayCommand = {
  name: 'roleplay',
  aliases: ['rp', 'rplay'],
  description: 'Athena Roleplay Engine: actions, duo affinity matrix, profiles, and marriages.',
  category: 'roleplay',
  options: [
    {
      name: 'subcommand',
      description: 'The roleplay action or view to execute',
      type: 3, // STRING
      required: false,
      choices: [
        { name: 'Actions Catalog', value: 'actions' },
        { name: 'My Profile', value: 'profile' },
        { name: 'Duo Affinity Matrix', value: 'duo' },
        { name: 'Leaderboard', value: 'top' },
        { name: 'GIF Routes & Providers', value: 'routes' },
        { name: 'Marriage Status', value: 'marriage' },
        { name: 'Help', value: 'help' }
      ]
    },
    {
      name: 'target',
      description: 'The user to target or inspect',
      type: 6, // USER
      required: false
    }
  ],

  async executePrefix(message, args) {
    const sub = (args[0] || 'help').toLowerCase();

    // 1. Actions Catalog / List
    if (sub === 'actions' || sub === 'list' || sub === 'catalog') {
      const catFilter = args[1] || null;
      const payload = buildCatalogPayload(catFilter);
      return message.reply(payload);
    }

    // 2. User Profile / Stats
    if (sub === 'profile' || sub === 'stats' || sub === 'me') {
      let targetUser = message.mentions.users.first();
      if (!targetUser && args[1]) {
        const cleanId = args[1].replace(/[^0-9]/g, '');
        if (cleanId) {
          targetUser = await message.client.users.fetch(cleanId).catch(() => null);
        }
      }
      if (!targetUser) targetUser = message.author;
      const payload = await buildUserProfilePayload(message.guild, targetUser);
      return message.reply(payload);
    }

    // 3. Custom Bio Setter
    if (sub === 'bio' || sub === 'setbio') {
      const bioText = args.slice(1).join(' ').trim();
      if (!bioText) {
        return message.reply({
          content: `-# ${WARN_EMOJI} **Please provide a bio text!** Example: \`!rp bio Always ready to cuddle and protect.\``
        });
      }
      db.setRoleplayBio(message.guild.id, message.author.id, bioText);
      return message.reply({
        content: `-# ${TICK_EMOJI} **Updated your roleplay profile bio:**\n> *"${bioText.slice(0, 150)}"*`
      });
    }

    // 4. Duo Affinity Matrix
    if (sub === 'duo' || sub === 'affinity' || sub === 'matrix' || sub === 'bond') {
      let targetUser = message.mentions.users.first();
      if (!targetUser && args[1]) {
        const cleanId = args[1].replace(/[^0-9]/g, '');
        if (cleanId) {
          targetUser = await message.client.users.fetch(cleanId).catch(() => null);
        }
      }
      if (!targetUser || targetUser.id === message.author.id) {
        return message.reply({
          content: `-# ${WARN_EMOJI} **Please mention another member to inspect your affinity matrix!** Example: \`!rp duo @user\``
        });
      }

      const payload = await buildDuoAffinityPayload(message.guild, message.author, targetUser);
      return message.reply(payload);
    }

    // 5. Server Leaderboard
    if (sub === 'top' || sub === 'leaderboard' || sub === 'lb') {
      const lbType = (args[1] || 'overall').toLowerCase();
      const payload = await buildLeaderboardPayload(message.guild, lbType);
      return message.reply(payload);
    }

    // 6. GIF Routes & Providers Status
    if (sub === 'routes' || sub === 'engines' || sub === 'providers' || sub === 'sources') {
      const payload = buildRoutesStatusPayload();
      return message.reply(payload);
    }

    // 6. Marriage Proposal
    if (sub === 'marry' || sub === 'propose') {
      let targetUser = message.mentions.users.first();
      if (!targetUser && args[1]) {
        const cleanId = args[1].replace(/[^0-9]/g, '');
        if (cleanId) {
          targetUser = await message.client.users.fetch(cleanId).catch(() => null);
        }
      }

      if (!targetUser || targetUser.id === message.author.id) {
        return message.reply({
          content: `-# ${WARN_EMOJI} **Please mention someone you want to propose to!** Example: \`!rp marry @user\``
        });
      }

      if (targetUser.bot) {
        return message.reply({
          content: `-# ${WARN_EMOJI} **Athena and her fellow bots are already married to their defense duties!**`
        });
      }

      // Check existing marriage for author
      const authorMarriage = db.getMarriage(message.guild.id, message.author.id);
      if (authorMarriage) {
        return message.reply({
          content: `-# ${WRONG_EMOJI} **You are already married to <@${authorMarriage.partnerId}>!** You must divorce first using \`!rp divorce\` before proposing again.`
        });
      }

      // Check existing marriage for target
      const targetMarriage = db.getMarriage(message.guild.id, targetUser.id);
      if (targetMarriage) {
        return message.reply({
          content: `-# ${WRONG_EMOJI} **<@${targetUser.id}> is already married to <@${targetMarriage.partnerId}>!**`
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0xFF70A6)
        .setTitle(`${getRandomHeadingGlyph()} A Royal Proposal | ${TICK_EMOJI}`)
        .setDescription(
          `💍 **<@${message.author.id}> has dropped down on one knee and proposed to <@${targetUser.id}>!**\n\n` +
          `${BULLET_EMOJI} *"Will you walk by my side through all battles, roleplays, and seasons?"*\n\n` +
          `-# <@${targetUser.id}>, choose your response below:`
        )
        .setImage('https://nekos.best/api/v2/hug/2c898eb2-71a0-4cf2-a79c-176510764d80.gif')
        .setFooter({ text: 'Athena Roleplay & Affinity Matrix • V2.0' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`rp_marry_accept_${targetUser.id}_${message.author.id}`)
          .setLabel('Yes, I Accept! 💍')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`rp_marry_reject_${targetUser.id}_${message.author.id}`)
          .setLabel('Decline 💔')
          .setStyle(ButtonStyle.Danger)
      );

      return message.reply({ embeds: [embed], components: [row] });
    }

    // 7. Divorce
    if (sub === 'divorce') {
      const marriage = db.getMarriage(message.guild.id, message.author.id);
      if (!marriage) {
        return message.reply({
          content: `-# ${WARN_EMOJI} **You are currently not married to anyone in this server.**`
        });
      }

      db.divorceMarriage(message.guild.id, message.author.id);
      const embed = new EmbedBuilder()
        .setColor(0x6C757D)
        .setTitle(`${getRandomHeadingGlyph()} Formal Separation | ${TICK_EMOJI}`)
        .setDescription(
          `💔 **<@${message.author.id}> and <@${marriage.partnerId}> have officially parted ways and signed divorce papers.**\n\n` +
          `The diamond rings have been returned to the vault. Both members are now single.`
        )
        .setFooter({ text: 'Athena Roleplay & Affinity Matrix • V2.0' });

      return message.reply({ embeds: [embed] });
    }

    // 8. Help Menu (Default)
    const helpEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`${getRandomHeadingGlyph()} Athena Roleplay & Affinity Engine | ${TICK_EMOJI}`)
      .setDescription(
        `Welcome to the expanded **Athena Roleplay & Affinity Matrix**! Engage in 54+ interactive anime actions with automated bidirectional counter buttons, track relationship affinity, build roleplay profiles, and propose marriage.\n\n` +
        `**__Core Roleplay Commands:__**\n` +
        `${BULLET_EMOJI} \`!rp actions [category]\` — Browse all 54+ actions (Affection, Playful, Combat, Reactions)\n` +
        `${BULLET_EMOJI} \`!rp profile [@user]\` — View complete roleplay stats, top partners, and bio\n` +
        `${BULLET_EMOJI} \`!rp bio <text>\` — Set your custom roleplay bio card description\n` +
        `${BULLET_EMOJI} \`!rp duo @user\` — View relationship affinity matrix, bond level, and top shared actions\n` +
        `${BULLET_EMOJI} \`!rp top [overall|duos|<action>]\` — View server roleplay leaderboards\n` +
        `${BULLET_EMOJI} \`!rp routes\` — View active federated GIF providers (Klipy, Nekos Best, OtakuGifs, Purrbot, etc.)\n` +
        `${BULLET_EMOJI} \`!rp marry @user\` — Propose marriage with interactive Accept/Decline buttons\n` +
        `${BULLET_EMOJI} \`!rp divorce\` — Part ways and dissolve marriage status\n\n` +
        `**__Quick Action Examples:__**\n` +
        `\`!hug @user\` · \`!kiss @user\` · \`!pat @user\` · \`!slap @user\` · \`!cuddle @user\` · \`!bonk @user\`\n` +
        `*Each action offers interactive counter buttons for the target to react instantly!*`
      )
      .setFooter({ text: 'Athena Roleplay & Affinity Matrix • V2.0' });

    return message.reply({ embeds: [helpEmbed] });
  },

  async executeSlash(interaction) {
    const sub = interaction.options.getString('subcommand') || 'help';
    const targetUser = interaction.options.getUser('target');

    if (sub === 'actions') {
      const payload = buildCatalogPayload();
      return interaction.reply(payload);
    }
    if (sub === 'profile') {
      const u = targetUser || interaction.user;
      const payload = await buildUserProfilePayload(interaction.guild, u);
      return interaction.reply(payload);
    }
    if (sub === 'duo') {
      if (!targetUser || targetUser.id === interaction.user.id) {
        return interaction.reply({
          content: `-# ${WARN_EMOJI} **Please select another member to view your duo affinity matrix!**`,
          flags: MessageFlags.Ephemeral
        });
      }
      const payload = await buildDuoAffinityPayload(interaction.guild, interaction.user, targetUser);
      return interaction.reply(payload);
    }
    if (sub === 'top') {
      const payload = await buildLeaderboardPayload(interaction.guild, 'overall');
      return interaction.reply(payload);
    }
    if (sub === 'routes') {
      const payload = buildRoutesStatusPayload();
      return interaction.reply(payload);
    }

    const helpEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`${getRandomHeadingGlyph()} Athena Roleplay & Affinity Engine | ${TICK_EMOJI}`)
      .setDescription(
        `Welcome to the expanded **Athena Roleplay & Affinity Matrix**! Engage in 54+ interactive anime actions with automated bidirectional counter buttons, track relationship affinity, build roleplay profiles, and propose marriage.\n\n` +
        `${BULLET_EMOJI} Use \`!rp actions\` to view all commands.\n` +
        `${BULLET_EMOJI} Use \`!hug @user\` or \`!pat @user\` to start interacting!`
      )
      .setFooter({ text: 'Athena Roleplay & Affinity Matrix • V2.0' });

    return interaction.reply({ embeds: [helpEmbed] });
  }
};

// =========================================================================
// 2. CONVENIENCE STANDALONE COMMANDS (`!marry`, `!divorce`, `!affinity`, `!rpstats`)
// =========================================================================
const standaloneMarry = {
  name: 'marry',
  aliases: ['propose'],
  description: 'Propose marriage to a special someone in the server!',
  category: 'roleplay',
  async executePrefix(message, args) {
    return masterRoleplayCommand.executePrefix(message, ['marry', ...args]);
  }
};

const standaloneDivorce = {
  name: 'divorce',
  description: 'Divorce your current roleplay spouse.',
  category: 'roleplay',
  async executePrefix(message, args) {
    return masterRoleplayCommand.executePrefix(message, ['divorce', ...args]);
  }
};

const standaloneAffinity = {
  name: 'affinity',
  aliases: ['duo', 'bond'],
  description: 'Inspect your relationship matrix and bond level with another user.',
  category: 'roleplay',
  async executePrefix(message, args) {
    return masterRoleplayCommand.executePrefix(message, ['duo', ...args]);
  }
};

const standaloneProfile = {
  name: 'rpstats',
  aliases: ['rpprofile'],
  description: 'View your roleplay activity profile and top partners.',
  category: 'roleplay',
  async executePrefix(message, args) {
    return masterRoleplayCommand.executePrefix(message, ['profile', ...args]);
  }
};

const standaloneRoutes = {
  name: 'rproutes',
  aliases: ['routes', 'gifroutes'],
  description: 'View active federated GIF providers & health telemetry.',
  category: 'roleplay',
  async executePrefix(message, args) {
    return masterRoleplayCommand.executePrefix(message, ['routes', ...args]);
  }
};

// =========================================================================
// 3. DYNAMIC GENERATION OF ALL 54+ INDIVIDUAL ACTION COMMANDS
// =========================================================================
const RP_SLASH_CONFLICT_ACTIONS = new Set(['kick', 'hide', 'ban', 'mute', 'warn', 'timeout', 'lock', 'unlock', 'purge', 'clear']);

const dynamicActionCommands = ROLEPLAY_ACTIONS.map(action => ({
  name: action.id,
  description: `Roleplay: ${action.name} someone!`,
  category: 'roleplay',
  slashHidden: RP_SLASH_CONFLICT_ACTIONS.has(action.id),
  options: [
    {
      name: 'user',
      description: `The user to ${action.name.toLowerCase()}`,
      type: 6, // USER
      required: false
    }
  ],
  async executePrefix(message, args) {
    let target = message.mentions.users.first();
    if (!target && args[0]) {
      const cleanId = args[0].replace(/[^0-9]/g, '');
      if (cleanId) {
        target = await message.client.users.fetch(cleanId).catch(() => null);
      }
    }

    const payload = await buildRoleplayPayload(message.guild, message.author, target, action.id);
    return message.reply(payload);
  },
  async executeSlash(interaction) {
    const target = interaction.options.getUser('user');
    const payload = await buildRoleplayPayload(interaction.guild, interaction.user, target, action.id);
    return interaction.reply(payload);
  }
}));

// Export all commands combined
export const commands = [
  masterRoleplayCommand,
  standaloneMarry,
  standaloneDivorce,
  standaloneAffinity,
  standaloneProfile,
  standaloneRoutes,
  ...dynamicActionCommands
];

export default commands;
