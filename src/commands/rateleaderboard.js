import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import cv2 from '../cv2.js';
import db from '../database.js';
import { NAV_EMOJI_IDS } from '../utils/emojis.js';

export const commands = [
  {
    name: 'rateleaderboard',
    slashHidden: true,
    description: 'View the leaderboard of the top rated edits in the server.',
    aliases: ['ratelb', 'editlb', 'editleaderboard'],
    category: 'utilities',
    executePrefix: async (message, args) => {
      await sendRateLeaderboard(message, 1);
    }
  }
];

const ITEMS_PER_PAGE = 10;

async function sendRateLeaderboard(context, page) {
  const allRatings = db.getAllEditRatings();
  
  // Aggregate data by user
  const userStats = {};
  
  for (const [messageId, data] of Object.entries(allRatings)) {
    const authorId = data.authorId;
    
    if (!userStats[authorId]) {
      userStats[authorId] = {
        authorId: authorId,
        authorName: data.authorName || 'Unknown User',
        totalVideos: 0,
        totalVotes: 0,
        totalStars: 0
      };
    }
    
    userStats[authorId].totalVideos += 1;
    
    // Sum votes for this video
    for (const vote of Object.values(data.votes || {})) {
      userStats[authorId].totalVotes += 1;
      userStats[authorId].totalStars += vote.stars;
    }
  }
  
  // Filter out users with 0 votes and calculate averages
  const leaderboard = Object.values(userStats)
    .filter(user => user.totalVotes > 0)
    .map(user => {
      user.averageRating = user.totalStars / user.totalVotes;
      user.score = user.totalStars;
      return user;
    })
    .sort((a, b) => b.averageRating - a.averageRating || b.totalVotes - a.totalVotes);
    
  if (leaderboard.length === 0) {
    const reply = cv2.info('Rate Leaderboard', 'There are no rated edits yet! Use `!rate` to post an edit.');
    return context.reply ? await context.reply(reply) : await context.update(reply);
  }
  
  const totalPages = Math.ceil(leaderboard.length / ITEMS_PER_PAGE);
  if (page < 1) page = 1;
  if (page > totalPages) page = totalPages;
  
  const startIndex = (page - 1) * ITEMS_PER_PAGE;
  const pageItems = leaderboard.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  
  const medals = ['🥇', '🥈', '🥉'];
  
  const description = pageItems.map((user, index) => {
    const rank = startIndex + index;
    const rankDisplay = rank < 3 ? medals[rank] : `**#${rank + 1}**`;
    
    return `${rankDisplay} **${user.authorName}**\n` +
           `> <a:1z:1517089474369032253> **Avg Rating:** ${user.averageRating.toFixed(1)}/5\n` +
           `> 📊 **Total Score:** ${user.score} ★\n` +
           `> 🎬 **Edits:** ${user.totalVideos} | 👥 **Votes:** ${user.totalVotes}`;
  }).join('\n\n');
  
  const guildConfig = context.guild ? db.getGuildConfig(context.guild.id) : null;
  const lbEmbed = new EmbedBuilder({
    title: '🏆 Edit Rating Leaderboard',
    description: description,
    color: guildConfig?.accentColor || '#FFD700',
    footer: { text: `Page ${page} of ${totalPages} • Ranked by Highest Avg Rating` }
  });
  
  const row = new ActionRowBuilder();
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`ratelb_prev_${page}`)
      .setLabel('Previous')
      .setEmoji(NAV_EMOJI_IDS.PREV)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 1),
    new ButtonBuilder()
      .setCustomId(`ratelb_next_${page}`)
      .setLabel('Next')
      .setEmoji(NAV_EMOJI_IDS.NEXT)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === totalPages)
  );
  
  const payload = { embeds: [lbEmbed], components: [row] };
  
  if (typeof context.isButton === 'function' && context.isButton()) {
    await context.update(payload).catch(() => null);
  } else {
    await context.reply(payload).catch(() => null);
  }
}

// Export for interaction handler
export { sendRateLeaderboard };
