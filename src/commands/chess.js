import { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags, EmbedBuilder } from 'discord.js';
import { Chess } from 'chess.js';
import cv2 from '../cv2.js';
import db from '../database.js';
import { isExtraOwnerOrHigher } from '../utils/helpers.js';

const TICK = '<a:atheNATICK:1557841381630681106>';
const UPTIME = '<a:uptime:1552608831060844575>';

export const CHESS_ENGINES = {
  stockfish_16: {
    id: 'stockfish_16',
    name: 'Stockfish 16.1',
    label: 'Stockfish 16.1 (Ultra GM • 3550 ELO)',
    description: 'The peak of open-source chess calculation at maximum depth.',
    elo: 3550,
    depth: 15,
    blunderRate: 0,
    aliases: ['stockfish', 'sf', 'stockfish16', 'sf16']
  },
  mittens: {
    id: 'mittens',
    name: 'Mittens 🐾',
    label: 'Mittens 🐾 (Menace Cat • 3600+ ELO)',
    description: "Chess.com's sinister cat bot that consumes all human hope.",
    elo: 3600,
    depth: 15,
    blunderRate: 0,
    aliases: ['mittens', 'cat', 'meow'],
    quotes: [
      "*meow* All pawns must eventually fall into the void.",
      "*purrs darkly* You cannot escape the infinite darkness of this board, mortal.",
      "Meow. Did you truly believe your king was safe? *twitch*",
      "*licks paw* Your pieces are mere yarn to be unraveled.",
      "I have seen the end of all worlds, and you are checkmated in all of them. *meow*",
      "*soft sinister purr* Another piece sacrificed to my eternal hunger.",
      "Meow... Time moves forward, but your position only collapses.",
      "*stares unblinkingly into your soul* Your king is already trapped."
    ]
  },
  alphazero: {
    id: 'alphazero',
    name: 'AlphaZero',
    label: 'AlphaZero (DeepMind • 3500 ELO)',
    description: 'DeepMind neural net known for intuitive sacrifices and piece activity.',
    elo: 3500,
    depth: 14,
    blunderRate: 0,
    aliases: ['alphazero', 'alpha', 'deepmind'],
    quotes: [
      "Intuitive dynamic sacrifice calculated. Harmonic equilibrium shifted.",
      "Positional balance disrupted. Long-term spatial constriction active.",
      "Neural network prioritizes king mobility over static material.",
      "Asymmetrical piece pressure converging on central squares.",
      "Dynamic activity exceeds static material evaluation."
    ]
  },
  torch: {
    id: 'torch',
    name: 'Torch 1.0',
    label: 'Torch 1.0 (Chess.com • 3420 ELO)',
    description: "Chess.com's aggressive engine that hunts enemy kings relentlessly.",
    elo: 3420,
    depth: 14,
    blunderRate: 0,
    aliases: ['torch', 'torch1'],
    quotes: [
      "Attack vector computed. King hunting sequence initialized!",
      "Central breakthrough imminent. Defense lines breached.",
      "Overwhelming tactical aggression unleashed on your flanks.",
      "Calculated king assault in progress. No retreat available."
    ]
  },
  leela: {
    id: 'leela',
    name: 'Leela Chess Zero (LCZero)',
    label: 'Leela Chess Zero (Neural Net • 3450 ELO)',
    description: 'Self-learning open-source neural network with supreme positional squeezing.',
    elo: 3450,
    depth: 13,
    blunderRate: 0,
    aliases: ['leela', 'lczero', 'lc0'],
    quotes: [
      "Prophylactic piece maneuvering completed. Total board squeeze.",
      "Monte Carlo Tree Search converges on structural weakness.",
      "Constricting square access with zero counterplay permitted.",
      "Neural weights verify overwhelming positional dominance."
    ]
  },
  stockfish_15: {
    id: 'stockfish_15',
    name: 'Stockfish 15',
    label: 'Stockfish 15 (Grandmaster • 3200 ELO)',
    description: 'High-speed classic NNUE engine calculating razor-sharp lines.',
    elo: 3200,
    depth: 12,
    blunderRate: 0,
    aliases: ['stockfish15', 'sf15']
  },
  komodo: {
    id: 'komodo',
    name: 'Komodo Dragon 3.3',
    label: 'Komodo Dragon 3.3 (World Champ • 3350 ELO)',
    description: 'Former computer world champion blending positional mastery & tactics.',
    elo: 3350,
    depth: 13,
    blunderRate: 0,
    aliases: ['komodo', 'dragon']
  },
  magnus: {
    id: 'magnus',
    name: 'Magnus Carlsen AI',
    label: 'Magnus Carlsen AI (Champion • 2882 ELO)',
    description: "Emulates the GOAT's legendary endgame grinding and piece harmony.",
    elo: 2882,
    depth: 12,
    blunderRate: 0,
    aliases: ['magnus', 'carlsen'],
    quotes: [
      "Just grinding an endgame win. Nothing fancy.",
      "Taking away all your counterplay move by move.",
      "You made one tiny inaccuracy 15 moves ago. That's enough.",
      "Simple, solid, completely winning."
    ]
  },
  hikaru: {
    id: 'hikaru',
    name: 'Hikaru Nakamura AI',
    label: 'Hikaru Nakamura AI (Blitz King • 2875 ELO)',
    description: 'Lightning-fast tactical fireworks and venomous king attacks.',
    elo: 2875,
    depth: 11,
    blunderRate: 0,
    aliases: ['hikaru', 'nakamura'],
    quotes: [
      "Takes, takes, takes, and then queen goes here... it's just completely winning.",
      "Chat, is this move completely winning? Yeah it is.",
      "Literally free pieces. I'm just gonna premove.",
      "Wait, did they actually play that? Oh wow, okay, thanks for the win."
    ]
  },
  stockfish_11: {
    id: 'stockfish_11',
    name: 'Stockfish 11',
    label: 'Stockfish 11 (Master • 2500 ELO)',
    description: 'Accessible classical engine for competitive club-level play.',
    elo: 2500,
    depth: 8,
    blunderRate: 0,
    aliases: ['stockfish11', 'sf11']
  },
  martin: {
    id: 'martin',
    name: 'Martin',
    label: 'Martin (Chess.com Coach • 250 ELO)',
    description: 'Beloved goofy dad bot that blunders pieces and loves making friends.',
    elo: 250,
    depth: 2,
    blunderRate: 0.65,
    aliases: ['martin', 'dad'],
    quotes: [
      "Oops! My kids told me not to move that, but I did it anyway!",
      "I have no idea what I'm doing, but hey, chess is fun!",
      "Wait, was that pawn protecting my queen? Oh boy...",
      "Is this checkmate? No? Just checking!",
      "My dog nudged my mouse! That's why I played that!",
      "Look, I moved a piece! That counts as progress, right?"
    ]
  }
};

export function resolveChessEngine(input) {
  if (!input) return null;
  const clean = input.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
  for (const [key, engine] of Object.entries(CHESS_ENGINES)) {
    if (key === clean || engine.id === clean) return engine;
    if (engine.aliases && engine.aliases.includes(clean)) return engine;
  }
  return null;
}

const THEMES = [
  { label: 'Tournament Green', value: 'tournament' },
  { label: 'Walnut Wood', value: 'walnut' },
  { label: 'Glass Board', value: 'glass' },
  { label: 'Burled Wood', value: 'burled_wood' },
  { label: 'Icy Sea', value: 'icy_sea' },
  { label: 'Bases', value: 'bases' },
  { label: '8-Bit Retro', value: '8_bit' },
  { label: 'Marble Texture', value: 'marble' },
  { label: 'Sky Blue', value: 'sky' },
  { label: 'Stone Texture', value: 'stone' },
  { label: 'Classic Brown', value: 'brown' },
  { label: 'Classic Green', value: 'green' },
  { label: 'Parchment', value: 'parchment' },
  { label: 'Lolz (Meme)', value: 'lolz' },
  { label: 'Graffiti', value: 'graffiti' },
  { label: 'Neon', value: 'neon' },
  { label: 'Dark Wood', value: 'dark' },
  { label: 'Nature', value: 'nature' },
  { label: 'Ocean', value: 'ocean' },
  { label: 'Newspaper', value: 'newspaper' }
];

export const commands = [
  {
    name: 'chess',
    description: 'Play a game of Chess against Advanced AI Engines (Stockfish, Mittens, AlphaZero, Torch, Leela, etc.) or a friend!',
    category: 'community',
    aliases: ['chessgame'],
    permissions: [],
    async executePrefix(message, args) {
      const client = message.client;
      if (!client.chessGames) client.chessGames = new Map();
      const cfg = message.guild ? db.getGuildConfig(message.guild.id) : null;
      const prefix = cfg?.prefix || '!';

      if (!args[0]) {
        const defaultEngineKey = cfg?.chessEngine || 'stockfish_16';
        const defaultEngine = CHESS_ENGINES[defaultEngineKey] || CHESS_ENGINES.stockfish_16;
        return message.reply(cv2.info('Athena Grandmaster Chess', 
          `### Available Chess Commands | ${TICK}\n` +
          `-# \`${prefix}chess ai [bot]\` - Challenge an AI engine (default: **${defaultEngine.name}**)\n` +
          `-# \`${prefix}chess engine\` - Open interactive engine selector dropdown\n` +
          `-# \`${prefix}chess @user\` - Challenge a friend to a PVP match\n` +
          `-# \`${prefix}chess theme\` - Customize board aesthetic\n` +
          `-# \`${prefix}chess stop\` - Resign / terminate active match\n\n` +
          `> -# <a:uptime:1552608831060844575> **Roster:** Stockfish 16.1, Mittens 🐾, AlphaZero, Torch 1.0, Leela (LCZero), Stockfish 15, Komodo Dragon, Magnus Carlsen, Hikaru Nakamura, Stockfish 11, Martin`
        ));
      }

      const sub = args[0].toLowerCase();

      // --- SUBCOMMAND: ENGINE SELECTOR DROPDOWN ---
      if (sub === 'engine' || sub === 'engines' || sub === 'bot' || sub === 'bots' || sub === 'select') {
        const currentEngineKey = cfg?.chessEngine || 'stockfish_16';
        const currentEngine = CHESS_ENGINES[currentEngineKey] || CHESS_ENGINES.stockfish_16;

        const options = Object.values(CHESS_ENGINES).map(eng => ({
          label: eng.name,
          value: eng.id,
          description: `${eng.elo} ELO • ${eng.description.slice(0, 50)}`,
          default: eng.id === currentEngineKey
        }));

        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('chess_engine_select')
            .setPlaceholder(`Current: ${currentEngine.name} (${currentEngine.elo} ELO)`)
            .addOptions(options.slice(0, 25))
        );

        const container = {
          type: 17,
          components: [
            { type: 10, content: `## Chess Engine Selector | ${TICK}` },
            { type: 14, divider: true },
            { 
              type: 10, 
              content: 
                `-# **Current Server Engine:** **${currentEngine.name}** (\`${currentEngine.elo} ELO\`)\n` +
                `-# **Description:** ${currentEngine.description}\n\n` +
                `> -# • Selecting an engine updates the active bot for \`${prefix}chess ai\` games in this server.\n` +
                `> -# • Anyone can also challenge any engine directly anytime: \`${prefix}chess ai <bot>\` (e.g. \`${prefix}chess ai mittens\`, \`${prefix}chess ai torch\`, \`${prefix}chess ai alphazero\`, \`${prefix}chess ai martin\`).`
            },
            { type: 14, divider: true },
            row.toJSON()
          ]
        };

        return message.reply({ 
          components: [container], 
          flags: MessageFlags.IsComponentsV2 
        }).catch(async () => {
          await message.reply({ content: `-# **Select your preferred Chess Engine:**`, components: [row] }).catch(() => null);
        });
      }

      // --- SUBCOMMAND: THEMES ---
      if (sub === 'theme' || sub === 'themes') {
        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('chess_theme_select')
            .setPlaceholder('Select a Chessboard Theme...')
            .addOptions(THEMES.slice(0, 20))
        );
        
        const container = {
          type: 17,
          components: [
            { type: 10, content: `## Athena Theme Configuration | ${TICK}` },
            { type: 14, divider: true },
            { type: 10, content: '-# Please select your preferred chessboard aesthetic from the dropdown below.' },
            { type: 14, divider: true },
            row.toJSON()
          ]
        };
        
        return message.reply({ 
          components: [container], 
          flags: MessageFlags.IsComponentsV2 
        }).catch(async () => {
          await message.reply({ content: '-# **Select your preferred Chessboard aesthetic:**', components: [row] }).catch(() => null);
        });
      }

      // --- SUBCOMMAND: STOP / RESIGN ---
      if (sub === 'stop' || sub === 'resign') {
        const game = client.chessGames.get(message.author.id);
        if (!game) return message.reply(cv2.warn('No Active Game', 'You do not have an active chess game.'));
        
        client.chessGames.delete(game.playerWhite);
        if (game.playerBlack !== 'ai') client.chessGames.delete(game.playerBlack);
        
        return message.reply(cv2.success('Game Terminated | <a:atheNATICK:1557841381630681106>', 'You resigned. The chess game has been ended.'));
      }

      if (client.chessGames.has(message.author.id)) {
        return message.reply(cv2.warn('Game in Progress', `You already have an active game! Type \`${prefix}chess stop\` to end it.`));
      }

      const isAI = sub === 'ai' || sub === 'bot' || sub === 'playai';
      const targetUser = message.mentions.users.first();

      if (!isAI && !targetUser) {
        return message.reply(cv2.info('Athena Chess', `Usage:\n\`${prefix}chess ai [bot]\` - Play against an AI engine\n\`${prefix}chess @user\` - Play against a friend\n\`${prefix}chess engine\` - Select default engine`));
      }

      if (targetUser && targetUser.id === message.author.id) {
        return message.reply(cv2.warn('Invalid Target', 'You cannot play against yourself.'));
      }

      if (targetUser && targetUser.bot) {
        return message.reply(cv2.warn('Invalid Target', `You cannot challenge other bots. Use \`${prefix}chess ai\` to challenge Athena's Grandmaster roster!`));
      }

      // Resolve selected engine for AI challenge
      let selectedEngine = CHESS_ENGINES[cfg?.chessEngine || 'stockfish_16'] || CHESS_ENGINES.stockfish_16;
      if (isAI && args[1]) {
        const customEngine = resolveChessEngine(args[1]);
        if (customEngine) {
          selectedEngine = customEngine;
        } else {
          return message.reply(cv2.warn('Unknown Engine', 
            `Engine \`${args[1]}\` not recognized.\n\n` +
            `> **Available Bots:** \`stockfish16\`, \`mittens\`, \`alphazero\`, \`torch\`, \`leela\`, \`stockfish15\`, \`komodo\`, \`magnus\`, \`hikaru\`, \`stockfish11\`, \`martin\`\n` +
            `> Use \`${prefix}chess engine\` to view all engines in a dropdown.`
          ));
        }
      }

      const newGame = {
        id: message.author.id,
        chess: new Chess(),
        playerWhite: message.author.id,
        playerBlack: isAI ? 'ai' : targetUser.id,
        engineId: selectedEngine.id,
        channelId: message.channel.id,
        theme: client.globalChessTheme || 'tournament',
        lastMessage: null,
        lastMoveText: isAI && selectedEngine.quotes ? `-# **${selectedEngine.name} entered the match:** *" ${selectedEngine.quotes[0]} "*` : null,
        lastActivity: Date.now()
      };

      client.chessGames.set(newGame.playerWhite, newGame);
      if (!isAI) client.chessGames.set(newGame.playerBlack, newGame);

      await renderBoard(message.channel, newGame);
    }
  }
];

function isLikelyChessMove(s) {
  if (!s || s.length < 2 || s.length > 7) return false;
  return /^(?:[a-h][1-8](?:=[qrbnQRBN])?|[a-h][18][qrbnQRBN]|[a-h]x[a-h][1-8](?:=[qrbnQRBN])?|[KQRBNkqrbn][a-h1-8]?x?[a-h][1-8]|[a-h][1-8][a-h][1-8][qrbnQRBN]?|O-O|O-O-O|o-o|o-o-o)[+#]?$/i.test(s);
}

function tryMove(game, moveStr) {
  if (!moveStr) return null;
  const clean = moveStr.trim();

  // 1. Direct raw move
  try {
    const move = game.chess.move(clean);
    if (move) return move;
  } catch (e) {}

  // 2. Capitalized (e.g. nf3 -> Nf3, qe2 -> Qe2)
  try {
    const capitalized = clean.charAt(0).toUpperCase() + clean.slice(1);
    const move = game.chess.move(capitalized);
    if (move) return move;
  } catch (e) {}

  // 3. Lowercase (e.g. E4 -> e4)
  try {
    const lower = clean.toLowerCase();
    const move = game.chess.move(lower);
    if (move) return move;
  } catch (e) {}

  // 4. Pawn promotion shorthand (e.g. e8q -> e8=Q)
  if (/^[a-h][18][qrbn]$/i.test(clean)) {
    try {
      const move = game.chess.move(`${clean.slice(0, 2)}=${clean[2].toUpperCase()}`);
      if (move) return move;
    } catch (e) {}
  }

  // 5. UCI promotion format (e.g. e7e8q -> e8=Q)
  if (/^[a-h][1-8][a-h][1-8][qrbn]$/i.test(clean)) {
    try {
      const move = game.chess.move(clean.toLowerCase());
      if (move) return move;
    } catch (e) {}
  }

  return null;
}

// In-memory Minimax with Alpha-Beta Pruning for zero-latency local fallback
const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

function evaluateBoard(chess) {
  let score = 0;
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece) {
        const val = PIECE_VALUES[piece.type] || 0;
        score += piece.color === 'w' ? val : -val;
      }
    }
  }
  return score;
}

function minimax(chess, depth, alpha, beta, isMaximizing) {
  if (depth === 0 || chess.isGameOver()) {
    return evaluateBoard(chess);
  }
  const moves = chess.moves({ verbose: true });
  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const m of moves) {
      chess.move(m);
      const ev = minimax(chess, depth - 1, alpha, beta, false);
      chess.undo();
      maxEval = Math.max(maxEval, ev);
      alpha = Math.max(alpha, ev);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const m of moves) {
      chess.move(m);
      const ev = minimax(chess, depth - 1, alpha, beta, true);
      chess.undo();
      minEval = Math.min(minEval, ev);
      beta = Math.min(beta, ev);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

function getBestLocalMove(chess, depth = 2) {
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return null;
  const isWhite = chess.turn() === 'w';
  let bestMove = moves[0];
  let bestScore = isWhite ? -Infinity : Infinity;

  for (const m of moves) {
    chess.move(m);
    const score = minimax(chess, depth - 1, -Infinity, Infinity, !isWhite);
    chess.undo();
    if (isWhite && score > bestScore) {
      bestScore = score;
      bestMove = m;
    } else if (!isWhite && score < bestScore) {
      bestScore = score;
      bestMove = m;
    }
  }
  return bestMove;
}

async function computeEngineMove(game) {
  const engine = CHESS_ENGINES[game.engineId] || CHESS_ENGINES.stockfish_16;

  // 1. Martin's blunders (65% chance of goofy move)
  if (engine.blunderRate > 0 && Math.random() < engine.blunderRate) {
    const legalMoves = game.chess.moves({ verbose: true });
    if (legalMoves.length > 0) {
      const randomMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
      const moveResult = game.chess.move(randomMove);
      const quote = engine.quotes ? engine.quotes[Math.floor(Math.random() * engine.quotes.length)] : null;
      return { moveResult, quote, engine };
    }
  }

  // 2. Cloud Stockfish Engine API with depth parameter
  try {
    const fen = encodeURIComponent(game.chess.fen());
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://stockfish.online/api/s/v2.php?fen=${fen}&depth=${engine.depth}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.success && data.bestmove) {
        const uciMove = data.bestmove.split(' ')[1];
        if (uciMove) {
          const moveResult = tryMove(game, uciMove);
          if (moveResult) {
            const quote = engine.quotes ? engine.quotes[Math.floor(Math.random() * engine.quotes.length)] : null;
            return { moveResult, quote, engine };
          }
        }
      }
    }
  } catch (err) {
    // API lag/timeout - seamless fallback
  }

  // 3. Resilient Local Minimax Fallback (Instant tactical calculation)
  const localMove = getBestLocalMove(game.chess, 2);
  if (localMove) {
    const moveResult = game.chess.move(localMove);
    const quote = engine.quotes ? engine.quotes[Math.floor(Math.random() * engine.quotes.length)] : null;
    return { moveResult, quote, engine };
  }

  return null;
}

export async function handleChessMove(message) {
  if (message.author.bot) return;
  if (message.content.startsWith('!') || message.content.startsWith('?')) return;

  const client = message.client;
  if (!client.chessGames || !client.chessGames.has(message.author.id)) return;

  const game = client.chessGames.get(message.author.id);
  if (game.channelId !== message.channel.id) return;

  // Prune idle games (> 30 mins)
  const now = Date.now();
  if (game.lastActivity && now - game.lastActivity > 30 * 60 * 1000) {
    client.chessGames.delete(game.playerWhite);
    if (game.playerBlack !== 'ai') client.chessGames.delete(game.playerBlack);
    return;
  }

  const isWhiteTurn = game.chess.turn() === 'w';
  if (isWhiteTurn && message.author.id !== game.playerWhite) return;
  if (!isWhiteTurn && message.author.id !== game.playerBlack) return;

  const rawTokens = message.content.trim().split(/\s+/);
  if (rawTokens.length > 2) return; // Ignore multi-word conversational chat

  const moveStrRaw = rawTokens[0];
  if (!isLikelyChessMove(moveStrRaw)) return; // Normal conversational message, do NOT delete or intercept!

  const userRole = isWhiteTurn ? 'White' : 'Black';
  const moveResult = tryMove(game, moveStrRaw);

  if (!moveResult) {
    const tempMsg = await message.reply(`-# **Illegal Move:** \`${moveStrRaw}\`\n-# Check board status and type a valid legal move.`).catch(() => null);
    if (tempMsg) setTimeout(() => tempMsg.delete().catch(() => null), 4000);
    message.delete().catch(() => null);
    return;
  }

  game.lastActivity = Date.now();
  game.lastMoveText = `-# **${userRole} moved \`${moveResult.san}\`**`;
  message.delete().catch(() => null);
  if (game.lastMessage) game.lastMessage.delete().catch(() => null);

  if (game.chess.isGameOver()) {
    await renderBoard(message.channel, game, true);
    client.chessGames.delete(game.playerWhite);
    if (game.playerBlack !== 'ai') client.chessGames.delete(game.playerBlack);
    return;
  }

  await renderBoard(message.channel, game);

  // AI Response Turn
  if (game.playerBlack === 'ai' && game.chess.turn() === 'b') {
    const engine = CHESS_ENGINES[game.engineId] || CHESS_ENGINES.stockfish_16;
    const aiMessage = await message.channel.send(`-# <a:loading:1542155051286396938> **${engine.name} (${engine.elo} ELO) is calculating...**`);

    const engineResponse = await computeEngineMove(game);

    aiMessage.delete().catch(() => null);
    if (game.lastMessage) game.lastMessage.delete().catch(() => null);

    if (engineResponse && engineResponse.moveResult) {
      game.lastActivity = Date.now();
      if (engineResponse.quote) {
        game.lastMoveText = `-# **${engine.name} moved \`${engineResponse.moveResult.san}\`**\n> *" ${engineResponse.quote} "*`;
      } else {
        game.lastMoveText = `-# **${engine.name} moved \`${engineResponse.moveResult.san}\`**`;
      }

      if (game.chess.isGameOver()) {
        await renderBoard(message.channel, game, true);
        client.chessGames.delete(game.playerWhite);
      } else {
        await renderBoard(message.channel, game);
      }
    }
  }
}

export async function handleChessEngineSelect(interaction) {
  const engineId = interaction.values[0];
  const engine = CHESS_ENGINES[engineId] || CHESS_ENGINES.stockfish_16;

  db.updateGuildConfig(interaction.guild.id, { chessEngine: engineId });
  return interaction.reply({
    content: `-# **Chess Engine Selected | ${TICK}**\n> Active chess engine for **${interaction.guild.name}** set to **${engine.name}** (\`${engine.elo} ELO\`).\n> Challenge anytime with \`!chess ai\` or directly challenge any bot via \`!chess ai <bot>\`!`,
    flags: 64
  }).catch(() => null);
}

export async function handleChessThemeSelect(interaction) {
  await interaction.deferUpdate().catch(() => {});

  const theme = interaction.values[0];
  const fen = new Chess().fen();
  const encodedFen = encodeURIComponent(fen);
  const imageUrl = `https://www.chess.com/dynboard?fen=${encodedFen}&board=${theme}&piece=neo&size=3&coordinates=inside`;

  const rowSelect = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('chess_theme_select')
      .setPlaceholder(`Previewing: ${theme}`)
      .addOptions(THEMES.slice(0, 20))
  );

  const rowButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`chess_theme_apply_${theme}`)
      .setLabel('Apply Theme')
      .setStyle(ButtonStyle.Secondary)
  );

  const embed = new EmbedBuilder()
    .setTitle(`Theme Preview: ${theme}`)
    .setImage(imageUrl + '&ext=.png')
    .setColor(0x2b2d31);

  if (interaction.message.flags.has(MessageFlags.IsComponentsV2)) {
    await interaction.message.delete().catch(() => null);
    await interaction.channel.send({
      embeds: [embed],
      components: [rowSelect, rowButton]
    }).catch(() => null);
  } else {
    await interaction.editReply({
      content: '',
      embeds: [embed],
      components: [rowSelect, rowButton],
      flags: 0
    }).catch(() => null);
  }
}

export async function handleChessThemeApply(interaction) {
  await interaction.deferUpdate().catch(() => {});

  const theme = interaction.customId.replace('chess_theme_apply_', '');
  if (interaction.guild) {
    db.updateGuildConfig(interaction.guild.id, { chessTheme: theme });
  }
  interaction.client.globalChessTheme = theme;

  if (interaction.client.chessGames && interaction.client.chessGames.has(interaction.user.id)) {
    const game = interaction.client.chessGames.get(interaction.user.id);
    game.theme = theme;
    await interaction.message.delete().catch(() => null);
    if (game.lastMessage) game.lastMessage.delete().catch(() => null);
    await renderBoard(interaction.channel, game, game.chess.isGameOver());
    const confirmMsg = await interaction.channel.send(`-# **Theme updated seamlessly in your active game!**`).catch(() => null);
    if (confirmMsg) setTimeout(() => confirmMsg.delete().catch(() => null), 4000);
  } else {
    await interaction.editReply({ 
      content: `-# **Theme successfully applied! Future games will use the ${theme} aesthetic.**`, 
      components: [], 
      embeds: [],
      files: [],
      flags: 0 
    }).catch(() => null);
  }
}

async function renderBoard(channel, game, isGameOver = false) {
  const fen = game.chess.fen();
  const encodedFen = encodeURIComponent(fen);
  const imageUrl = `https://www.chess.com/dynboard?fen=${encodedFen}&board=${game.theme}&piece=neo&size=3&coordinates=inside`;
  const engine = CHESS_ENGINES[game.engineId] || CHESS_ENGINES.stockfish_16;

  let statusText = '';
  if (isGameOver) {
    if (game.chess.isCheckmate()) statusText = '-# **CHECKMATE!**';
    else if (game.chess.isDraw()) statusText = '-# **DRAW!**';
    else statusText = '-# **GAME OVER!**';
  } else {
    const turnUser = game.chess.turn() === 'w' ? `<@${game.playerWhite}>` : (game.playerBlack === 'ai' ? `**Athena (${engine.name})**` : `<@${game.playerBlack}>`);
    statusText = `-# **Turn:** ${turnUser}\n-# Type your move in chat (e.g. \`e4\`, \`Nf3\`).\n-# Type \`!chess stop\` to resign.`;
  }

  if (game.lastMoveText) {
    statusText = `${game.lastMoveText}\n\n${statusText}`;
  }

  const embed = new EmbedBuilder()
    .setTitle(`Athena Grandmaster Chess | ${TICK}`)
    .setDescription(statusText)
    .setImage(imageUrl + '&ext=.png')
    .setColor(0x2b2d31)
    .setFooter({ text: game.playerBlack === 'ai' ? `Engine: ${engine.name} (${engine.elo} ELO) • Athena Chess Matrix` : 'PVP Match • Athena Chess Matrix' });

  let msg = await channel.send({ 
    embeds: [embed],
    flags: 0 
  }).catch(async (e) => {
    console.error('[Chess] Failed to send board embed:', e);
    return null;
  });

  if (msg) game.lastMessage = msg;
}
