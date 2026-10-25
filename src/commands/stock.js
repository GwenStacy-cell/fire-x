import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import cv2 from '../cv2.js';
import db from '../database.js';
import { 
  fetchStockData, 
  fetchMarketOverview, 
  fetchStockNews, 
  renderSingleStockCard, 
  renderMarketOverviewCard, 
  buildStockPayload, 
  buildMarketOverviewPayload,
  buildStockGuidancePayload,
  DISCLAIMER_TEXT 
} from '../utils/stockMarket.js';
import { generateAIResponse, formatAIToGreyMarkdown } from '../utils/ai.js';
import { dispatchDailyBriefing } from '../utils/stockBroadcaster.js';

export const commands = [
  // 1. MAIN STOCK & MARKET COMMAND
  {
    name: 'stock',
    aliases: ['stocks', 'market', 'stockmarket', 'ticker', 'share', 'shares'],
    description: 'Generate real-time stock and crypto market details in a high-resolution image with financial telemetry',
    category: 'utility',
    permissions: [],
    options: [
      {
        name: 'symbol',
        description: 'Stock ticker, company name, or crypto asset (e.g. NVDA, AAPL, TSLA, BTC, ETH)',
        type: 3, // STRING
        required: false
      }
    ],
    async executePrefix(message, args) {
      const input = args.join(' ').trim();
      const prefix = db.getGuildConfig(message.guild.id)?.prefix || '!';

      if (input.toLowerCase() === 'help' || input.toLowerCase() === 'cmds' || input.toLowerCase() === 'guidance') {
        return message.reply({ ...buildStockGuidancePayload(prefix), flags: MessageFlags.IsComponentsV2 });
      }

      const loadingMsg = await message.reply({
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `<a:uptime:1552608831060844575> **Athena Financial Terminal:** Aggregating real-time exchange telemetry & generating high-resolution Canvas chart for \`${input || 'Global Market Overview'}\`...`
              }
            ]
          }
        ],
        flags: MessageFlags.IsComponentsV2
      });

      try {
        if (!input) {
          // Global Market Overview
          const overview = await fetchMarketOverview();
          const imageBuffer = renderMarketOverviewCard(overview);
          const payload = buildMarketOverviewPayload(overview, imageBuffer, false, prefix);
          return await loadingMsg.edit(payload);
        } else {
          // Specific Stock / Crypto Ticker
          const stockData = await fetchStockData(input);
          const imageBuffer = renderSingleStockCard(stockData);
          const payload = buildStockPayload(stockData, imageBuffer, prefix);
          return await loadingMsg.edit(payload);
        }
      } catch (err) {
        return await loadingMsg.edit({
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `## Financial Reconnaissance Error | <a:atheNATICK:1557841381630681106>\n` +
                           `> -# <a:uptime:1552608831060844575> **Telemetry Fault:** ${err.message || 'Unable to resolve market data.'}\n` +
                           `> -# • **Try:** \`${prefix}stock NVDA\`, \`${prefix}stock AAPL\`, \`${prefix}stock BTC\`, or \`${prefix}market\` for global overview.\n` +
                           `> -# • **All Features Guide:** Type \`${prefix}stock help\` for complete commands guidance.\n\n` +
                           `> -# <a:uptime:1552608831060844575> **Notice:** ${DISCLAIMER_TEXT}`
                }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }
    },
    async executeSlash(interaction) {
      const input = interaction.options?.getString('symbol')?.trim();
      const prefix = interaction.guild ? (db.getGuildConfig(interaction.guild.id)?.prefix || '!') : '!';

      if (input?.toLowerCase() === 'help' || input?.toLowerCase() === 'cmds') {
        return interaction.reply(buildStockGuidancePayload(prefix));
      }

      await interaction.deferReply();

      try {
        if (!input) {
          const overview = await fetchMarketOverview();
          const imageBuffer = renderMarketOverviewCard(overview);
          const payload = buildMarketOverviewPayload(overview, imageBuffer, false, prefix);
          return await interaction.editReply(payload);
        } else {
          const stockData = await fetchStockData(input);
          const imageBuffer = renderSingleStockCard(stockData);
          const payload = buildStockPayload(stockData, imageBuffer, prefix);
          return await interaction.editReply(payload);
        }
      } catch (err) {
        return await interaction.editReply({
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `## Financial Reconnaissance Error | <a:atheNATICK:1557841381630681106>\n` +
                           `> -# <a:uptime:1552608831060844575> **Telemetry Fault:** ${err.message || 'Unable to resolve market data.'}\n\n` +
                           `> -# <a:uptime:1552608831060844575> **Notice:** ${DISCLAIMER_TEXT}`
                }
              ]
            }
          ]
        });
      }
    }
  },

  // 2. AI STOCK & MARKET ANALYSIS COMMAND
  {
    name: 'stockai',
    aliases: ['stockexplain', 'marketai', 'stai'],
    description: 'Ask Athena AI for detailed market analysis, earnings reports, stock movements, and financial concepts',
    category: 'utility',
    permissions: [],
    options: [
      {
        name: 'query',
        description: 'Financial question, stock symbol, or market event (e.g. why is tech dropping?, explain NVDA, what is P/E ratio)',
        type: 3, // STRING
        required: true
      }
    ],
    async executePrefix(message, args) {
      const query = args.join(' ').trim();
      if (!query) {
        return message.reply({
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `## Athena Stock AI Guidance | <a:atheNATICK:1557841381630681106>\n` +
                           `> -# <a:uptime:1552608831060844575> **Usage:** \`!stockai <question / topic / symbol>\`\n` +
                           `> -# • **Examples:** \`!stockai why did tech drop today?\`, \`!stockai explain NVDA earnings\`, \`!stockai what is market cap?\`\n` +
                           `> -# • **All Aliases:** \`!stockai\`, \`!stockexplain\`, \`!marketai\`, \`!stai\`\n\n` +
                           `> -# <a:uptime:1552608831060844575> **Risk Notice:** ${DISCLAIMER_TEXT}`
                }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      const loadingMsg = await message.reply({
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `<a:uptime:1552608831060844575> **Athena Financial AI:** Conducting market reconnaissance & synthesizing financial intelligence for \`"${query}"\`...`
              }
            ]
          }
        ],
        flags: MessageFlags.IsComponentsV2
      });

      try {
        // Attempt to detect if query mentions a specific ticker or company to enrich context
        let extraContext = '';
        const words = query.split(/\s+/);
        for (const word of words) {
          const cleanWord = word.replace(/[^A-Za-z0-9]/g, '');
          if (/^[A-Za-z]{1,5}$/.test(cleanWord)) {
            try {
              const testStock = await fetchStockData(cleanWord);
              if (testStock && testStock.price > 0) {
                extraContext += `[Live Market Quote Context]: ${testStock.name} (${testStock.symbol}) is currently trading at $${testStock.price.toFixed(2)} ${testStock.currency} (${testStock.change >= 0 ? '+' : ''}${testStock.changePct.toFixed(2)}% today). Day Range: $${testStock.dayLow.toFixed(2)} - $${testStock.dayHigh.toFixed(2)}. 52-Week Range: $${testStock.fiftyTwoWeekLow.toFixed(2)} - $${testStock.fiftyTwoWeekHigh.toFixed(2)}. Volume: ${testStock.volume.toLocaleString()}.\n`;
                break;
              }
            } catch {}
          }
        }

        const customSystem = [
          'You are Athena Prime Financial Intelligence, an elite Wall Street quantitative and macroeconomic analyst assistant.',
          'Temporal Context: The current year is 2026.',
          'Core Financial Directive:',
          '- Provide deep, analytical, objective financial analysis covering market drivers, monetary policy, macroeconomic indicators, earnings performance, and valuation metrics.',
          '- Ground your reasoning in data and established financial principles.',
          '- Formatting: Output in Discord grey font (-# ) with bold-underlined section headers (-# **__Section Header__**). Do NOT use markdown dividers (--- or ===).',
          '- Ground Truth & Ethics: Always remember that Athena can make mistakes. This analysis is generated by AI for informational and educational purposes only and does NOT constitute financial or investment advice.'
        ].join(' ');

        const aiPrompt = extraContext ? `${extraContext}\n\nUser Question: ${query}` : query;
        const aiResponse = await generateAIResponse(aiPrompt, {
          userId: message.author.id,
          username: message.author.username,
          guildId: message.guild.id,
          customSystem
        });

        const formatted = formatAIToGreyMarkdown(aiResponse);

        return await loadingMsg.edit({
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `## Financial Intelligence Analysis | <a:atheNATICK:1557841381630681106>\n` +
                           `> -# <a:uptime:1552608831060844575> **Inquiry:** \`${query}\`\n\n` +
                           formatted + `\n\n` +
                           `> -# <a:uptime:1552608831060844575> **Risk Notice:** ${DISCLAIMER_TEXT}`
                },
                { type: 14, divider: true },
                {
                  type: 10,
                  content: `-# **Athena Prime Neural Financial Sentry \u2022 Quantitative Intelligence Engine**`
                }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2
        });
      } catch (err) {
        return await loadingMsg.edit({
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `## Financial AI Generation Error | <a:atheNATICK:1557841381630681106>\n` +
                           `> -# <a:uptime:1552608831060844575> **Fault:** ${err.message || 'Unable to generate analysis.'}\n\n` +
                           `> -# <a:uptime:1552608831060844575> **Notice:** ${DISCLAIMER_TEXT}`
                }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }
    }
  },

  // 3. MARKET MOVERS COMMAND
  {
    name: 'movers',
    aliases: ['topmovers', 'gainers', 'losers', 'marketmovers'],
    description: 'Quick real-time breakdown of top gainers and decliners across mega-caps and crypto',
    category: 'utility',
    permissions: [],
    async executePrefix(message) {
      const loadingMsg = await message.reply({
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `<a:uptime:1552608831060844575> **Scanning Exchanges:** Compiling top market movers and volatility metrics...`
              }
            ]
          }
        ],
        flags: MessageFlags.IsComponentsV2
      });

      try {
        const prefix = db.getGuildConfig(message.guild.id)?.prefix || '!';
        const overview = await fetchMarketOverview();
        const allAssets = [...overview.indices, ...overview.tickers].filter(a => a.price > 0);
        allAssets.sort((a, b) => b.changePct - a.changePct);

        const gainers = allAssets.filter(a => a.changePct >= 0).slice(0, 4);
        const decliners = allAssets.filter(a => a.changePct < 0).reverse().slice(0, 4);

        const gainersList = gainers.map(g => `> -# • **${g.symbol || g.label}:** \`$${g.price.toFixed(2)}\` (\`+${g.changePct.toFixed(2)}%\`)`).join('\n') || '> -# • No major positive movers recorded.';
        const declinersList = decliners.map(d => `> -# • **${d.symbol || d.label}:** \`$${d.price.toFixed(2)}\` (\`${d.changePct.toFixed(2)}%\`)`).join('\n') || '> -# • No major negative decliners recorded.';

        return await loadingMsg.edit({
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `## Market Movers Telemetry | <a:atheNATICK:1557841381630681106>\n\n` +
                           `### Top Gainers & Momentum Leaders\n` +
                           gainersList + `\n\n` +
                           `### Top Decliners & Downward Volatility\n` +
                           declinersList + `\n\n` +
                           `### Supporting Commands Guidance\n` +
                           `> -# • \`${prefix}stock <symbol>\` \u2014 Single stock Canvas chart & telemetry\n` +
                           `> -# • \`${prefix}market\` \u2014 Global 6-index world market pulse\n` +
                           `> -# • \`${prefix}stockai <query>\` \u2014 AI financial analyst & earnings breakdown\n` +
                           `> -# • \`${prefix}crypto [coin]\` \u2014 Dedicated cryptocurrency charts (BTC, ETH, SOL)\n` +
                           `> -# • \`${prefix}stocknews [symbol]\` \u2014 Real-time press wiretap & headlines\n` +
                           `> -# • \`${prefix}stockchannel set <#channel>\` \u2014 Automated daily morning briefing upload\n\n` +
                           `> -# <a:uptime:1552608831060844575> **Risk Notice:** ${DISCLAIMER_TEXT}`
                },
                { type: 14, divider: true },
                {
                  type: 1,
                  components: [
                    {
                      type: 2,
                      custom_id: 'stk_ref_overview',
                      label: 'Global Pulse',
                      style: 2,
                      emoji: { name: '🌐' }
                    },
                    {
                      type: 2,
                      custom_id: 'stk_crypto',
                      label: 'Crypto Pulse',
                      style: 2,
                      emoji: { name: '🪙' }
                    },
                    {
                      type: 2,
                      custom_id: 'stk_help',
                      label: 'All Cmds Guide',
                      style: 2,
                      emoji: { name: '🧭' }
                    }
                  ]
                },
                { type: 14, divider: true },
                {
                  type: 10,
                  content: `-# **Athena Prime Volatility Scanner \u2022 Cross-Asset Velocity**`
                }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2
        });
      } catch (err) {
        return await loadingMsg.edit({
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `## Market Movers Error | <a:atheNATICK:1557841381630681106>\n` +
                           `> -# <a:uptime:1552608831060844575> **Fault:** ${err.message}\n\n` +
                           `> -# <a:uptime:1552608831060844575> **Notice:** ${DISCLAIMER_TEXT}`
                }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }
    }
  },

  // 4. CRYPTO PULSE COMMAND
  {
    name: 'crypto',
    aliases: ['cryptocurrency', 'coin', 'btc', 'eth'],
    description: 'Live cryptocurrency asset telemetry and Canvas price action',
    category: 'utility',
    permissions: [],
    async executePrefix(message, args) {
      const prefix = db.getGuildConfig(message.guild.id)?.prefix || '!';
      const rawArg = (args[0] || '').trim();
      if (rawArg.toLowerCase() === 'help' || rawArg.toLowerCase() === 'cmds') {
        return message.reply({ ...buildStockGuidancePayload(prefix), flags: MessageFlags.IsComponentsV2 });
      }

      let coin = (rawArg || 'BTC').toUpperCase();
      if (!coin.includes('-USD') && !coin.includes('-USDT')) {
        coin = `${coin}-USD`;
      }

      const loadingMsg = await message.reply({
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `<a:uptime:1552608831060844575> **Crypto Terminal:** Fetching blockchain market data for \`${coin}\`...`
              }
            ]
          }
        ],
        flags: MessageFlags.IsComponentsV2
      });

      try {
        const stockData = await fetchStockData(coin);
        const imageBuffer = renderSingleStockCard(stockData);
        const payload = buildStockPayload(stockData, imageBuffer, prefix);
        return await loadingMsg.edit(payload);
      } catch (err) {
        return await loadingMsg.edit({
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `## Crypto Telemetry Error | <a:atheNATICK:1557841381630681106>\n` +
                           `> -# <a:uptime:1552608831060844575> **Fault:** ${err.message || 'Crypto coin not found.'}\n` +
                           `> -# • **Try:** \`${prefix}crypto BTC\`, \`${prefix}crypto ETH\`, \`${prefix}crypto SOL\`, \`${prefix}crypto DOGE\`\n` +
                           `> -# • **All Features Guide:** Type \`${prefix}stock help\` for complete commands guidance.\n\n` +
                           `> -# <a:uptime:1552608831060844575> **Notice:** ${DISCLAIMER_TEXT}`
                }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }
    }
  },

  // 5. STOCK NEWS COMMAND
  {
    name: 'stocknews',
    aliases: ['marketnews', 'financenews'],
    description: 'Real-time financial news headlines and market catalysts',
    category: 'utility',
    permissions: [],
    async executePrefix(message, args) {
      const query = args.join(' ').trim() || 'stock market';
      const prefix = db.getGuildConfig(message.guild.id)?.prefix || '!';

      if (query.toLowerCase() === 'help' || query.toLowerCase() === 'cmds') {
        return message.reply({ ...buildStockGuidancePayload(prefix), flags: MessageFlags.IsComponentsV2 });
      }

      const loadingMsg = await message.reply({
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `<a:uptime:1552608831060844575> **Financial Wiretap:** Pulling live market news headlines for \`${query}\`...`
              }
            ]
          }
        ],
        flags: MessageFlags.IsComponentsV2
      });

      try {
        const newsItems = await fetchStockNews(query);
        if (!newsItems.length) {
          return await loadingMsg.edit({
            components: [
              {
                type: 17,
                components: [
                  {
                    type: 10,
                    content: `## No Headlines Found | <a:atheNATICK:1557841381630681106>\n` +
                             `> -# <a:uptime:1552608831060844575> No recent articles found for \`${query}\`.\n\n` +
                             `> -# <a:uptime:1552608831060844575> **Notice:** ${DISCLAIMER_TEXT}`
                  }
                ]
              }
            ],
            flags: MessageFlags.IsComponentsV2
          });
        }

        const headlines = newsItems.map((n, i) => {
          const dateStr = n.providerPublishTime ? `<t:${Math.floor(n.providerPublishTime.getTime() / 1000)}:R>` : '';
          return `> -# • **[${n.title}](${n.link})**\n> -#   *Source:* \`${n.publisher}\` ${dateStr}`;
        }).join('\n\n');

        return await loadingMsg.edit({
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `## Live Financial News Wire | <a:atheNATICK:1557841381630681106>\n` +
                           `> -# <a:uptime:1552608831060844575> **Subject:** \`${query}\`\n\n` +
                           headlines + `\n\n` +
                           `### Supporting Commands Guidance\n` +
                           `> -# • \`${prefix}stock <symbol>\` \u2014 Single stock Canvas chart & telemetry\n` +
                           `> -# • \`${prefix}market\` \u2014 Global 6-index world market pulse\n` +
                           `> -# • \`${prefix}stockai <query>\` \u2014 AI financial analyst & earnings breakdown\n` +
                           `> -# • \`${prefix}movers\` \u2014 Top market gainers & decliners\n` +
                           `> -# • \`${prefix}crypto [coin]\` \u2014 Dedicated cryptocurrency telemetry\n` +
                           `> -# • \`${prefix}stockchannel set <#channel>\` \u2014 Automated daily morning briefing upload\n\n` +
                           `> -# <a:uptime:1552608831060844575> **Risk Notice:** ${DISCLAIMER_TEXT}`
                },
                { type: 14, divider: true },
                {
                  type: 1,
                  components: [
                    {
                      type: 2,
                      custom_id: 'stk_ref_overview',
                      label: 'Global Pulse',
                      style: 2,
                      emoji: { name: '🌐' }
                    },
                    {
                      type: 2,
                      custom_id: 'stk_movers',
                      label: 'Market Movers',
                      style: 2,
                      emoji: { name: '🔥' }
                    },
                    {
                      type: 2,
                      custom_id: 'stk_crypto',
                      label: 'Crypto Pulse',
                      style: 2,
                      emoji: { name: '🪙' }
                    },
                    {
                      type: 2,
                      custom_id: 'stk_help',
                      label: 'All Cmds Guide',
                      style: 2,
                      emoji: { name: '🧭' }
                    }
                  ]
                },
                { type: 14, divider: true },
                {
                  type: 10,
                  content: `-# **Athena Prime Wiretap \u2022 Verified Financial Press Syndicate**`
                }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2
        });
      } catch (err) {
        return await loadingMsg.edit({
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `## News Retrieval Error | <a:atheNATICK:1557841381630681106>\n` +
                           `> -# <a:uptime:1552608831060844575> **Fault:** ${err.message}\n\n` +
                           `> -# <a:uptime:1552608831060844575> **Notice:** ${DISCLAIMER_TEXT}`
                }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }
    }
  },

  // 6. DAILY STOCK MARKET CHANNEL CONFIGURATION COMMAND
  {
    name: 'stockchannel',
    aliases: ['dailystock', 'setstockchannel', 'stockalert'],
    description: 'Configure automated daily stock market image upload and briefing channel',
    category: 'utility',
    permissions: [PermissionFlagsBits.ManageGuild],
    async executePrefix(message, args) {
      const sub = (args[0] || '').toLowerCase();
      const config = db.getGuildConfig(message.guild.id);
      const prefix = config?.prefix || '!';

      if (!sub || sub === 'help') {
        const boundChannelId = db.getStockChannel(message.guild.id);
        const boundChannelText = boundChannelId ? `<#${boundChannelId}> (\`${boundChannelId}\`)` : '`None (Disabled)`';

        return message.reply({
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `## Daily Stock Market Broadcaster Control | <a:atheNATICK:1557841381630681106>\n` +
                           `> -# <a:uptime:1552608831060844575> **Current Channel:** ${boundChannelText}\n` +
                           `> -# • **Scheduled Time:** \`09:30 AM EST (14:30 UTC)\` \u2014 Every day at US Market Open.\n\n` +
                           `### Available Directives\n` +
                           `> -# • \`${prefix}stockchannel set <#channel>\` \u2014 Bind daily stock market briefing upload channel.\n` +
                           `> -# • \`${prefix}stockchannel disable\` \u2014 Disarm automated daily market briefing.\n` +
                           `> -# • \`${prefix}stockchannel test\` \u2014 Immediately generate and dispatch today's market briefing into the configured channel.\n` +
                           `> -# • \`${prefix}stockchannel status\` \u2014 Check current broadcast channel ID & delivery state.\n\n` +
                           `> -# <a:uptime:1552608831060844575> **Risk Notice:** ${DISCLAIMER_TEXT}`
                },
                { type: 14, divider: true },
                {
                  type: 10,
                  content: `-# **Athena Prime Stock Automation \u2022 Ground-Truth Database ID Resolution**`
                }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      if (sub === 'set') {
        const channelMention = message.mentions.channels.first();
        const rawId = args[1]?.replace(/[<#>]/g, '');
        const targetChannel = channelMention || (rawId ? message.guild.channels.cache.get(rawId) || await message.guild.channels.fetch(rawId).catch(() => null) : null);

        if (!targetChannel) {
          return message.reply({
            components: [
              {
                type: 17,
                components: [
                  {
                    type: 10,
                    content: `## Invalid Channel Specified | <a:atheNATICK:1557841381630681106>\n` +
                             `> -# <a:uptime:1552608831060844575> **Usage:** \`${prefix}stockchannel set <#channel>\` or \`${prefix}stockchannel set <channel_id>\`\n\n` +
                             `> -# <a:uptime:1552608831060844575> **Notice:** ${DISCLAIMER_TEXT}`
                  }
                ]
              }
            ],
            flags: MessageFlags.IsComponentsV2
          });
        }

        // Store channel ID in database immediately
        db.setStockChannel(message.guild.id, targetChannel.id);

        return message.reply({
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `## Daily Stock Channel Configured | <a:atheNATICK:1557841381630681106>\n` +
                           `> -# <a:uptime:1552608831060844575> **Bound Channel:** <#${targetChannel.id}> (\`${targetChannel.id}\`)\n` +
                           `> -# • **Schedule:** Athena will automatically generate and upload the high-resolution World Market Pulse dashboard image and briefing here every day at **09:30 AM EST (14:30 UTC)**.\n` +
                           `> -# • **Instant Test:** Type \`${prefix}stockchannel test\` to verify delivery right now.\n\n` +
                           `> -# <a:uptime:1552608831060844575> **Risk Notice:** ${DISCLAIMER_TEXT}`
                }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      if (sub === 'disable' || sub === 'off') {
        db.setStockChannel(message.guild.id, null);
        return message.reply({
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `## Daily Stock Broadcaster Disarmed | <a:atheNATICK:1557841381630681106>\n` +
                           `> -# <a:uptime:1552608831060844575> Daily stock market upload has been disabled for this server.\n\n` +
                           `> -# <a:uptime:1552608831060844575> **Notice:** ${DISCLAIMER_TEXT}`
                }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }

      if (sub === 'test') {
        const boundChannelId = db.getStockChannel(message.guild.id);
        if (!boundChannelId) {
          return message.reply({
            components: [
              {
                type: 17,
                components: [
                  {
                    type: 10,
                    content: `## No Stock Channel Configured | <a:atheNATICK:1557841381630681106>\n` +
                             `> -# <a:uptime:1552608831060844575> Please set a channel first via \`${prefix}stockchannel set <#channel>\`.\n\n` +
                             `> -# <a:uptime:1552608831060844575> **Notice:** ${DISCLAIMER_TEXT}`
                  }
                ]
              }
            ],
            flags: MessageFlags.IsComponentsV2
          });
        }

        const channel = message.guild.channels.cache.get(boundChannelId) || await message.guild.channels.fetch(boundChannelId).catch(() => null);
        if (!channel) {
          return message.reply({
            components: [
              {
                type: 17,
                components: [
                  {
                    type: 10,
                    content: `## Target Channel Not Found | <a:atheNATICK:1557841381630681106>\n` +
                             `> -# <a:uptime:1552608831060844575> Channel ID \`${boundChannelId}\` could not be resolved. Please re-bind via \`${prefix}stockchannel set <#channel>\`.\n\n` +
                             `> -# <a:uptime:1552608831060844575> **Notice:** ${DISCLAIMER_TEXT}`
                  }
                ]
              }
            ],
            flags: MessageFlags.IsComponentsV2
          });
        }

        const testMsg = await message.reply({
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `<a:uptime:1552608831060844575> **Generating Daily Market Briefing Test:** Compiling 6-index telemetry & dispatching to <#${channel.id}>...`
                }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2
        });

        const success = await dispatchDailyBriefing(channel);
        if (success) {
          return await testMsg.edit({
            components: [
              {
                type: 17,
                components: [
                  {
                    type: 10,
                    content: `## Daily Stock Briefing Dispatched | <a:atheNATICK:1557841381630681106>\n` +
                             `> -# <a:uptime:1552608831060844575> Daily stock market intelligence image and report successfully delivered to <#${channel.id}>.\n\n` +
                             `> -# <a:uptime:1552608831060844575> **Notice:** ${DISCLAIMER_TEXT}`
                  }
                ]
              }
            ],
            flags: MessageFlags.IsComponentsV2
          });
        } else {
          return await testMsg.edit({
            components: [
              {
                type: 17,
                components: [
                  {
                    type: 10,
                    content: `## Daily Stock Dispatch Failed | <a:atheNATICK:1557841381630681106>\n` +
                             `> -# <a:uptime:1552608831060844575> Could not post to <#${channel.id}>. Please verify bot permissions in that channel.\n\n` +
                             `> -# <a:uptime:1552608831060844575> **Notice:** ${DISCLAIMER_TEXT}`
                  }
                ]
              }
            ],
            flags: MessageFlags.IsComponentsV2
          });
        }
      }

      if (sub === 'status') {
        const boundChannelId = db.getStockChannel(message.guild.id);
        const boundChannelText = boundChannelId ? `<#${boundChannelId}> (\`${boundChannelId}\`)` : '`None (Disabled)`';

        return message.reply({
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `## Stock Channel Status | <a:atheNATICK:1557841381630681106>\n` +
                           `> -# <a:uptime:1552608831060844575> **Bound Channel:** ${boundChannelText}\n` +
                           `> -# • **Active Schedule:** \`09:30 AM EST (14:30 UTC)\` daily.\n` +
                           `> -# • **Last Sent Date:** \`${config.lastDailyStockSentDate || 'Never'}\`\n\n` +
                           `> -# <a:uptime:1552608831060844575> **Notice:** ${DISCLAIMER_TEXT}`
                }
              ]
            }
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }
    }
  }
];

/**
 * Handles interactive button clicks on stock cards
 */
export async function handleStockButton(interaction) {
  const customId = interaction.customId;

  // Refresh single stock card
  if (customId.startsWith('stk_ref_') && customId !== 'stk_ref_overview') {
    const symbol = customId.replace('stk_ref_', '');
    await interaction.deferUpdate();
    try {
      const stockData = await fetchStockData(symbol);
      const imageBuffer = renderSingleStockCard(stockData);
      const payload = buildStockPayload(stockData, imageBuffer);
      return await interaction.editReply(payload);
    } catch (err) {
      return await interaction.followUp({ content: `-! Telemetry refresh failed: ${err.message}`, flags: MessageFlags.Ephemeral });
    }
  }

  // Refresh market overview
  if (customId === 'stk_ref_overview') {
    await interaction.deferUpdate();
    try {
      const overview = await fetchMarketOverview();
      const imageBuffer = renderMarketOverviewCard(overview);
      const payload = buildMarketOverviewPayload(overview, imageBuffer, false);
      return await interaction.editReply(payload);
    } catch (err) {
      return await interaction.followUp({ content: `-! Overview refresh failed: ${err.message}`, flags: MessageFlags.Ephemeral });
    }
  }

  // AI Market Analysis for symbol
  if (customId.startsWith('stk_ai_')) {
    const symbol = customId.replace('stk_ai_', '');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const stockData = await fetchStockData(symbol);
      const customSystem = [
        'You are Athena Prime Financial Intelligence, an elite Wall Street quantitative and macroeconomic analyst assistant.',
        'Temporal Context: The current year is 2026.',
        'Provide deep, analytical, objective financial breakdown covering valuation, recent catalysts, earnings sentiment, and technical levels.',
        'Formatting: Output in Discord grey font (-# ) with bold-underlined headers (-# **__Header__**). Never use divider lines.',
        'Ethics: Athena can make mistakes. Always mention that this is for educational/informational purposes only and not financial advice.'
      ].join(' ');

      const prompt = `Conduct a technical and fundamental market breakdown for ${stockData.name} (${stockData.symbol}). Current price: $${stockData.price.toFixed(2)} (${stockData.change >= 0 ? '+' : ''}${stockData.changePct.toFixed(2)}% today). Day range: $${stockData.dayLow.toFixed(2)} - $${stockData.dayHigh.toFixed(2)}. 52-Week Range: $${stockData.fiftyTwoWeekLow.toFixed(2)} - $${stockData.fiftyTwoWeekHigh.toFixed(2)}. Volume: ${stockData.volume.toLocaleString()}.`;
      const aiResponse = await generateAIResponse(prompt, {
        userId: interaction.user.id,
        username: interaction.user.username,
        guildId: interaction.guild?.id || 'dm',
        customSystem
      });

      const formatted = formatAIToGreyMarkdown(aiResponse);

      return await interaction.editReply({
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `## ${stockData.name} (${stockData.symbol}) AI Analysis | <a:atheNATICK:1557841381630681106>\n\n` +
                         formatted + `\n\n` +
                         `> -# <a:uptime:1552608831060844575> **Risk Notice:** ${DISCLAIMER_TEXT}`
              }
            ]
          }
        ]
      });
    } catch (err) {
      return await interaction.editReply({ content: `-! AI analysis error: ${err.message}` });
    }
  }

  // News Headlines for symbol
  if (customId.startsWith('stk_news_')) {
    const symbol = customId.replace('stk_news_', '');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const newsItems = await fetchStockNews(symbol);
      if (!newsItems.length) {
        return await interaction.editReply({ content: `No recent news articles found for ${symbol}.` });
      }

      const headlines = newsItems.map((n, i) => {
        const dateStr = n.providerPublishTime ? `<t:${Math.floor(n.providerPublishTime.getTime() / 1000)}:R>` : '';
        return `> -# • **[${n.title}](${n.link})**\n> -#   *Source:* \`${n.publisher}\` ${dateStr}`;
      }).join('\n\n');

      return await interaction.editReply({
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `## ${symbol} Financial News Wire | <a:atheNATICK:1557841381630681106>\n\n` +
                         headlines + `\n\n` +
                         `> -# <a:uptime:1552608831060844575> **Risk Notice:** ${DISCLAIMER_TEXT}`
              }
            ]
          }
        ]
      });
    } catch (err) {
      return await interaction.editReply({ content: `-! News retrieval error: ${err.message}` });
    }
  }

  // Market Movers button
  if (customId === 'stk_movers') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const overview = await fetchMarketOverview();
      const allAssets = [...overview.indices, ...overview.tickers].filter(a => a.price > 0);
      allAssets.sort((a, b) => b.changePct - a.changePct);

      const gainers = allAssets.filter(a => a.changePct >= 0).slice(0, 4);
      const decliners = allAssets.filter(a => a.changePct < 0).reverse().slice(0, 4);

      const gainersList = gainers.map(g => `> -# • **${g.symbol || g.label}:** \`$${g.price.toFixed(2)}\` (\`+${g.changePct.toFixed(2)}%\`)`).join('\n') || '> -# • No major positive movers recorded.';
      const declinersList = decliners.map(d => `> -# • **${d.symbol || d.label}:** \`$${d.price.toFixed(2)}\` (\`${d.changePct.toFixed(2)}%\`)`).join('\n') || '> -# • No major negative decliners recorded.';

      return await interaction.editReply({
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `## Market Movers Telemetry | <a:atheNATICK:1557841381630681106>\n\n` +
                         `### Top Gainers & Momentum Leaders\n` +
                         gainersList + `\n\n` +
                         `### Top Decliners & Downward Volatility\n` +
                         declinersList + `\n\n` +
                         `> -# <a:uptime:1552608831060844575> **Risk Notice:** ${DISCLAIMER_TEXT}`
              }
            ]
          }
        ]
      });
    } catch (err) {
      return await interaction.editReply({ content: `-! Error compiling movers: ${err.message}` });
    }
  }

  // Crypto pulse button
  if (customId === 'stk_crypto') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const btc = await fetchStockData('BTC-USD');
      const eth = await fetchStockData('ETH-USD');
      const sol = await fetchStockData('SOL-USD');

      return await interaction.editReply({
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `## Crypto Asset Telemetry | <a:atheNATICK:1557841381630681106>\n\n` +
                         `> -# • **Bitcoin (BTC):** \`$${btc.price.toLocaleString()}\` (${btc.change >= 0 ? '+' : ''}${btc.changePct.toFixed(2)}%)\n` +
                         `> -# • **Ethereum (ETH):** \`$${eth.price.toLocaleString()}\` (${eth.change >= 0 ? '+' : ''}${eth.changePct.toFixed(2)}%)\n` +
                         `> -# • **Solana (SOL):** \`$${sol.price.toLocaleString()}\` (${sol.change >= 0 ? '+' : ''}${sol.changePct.toFixed(2)}%)\n\n` +
                         `> -# <a:uptime:1552608831060844575> **Risk Notice:** ${DISCLAIMER_TEXT}`
              }
            ]
          }
        ]
      });
    } catch (err) {
      return await interaction.editReply({ content: `-! Error compiling crypto: ${err.message}` });
    }
  }

  // All Cmds Guide button
  if (customId === 'stk_help') {
    const config = interaction.guild ? db.getGuildConfig(interaction.guild.id) : null;
    const prefix = config?.prefix || '!';
    return await interaction.reply({ ...buildStockGuidancePayload(prefix), flags: MessageFlags.Ephemeral });
  }
}
