import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
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

export const pendingProposals = new Map();
export const pendingAdoptions = new Map();

export const RING_TIERS = {
  'silver': 'Silver Band',
  'gold': '24k Gold Band',
  'diamond': 'Flawless Diamond Ring',
  'sapphire': 'Royal Sapphire Ring',
  'cyber': 'Cyberpunk Holographic Core Ring'
};

/**
 * Creates marriage proposal payload with interactive accept/decline buttons
 */
export function buildProposalPayload(proposer, target, ring = 'Flawless Diamond Ring') {
  const proposalId = 'prop_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  pendingProposals.set(proposalId, {
    id: proposalId,
    proposerId: proposer.id,
    targetId: target.id,
    ring,
    createdAt: Date.now()
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`fam:prop:accept:${proposalId}`)
      .setLabel('Accept Proposal')
      .setEmoji('1565665642084827206')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`fam:prop:decline:${proposalId}`)
      .setLabel('Decline')
      .setEmoji('1565665644806934639')
      .setStyle(ButtonStyle.Secondary)
  );

  const container = {
    type: 17,
    components: [
      {
        type: 10,
        content: `# ${getRandomHeadingGlyph()} Romantic Marriage Proposal | ${TICK_EMOJI}\n` +
                 `> -# <a:uptime:1552608831060844575> <@${proposer.id}> has dropped on one knee to propose to <@${target.id}>!\n\n` +
                 `${BULLET_EMOJI} **Ring Offered:** \`${ring}\`\n` +
                 `${BULLET_EMOJI} <@${target.id}>, do you take <@${proposer.id}> to be your lawfully wedded roleplay partner?`
      },
      { type: 14, divider: true },
      row.toJSON(),
      { type: 14, divider: true },
      { type: 10, content: `-# **Athena Prime Social Matrix \u00b7 Holy Matrimony Registry**` }
    ]
  };

  return sanitizeCV2Payload({
    components: [container],
    flags: MessageFlags.IsComponentsV2
  });
}

/**
 * Creates adoption request payload with interactive accept/decline buttons
 */
export function buildAdoptionPayload(parent, child) {
  const adoptionId = 'adopt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  pendingAdoptions.set(adoptionId, {
    id: adoptionId,
    parentId: parent.id,
    childId: child.id,
    createdAt: Date.now()
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`fam:adopt:accept:${adoptionId}`)
      .setLabel('Accept Adoption')
      .setEmoji('1565665642084827206')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`fam:adopt:decline:${adoptionId}`)
      .setLabel('Decline')
      .setEmoji('1565665644806934639')
      .setStyle(ButtonStyle.Secondary)
  );

  const container = {
    type: 17,
    components: [
      {
        type: 10,
        content: `# ${getRandomHeadingGlyph()} Family Adoption Request | ${TICK_EMOJI}\n` +
                 `> -# <a:uptime:1552608831060844575> <@${parent.id}> wants to adopt <@${child.id}> into their family lineage!\n\n` +
                 `${BULLET_EMOJI} <@${child.id}>, do you accept <@${parent.id}> as your parent?`
      },
      { type: 14, divider: true },
      row.toJSON(),
      { type: 14, divider: true },
      { type: 10, content: `-# **Athena Prime Social Matrix \u00b7 Kinship & Adoption**` }
    ]
  };

  return sanitizeCV2Payload({
    components: [container],
    flags: MessageFlags.IsComponentsV2
  });
}

/**
 * Builds the comprehensive visual family tree breakdown
 */
export function buildFamilyTreePayload(guild, targetUser) {
  const fam = db.getFamily(guild.id, targetUser.id);
  const spouse = fam.spouseId ? `<@${fam.spouseId}>` : '*None (Single)*';
  const parent = fam.parentId ? `<@${fam.parentId}>` : '*None (Independent)*';
  const children = fam.children.length > 0 ? fam.children.map(id => `<@${id}>`).join(', ') : '*None*';

  let marriageDetails = '';
  if (fam.spouseId && fam.marriedAt) {
    const days = Math.max(0, Math.floor((Date.now() - fam.marriedAt) / (1000 * 60 * 60 * 24)));
    marriageDetails = `\n${BULLET_EMOJI} **Ring Tier:** \`${fam.ringType || 'Diamond Band'}\` \u00b7 **Together:** \`${days} day(s)\``;
  }

  const container = {
    type: 17,
    components: [
      {
        type: 10,
        content: `# ${getRandomHeadingGlyph()} Family Lineage Tree | ${TICK_EMOJI}\n` +
                 `> -# <a:uptime:1552608831060844575> Official Kinship & Dynasty record for <@${targetUser.id}>:\n\n` +
                 `**__Primary Bonds:__**\n` +
                 `${BULLET_EMOJI} **Spouse:** ${spouse}${marriageDetails}\n` +
                 `${BULLET_EMOJI} **Parent:** ${parent}\n` +
                 `${BULLET_EMOJI} **Children (${fam.children.length}):** ${children}\n\n` +
                 `Use \`!marry @user\` to propose or \`!adopt @user\` to expand your family tree!`
      },
      { type: 14, divider: true },
      { type: 10, content: `-# **Athena Prime Social Matrix \u00b7 Verified Family Registry**` }
    ]
  };

  return sanitizeCV2Payload({
    components: [container],
    flags: MessageFlags.IsComponentsV2
  });
}
