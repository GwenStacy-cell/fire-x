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
  createTicTacToeGame, 
  buildTicTacToePayload, 
  createBlackjackGame, 
  buildBlackjackPayload, 
  fetchTriviaQuestion, 
  createTriviaGame, 
  buildTriviaPayload 
} from '../utils/arcadeEngine.js';

export const commands = [
  // --- TIC TAC TOE ---
  {
    name: 'tictactoe',
    aliases: ['ttt'],
    description: 'Challenge a server member or Athena AI to an interactive game of Tic-Tac-Toe',
    category: 'engagement',
    options: [
      { name: 'opponent', description: 'The member to challenge (leave empty to play against Athena AI)', type: 6, required: false }
    ],

    async executePrefix(message, args) {
      let opponent = message.mentions.users.first();

      if (!opponent && args && args[0]) {
        const firstArg = args[0].toLowerCase().trim();
        if (firstArg === 'ai' || firstArg === 'bot' || firstArg === 'athena' || firstArg === 'solo') {
          opponent = message.client.user;
        } else {
          const cleanId = args[0].replace(/[<@!>]/g, '');
          opponent = message.client.users.cache.get(cleanId) || await message.client.users.fetch(cleanId).catch(() => null);
          if (!opponent && message.guild) {
            const member = message.guild.members.cache.find(m => 
              m.user.username.toLowerCase() === firstArg || 
              m.displayName.toLowerCase() === firstArg
            );
            if (member) opponent = member.user;
          }
        }
      }

      // If no opponent was provided, default to Athena AI
      if (!opponent) {
        opponent = message.client.user;
      }

      if (opponent.id === message.author.id) {
        return message.reply(cv2.warn(
          `Invalid Challenge | ${WARN_EMOJI}`,
          `You cannot play Tic-Tac-Toe against yourself!`
        ));
      }

      const game = createTicTacToeGame(message.guild.id, message.author, opponent);
      const payload = buildTicTacToePayload(game.id);
      return message.reply(payload);
    },

    async executeSlash(interaction) {
      let opponent = interaction.options.getUser('opponent') || interaction.client.user;

      if (opponent.id === interaction.user.id) {
        return interaction.reply({
          ...cv2.warn(`Invalid Challenge | ${WARN_EMOJI}`, `You cannot play Tic-Tac-Toe against yourself!`),
          flags: MessageFlags.Ephemeral
        });
      }

      const game = createTicTacToeGame(interaction.guild.id, interaction.user, opponent);
      const payload = buildTicTacToePayload(game.id);
      return interaction.reply(payload);
    }
  },

  // --- BLACKJACK 21 ---
  {
    name: 'blackjack',
    aliases: ['bj', '21'],
    description: 'Play a game of high-stakes Blackjack against Athena the Dealer',
    category: 'economy',
    options: [
      { name: 'bet', description: 'Coins amount to wager (default: 100)', type: 4, required: false }
    ],

    async executePrefix(message, args) {
      let bet = parseInt(args[0], 10);
      if (isNaN(bet) || bet <= 0) bet = 100;
      if (bet > 1000000) bet = 1000000;

      // Check economy balance if economy is active
      const userEco = db.cache.economy?.[message.guild.id]?.[message.author.id];
      if (userEco && (userEco.wallet || 0) < bet) {
        return message.reply(cv2.warn(
          `Insufficient Balance | ${WARN_EMOJI}`,
          `You only have **${(userEco.wallet || 0).toLocaleString()} coins** in your wallet. Cannot wager **${bet.toLocaleString()} coins**!`
        ));
      }

      const game = createBlackjackGame(message.guild.id, message.author, bet);
      const payload = buildBlackjackPayload(game.id);
      return message.reply(payload);
    },

    async executeSlash(interaction) {
      let bet = interaction.options.getInteger('bet') || 100;
      if (bet <= 0) bet = 100;
      if (bet > 1000000) bet = 1000000;

      const userEco = db.cache.economy?.[interaction.guild.id]?.[interaction.user.id];
      if (userEco && (userEco.wallet || 0) < bet) {
        return interaction.reply({
          ...cv2.warn(`Insufficient Balance | ${WARN_EMOJI}`, `You only have **${(userEco.wallet || 0).toLocaleString()} coins** in your wallet.`),
          flags: MessageFlags.Ephemeral
        });
      }

      const game = createBlackjackGame(interaction.guild.id, interaction.user, bet);
      const payload = buildBlackjackPayload(game.id);
      return interaction.reply(payload);
    }
  },

  // --- TRIVIA ARENA ---
  {
    name: 'trivia',
    aliases: ['quiz', 'brain'],
    description: 'Launch a timed multiplayer trivia question across Anime, Gaming, Tech, and Science',
    category: 'engagement',
    options: [
      { name: 'category', description: 'Trivia category (anime, gaming, tech, movies, all)', type: 3, required: false }
    ],

    async executePrefix(message, args) {
      const category = (args[0] || 'all').toLowerCase();
      const loading = await message.reply({
        content: `-# <a:uptime:1552608831060844575> **Summoning trivia question...**`
      }).catch(() => null);

      try {
        const questionData = await fetchTriviaQuestion(category);
        const game = createTriviaGame(message.guild.id, questionData);
        const payload = buildTriviaPayload(game.id);

        if (loading) await loading.delete().catch(() => {});
        return message.reply(payload);
      } catch (err) {
        console.error('[Trivia Error]:', err);
        const errPayload = cv2.error('Trivia Failed', `Could not fetch question: \`${err.message}\``);
        if (loading) return loading.edit(errPayload);
        return message.reply(errPayload);
      }
    },

    async executeSlash(interaction) {
      const category = (interaction.options.getString('category') || 'all').toLowerCase();
      await interaction.deferReply();

      try {
        const questionData = await fetchTriviaQuestion(category);
        const game = createTriviaGame(interaction.guild.id, questionData);
        const payload = buildTriviaPayload(game.id);
        return interaction.editReply(payload);
      } catch (err) {
        console.error('[TriviaSlash Error]:', err);
        return interaction.editReply(cv2.error('Trivia Failed', `Could not fetch question: \`${err.message}\``));
      }
    }
  },

  // --- ARCADE STATS ---
  {
    name: 'arcadestats',
    aliases: ['gamestats', 'arcadelb'],
    description: 'View your competitive arcade and casino statistics in this server',
    category: 'engagement',
    options: [
      { name: 'user', description: 'View arcade stats for another member', type: 6, required: false }
    ],

    async executePrefix(message, args) {
      const target = message.mentions.users.first() || message.author;
      const stats = db.getArcadeStats(message.guild.id, target.id);

      const ttt = stats?.tictactoe || { wins: 0, losses: 0, ties: 0 };
      const bj = stats?.blackjack || { wins: 0, losses: 0, ties: 0, profit: 0 };
      const trv = stats?.trivia || { wins: 0, correct: 0, total: 0 };

      return message.reply(cv2.panel(
        `Arcade Telemetry Matrix | ${TICK_EMOJI}`,
        `Competitive gaming statistics for <@${target.id}>:\n\n` +
        `**__Tic-Tac-Toe:__**\n` +
        `${BULLET_EMOJI} **Wins:** \`${ttt.wins}\` \u00b7 **Losses:** \`${ttt.losses}\` \u00b7 **Draws:** \`${ttt.ties}\`\n\n` +
        `**__Blackjack Casino:__**\n` +
        `${BULLET_EMOJI} **Wins:** \`${bj.wins}\` \u00b7 **Losses:** \`${bj.losses}\` \u00b7 **Net Earnings:** \`${(bj.profit || 0).toLocaleString()} Coins\`\n\n` +
        `**__Trivia Arena:__**\n` +
        `${BULLET_EMOJI} **Correct Answers:** \`${trv.correct}\` questions nailed`
      ));
    },

    async executeSlash(interaction) {
      const target = interaction.options.getUser('user') || interaction.user;
      const stats = db.getArcadeStats(interaction.guild.id, target.id);

      const ttt = stats?.tictactoe || { wins: 0, losses: 0, ties: 0 };
      const bj = stats?.blackjack || { wins: 0, losses: 0, ties: 0, profit: 0 };
      const trv = stats?.trivia || { wins: 0, correct: 0, total: 0 };

      return interaction.reply(cv2.panel(
        `Arcade Telemetry Matrix | ${TICK_EMOJI}`,
        `Competitive gaming statistics for <@${target.id}>:\n\n` +
        `**__Tic-Tac-Toe:__**\n` +
        `${BULLET_EMOJI} **Wins:** \`${ttt.wins}\` \u00b7 **Losses:** \`${ttt.losses}\` \u00b7 **Draws:** \`${ttt.ties}\`\n\n` +
        `**__Blackjack Casino:__**\n` +
        `${BULLET_EMOJI} **Wins:** \`${bj.wins}\` \u00b7 **Losses:** \`${bj.losses}\` \u00b7 **Net Earnings:** \`${(bj.profit || 0).toLocaleString()} Coins\`\n\n` +
        `**__Trivia Arena:__**\n` +
        `${BULLET_EMOJI} **Correct Answers:** \`${trv.correct}\` questions nailed`
      ));
    }
  }
];

export default { commands };
