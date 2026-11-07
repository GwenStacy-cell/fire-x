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
  buildProposalPayload, 
  buildAdoptionPayload, 
  buildFamilyTreePayload, 
  RING_TIERS 
} from '../utils/familyEngine.js';

export const commands = [
  // --- MARRY / PROPOSE ---
  {
    name: 'marry',
    aliases: ['propose', 'marriage'],
    description: 'Propose marriage to a server member with a custom engagement ring',
    category: 'engagement',
    options: [
      { name: 'partner', description: 'The member to propose to', type: 6, required: true },
      { name: 'ring', description: 'Ring tier (silver, gold, diamond, sapphire, cyber)', type: 3, required: false }
    ],

    async executePrefix(message, args) {
      const target = message.mentions.users.first();
      if (!target) {
        return message.reply(cv2.warn(
          `Partner Required | ${WARN_EMOJI}`,
          `Please mention the member you want to marry: \`!marry @user [ring]\`.`
        ));
      }

      if (target.id === message.author.id) {
        return message.reply(cv2.warn(`Self-Marriage Forbidden | ${WARN_EMOJI}`, `You cannot marry yourself!`));
      }

      if (target.bot) {
        return message.reply(cv2.warn(`Bot Marriage Forbidden | ${WARN_EMOJI}`, `You cannot marry bots!`));
      }

      // Check existing marriages
      const authorMarriage = db.getMarriage(message.guild.id, message.author.id);
      if (authorMarriage) {
        return message.reply(cv2.warn(
          `Already Married | ${WARN_EMOJI}`,
          `You are already lawfully married to <@${authorMarriage.partnerId}>! Run \`!divorce\` first.`
        ));
      }

      const targetMarriage = db.getMarriage(message.guild.id, target.id);
      if (targetMarriage) {
        return message.reply(cv2.warn(
          `Partner Taken | ${WARN_EMOJI}`,
          `<@${target.id}> is already married to <@${targetMarriage.partnerId}>!`
        ));
      }

      const ringKey = (args[1] || 'diamond').toLowerCase();
      const ringName = RING_TIERS[ringKey] || 'Flawless Diamond Ring';

      const payload = buildProposalPayload(message.author, target, ringName);
      return message.reply(payload);
    }
  },

  // --- DIVORCE ---
  {
    name: 'divorce',
    aliases: ['breakup'],
    description: 'Divorce your current married partner and dissolve the bond',
    category: 'engagement',

    async executePrefix(message) {
      const marriage = db.getMarriage(message.guild.id, message.author.id);
      if (!marriage) {
        return message.reply(cv2.warn(
          `Not Married | ${WARN_EMOJI}`,
          `You are currently single! Find someone special using \`!marry @user\`.`
        ));
      }

      const exPartnerId = marriage.partnerId;
      db.divorceMarriage(message.guild.id, message.author.id);

      return message.reply(cv2.danger(
        `Marriage Dissolved | ${WRONG_EMOJI}`,
        `<@${message.author.id}> has filed for divorce and severed their holy bond with <@${exPartnerId}>.\n` +
        `Both members are now officially single.`
      ));
    }
  },

  // --- ADOPT ---
  {
    name: 'adopt',
    aliases: ['adoptchild'],
    description: 'Adopt a server member into your family lineage',
    category: 'engagement',
    options: [
      { name: 'child', description: 'The member to adopt', type: 6, required: true }
    ],

    async executePrefix(message) {
      const target = message.mentions.users.first();
      if (!target) {
        return message.reply(cv2.warn(
          `Child Required | ${WARN_EMOJI}`,
          `Please mention the member you want to adopt: \`!adopt @user\`.`
        ));
      }

      if (target.id === message.author.id) {
        return message.reply(cv2.warn(`Self-Adoption Forbidden | ${WARN_EMOJI}`, `You cannot adopt yourself!`));
      }

      if (target.bot) {
        return message.reply(cv2.warn(`Bot Adoption Forbidden | ${WARN_EMOJI}`, `You cannot adopt bots!`));
      }

      const fam = db.getFamily(message.guild.id, target.id);
      if (fam.parentId) {
        return message.reply(cv2.warn(
          `Already Adopted | ${WARN_EMOJI}`,
          `<@${target.id}> already has a registered parent: <@${fam.parentId}>!`
        ));
      }

      const payload = buildAdoptionPayload(message.author, target);
      return message.reply(payload);
    }
  },

  // --- DISOWN ---
  {
    name: 'disown',
    aliases: ['disownchild'],
    description: 'Disown a child from your family lineage',
    category: 'engagement',
    options: [
      { name: 'child', description: 'The child to disown', type: 6, required: true }
    ],

    async executePrefix(message) {
      const target = message.mentions.users.first();
      if (!target) {
        return message.reply(cv2.warn(
          `Child Required | ${WARN_EMOJI}`,
          `Please mention the child to disown: \`!disown @user\`.`
        ));
      }

      const success = db.disownChild(message.guild.id, message.author.id, target.id);
      if (!success) {
        return message.reply(cv2.warn(
          `Not Your Child | ${WARN_EMOJI}`,
          `<@${target.id}> is not registered as your child.`
        ));
      }

      return message.reply(cv2.danger(
        `Family Tie Severed | ${WRONG_EMOJI}`,
        `<@${message.author.id}> has disowned <@${target.id}> from their family lineage.`
      ));
    }
  },

  // --- FAMILY / TREE ---
  {
    name: 'family',
    aliases: ['tree', 'lineage', 'familytree'],
    description: 'View your family lineage, spouse, parents, and children',
    category: 'engagement',
    options: [
      { name: 'user', description: 'View family tree for another member', type: 6, required: false }
    ],

    async executePrefix(message) {
      const target = message.mentions.users.first() || message.author;
      const payload = buildFamilyTreePayload(message.guild, target);
      return message.reply(payload);
    }
  }
];

export default { commands };
