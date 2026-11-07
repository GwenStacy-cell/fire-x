import fetch from 'node-fetch';
import { 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  MessageFlags 
} from 'discord.js';
import db from '../database.js';
import { 
  TICK_EMOJI, 
  WRONG_EMOJI, 
  WARN_EMOJI, 
  BULLET_EMOJI, 
  UPTIME_EMOJI, 
  getRandomHeadingGlyph 
} from './emojis.js';
import { sanitizeCV2Payload } from '../cv2.js';

// In-memory active game states
export const activeGames = new Map();

// Periodic prune for abandoned games older than 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, game] of activeGames.entries()) {
    if (now - (game.updatedAt || game.createdAt || 0) > 15 * 60 * 1000) {
      activeGames.delete(id);
    }
  }
}, 5 * 60 * 1000);

// =========================================================================
// 1. TIC-TAC-TOE ENGINE
// =========================================================================

export function createTicTacToeGame(guildId, playerX, playerO) {
  const gameId = 'ttt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const game = {
    id: gameId,
    type: 'tictactoe',
    guildId,
    playerX: { id: playerX.id, tag: playerX.username },
    playerO: { id: playerO.id, tag: playerO.username },
    currentTurn: playerX.id, // Player X starts
    board: [
      [' ', ' ', ' '],
      [' ', ' ', ' '],
      [' ', ' ', ' ']
    ],
    status: 'in_progress', // 'in_progress', 'win', 'tie'
    winner: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  activeGames.set(gameId, game);
  return game;
}

function checkTicTacToeWin(board) {
  // Check rows
  for (let r = 0; r < 3; r++) {
    if (board[r][0] !== ' ' && board[r][0] === board[r][1] && board[r][1] === board[r][2]) {
      return board[r][0];
    }
  }
  // Check cols
  for (let c = 0; c < 3; c++) {
    if (board[0][c] !== ' ' && board[0][c] === board[1][c] && board[1][c] === board[2][c]) {
      return board[0][c];
    }
  }
  // Check diagonals
  if (board[0][0] !== ' ' && board[0][0] === board[1][1] && board[1][1] === board[2][2]) return board[0][0];
  if (board[0][2] !== ' ' && board[0][2] === board[1][1] && board[1][1] === board[2][0]) return board[0][2];

  // Check full board
  const isFull = board.every(row => row.every(cell => cell !== ' '));
  if (isFull) return 'tie';

  return null;
}

export function buildTicTacToePayload(gameId) {
  const game = activeGames.get(gameId);
  if (!game) {
    return {
      components: [
        {
          type: 17,
          components: [
            { type: 10, content: `# ${getRandomHeadingGlyph()} Game Expired | ${WARN_EMOJI}\n> -# This Tic-Tac-Toe session has expired.` }
          ]
        }
      ],
      flags: MessageFlags.IsComponentsV2
    };
  }

  const rows = [];
  for (let r = 0; r < 3; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < 3; c++) {
      const val = game.board[r][c];
      const btn = new ButtonBuilder()
        .setCustomId(`arc:ttt:${gameId}:${r}:${c}`)
        .setDisabled(val !== ' ' || game.status !== 'in_progress');

      if (val === 'X') {
        btn.setLabel('✕').setStyle(ButtonStyle.Primary);
      } else if (val === 'O') {
        btn.setLabel('◯').setStyle(ButtonStyle.Danger);
      } else {
        btn.setLabel('·').setStyle(ButtonStyle.Secondary);
      }
      row.addComponents(btn);
    }
    rows.push(row.toJSON());
  }

  let statusText = '';
  if (game.status === 'in_progress') {
    const currentMember = game.currentTurn === game.playerX.id ? `<@${game.playerX.id}> (✕)` : `<@${game.playerO.id}> (◯)`;
    statusText = `**Current Turn:** ${currentMember}\n` +
                 `${BULLET_EMOJI} **Player ✕:** <@${game.playerX.id}>\n` +
                 `${BULLET_EMOJI} **Player ◯:** <@${game.playerO.id}>`;
  } else if (game.status === 'win') {
    const winnerUser = game.winner === 'X' ? game.playerX : game.playerO;
    statusText = `**Winner:** <@${winnerUser.id}> (${game.winner}) | ${TICK_EMOJI}\n` +
                 `${BULLET_EMOJI} Congratulations! Victory recorded in arcade database.`;
  } else {
    statusText = `**Result:** It's a Draw! Both warriors matched equally.`;
  }

  const container = {
    type: 17,
    components: [
      {
        type: 10,
        content: `# ${getRandomHeadingGlyph()} Tic-Tac-Toe Match | ${TICK_EMOJI}\n> -# ${statusText}`
      },
      { type: 14, divider: true },
      ...rows,
      { type: 14, divider: true },
      { type: 10, content: `-# **Athena Prime Arcade Matrix \u00b7 Tic-Tac-Toe**` }
    ]
  };

  return sanitizeCV2Payload({
    components: [container],
    flags: MessageFlags.IsComponentsV2
  });
}

// =========================================================================
// 2. BLACKJACK CASINO ENGINE
// =========================================================================

const SUITS = ['♠', '♥', '♦', '♣'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function createDeck() {
  const deck = [];
  for (const s of SUITS) {
    for (const v of VALUES) {
      deck.push({ suit: s, value: v });
    }
  }
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function calculateHandValue(hand) {
  let val = 0;
  let aces = 0;
  for (const card of hand) {
    if (['J', 'Q', 'K'].includes(card.value)) val += 10;
    else if (card.value === 'A') {
      val += 11;
      aces++;
    } else {
      val += parseInt(card.value, 10);
    }
  }
  while (val > 21 && aces > 0) {
    val -= 10;
    aces--;
  }
  return val;
}

export function createBlackjackGame(guildId, user, bet = 100) {
  const gameId = 'bj_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const deck = createDeck();
  const playerHand = [deck.pop(), deck.pop()];
  const dealerHand = [deck.pop(), deck.pop()];

  const game = {
    id: gameId,
    type: 'blackjack',
    guildId,
    userId: user.id,
    userName: user.username,
    bet,
    deck,
    playerHand,
    dealerHand,
    status: 'player_turn', // 'player_turn', 'dealer_turn', 'ended'
    result: null, // 'win', 'loss', 'push', 'blackjack'
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  if (calculateHandValue(playerHand) === 21) {
    game.status = 'ended';
    game.result = 'blackjack';
    db.recordArcadeGame(guildId, user.id, 'blackjack', 'win', bet * 1.5);
  }

  activeGames.set(gameId, game);
  return game;
}

export function buildBlackjackPayload(gameId) {
  const game = activeGames.get(gameId);
  if (!game) {
    return {
      components: [
        {
          type: 17,
          components: [
            { type: 10, content: `# ${getRandomHeadingGlyph()} Session Expired | ${WARN_EMOJI}\n> -# Blackjack hand expired.` }
          ]
        }
      ],
      flags: MessageFlags.IsComponentsV2
    };
  }

  const pScore = calculateHandValue(game.playerHand);
  const pCardsStr = game.playerHand.map(c => `[${c.value}${c.suit}]`).join(' ');

  let dCardsStr = '';
  let dScoreStr = '';
  if (game.status === 'player_turn') {
    dCardsStr = `[${game.dealerHand[0].value}${game.dealerHand[0].suit}] [🂠 Hidden]`;
    dScoreStr = '?';
  } else {
    dCardsStr = game.dealerHand.map(c => `[${c.value}${c.suit}]`).join(' ');
    dScoreStr = String(calculateHandValue(game.dealerHand));
  }

  let resultHeader = 'High-Stakes Blackjack Table';
  let outcomeDesc = `**Bet:** \`${game.bet.toLocaleString()} Coins\` \u00b7 Choose your move below!`;

  if (game.status === 'ended') {
    if (game.result === 'blackjack') {
      resultHeader = `Natural Blackjack! | ${TICK_EMOJI}`;
      outcomeDesc = `**YOU WON +${Math.floor(game.bet * 1.5).toLocaleString()} COINS!** (3:2 Payout)`;
    } else if (game.result === 'win') {
      resultHeader = `Dealer Bust / You Won! | ${TICK_EMOJI}`;
      outcomeDesc = `**YOU WON +${game.bet.toLocaleString()} COINS!**`;
    } else if (game.result === 'loss') {
      resultHeader = `Dealer Wins | ${WRONG_EMOJI}`;
      outcomeDesc = `**Hand Lost:** -${game.bet.toLocaleString()} Coins.`;
    } else {
      resultHeader = `Push / Standoff | ${WARN_EMOJI}`;
      outcomeDesc = `**Push:** Bet of ${game.bet.toLocaleString()} Coins returned.`;
    }
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`arc:bj:${gameId}:hit`)
      .setLabel('Hit')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(game.status !== 'player_turn'),
    new ButtonBuilder()
      .setCustomId(`arc:bj:${gameId}:stand`)
      .setLabel('Stand')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(game.status !== 'player_turn'),
    new ButtonBuilder()
      .setCustomId(`arc:bj:${gameId}:double`)
      .setLabel('Double Down')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(game.status !== 'player_turn' || game.playerHand.length > 2)
  );

  const container = {
    type: 17,
    components: [
      {
        type: 10,
        content: `# ${getRandomHeadingGlyph()} ${resultHeader}\n` +
                 `> -# <a:uptime:1552608831060844575> ${outcomeDesc}\n\n` +
                 `**__Dealer's Hand:__** (\`${dScoreStr}\`)\n\`${dCardsStr}\`\n\n` +
                 `**__<@${game.userId}>'s Hand:__** (\`${pScore}\`)\n\`${pCardsStr}\``
      },
      { type: 14, divider: true },
      row.toJSON(),
      { type: 14, divider: true },
      { type: 10, content: `-# **Athena Prime Casino Matrix \u00b7 Blackjack 21**` }
    ]
  };

  return sanitizeCV2Payload({
    components: [container],
    flags: MessageFlags.IsComponentsV2
  });
}

// =========================================================================
// 3. TRIVIA ARENA ENGINE
// =========================================================================

const LOCAL_TRIVIA = [
  { q: 'In Attack on Titan, who was the first person to breach Wall Maria?', a: 'Bertolt Hoover (Colossal Titan)', inc: ['Reiner Braun', 'Annie Leonhart', 'Eren Yeager'], cat: 'Anime' },
  { q: 'What is the highest-grossing anime movie of all time worldwide?', a: 'Demon Slayer: Mugen Train', inc: ['Spirited Away', 'Your Name', 'One Piece: Red'], cat: 'Anime' },
  { q: 'Which programming language originally implemented Node.js?', a: 'C++', inc: ['Python', 'Java', 'Rust'], cat: 'Tech' },
  { q: 'What year was the original Sony PlayStation console released in Japan?', a: '1994', inc: ['1992', '1996', '1998'], cat: 'Gaming' },
  { q: 'In Minecraft, what block is immune to explosions?', a: 'Bedrock', inc: ['Obsidian', 'Netherite Block', 'Reinforced Deepslate'], cat: 'Gaming' },
  { q: 'Who directed the cinematic masterpiece Interstellar (2014)?', a: 'Christopher Nolan', inc: ['Denis Villeneuve', 'James Cameron', 'Ridley Scott'], cat: 'Movies' }
];

export async function fetchTriviaQuestion(category = 'all') {
  try {
    const res = await fetch('https://opentdb.com/api.php?amount=1&type=multiple', { timeout: 3000 });
    if (res.ok) {
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const item = data.results[0];
        const decode = str => Buffer.from(str, 'utf8').toString();
        const q = item.question
          .replace(/&quot;/g, '"')
          .replace(/&#039;/g, "'")
          .replace(/&amp;/g, '&')
          .replace(/&eacute;/g, 'é');

        const correct = item.correct_answer.replace(/&quot;/g, '"').replace(/&#039;/g, "'");
        const inc = item.incorrect_answers.map(a => a.replace(/&quot;/g, '"').replace(/&#039;/g, "'"));
        return {
          question: q,
          correct,
          incorrect: inc,
          category: item.category
        };
      }
    }
  } catch {}

  // Fallback to local curated pool
  const picked = LOCAL_TRIVIA[Math.floor(Math.random() * LOCAL_TRIVIA.length)];
  return {
    question: picked.q,
    correct: picked.a,
    incorrect: picked.inc,
    category: picked.cat
  };
}

export function createTriviaGame(guildId, triviaData) {
  const gameId = 'trv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const options = [...triviaData.incorrect, triviaData.correct].sort(() => Math.random() - 0.5);
  const correctIndex = options.indexOf(triviaData.correct);

  const game = {
    id: gameId,
    type: 'trivia',
    guildId,
    question: triviaData.question,
    category: triviaData.category,
    options,
    correctIndex,
    correctAnswer: triviaData.correct,
    answeredBy: null,
    isCorrect: null,
    status: 'waiting',
    createdAt: Date.now()
  };

  activeGames.set(gameId, game);
  return game;
}

export function buildTriviaPayload(gameId) {
  const game = activeGames.get(gameId);
  if (!game) {
    return {
      components: [
        {
          type: 17,
          components: [
            { type: 10, content: `# ${getRandomHeadingGlyph()} Trivia Expired | ${WARN_EMOJI}\n> -# Trivia round has expired.` }
          ]
        }
      ],
      flags: MessageFlags.IsComponentsV2
    };
  }

  const row = new ActionRowBuilder();
  const letters = ['A', 'B', 'C', 'D'];

  game.options.forEach((opt, idx) => {
    const btn = new ButtonBuilder()
      .setCustomId(`arc:trv:${gameId}:${idx}`)
      .setLabel(`${letters[idx]}. ${opt.slice(0, 75)}`)
      .setDisabled(game.status === 'answered');

    if (game.status === 'answered') {
      if (idx === game.correctIndex) btn.setStyle(ButtonStyle.Success);
      else if (idx === game.selectedIndex && !game.isCorrect) btn.setStyle(ButtonStyle.Danger);
      else btn.setStyle(ButtonStyle.Secondary);
    } else {
      btn.setStyle(ButtonStyle.Secondary);
    }
    row.addComponents(btn);
  });

  let statusMsg = `**Category:** \`${game.category}\` \u00b7 Click the correct option below!`;
  if (game.status === 'answered') {
    if (game.isCorrect) {
      statusMsg = `**Correct Answer! | ${TICK_EMOJI}**\n<@${game.answeredBy}> nailed it: \`${game.correctAnswer}\`! (+50 XP)`;
    } else {
      statusMsg = `**Incorrect! | ${WRONG_EMOJI}**\n<@${game.answeredBy}> chose the wrong option. Correct answer was: \`${game.correctAnswer}\``;
    }
  }

  const container = {
    type: 17,
    components: [
      {
        type: 10,
        content: `# ${getRandomHeadingGlyph()} Trivia Arena Challenge | ${TICK_EMOJI}\n` +
                 `> -# <a:uptime:1552608831060844575> ${statusMsg}\n\n` +
                 `**${game.question}**`
      },
      { type: 14, divider: true },
      row.toJSON(),
      { type: 14, divider: true },
      { type: 10, content: `-# **Athena Prime Arcade Matrix \u00b7 Live Trivia Battle**` }
    ]
  };

  return sanitizeCV2Payload({
    components: [container],
    flags: MessageFlags.IsComponentsV2
  });
}
