import { 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  MessageFlags,
  PermissionFlagsBits 
} from 'discord.js';
import db from '../database.js';
import cv2 from '../cv2.js';

// ==========================================
// BLACKJACK ENGINE
// ==========================================

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function createDeck() {
  const deck = [];
  for (const s of SUITS) {
    for (const r of RANKS) {
      let val = parseInt(r);
      if (['J', 'Q', 'K'].includes(r)) val = 10;
      if (r === 'A') val = 11;
      deck.push({ rank: r, suit: s, value: val, display: `${r}${s}` });
    }
  }
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function calculateHandValue(hand) {
  let total = hand.reduce((acc, c) => acc + c.value, 0);
  let aces = hand.filter(c => c.rank === 'A').length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

function formatHand(hand, hideSecond = false) {
  if (hideSecond && hand.length > 1) {
    return `\`${hand[0].display}\` \`[ ? ]\``;
  }
  return hand.map(c => `\`${c.display}\``).join(' ');
}

// ==========================================
// TRIVIA QUESTION BANK
// ==========================================
const TRIVIA_QUESTIONS = [
  {
    q: 'Which protocol is primarily used by Discord for real-time voice and video transmission?',
    options: ['WebRTC', 'FTP', 'HTTP/2', 'Telnet'],
    answer: 'WebRTC'
  },
  {
    q: 'In Discord architecture, what is the maximum number of roles a single guild can have?',
    options: ['250', '100', '500', '1000'],
    answer: '250'
  },
  {
    q: 'What is the standard unit of currency in cryptography and computing representing 1,024 Megabytes?',
    options: ['1 Gigabyte (GiB)', '1 Terabyte (TiB)', '1 Kilobyte (KiB)', '1 Petabyte (PiB)'],
    answer: '1 Gigabyte (GiB)'
  },
  {
    q: 'Which cipher algorithm provides 256-bit symmetric encryption used universally across military defense?',
    options: ['AES-256', 'MD5', 'SHA-1', 'DES-56'],
    answer: 'AES-256'
  },
  {
    q: 'What does the anti-raid honeypot security mechanism primarily rely upon?',
    options: ['Hidden tripwire channels and reactions', 'Random bans', 'Auto-muting all users', 'Deleting server invites'],
    answer: 'Hidden tripwire channels and reactions'
  },
  {
    q: 'In competitive gaming, what does the acronym "APM" stand for?',
    options: ['Actions Per Minute', 'Average Player Motion', 'Active Ping Meter', 'Area Point Modifier'],
    answer: 'Actions Per Minute'
  },
  {
    q: 'What planetary body has the highest surface gravity in our solar system?',
    options: ['Jupiter', 'Sun', 'Saturn', 'Neptune'],
    answer: 'Jupiter'
  },
  {
    q: 'In JavaScript and Node.js, what is the default non-blocking event-driven loop engine called?',
    options: ['libuv', 'v8-core', 'threadmaster', 'sync-bridge'],
    answer: 'libuv'
  },
  {
    q: 'What chemical element has the atomic number 79 and symbol "Au"?',
    options: ['Gold', 'Silver', 'Argon', 'Platinum'],
    answer: 'Gold'
  },
  {
    q: 'What year was Discord first officially launched to the public?',
    options: ['2015', '2013', '2017', '2019'],
    answer: '2015'
  }
];

// ==========================================
// ROULETTE WHEEL NUMBERS
// ==========================================
const ROULETTE_RED = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const ROULETTE_BLACK = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];

// ==========================================
// COMMAND DEFINITIONS
// ==========================================

export const commands = [
  // --- BLACKJACK COMMAND ---
  {
    name: 'blackjack',
    aliases: ['bj', '21'],
    description: 'Play interactive casino Blackjack against Athena with server economy betting',
    category: 'minigames',
    slashHidden: true,
    options: [
      {
        name: 'bet',
        description: 'Amount of coins to wager',
        type: 4, // INTEGER
        required: true
      }
    ],
    async executePrefix(message, args) {
      const bet = parseInt(args[0]);
      if (isNaN(bet) || bet <= 0) {
        return message.reply(cv2.warn('Invalid Bet', 'Please provide a valid positive coin wager: `!blackjack <bet>`'));
      }
      return handleBlackjack(message, message.author, bet);
    },
    async executeSlash(interaction) {
      const bet = interaction.options.getInteger('bet');
      if (bet <= 0) {
        return interaction.reply(cv2.e.warn('Invalid Bet', 'Please enter a valid positive wager.'));
      }
      return handleBlackjack(interaction, interaction.user, bet);
    }
  },

  // --- ROULETTE COMMAND ---
  {
    name: 'roulette',
    aliases: ['roul', 'wheel'],
    description: 'Bet coins on European roulette (Red, Black, Green, Even, Odd, or Number 0-36)',
    category: 'minigames',
    options: [
      {
        name: 'bet',
        description: 'Amount of coins to wager',
        type: 4,
        required: true
      },
      {
        name: 'space',
        description: 'Your prediction: red, black, green, even, odd, or a number 0-36',
        type: 3,
        required: true
      }
    ],
    async executePrefix(message, args) {
      const bet = parseInt(args[0]);
      const space = args[1]?.toLowerCase();
      if (isNaN(bet) || bet <= 0 || !space) {
        return message.reply(cv2.warn('Invalid Usage', 'Format: `!roulette <bet> <red|black|green|even|odd|0-36>`'));
      }
      return handleRoulette(message, message.author, bet, space);
    },
    async executeSlash(interaction) {
      const bet = interaction.options.getInteger('bet');
      const space = interaction.options.getString('space')?.toLowerCase();
      if (bet <= 0 || !space) {
        return interaction.reply(cv2.e.warn('Invalid Parameters', 'Please specify a positive bet and a valid roulette space.'));
      }
      return handleRoulette(interaction, interaction.user, bet, space);
    }
  },

  // --- TRIVIA COMMAND ---
  {
    name: 'trivia',
    aliases: ['quiz', 'tournament'],
    description: 'Challenge your knowledge with interactive 4-button trivia tournaments and coin rewards',
    category: 'minigames',
    slashHidden: true,
    options: [
      {
        name: 'wager',
        description: 'Optional coin wager to double up on a correct answer',
        type: 4,
        required: false
      }
    ],
    async executePrefix(message, args) {
      const wager = args[0] ? parseInt(args[0]) : 0;
      return handleTrivia(message, message.author, wager);
    },
    async executeSlash(interaction) {
      const wager = interaction.options.getInteger('wager') || 0;
      return handleTrivia(interaction, interaction.user, wager);
    }
  },

  // --- MINIGAMES STATS COMMAND ---
  {
    name: 'gamestats',
    aliases: ['mgstats', 'casinostats'],
    description: 'View your personal or another user\'s casino minigames records, wins, and net earnings',
    category: 'minigames',
    options: [
      {
        name: 'user',
        description: 'Member to inspect stats for',
        type: 6, // USER
        required: false
      }
    ],
    async executePrefix(message, args) {
      const target = message.mentions.users.first() || message.author;
      return displayGameStats(message, target);
    },
    async executeSlash(interaction) {
      const target = interaction.options.getUser('user') || interaction.user;
      return displayGameStats(interaction, target);
    }
  }
];

// ==========================================
// HANDLER: BLACKJACK
// ==========================================

async function handleBlackjack(ctx, user, bet) {
  const guildId = ctx.guild.id;
  const eco = db.getUserEconomy(guildId, user.id);

  if ((eco.wallet || 0) < bet) {
    const errorMsg = cv2.warn(
      'Insufficient Funds', 
      `You need **${bet.toLocaleString()}** coins in your wallet to start this game.\n-# Current Wallet Balance: **${(eco.wallet || 0).toLocaleString()}** coins.`
    );
    return ctx.reply ? ctx.reply(errorMsg) : ctx.reply(errorMsg);
  }

  // Deduct bet upfront
  db.removeWallet(guildId, user.id, bet);

  const deck = createDeck();
  const playerHand = [deck.pop(), deck.pop()];
  const dealerHand = [deck.pop(), deck.pop()];
  let currentBet = bet;

  let playerVal = calculateHandValue(playerHand);
  const dealerInitialVal = dealerHand[0].value;

  // Natural Blackjack check
  if (playerVal === 21) {
    const dealerVal = calculateHandValue(dealerHand);
    if (dealerVal === 21) {
      // Push
      db.addWallet(guildId, user.id, currentBet);
      return sendResponse(ctx, cv2.info(
        'Blackjack Push (Tie)',
        `Both you and the dealer got a Natural 21 Blackjack!\n\n` +
        `-# \u2022 **Your Hand:** ${formatHand(playerHand)} (Total: **21**)\n` +
        `-# \u2022 **Dealer Hand:** ${formatHand(dealerHand)} (Total: **21**)\n` +
        `-# \u2022 **Outcome:** Your wager of **${currentBet.toLocaleString()}** coins has been refunded.`
      ));
    }
    // Player wins 3:2 payout (2.5x)
    const winnings = Math.floor(currentBet * 2.5);
    db.addWallet(guildId, user.id, winnings);
    db.recordMinigameResult(guildId, user.id, 'blackjack', true, currentBet);

    return sendResponse(ctx, cv2.success(
      'Blackjack Natural 21',
      `You were dealt a Natural 21 Blackjack! Payout: **3:2**.\n\n` +
      `-# \u2022 **Your Hand:** ${formatHand(playerHand)} (Total: **21**)\n` +
      `-# \u2022 **Dealer Hand:** ${formatHand(dealerHand)} (Total: **${dealerVal}**)\n` +
      `-# \u2022 **Winnings:** +**${(winnings - currentBet).toLocaleString()}** profit (**${winnings.toLocaleString()}** returned).`
    ));
  }

  const gameId = `bj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const getActionRow = (disableAll = false) => {
    const canDouble = (db.getUserEconomy(guildId, user.id).wallet || 0) >= currentBet && playerHand.length === 2;
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${gameId}_hit`)
        .setLabel('Hit')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disableAll),
      new ButtonBuilder()
        .setCustomId(`${gameId}_stand`)
        .setLabel('Stand')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disableAll),
      new ButtonBuilder()
        .setCustomId(`${gameId}_double`)
        .setLabel(`Double Down (2x)`)
        .setStyle(ButtonStyle.Success)
        .setDisabled(disableAll || !canDouble)
    );
  };

  const buildGamePayload = (finished = false, outcomeText = '') => {
    playerVal = calculateHandValue(playerHand);
    const dealerTotal = finished ? calculateHandValue(dealerHand) : '?';
    const dealerDisplay = formatHand(dealerHand, !finished);

    const desc = 
      `**Table Stakes:** \`${currentBet.toLocaleString()}\` coins\n\n` +
      `-# \u2022 **Your Hand:** ${formatHand(playerHand)} (Total: **${playerVal}**)\n` +
      `-# \u2022 **Dealer Hand:** ${dealerDisplay} (Total: **${dealerTotal}**)\n\n` +
      (outcomeText ? outcomeText : `-# *Select an action below to proceed. Standing transfers play to Dealer.*`);

    const title = finished 
      ? (outcomeText.includes('Won') || outcomeText.includes('Victory') ? 'Blackjack Table' : 'Blackjack Table')
      : 'Blackjack Table Active';

    let container = outcomeText.includes('Won') || outcomeText.includes('Victory')
      ? cv2.success(title, desc)
      : outcomeText.includes('Bust') || outcomeText.includes('Lost')
        ? cv2.danger(title, desc)
        : cv2.info(title, desc);

    return {
      components: [
        container.components[0],
        getActionRow(finished)
      ],
      flags: MessageFlags.IsComponentsV2
    };
  };

  let msg;
  if (ctx.reply) {
    msg = await ctx.reply(buildGamePayload());
  } else {
    msg = await ctx.send(buildGamePayload());
  }

  const collector = msg.createMessageComponentCollector({
    filter: i => i.user.id === user.id && i.customId.startsWith(gameId),
    time: 60000
  });

  collector.on('collect', async i => {
    await i.deferUpdate().catch(() => null);

    if (i.customId === `${gameId}_hit`) {
      playerHand.push(deck.pop());
      playerVal = calculateHandValue(playerHand);

      if (playerVal > 21) {
        // Bust!
        collector.stop('bust');
        db.recordMinigameResult(guildId, user.id, 'blackjack', false, currentBet);
        const finishPayload = buildGamePayload(true, `-# \u2022 **Outcome:** You Busted! (${playerVal} > 21). You lost **${currentBet.toLocaleString()}** coins.`);
        return msg.edit(finishPayload).catch(() => null);
      } else if (playerVal === 21) {
        // Auto stand
        collector.stop('stand');
        return resolveDealerTurn();
      } else {
        return msg.edit(buildGamePayload()).catch(() => null);
      }
    }

    if (i.customId === `${gameId}_double`) {
      db.removeWallet(guildId, user.id, currentBet);
      currentBet *= 2;
      playerHand.push(deck.pop());
      playerVal = calculateHandValue(playerHand);

      collector.stop('double');
      if (playerVal > 21) {
        db.recordMinigameResult(guildId, user.id, 'blackjack', false, currentBet);
        const finishPayload = buildGamePayload(true, `-# \u2022 **Outcome:** Double Down Bust! (${playerVal} > 21). You lost **${currentBet.toLocaleString()}** coins.`);
        return msg.edit(finishPayload).catch(() => null);
      }
      return resolveDealerTurn();
    }

    if (i.customId === `${gameId}_stand`) {
      collector.stop('stand');
      return resolveDealerTurn();
    }
  });

  collector.on('end', async (_, reason) => {
    if (reason === 'time') {
      resolveDealerTurn();
    }
  });

  async function resolveDealerTurn() {
    let dealerVal = calculateHandValue(dealerHand);
    while (dealerVal < 17) {
      dealerHand.push(deck.pop());
      dealerVal = calculateHandValue(dealerHand);
    }

    playerVal = calculateHandValue(playerHand);
    let outcome = '';

    if (dealerVal > 21) {
      const winAmt = currentBet * 2;
      db.addWallet(guildId, user.id, winAmt);
      db.recordMinigameResult(guildId, user.id, 'blackjack', true, currentBet);
      outcome = `-# \u2022 **Outcome: Dealer Busts! (${dealerVal} > 21).** You Won! Received **${winAmt.toLocaleString()}** coins.`;
    } else if (playerVal > dealerVal) {
      const winAmt = currentBet * 2;
      db.addWallet(guildId, user.id, winAmt);
      db.recordMinigameResult(guildId, user.id, 'blackjack', true, currentBet);
      outcome = `-# \u2022 **Outcome: Victory!** Your **${playerVal}** beats Dealer\'s **${dealerVal}**. Received **${winAmt.toLocaleString()}** coins.`;
    } else if (dealerVal > playerVal) {
      db.recordMinigameResult(guildId, user.id, 'blackjack', false, currentBet);
      outcome = `-# \u2022 **Outcome: Dealer Wins.** Dealer\'s **${dealerVal}** beats your **${playerVal}**. Lost **${currentBet.toLocaleString()}** coins.`;
    } else {
      // Tie
      db.addWallet(guildId, user.id, currentBet);
      outcome = `-# \u2022 **Outcome: Push (Tie).** Both hands equal **${playerVal}**. Your **${currentBet.toLocaleString()}** coins were returned.`;
    }

    const finishPayload = buildGamePayload(true, outcome);
    return msg.edit(finishPayload).catch(() => null);
  }
}

// ==========================================
// HANDLER: ROULETTE
// ==========================================

async function handleRoulette(ctx, user, bet, space) {
  const guildId = ctx.guild.id;
  const eco = db.getUserEconomy(guildId, user.id);

  if ((eco.wallet || 0) < bet) {
    const errorMsg = cv2.warn(
      'Insufficient Funds', 
      `You need **${bet.toLocaleString()}** coins in your wallet to place this bet.\n-# Current Balance: **${(eco.wallet || 0).toLocaleString()}** coins.`
    );
    return sendResponse(ctx, errorMsg);
  }

  // Validate choice
  let validChoice = false;
  let multiplier = 2;
  const isNumber = /^\d+$/.test(space);
  const numVal = parseInt(space);

  if (['red', 'black', 'even', 'odd'].includes(space)) {
    validChoice = true;
    multiplier = 2;
  } else if (space === 'green') {
    validChoice = true;
    multiplier = 14;
  } else if (isNumber && numVal >= 0 && numVal <= 36) {
    validChoice = true;
    multiplier = 36;
  }

  if (!validChoice) {
    return sendResponse(ctx, cv2.warn(
      'Invalid Roulette Space',
      'Please select a valid roulette option:\n' +
      '-# \u2022 **Colors:** `red` (2x), `black` (2x), `green` (14x)\n' +
      '-# \u2022 **Parity:** `even` (2x), `odd` (2x)\n' +
      '-# \u2022 **Straight Number:** `0` through `36` (36x)'
    ));
  }

  // Deduct bet
  db.removeWallet(guildId, user.id, bet);

  // Spin wheel (0 to 36)
  const landingNumber = Math.floor(Math.random() * 37);
  let landingColor = 'green';
  if (ROULETTE_RED.includes(landingNumber)) landingColor = 'red';
  else if (ROULETTE_BLACK.includes(landingNumber)) landingColor = 'black';

  let won = false;
  if (space === 'red' && landingColor === 'red') won = true;
  else if (space === 'black' && landingColor === 'black') won = true;
  else if (space === 'green' && landingColor === 'green') won = true;
  else if (space === 'even' && landingNumber > 0 && landingNumber % 2 === 0) won = true;
  else if (space === 'odd' && landingNumber % 2 !== 0) won = true;
  else if (isNumber && numVal === landingNumber) won = true;

  if (won) {
    const payout = bet * multiplier;
    db.addWallet(guildId, user.id, payout);
    db.recordMinigameResult(guildId, user.id, 'roulette', true, bet);

    const winEmbed = cv2.success(
      'Roulette Victory',
      `The roulette wheel spun and landed on **${landingNumber} (${landingColor.toUpperCase()})**!\n\n` +
      `-# \u2022 **Your Prediction:** \`${space.toUpperCase()}\` (Multiplier: **${multiplier}x**)\n` +
      `-# \u2022 **Winnings:** +**${(payout - bet).toLocaleString()}** profit (**${payout.toLocaleString()}** coins added to wallet).`
    );
    return sendResponse(ctx, winEmbed);
  } else {
    db.recordMinigameResult(guildId, user.id, 'roulette', false, bet);

    const lossEmbed = cv2.danger(
      'Roulette Defeat',
      `The roulette wheel spun and landed on **${landingNumber} (${landingColor.toUpperCase()})**.\n\n` +
      `-# \u2022 **Your Prediction:** \`${space.toUpperCase()}\`\n` +
      `-# \u2022 **Loss:** **${bet.toLocaleString()}** coins surrendered to the house.`
    );
    return sendResponse(ctx, lossEmbed);
  }
}

// ==========================================
// HANDLER: TRIVIA
// ==========================================

async function handleTrivia(ctx, user, wager = 0) {
  const guildId = ctx.guild.id;

  if (wager > 0) {
    const eco = db.getUserEconomy(guildId, user.id);
    if ((eco.wallet || 0) < wager) {
      return sendResponse(ctx, cv2.warn(
        'Insufficient Funds',
        `You need **${wager.toLocaleString()}** coins in your wallet to place this trivia wager.`
      ));
    }
    db.removeWallet(guildId, user.id, wager);
  }

  const qObj = TRIVIA_QUESTIONS[Math.floor(Math.random() * TRIVIA_QUESTIONS.length)];
  const shuffledOptions = [...qObj.options].sort(() => Math.random() - 0.5);
  const triviaId = `trivia_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const buttons = shuffledOptions.map((opt, idx) => {
    return new ButtonBuilder()
      .setCustomId(`${triviaId}_${idx}`)
      .setLabel(opt)
      .setStyle(ButtonStyle.Secondary);
  });

  const row = new ActionRowBuilder().addComponents(buttons);

  const container = cv2.info(
    'Athena Knowledge Tournament',
    `**${qObj.q}**\n\n` +
    `-# \u2022 **Wager:** ${wager > 0 ? `\`${wager.toLocaleString()}\` coins (2x payout)` : 'Free tournament (50 coin bounty)'}\n` +
    `-# \u2022 **Time Limit:** 25 seconds\n` +
    `-# *Click the matching button below to lock in your answer.*`
  );

  const payload = {
    components: [container.components[0], row],
    flags: MessageFlags.IsComponentsV2
  };

  let msg;
  if (ctx.reply) {
    msg = await ctx.reply(payload);
  } else {
    msg = await ctx.send(payload);
  }

  const collector = msg.createMessageComponentCollector({
    filter: i => i.user.id === user.id && i.customId.startsWith(triviaId),
    time: 25000,
    max: 1
  });

  collector.on('collect', async i => {
    await i.deferUpdate().catch(() => null);
    const chosenIdx = parseInt(i.customId.split('_').pop());
    const chosenAnswer = shuffledOptions[chosenIdx];

    const isCorrect = chosenAnswer === qObj.answer;

    if (isCorrect) {
      const reward = wager > 0 ? wager * 2 : 50;
      db.addWallet(guildId, user.id, reward);
      db.recordMinigameResult(guildId, user.id, 'trivia', true, wager || 50);

      const winContainer = cv2.success(
        'Trivia Master',
        `**Correct!** The correct answer was indeed **${qObj.answer}**.\n\n` +
        `-# \u2022 **Reward:** +**${reward.toLocaleString()}** coins credited to your wallet!\n` +
        `-# \u2022 **Result:** Verified and registered in minigames tournament leaderboard.`
      );
      return msg.edit({ components: [winContainer.components[0]], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
    } else {
      db.recordMinigameResult(guildId, user.id, 'trivia', false, wager || 0);

      const lossContainer = cv2.danger(
        'Incorrect Answer',
        `**Incorrect!** You selected \`${chosenAnswer}\`.\n\n` +
        `-# \u2022 **Correct Answer:** **${qObj.answer}**\n` +
        `-# \u2022 **Outcome:** ${wager > 0 ? `Lost **${wager.toLocaleString()}** wager.` : 'No bounty earned.'}`
      );
      return msg.edit({ components: [lossContainer.components[0]], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
    }
  });

  collector.on('end', (_, reason) => {
    if (reason === 'time') {
      const timeoutContainer = cv2.warn(
        'Trivia Expired',
        `Time expired! The correct answer was **${qObj.answer}**.\n-# Better luck in the next tournament round.`
      );
      msg.edit({ components: [timeoutContainer.components[0]], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
    }
  });
}

// ==========================================
// HANDLER: GAME STATS
// ==========================================

async function displayGameStats(ctx, user) {
  const stats = db.getMinigameStats(ctx.guild.id, user.id);
  const eco = db.getUserEconomy(ctx.guild.id, user.id);
  const netEarnings = (stats.totalWon || 0) - (stats.totalWagered || 0);

  const container = cv2.info(
    `Casino & Minigames Ledger`,
    `Performance and tournament records for **${user.tag}**.\n\n` +
    `-# \u2022 **Blackjack Victories:** \`${stats.blackjackWins || 0}\` wins\n` +
    `-# \u2022 **Roulette Hits:** \`${stats.rouletteWins || 0}\` wins\n` +
    `-# \u2022 **Trivia Trophies:** \`${stats.triviaWins || 0}\` tournament points\n\n` +
    `**Financial Telemetry:**\n` +
    `-# \u2022 **Total Wagered:** \`${(stats.totalWagered || 0).toLocaleString()}\` coins\n` +
    `-# \u2022 **Total Won:** \`${(stats.totalWon || 0).toLocaleString()}\` coins\n` +
    `-# \u2022 **Net Performance:** \`${netEarnings >= 0 ? `+${netEarnings.toLocaleString()}` : netEarnings.toLocaleString()}\` coins\n` +
    `-# \u2022 **Active Balance:** \`${(eco.wallet || 0).toLocaleString()}\` in wallet`
  );

  return sendResponse(ctx, container);
}

// Helper to respond to both message and interaction
async function sendResponse(ctx, payload) {
  if (ctx.editReply && (ctx.deferred || ctx.replied)) {
    return ctx.editReply(payload);
  }
  if (ctx.reply) {
    return ctx.reply(payload);
  }
  return ctx.channel.send(payload);
}
