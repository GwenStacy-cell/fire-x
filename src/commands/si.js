import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import db from '../database.js';
import { cleanDisplayName } from '../utils/helpers.js';

export const commands = [
  {
    name: 'si',
    description: 'Displays advanced CV2 Server Information.',
    async executePrefix(message, args) {
        const guild = message.guild;
        if (!guild) return;

        // Instant O(1) cache lookup for owner and counts
        const owner = guild.members.cache.get(guild.ownerId) || (await guild.fetchOwner().catch(() => null));
        const bots = guild.members.cache.filter(m => m.user.bot).size;
        const humans = Math.max(0, guild.memberCount - bots);
        
        const textChannels = guild.channels.cache.filter(c => c.type === 0).size;
        const voiceChannels = guild.channels.cache.filter(c => c.type === 2).size;
        const categories = guild.channels.cache.filter(c => c.type === 4).size;
        const stageChannels = guild.channels.cache.filter(c => c.type === 13).size;

        const emojis = guild.emojis.cache;
        const animated = emojis.filter(e => e.animated).size;
        const regular = emojis.size - animated;
        const stickers = guild.stickers.cache.size;

        let emojiArr = emojis.map(e => e.toString());
        let emojiSample = emojiArr.length > 25 ? emojiArr.slice(0, 25).join(' ') + ' ...' : emojiArr.join(' ');

        const boostLevel = guild.premiumTier;
        const boostCount = guild.premiumSubscriptionCount || 0;
        
        const roleArr = guild.roles.cache.sort((a, b) => b.position - a.position).filter(r => r.id !== guild.id).map(r => r.toString());
        const roleSample = roleArr.length > 30 ? roleArr.slice(0, 30).join(', ') + ' ...' : roleArr.join(', ');

        const features = guild.features.map(f => f.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())).join(', ') || 'No special features.';

        const securityData = db.getSpamPermitted();
        const whitelistCount = securityData ? securityData.length : 0;
        const extraOwnersCount = db.getExtraOwners(guild.id).length;

        const buildContainer = (title, text, thumb, footer) => {
            const comps = [];
            if (title) {
                comps.push({ type: 10, content: `### **${title}**` });
                comps.push({ type: 14, divider: true });
            }
            
            if (thumb) {
                comps.push({ 
                    type: 9, 
                    components: [{ type: 10, content: text }],
                    accessory: { type: 11, media: { url: thumb } }
                });
            } else {
                const blockquoted = text.split('\n').map(l => '> ' + l).join('\n');
                comps.push({ type: 10, content: blockquoted });
            }

            if (footer) {
                comps.push({ type: 14, divider: true });
                comps.push({ type: 10, content: `-# ${footer}` });
            }
            return { type: 17, components: comps };
        };

        const vLevel = ['None', 'Low', 'Medium', 'High', 'Highest'][guild.verificationLevel] || 'Unknown';
        const mfaLevel = guild.mfaLevel === 1 ? 'Enabled' : 'Disabled';
        const filterLevel = ['Disabled', 'Members without roles', 'All Members'][guild.explicitContentFilter] || 'Unknown';

        const c1 = buildContainer(
            'Server Information.',
            `**Name :** \`${guild.name}\`\n**Server ID :** \`${guild.id}\`\n**Owner :** ${owner ? `[${cleanDisplayName(owner.displayName || owner.user.username)}](https://discord.com/users/${owner.id})` : 'Unknown'}\n**Created At :** <t:${Math.floor(guild.createdTimestamp / 1000)}:R>\n**Total Members :** ${guild.memberCount}`,
            guild.iconURL({ dynamic: true, size: 256 })
        );

        const c2 = buildContainer(
            'Extras',
            `**Verification Level :** ${vLevel}\n**MFA Level :** ${mfaLevel}\n**Content Filter :** ${filterLevel}`
        );

        const c3 = buildContainer(
            'Features',
            features
        );

        const c4 = buildContainer(
            'Members',
            `**Total Members :** ${guild.memberCount}\n**Humans :** ${humans}\n**Bots :** ${bots}`
        );

        const c5 = buildContainer(
            'Channels',
            `**Categories :** ${categories}\n**Text Channels :** ${textChannels}\n**Voice Channels :** ${voiceChannels}\n**Stage Channels :** ${stageChannels}`
        );

        const c6 = buildContainer(
            'Emojis',
            `**Regular emojis :** ${regular}\n**Animated emojis :** ${animated}\n**Stickers :** ${stickers}\n**Total :** ${emojis.size + stickers}\n\n${emojiSample || 'None'}`
        );

        const c7 = buildContainer(
            'Boosts',
            `**Boost Level :** Level ${boostLevel}\n**Boost count :** ${boostCount}\n**Boosters :** 0\n**Booster Role :** ${guild.roles.premiumSubscriberRole ? guild.roles.premiumSubscriberRole.toString() : 'None'}`
        );

        const c8 = buildContainer(
            'Roles',
            roleSample || 'None'
        );

        const c9 = buildContainer(
            'Banner',
            `| ${guild.bannerURL() ? `[Click here to view banner](${guild.bannerURL({ size: 1024, dynamic: true })})` : 'No server banner set.'}`
        );

        const c10 = buildContainer(
            'Security Status',
            `**Security System :** Enabled\n**Whitelisted Users :** ${whitelistCount}\n**Whitelisted Roles :** 0\n**Extra Owners :** ${extraOwnersCount}`,
            null,
            `Powered by Athena | Requested by ${message.author.username}`
        );

        // Send first 5
        await message.reply({ components: [c1, c2, c3, c4, c5], flags: MessageFlags.IsComponentsV2 });
        // Send next 5
        await message.channel.send({ components: [c6, c7, c8, c9, c10], flags: MessageFlags.IsComponentsV2 });
    }
  }
];
