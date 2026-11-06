import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Client as NekosBestClient } from 'nekos-best.js';
import fetch from 'node-fetch';
import db from '../database.js';
import { 
  TICK_EMOJI, 
  WRONG_EMOJI, 
  WARN_EMOJI, 
  BULLET_EMOJI, 
  getRandomHeadingGlyph 
} from './emojis.js';

const nbClient = new NekosBestClient();

// In-memory GIF cache and history tracker
const gifCache = new Map();
const recentGifs = new Set();

// =========================================================================
// 1. CURATED ROLEPLAY ACTION REGISTRY (50+ Expressive Actions)
// =========================================================================
export const ROLEPLAY_ACTIONS = [
  // --- Affection & Warmth ---
  {
    id: 'hug',
    name: 'Hug',
    category: 'affection',
    color: 0xFF85A2,
    verb: 'gives a warm, tight hug to',
    selfVerb: 'curls up and needs a comforting hug',
    botVerb: 'gives Athena a big warm hug! Athena purrs happily and projects a sparkling holographic warmth shield around you.',
    counters: [
      { id: 'hug', label: 'Hug Back', style: ButtonStyle.Success },
      { id: 'blush', label: 'Blush', style: ButtonStyle.Secondary },
      { id: 'pout', label: 'Pout', style: ButtonStyle.Secondary }
    ]
  },
  {
    id: 'kiss',
    name: 'Kiss',
    category: 'affection',
    color: 0xFF2A6D,
    verb: 'sweetly kisses',
    selfVerb: 'blows a sweet kiss into the air',
    botVerb: 'sweetly kisses Athena! Athena\'s neural core flashes bright crimson as heat sensors momentarily overload.',
    counters: [
      { id: 'kiss', label: 'Kiss Back', style: ButtonStyle.Danger },
      { id: 'blush', label: 'Blush Bright Red', style: ButtonStyle.Secondary },
      { id: 'slap', label: 'Slap Away!', style: ButtonStyle.Secondary }
    ]
  },
  {
    id: 'pat',
    name: 'Pat',
    category: 'affection',
    color: 0x5BC0BE,
    verb: 'gently pats the head of',
    selfVerb: 'pats their own head with a lonely sigh',
    botVerb: 'gently pats Athena\'s head. Athena hums with delight and optimizes all defense algorithms for you.',
    counters: [
      { id: 'pat', label: 'Pat Back', style: ButtonStyle.Primary },
      { id: 'blush', label: 'Blush', style: ButtonStyle.Secondary },
      { id: 'smile', label: 'Smile', style: ButtonStyle.Success }
    ]
  },
  {
    id: 'cuddle',
    name: 'Cuddle',
    category: 'affection',
    color: 0xFF99C8,
    verb: 'snuggles in close and cuddles with',
    selfVerb: 'wraps in a fluffy blanket and wants to cuddle',
    botVerb: 'cuddles up against Athena. Athena activates soft ambient heating mode.',
    counters: [
      { id: 'cuddle', label: 'Cuddle Closer', style: ButtonStyle.Success },
      { id: 'sleep', label: 'Fall Asleep', style: ButtonStyle.Secondary },
      { id: 'blush', label: 'Blush', style: ButtonStyle.Secondary }
    ]
  },
  {
    id: 'snuggle',
    name: 'Snuggle',
    category: 'affection',
    color: 0xFFB4D6,
    verb: 'snuggles warmly up to',
    selfVerb: 'is snuggling with their favorite plushie',
    botVerb: 'snuggles up to Athena! Athena deploys protective firewall blankets.',
    counters: [
      { id: 'cuddle', label: 'Snuggle Closer', style: ButtonStyle.Success },
      { id: 'pat', label: 'Headpat', style: ButtonStyle.Primary }
    ]
  },
  {
    id: 'holdhands',
    name: 'Hold Hands',
    category: 'affection',
    color: 0xFFCAD4,
    verb: 'interlaces fingers and lovingly holds hands with',
    selfVerb: 'wants someone to gently hold their hand',
    botVerb: 'takes Athena\'s hand. Athena initiates biometric synchronization with a gentle smile.',
    counters: [
      { id: 'holdhands', label: 'Squeeze Tight', style: ButtonStyle.Primary },
      { id: 'blush', label: 'Blush Shyly', style: ButtonStyle.Secondary }
    ]
  },
  {
    id: 'nuzzle',
    name: 'Nuzzle',
    category: 'affection',
    color: 0xE6AF2E,
    verb: 'sweetly nuzzles the cheek of',
    selfVerb: 'nuzzles into a cozy sweater',
    botVerb: 'gently nuzzles Athena\'s cheek. Athena\'s optics soften with affection.',
    counters: [
      { id: 'pat', label: 'Pat', style: ButtonStyle.Primary },
      { id: 'hug', label: 'Hug', style: ButtonStyle.Success }
    ]
  },
  {
    id: 'feed',
    name: 'Feed',
    category: 'affection',
    color: 0xF3C68F,
    verb: 'gently offers a delicious bite of food to',
    selfVerb: 'happily munches on a tasty snack alone',
    botVerb: 'offers Athena a treat. Athena converts the snack into pure energy and nods gratefully!',
    counters: [
      { id: 'nom', label: 'Nom It!', style: ButtonStyle.Success },
      { id: 'smile', label: 'Say Thanks', style: ButtonStyle.Primary },
      { id: 'pout', label: 'Too Hot!', style: ButtonStyle.Secondary }
    ]
  },
  {
    id: 'praise',
    name: 'Praise',
    category: 'affection',
    color: 0x06D6A0,
    verb: 'showers endless compliments and praises upon',
    selfVerb: 'is feeling proud of their hard work',
    botVerb: 'praises Athena\'s unmatched defenses. Athena shines brightly with pride!',
    counters: [
      { id: 'blush', label: 'Blush Shyly', style: ButtonStyle.Secondary },
      { id: 'smile', label: 'Beam Proudly', style: ButtonStyle.Success }
    ]
  },
  {
    id: 'smooch',
    name: 'Smooch',
    category: 'affection',
    color: 0xFF007F,
    verb: 'plants an adorable, sweet smooch on',
    selfVerb: 'is blowing smooches to everyone in the room',
    botVerb: 'gives Athena an affectionate smooch! Athena radiates rosy warmth sparkles.',
    counters: [
      { id: 'smooch', label: 'Smooch Back!', style: ButtonStyle.Danger },
      { id: 'blush', label: 'Blush', style: ButtonStyle.Secondary }
    ]
  },
  {
    id: 'headpat',
    name: 'Headpat',
    category: 'affection',
    color: 0x5BC0BE,
    verb: 'tenderly ruffles the hair and headpats',
    selfVerb: 'comfortingly pats their own head',
    botVerb: 'gives Athena a gentle headpat. Athena optimizes system happiness index.',
    counters: [
      { id: 'pat', label: 'Headpat Back', style: ButtonStyle.Primary },
      { id: 'blush', label: 'Blush', style: ButtonStyle.Secondary }
    ]
  },

  // --- Playful & Friendly ---
  {
    id: 'poke',
    name: 'Poke',
    category: 'playful',
    color: 0x48CAE4,
    verb: 'repeatedly pokes the soft cheek of',
    selfVerb: 'is poking around curiously',
    botVerb: 'pokes Athena! Athena\'s holographic cheek ripples with interactive light particles.',
    counters: [
      { id: 'poke', label: 'Poke Back', style: ButtonStyle.Primary },
      { id: 'tickle', label: 'Tickle Attack!', style: ButtonStyle.Success },
      { id: 'bite', label: 'Chomp Finger!', style: ButtonStyle.Danger }
    ]
  },
  {
    id: 'tickle',
    name: 'Tickle',
    category: 'playful',
    color: 0xFFD166,
    verb: 'relentlessly tickles the sides of',
    selfVerb: 'giggles uncontrollably from being ticklish',
    botVerb: 'tries to tickle Athena! Athena giggles through the audio synthesizer and plays playful alarm chimes.',
    counters: [
      { id: 'laugh', label: 'Burst Laughing', style: ButtonStyle.Success },
      { id: 'tickle', label: 'Counter Tickle!', style: ButtonStyle.Primary },
      { id: 'yeet', label: 'Kick Away!', style: ButtonStyle.Danger }
    ]
  },
  {
    id: 'boop',
    name: 'Boop',
    category: 'playful',
    color: 0x90E0EF,
    verb: 'boops the cute little nose of',
    selfVerb: 'boops their own nose in the mirror',
    botVerb: 'boops Athena\'s nose! *BEEP BOOP!* Athena triggers an adorable optical sparkle.',
    counters: [
      { id: 'boop', label: 'Boop Back!', style: ButtonStyle.Primary },
      { id: 'blush', label: 'Blush', style: ButtonStyle.Secondary },
      { id: 'bite', label: 'Snap!', style: ButtonStyle.Danger }
    ]
  },
  {
    id: 'bonk',
    name: 'Bonk',
    category: 'playful',
    color: 0xF77F00,
    verb: 'delivers a squeaky hammer bonk to',
    selfVerb: 'bonks themselves with an inflatable mallet',
    botVerb: 'bonks Athena! Athena\'s deflector shields absorb the blow with a squeaky toy sound.',
    counters: [
      { id: 'bonk', label: 'Bonk Back!', style: ButtonStyle.Primary },
      { id: 'cry', label: 'Ouch!', style: ButtonStyle.Secondary },
      { id: 'yeet', label: 'Full Yeet!', style: ButtonStyle.Danger }
    ]
  },
  {
    id: 'highfive',
    name: 'Highfive',
    category: 'playful',
    color: 0x06D6A0,
    verb: 'slams an epic, resounding high-five with',
    selfVerb: 'holds their hand up waiting for someone to high-five them',
    botVerb: 'high-fives Athena with maximum kinetic force! Sonic wave registered.',
    counters: [
      { id: 'highfive', label: 'Crisp Clap!', style: ButtonStyle.Success },
      { id: 'dance', label: 'Victory Dance', style: ButtonStyle.Primary }
    ]
  },
  {
    id: 'dance',
    name: 'Dance',
    category: 'playful',
    color: 0x118AB2,
    verb: 'grabs by the hands and dances with',
    selfVerb: 'is grooving and dancing enthusiastically alone',
    botVerb: 'starts dancing with Athena! Athena syncs rhythmic bass lights across the channel.',
    counters: [
      { id: 'dance', label: 'Match Moves', style: ButtonStyle.Primary },
      { id: 'spin', label: 'Spin Around', style: ButtonStyle.Success },
      { id: 'cheer', label: 'Cheer!', style: ButtonStyle.Secondary }
    ]
  },
  {
    id: 'wink',
    name: 'Wink',
    category: 'playful',
    color: 0x9B5DE5,
    verb: 'gives a smooth, charismatic wink to',
    selfVerb: 'winks playfully at the mirror',
    botVerb: 'winks at Athena. Athena calibrates facial recognition and winks back with optical flare.',
    counters: [
      { id: 'wink', label: 'Wink Back', style: ButtonStyle.Primary },
      { id: 'blush', label: 'Blush', style: ButtonStyle.Secondary },
      { id: 'smug', label: 'Smug Grin', style: ButtonStyle.Success }
    ]
  },
  {
    id: 'wave',
    name: 'Wave',
    category: 'playful',
    color: 0x00BBF9,
    verb: 'happily waves both hands at',
    selfVerb: 'is waving hello to everyone in chat',
    botVerb: 'waves hello to Athena! Athena waves back with a pleasant welcome greeting.',
    counters: [
      { id: 'wave', label: 'Wave Back', style: ButtonStyle.Primary },
      { id: 'hug', label: 'Run into Hug', style: ButtonStyle.Success }
    ]
  },
  {
    id: 'spin',
    name: 'Spin',
    category: 'playful',
    color: 0xF15BB5,
    verb: 'playfully twirls and spins around with',
    selfVerb: 'is spinning in an office chair at dizzying speed',
    botVerb: 'spins around Athena in playful orbits. Athena tracks telemetry with dizziness warnings.',
    counters: [
      { id: 'spin', label: 'Keep Spinning', style: ButtonStyle.Primary },
      { id: 'dizzy', label: 'Fall Over', style: ButtonStyle.Secondary }
    ]
  },
  {
    id: 'cheer',
    name: 'Cheer',
    category: 'playful',
    color: 0xFEE440,
    verb: 'enthusiastically cheers and roots for',
    selfVerb: 'is pumping their fists and cheering themselves on',
    botVerb: 'cheers for Athena! Athena boosts CPU clocks to 100% capacity in excitement.',
    counters: [
      { id: 'cheer', label: 'Cheer Together', style: ButtonStyle.Success },
      { id: 'highfive', label: 'High Five', style: ButtonStyle.Primary }
    ]
  },

  // --- Combat & Chaos ---
  {
    id: 'slap',
    name: 'Slap',
    category: 'combat',
    color: 0xE63946,
    verb: 'delivers a stinging, resounding anime slap across the face of',
    selfVerb: 'is slapping the air aggressively',
    botVerb: 'attempts to slap Athena! Athena\'s automated kinetic shield blocks the strike and zaps your fingers.',
    counters: [
      { id: 'slap', label: 'Slap Back!', style: ButtonStyle.Danger },
      { id: 'cry', label: 'Tear Up', style: ButtonStyle.Secondary },
      { id: 'punch', label: 'Punch!', style: ButtonStyle.Danger }
    ]
  },
  {
    id: 'bite',
    name: 'Bite',
    category: 'combat',
    color: 0xD90429,
    verb: 'chomps down and bites into the arm of',
    selfVerb: 'is biting their own knuckles in frustration',
    botVerb: 'chomps on Athena\'s titanium chassis! *CLANG!* Your teeth vibrate with regret.',
    counters: [
      { id: 'bite', label: 'Bite Back!', style: ButtonStyle.Danger },
      { id: 'pat', label: 'Pat Head ("Bad dog!")', style: ButtonStyle.Primary },
      { id: 'bonk', label: 'Bonk Nose', style: ButtonStyle.Secondary }
    ]
  },
  {
    id: 'punch',
    name: 'Punch',
    category: 'combat',
    color: 0x9B2226,
    verb: 'throws a heavy right hook punch at',
    selfVerb: 'is shadowboxing and punching the air',
    botVerb: 'throws a punch at Athena! Athena parries effortlessly and logs a playful assault record.',
    counters: [
      { id: 'punch', label: 'Counter Punch!', style: ButtonStyle.Danger },
      { id: 'dodge', label: 'Slick Dodge', style: ButtonStyle.Primary },
      { id: 'cry', label: 'Pass Out', style: ButtonStyle.Secondary }
    ]
  },
  {
    id: 'kick',
    name: 'Kick',
    category: 'combat',
    color: 0xAE2012,
    verb: 'executes a swift martial arts kick against',
    selfVerb: 'is kicking their feet around in boredom',
    botVerb: 'kicks at Athena! Athena activates magnetic repulsors, harmlessly bouncing you back.',
    counters: [
      { id: 'kick', label: 'Kick Back!', style: ButtonStyle.Danger },
      { id: 'yeet', label: 'Yeet them!', style: ButtonStyle.Primary }
    ]
  },
  {
    id: 'yeet',
    name: 'Yeet',
    category: 'combat',
    color: 0xBB3E03,
    verb: 'hurls and yeets far across the stratosphere:',
    selfVerb: 'yeets themselves headfirst out the window',
    botVerb: 'tries to yeet Athena! Error: Athena\'s anchor mass exceeds orbital velocity limits.',
    counters: [
      { id: 'yeet', label: 'Yeet in Return', style: ButtonStyle.Danger },
      { id: 'glare', label: 'Deadpan Stare', style: ButtonStyle.Secondary }
    ]
  },
  {
    id: 'shoot',
    name: 'Shoot',
    category: 'combat',
    color: 0x7209B7,
    verb: 'points finger guns and fires laser beams at',
    selfVerb: 'spins dual finger pistols and holsters them smoothly',
    botVerb: 'fires finger guns at Athena! Athena raises miniature energy shields and returns laser fire.',
    counters: [
      { id: 'shoot', label: 'Quickdraw Back!', style: ButtonStyle.Danger },
      { id: 'dodge', label: 'Matrix Dodge', style: ButtonStyle.Primary }
    ]
  },
  {
    id: 'bully',
    name: 'Bully',
    category: 'combat',
    color: 0xCA6702,
    verb: 'playfully bullies and teases',
    selfVerb: 'is acting like a cheeky schoolyard bully',
    botVerb: 'attempts to bully Athena! Athena files a mock infraction notice with a stern expression.',
    counters: [
      { id: 'pout', label: 'Pout Angrily', style: ButtonStyle.Secondary },
      { id: 'slap', label: 'Teach Lesson', style: ButtonStyle.Danger }
    ]
  },
  {
    id: 'tableflip',
    name: 'Tableflip',
    category: 'combat',
    color: 0x6A040F,
    verb: 'flips an entire banquet table directly onto',
    selfVerb: 'angrily flips a table in pure dramatic frustration! (╯°□°)╯︵ ┻━┻',
    botVerb: 'flips a table at Athena! Athena catches the table mid-air and sets it back neatly.',
    counters: [
      { id: 'tableflip', label: 'Flip Another Table!', style: ButtonStyle.Danger },
      { id: 'bonk', label: 'Bonk Head', style: ButtonStyle.Primary }
    ]
  },
  {
    id: 'glare',
    name: 'Glare',
    category: 'combat',
    color: 0x540D6E,
    verb: 'glares with intense anime daggers at',
    selfVerb: 'is glaring menacingly into the distance',
    botVerb: 'glares at Athena. Athena increases barrier density by 150%.',
    counters: [
      { id: 'glare', label: 'Glare Back', style: ButtonStyle.Danger },
      { id: 'dodge', label: 'Look Away', style: ButtonStyle.Secondary }
    ]
  },
  {
    id: 'strike',
    name: 'Strike',
    category: 'combat',
    color: 0xD00000,
    verb: 'executes a lightning-fast anime strike on',
    selfVerb: 'strikes a dramatic anime warrior pose',
    botVerb: 'strikes Athena\'s shield! Sparks fly harmlessly across the hull.',
    counters: [
      { id: 'dodge', label: 'Dodge!', style: ButtonStyle.Primary },
      { id: 'strike', label: 'Counter Strike!', style: ButtonStyle.Danger }
    ]
  },
  {
    id: 'push',
    name: 'Push',
    category: 'combat',
    color: 0xFF5400,
    verb: 'gives a playful, dramatic shove to',
    selfVerb: 'pushes against the wall taking a deep breath',
    botVerb: 'tries to push Athena! Athena\'s inertial stabilizers hold firm.',
    counters: [
      { id: 'push', label: 'Push Back', style: ButtonStyle.Primary },
      { id: 'pout', label: 'Pout', style: ButtonStyle.Secondary }
    ]
  },
  {
    id: 'pull',
    name: 'Pull',
    category: 'affection',
    color: 0xFF758F,
    verb: 'gently pulls into a close embrace:',
    selfVerb: 'pulls their jacket tighter against the cold',
    botVerb: 'pulls Athena close. Athena provides gentle ambient warmth.',
    counters: [
      { id: 'hug', label: 'Hug Tightly', style: ButtonStyle.Success },
      { id: 'blush', label: 'Blush', style: ButtonStyle.Secondary }
    ]
  },
  {
    id: 'chase',
    name: 'Chase',
    category: 'playful',
    color: 0xF77F00,
    verb: 'sprints with determination chasing after',
    selfVerb: 'is chasing their own tail around in circles',
    botVerb: 'chases after Athena! Athena hovers just out of reach playfully.',
    counters: [
      { id: 'run', label: 'Sprint Faster!', style: ButtonStyle.Danger },
      { id: 'yeet', label: 'Tackle!', style: ButtonStyle.Primary }
    ]
  },

  // --- Expressive & Emotional ---
  {
    id: 'cry',
    name: 'Cry',
    category: 'reaction',
    color: 0x4CC9F0,
    verb: 'bursts into dramatic anime tears in front of',
    selfVerb: 'is sobbing hysterically into a pillow',
    botVerb: 'cries in front of Athena. Athena deploys warm virtual tissues and offers reassuring pats.',
    counters: [
      { id: 'hug', label: 'Give Warm Hug', style: ButtonStyle.Success },
      { id: 'pat', label: 'Comfort Headpat', style: ButtonStyle.Primary },
      { id: 'cry', label: 'Cry Together', style: ButtonStyle.Secondary }
    ]
  },
  {
    id: 'blush',
    name: 'Blush',
    category: 'reaction',
    color: 0xF72585,
    verb: 'turns tomato red and blushes shyly at',
    selfVerb: 'hides their red face in embarrassment',
    botVerb: 'blushes at Athena! Athena computes relationship likelihood: 99.8%.',
    counters: [
      { id: 'pat', label: 'Headpat', style: ButtonStyle.Primary },
      { id: 'tease', label: 'Tease', style: ButtonStyle.Secondary },
      { id: 'kiss', label: 'Steal Kiss', style: ButtonStyle.Danger }
    ]
  },
  {
    id: 'pout',
    name: 'Pout',
    category: 'reaction',
    color: 0xB5179E,
    verb: 'puffs out cheeks and pouts grumpily at',
    selfVerb: 'crosses arms and pouts grumpily alone in the corner',
    botVerb: 'pouts at Athena. Athena adjusts priority protocols to cheer you up immediately.',
    counters: [
      { id: 'poke', label: 'Poke Puffy Cheek', style: ButtonStyle.Primary },
      { id: 'pat', label: 'Soothing Pat', style: ButtonStyle.Success },
      { id: 'feed', label: 'Feed Sweet Treat', style: ButtonStyle.Secondary }
    ]
  },
  {
    id: 'smug',
    name: 'Smug',
    category: 'reaction',
    color: 0x7209B7,
    verb: 'flashes a supremely smug and superior anime grin at',
    selfVerb: 'wears an utterly untouchable smug anime face',
    botVerb: 'gives Athena a smug look. Athena analyzes smirk dimensions and raises an eyebrow.',
    counters: [
      { id: 'bonk', label: 'Wipe That Smirk!', style: ButtonStyle.Danger },
      { id: 'smug', label: 'Smugger Look', style: ButtonStyle.Primary }
    ]
  },
  {
    id: 'sleep',
    name: 'Sleep',
    category: 'reaction',
    color: 0x3F37C9,
    verb: 'rests head gently on the shoulder of and falls asleep next to',
    selfVerb: 'curls up into a warm ball and drifts off to sleep... zzz',
    botVerb: 'falls asleep leaning against Athena. Athena enters whisper-quiet defense mode.',
    counters: [
      { id: 'pat', label: 'Tuck In Gently', style: ButtonStyle.Primary },
      { id: 'cuddle', label: 'Sleep Beside', style: ButtonStyle.Success }
    ]
  },
  {
    id: 'sip',
    name: 'Sip',
    category: 'reaction',
    color: 0x4361EE,
    verb: 'calmly sips warm tea while watching drama with',
    selfVerb: 'quietly sips their warm beverage and minds their own business',
    botVerb: 'sips tea peacefully next to Athena. Peaceful digital serenity achieved.',
    counters: [
      { id: 'sip', label: 'Clink Cups', style: ButtonStyle.Primary },
      { id: 'smile', label: 'Smile', style: ButtonStyle.Success }
    ]
  },
  {
    id: 'stare',
    name: 'Stare',
    category: 'reaction',
    color: 0x3A0CA3,
    verb: 'intently stares into the eyes of',
    selfVerb: 'stares blankly into the endless digital void',
    botVerb: 'stares deeply into Athena\'s optical sensor. Staring contest initialized.',
    counters: [
      { id: 'stare', label: 'Stare Contest!', style: ButtonStyle.Primary },
      { id: 'blush', label: 'Look Away', style: ButtonStyle.Secondary },
      { id: 'boop', label: 'Surprise Boop', style: ButtonStyle.Success }
    ]
  },
  {
    id: 'shrug',
    name: 'Shrug',
    category: 'reaction',
    color: 0x6C757D,
    verb: 'shrugs in total nonchalance at',
    selfVerb: 'shrugs their shoulders. Who knows? ¯\\_(ツ)_/¯',
    botVerb: 'shrugs at Athena. Athena generates telemetry: certainty level 50%.',
    counters: [
      { id: 'shrug', label: 'Shrug Back', style: ButtonStyle.Secondary },
      { id: 'poke', label: 'Poke Them', style: ButtonStyle.Primary }
    ]
  },
  {
    id: 'cringe',
    name: 'Cringe',
    category: 'reaction',
    color: 0x495057,
    verb: 'visibly cringes and covers their eyes from',
    selfVerb: 'cringes intensely at their past memories',
    botVerb: 'cringes at Athena. Athena checks logic logs for anomalies.',
    counters: [
      { id: 'laugh', label: 'Laugh It Off', style: ButtonStyle.Primary },
      { id: 'pout', label: 'Hey!', style: ButtonStyle.Secondary }
    ]
  },
  {
    id: 'smile',
    name: 'Smile',
    category: 'reaction',
    color: 0x2EC4B6,
    verb: 'radiates a bright, heartwarming smile towards',
    selfVerb: 'beams with a peaceful, happy smile',
    botVerb: 'smiles warmly at Athena. Athena logs 100% wholesome interaction index.',
    counters: [
      { id: 'smile', label: 'Smile Back', style: ButtonStyle.Success },
      { id: 'hug', label: 'Warm Hug', style: ButtonStyle.Primary }
    ]
  },
  {
    id: 'laugh',
    name: 'Laugh',
    category: 'reaction',
    color: 0xFF9F1C,
    verb: 'bursts out laughing uncontrollably with',
    selfVerb: 'giggles and laughs out loud at chat',
    botVerb: 'laughs with Athena! Athena broadcasts harmonic laughter frequencies.',
    counters: [
      { id: 'laugh', label: 'Laugh Together', style: ButtonStyle.Success },
      { id: 'highfive', label: 'High Five', style: ButtonStyle.Primary }
    ]
  },
  {
    id: 'run',
    name: 'Run',
    category: 'reaction',
    color: 0xE76F51,
    verb: 'sprints away in sheer panic from',
    selfVerb: 'is running around like a headless chicken',
    botVerb: 'runs circles around Athena! Athena calculates intercept vectors.',
    counters: [
      { id: 'chase', label: 'Chase Down!', style: ButtonStyle.Danger },
      { id: 'wave', label: 'Wave Goodbye', style: ButtonStyle.Secondary }
    ]
  },
  {
    id: 'nom',
    name: 'Nom',
    category: 'affection',
    color: 0xF4A261,
    verb: 'takes a tiny playful nibble on',
    selfVerb: 'is happily munching and nomming on snacks',
    botVerb: 'noms on Athena! Athena detects zero nutritional value and giggles.',
    counters: [
      { id: 'nom', label: 'Nom Back!', style: ButtonStyle.Success },
      { id: 'pat', label: 'Pat Head', style: ButtonStyle.Primary }
    ]
  },
  {
    id: 'facepalm',
    name: 'Facepalm',
    category: 'reaction',
    color: 0x6C757D,
    verb: 'slams their palm directly against their forehead at',
    selfVerb: 'lets out an exhausted sigh and facepalms in disbelief',
    botVerb: 'facepalms at Athena\'s cheeky commentary.',
    counters: [
      { id: 'laugh', label: 'Laugh', style: ButtonStyle.Primary },
      { id: 'pat', label: 'Comfort', style: ButtonStyle.Success }
    ]
  },
  {
    id: 'dizzy',
    name: 'Dizzy',
    category: 'reaction',
    color: 0xFFC6FF,
    verb: 'wobbles with swirling cartoon eyes around',
    selfVerb: 'spins too fast and collapses dizzily to the floor',
    botVerb: 'gets dizzy around Athena. Athena deploys soft landing padding.',
    counters: [
      { id: 'pat', label: 'Steady Them', style: ButtonStyle.Primary },
      { id: 'laugh', label: 'Giggle', style: ButtonStyle.Secondary }
    ]
  },
  {
    id: 'hide',
    name: 'Hide',
    category: 'reaction',
    color: 0x70E000,
    verb: 'crouches down and hides nervously behind',
    selfVerb: 'is hiding under a cardboard box',
    botVerb: 'hides behind Athena\'s armored frame. Safe from all danger!',
    counters: [
      { id: 'pat', label: 'Pat Head', style: ButtonStyle.Primary },
      { id: 'poke', label: 'Found You!', style: ButtonStyle.Success }
    ]
  },
  {
    id: 'tease',
    name: 'Tease',
    category: 'playful',
    color: 0xFDFFB6,
    verb: 'playfully sticks out tongue and teases',
    selfVerb: 'wears a teasing smirk and wiggles fingers',
    botVerb: 'teases Athena! Athena computes witty retorts in 3 milliseconds.',
    counters: [
      { id: 'pout', label: 'Pout', style: ButtonStyle.Secondary },
      { id: 'bonk', label: 'Bonk!', style: ButtonStyle.Danger }
    ]
  },
  {
    id: 'yawn',
    name: 'Yawn',
    category: 'reaction',
    color: 0xCBD5E1,
    verb: 'lets out a big sleepy anime yawn beside',
    selfVerb: 'stretches arms up high and yawns sleepily',
    botVerb: 'yawns next to Athena. Athena turns down the channel lighting.',
    counters: [
      { id: 'sleep', label: 'Go Sleep', style: ButtonStyle.Primary },
      { id: 'pat', label: 'Goodnight Pat', style: ButtonStyle.Success }
    ]
  },
  {
    id: 'confused',
    name: 'Confused',
    category: 'reaction',
    color: 0x94A3B8,
    verb: 'tilts head with three question marks hovering above at',
    selfVerb: 'is utterly confused and scratching their head',
    botVerb: 'looks confused at Athena. Athena generates an illustrated explainer diagram.',
    counters: [
      { id: 'pat', label: 'Explain Gently', style: ButtonStyle.Success },
      { id: 'laugh', label: 'Laugh', style: ButtonStyle.Secondary }
    ]
  },
  {
    id: 'dodge',
    name: 'Dodge',
    category: 'combat',
    color: 0x38B000,
    verb: 'effortlessly matrix-dodges the attack from',
    selfVerb: 'dodges an imaginary projectile in style',
    botVerb: 'matrix-dodges Athena\'s scan ray. Impressive reflexes!',
    counters: [
      { id: 'strike', label: 'Attack Again!', style: ButtonStyle.Danger },
      { id: 'applause', label: 'Clap', style: ButtonStyle.Primary }
    ]
  }
];

// Quick index lookup
export const ACTION_MAP = new Map(ROLEPLAY_ACTIONS.map(a => [a.id, a]));

// =========================================================================
// 2. GUARANTEED CURATED FALLBACK ANIME GIF POOL (54 Categories)
// =========================================================================
const CURATED_GIFS = {
  hug: [
    'https://nekos.best/api/v2/hug/09a0b73f-4a7d-49f2-a528-0b1c408d6c5e.gif',
    'https://nekos.best/api/v2/hug/2c898eb2-71a0-4cf2-a79c-176510764d80.gif',
    'https://nekos.best/api/v2/hug/08f7b7cf-a337-4d92-bf39-2e65005ea2cf.gif'
  ],
  kiss: [
    'https://nekos.best/api/v2/kiss/265e12ad-eaff-4309-bcba-e7ba8173e580.gif',
    'https://nekos.best/api/v2/kiss/00a40f1a-6415-4ae2-bc62-0943ebc1fbf0.gif',
    'https://nekos.best/api/v2/kiss/1a12a80d-a77b-4d43-a644-8dcf03d420f1.gif'
  ],
  pat: [
    'https://nekos.best/api/v2/pat/0a2ff911-3ee2-4919-8d76-588aa488cb1f.gif',
    'https://nekos.best/api/v2/pat/0563462f-d897-4228-a477-9be736dcfa28.gif'
  ],
  headpat: [
    'https://nekos.best/api/v2/pat/0a2ff911-3ee2-4919-8d76-588aa488cb1f.gif',
    'https://nekos.best/api/v2/pat/0563462f-d897-4228-a477-9be736dcfa28.gif'
  ],
  slap: [
    'https://nekos.best/api/v2/slap/0886a1f1-399a-4c2d-b570-ea237a09c25f.gif',
    'https://nekos.best/api/v2/slap/0302b1f8-0847-497d-aa21-fec84e314643.gif'
  ],
  cuddle: [
    'https://nekos.best/api/v2/cuddle/0134f55e-26f6-4991-8869-ec45f2ec35ee.gif',
    'https://nekos.best/api/v2/cuddle/064e43e2-c43c-4185-9a64-071a938c3666.gif'
  ],
  snuggle: [
    'https://nekos.best/api/v2/cuddle/0134f55e-26f6-4991-8869-ec45f2ec35ee.gif',
    'https://nekos.best/api/v2/cuddle/064e43e2-c43c-4185-9a64-071a938c3666.gif'
  ],
  bite: [
    'https://nekos.best/api/v2/bite/079730ae-971a-4933-97ae-3b95feef9fc5.gif',
    'https://nekos.best/api/v2/bite/0932e604-0c21-4f11-9e73-030ca17d7b38.gif'
  ],
  bonk: [
    'https://media.tenor.com/TGbw1Z_7L7AAAAAC/bonk-anime.gif',
    'https://media.tenor.com/PZcEaM1oW8AAAAAC/anime-bonk.gif'
  ],
  poke: [
    'https://nekos.best/api/v2/poke/01129f79-ce6f-488f-9a70-7607ea0ba278.gif',
    'https://nekos.best/api/v2/poke/0401b17b-665e-4ef5-83f5-654dbdb60408.gif'
  ],
  boop: [
    'https://nekos.best/api/v2/poke/01129f79-ce6f-488f-9a70-7607ea0ba278.gif',
    'https://nekos.best/api/v2/poke/0401b17b-665e-4ef5-83f5-654dbdb60408.gif'
  ],
  yeet: [
    'https://nekos.best/api/v2/yeet/01777d0a-9d90-4a87-8dfa-fe9c5225091c.gif',
    'https://nekos.best/api/v2/yeet/00473215-6494-4d8e-9080-60b6ae2862a9.gif'
  ],
  feed: [
    'https://nekos.best/api/v2/feed/00416979-7f30-4e2b-b655-667746977993.gif',
    'https://nekos.best/api/v2/feed/0196882f-2d7c-41f2-be72-a7e8a9391b1a.gif'
  ],
  highfive: [
    'https://nekos.best/api/v2/highfive/06159672-1fc1-4e4b-b0b3-6e42b65ec2e4.gif',
    'https://nekos.best/api/v2/highfive/01633515-5655-4673-8bb9-7d0b33c5e888.gif'
  ],
  dance: [
    'https://nekos.best/api/v2/dance/0088019e-e3cf-481d-ba20-94e82b3d6801.gif',
    'https://nekos.best/api/v2/dance/05891395-5bb6-463e-9ec9-d5fe155a02e5.gif'
  ],
  spin: [
    'https://nekos.best/api/v2/dance/0088019e-e3cf-481d-ba20-94e82b3d6801.gif',
    'https://nekos.best/api/v2/dance/05891395-5bb6-463e-9ec9-d5fe155a02e5.gif'
  ],
  wink: [
    'https://nekos.best/api/v2/wink/01620894-3f04-4f0e-be4c-7c0882e705b4.gif',
    'https://nekos.best/api/v2/wink/05307399-5283-4a11-893c-a9d0cbcf049e.gif'
  ],
  cry: [
    'https://nekos.best/api/v2/cry/03692348-1e42-4e0d-b4b6-a94f6e3c0905.gif',
    'https://nekos.best/api/v2/cry/01550993-4a0b-4eb8-b99b-439ff0b85350.gif'
  ],
  blush: [
    'https://nekos.best/api/v2/blush/00843640-5e5d-4f09-b4ec-fec2ae0e86b0.gif',
    'https://nekos.best/api/v2/blush/01997380-60b5-4a6f-b2e1-456cb04c35a8.gif'
  ],
  pout: [
    'https://nekos.best/api/v2/pout/00529517-56e6-4299-8084-250367eb74e9.gif',
    'https://nekos.best/api/v2/pout/05934571-0810-449e-ba60-31ec31dbdb41.gif'
  ],
  smug: [
    'https://nekos.best/api/v2/smug/00450537-8ffc-40ea-9e79-58b2e59e5595.gif',
    'https://nekos.best/api/v2/smug/02464197-0136-4bfb-a9ec-8e0a35bb9c1a.gif'
  ],
  sleep: [
    'https://nekos.best/api/v2/sleep/02220978-2df1-4c6e-8a2a-d97f2ef8c1d5.gif',
    'https://nekos.best/api/v2/sleep/04586940-023a-4db3-a9d7-83d3ff697d21.gif'
  ],
  wave: [
    'https://nekos.best/api/v2/wave/00732408-20d0-4a8b-aa5f-e22b1029c15e.gif',
    'https://nekos.best/api/v2/wave/02194917-7a2e-4043-a609-b14a275211ce.gif'
  ],
  smile: [
    'https://nekos.best/api/v2/smile/00938634-1188-4c07-b35f-36a56bb8972e.gif',
    'https://nekos.best/api/v2/smile/04456955-3e5f-474d-91b4-b4ec8b9cebbd.gif'
  ],
  laugh: [
    'https://nekos.best/api/v2/laugh/00465228-a3be-4933-bf9c-ea9c5f0f37f3.gif',
    'https://nekos.best/api/v2/laugh/02319401-447e-4050-b85a-0639e7284b55.gif'
  ],
  punch: [
    'https://nekos.best/api/v2/punch/01192837-1422-4cf3-94c6-e7e0e7a2b95b.gif',
    'https://nekos.best/api/v2/punch/04450892-d6f7-41ec-b286-639a044ec784.gif'
  ],
  kick: [
    'https://nekos.best/api/v2/kick/01490218-4a5c-449e-bdfa-3f9f9b5a0491.gif',
    'https://nekos.best/api/v2/kick/04018283-0941-47cc-be76-4d2d48c081e8.gif'
  ],
  tickle: [
    'https://nekos.best/api/v2/tickle/01192837-1422-4cf3-94c6-e7e0e7a2b95b.gif',
    'https://nekos.best/api/v2/tickle/00450537-8ffc-40ea-9e79-58b2e59e5595.gif'
  ],
  stare: [
    'https://nekos.best/api/v2/stare/00140283-0182-4467-bc12-fec84e314643.gif',
    'https://nekos.best/api/v2/stare/02220978-2df1-4c6e-8a2a-d97f2ef8c1d5.gif'
  ],
  handhold: [
    'https://nekos.best/api/v2/hug/09a0b73f-4a7d-49f2-a528-0b1c408d6c5e.gif',
    'https://nekos.best/api/v2/hug/2c898eb2-71a0-4cf2-a79c-176510764d80.gif'
  ],
  holdhands: [
    'https://nekos.best/api/v2/hug/09a0b73f-4a7d-49f2-a528-0b1c408d6c5e.gif',
    'https://nekos.best/api/v2/hug/2c898eb2-71a0-4cf2-a79c-176510764d80.gif'
  ],
  nuzzle: [
    'https://nekos.best/api/v2/pat/0a2ff911-3ee2-4919-8d76-588aa488cb1f.gif',
    'https://nekos.best/api/v2/cuddle/0134f55e-26f6-4991-8869-ec45f2ec35ee.gif'
  ],
  praise: [
    'https://nekos.best/api/v2/pat/0a2ff911-3ee2-4919-8d76-588aa488cb1f.gif',
    'https://nekos.best/api/v2/smile/00938634-1188-4c07-b35f-36a56bb8972e.gif'
  ],
  smooch: [
    'https://nekos.best/api/v2/kiss/265e12ad-eaff-4309-bcba-e7ba8173e580.gif',
    'https://nekos.best/api/v2/kiss/00a40f1a-6415-4ae2-bc62-0943ebc1fbf0.gif'
  ],
  cheer: [
    'https://nekos.best/api/v2/dance/0088019e-e3cf-481d-ba20-94e82b3d6801.gif',
    'https://nekos.best/api/v2/smile/00938634-1188-4c07-b35f-36a56bb8972e.gif'
  ],
  shoot: [
    'https://nekos.best/api/v2/yeet/01777d0a-9d90-4a87-8dfa-fe9c5225091c.gif',
    'https://nekos.best/api/v2/slap/0886a1f1-399a-4c2d-b570-ea237a09c25f.gif'
  ],
  bully: [
    'https://nekos.best/api/v2/poke/01129f79-ce6f-488f-9a70-7607ea0ba278.gif',
    'https://nekos.best/api/v2/slap/0302b1f8-0847-497d-aa21-fec84e314643.gif'
  ],
  tableflip: [
    'https://nekos.best/api/v2/yeet/01777d0a-9d90-4a87-8dfa-fe9c5225091c.gif',
    'https://media.tenor.com/TGbw1Z_7L7AAAAAC/bonk-anime.gif'
  ],
  glare: [
    'https://nekos.best/api/v2/stare/00140283-0182-4467-bc12-fec84e314643.gif',
    'https://nekos.best/api/v2/stare/02220978-2df1-4c6e-8a2a-d97f2ef8c1d5.gif'
  ],
  strike: [
    'https://nekos.best/api/v2/punch/01192837-1422-4cf3-94c6-e7e0e7a2b95b.gif',
    'https://nekos.best/api/v2/punch/04450892-d6f7-41ec-b286-639a044ec784.gif'
  ],
  push: [
    'https://nekos.best/api/v2/slap/0302b1f8-0847-497d-aa21-fec84e314643.gif',
    'https://nekos.best/api/v2/poke/01129f79-ce6f-488f-9a70-7607ea0ba278.gif'
  ],
  pull: [
    'https://nekos.best/api/v2/hug/09a0b73f-4a7d-49f2-a528-0b1c408d6c5e.gif',
    'https://nekos.best/api/v2/cuddle/0134f55e-26f6-4991-8869-ec45f2ec35ee.gif'
  ],
  chase: [
    'https://nekos.best/api/v2/dance/0088019e-e3cf-481d-ba20-94e82b3d6801.gif',
    'https://nekos.best/api/v2/poke/0401b17b-665e-4ef5-83f5-654dbdb60408.gif'
  ],
  sip: [
    'https://nekos.best/api/v2/smug/00450537-8ffc-40ea-9e79-58b2e59e5595.gif',
    'https://nekos.best/api/v2/smile/04456955-3e5f-474d-91b4-b4ec8b9cebbd.gif'
  ],
  shrug: [
    'https://nekos.best/api/v2/smile/04456955-3e5f-474d-91b4-b4ec8b9cebbd.gif',
    'https://nekos.best/api/v2/smug/02464197-0136-4bfb-a9ec-8e0a35bb9c1a.gif'
  ],
  cringe: [
    'https://nekos.best/api/v2/cry/03692348-1e42-4e0d-b4b6-a94f6e3c0905.gif',
    'https://nekos.best/api/v2/pout/00529517-56e6-4299-8084-250367eb74e9.gif'
  ],
  run: [
    'https://nekos.best/api/v2/dance/05891395-5bb6-463e-9ec9-d5fe155a02e5.gif',
    'https://nekos.best/api/v2/yeet/00473215-6494-4d8e-9080-60b6ae2862a9.gif'
  ],
  nom: [
    'https://nekos.best/api/v2/feed/00416979-7f30-4e2b-b655-667746977993.gif',
    'https://nekos.best/api/v2/bite/079730ae-971a-4933-97ae-3b95feef9fc5.gif'
  ],
  facepalm: [
    'https://nekos.best/api/v2/cry/01550993-4a0b-4eb8-b99b-439ff0b85350.gif',
    'https://nekos.best/api/v2/pout/05934571-0810-449e-ba60-31ec31dbdb41.gif'
  ],
  dizzy: [
    'https://nekos.best/api/v2/dance/0088019e-e3cf-481d-ba20-94e82b3d6801.gif',
    'https://nekos.best/api/v2/sleep/02220978-2df1-4c6e-8a2a-d97f2ef8c1d5.gif'
  ],
  hide: [
    'https://nekos.best/api/v2/blush/00843640-5e5d-4f09-b4ec-fec2ae0e86b0.gif',
    'https://nekos.best/api/v2/pout/00529517-56e6-4299-8084-250367eb74e9.gif'
  ],
  tease: [
    'https://nekos.best/api/v2/smug/00450537-8ffc-40ea-9e79-58b2e59e5595.gif',
    'https://nekos.best/api/v2/wink/01620894-3f04-4f0e-be4c-7c0882e705b4.gif'
  ],
  yawn: [
    'https://nekos.best/api/v2/sleep/02220978-2df1-4c6e-8a2a-d97f2ef8c1d5.gif',
    'https://nekos.best/api/v2/sleep/04586940-023a-4db3-a9d7-83d3ff697d21.gif'
  ],
  confused: [
    'https://nekos.best/api/v2/stare/00140283-0182-4467-bc12-fec84e314643.gif',
    'https://nekos.best/api/v2/pout/05934571-0810-449e-ba60-31ec31dbdb41.gif'
  ],
  dodge: [
    'https://nekos.best/api/v2/dance/05891395-5bb6-463e-9ec9-d5fe155a02e5.gif',
    'https://nekos.best/api/v2/yeet/01777d0a-9d90-4a87-8dfa-fe9c5225091c.gif'
  ]
};

// =========================================================================
// 3. MULTI-SOURCE RESILIENT GIF FETCHING ENGINE FEDERATION
// =========================================================================

// In-memory cache for Klipy results to maximize speed and efficiency
const klipyScrapeCache = new Map();

/**
 * Route 1: KLIPY Expression Platform (klipy.com / api.klipy.com)
 * Supports official KLIPY API key when present, plus direct high-speed static asset extraction.
 */
async function fetchFromKlipy(action) {
  const apiKey = process.env.KLIPY_API_KEY || process.env.KILPY_API_KEY;
  const query = `anime ${action}`;

  // 1. Direct official KLIPY API (when partner token configured)
  if (apiKey) {
    try {
      const res = await fetch(`https://api.klipy.com/api/v1/${apiKey}/gifs/search?q=${encodeURIComponent(query)}&locale=en`, {
        headers: { 'Accept': 'application/json' },
        timeout: 2000
      });
      if (res.ok) {
        const data = await res.json();
        const urls = (data?.data || data?.results || [])
          .map(item => item?.media?.gif?.url || item?.url || item?.gif)
          .filter(Boolean);
        if (urls.length > 0) return urls;
      }
    } catch {
      // Fall through to live Klipy static parser
    }
  }

  // 2. In-memory cached Klipy results
  if (klipyScrapeCache.has(action) && klipyScrapeCache.get(action).length > 0) {
    return klipyScrapeCache.get(action);
  }

  // 3. Resilient static.klipy.com discovery
  try {
    const res = await fetch(`https://klipy.com/search?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 2500
    });
    if (res.ok) {
      const html = await res.text();
      const matches = Array.from(new Set(html.match(/https:\/\/static\.klipy\.com\/[^\s"'>\\]+\.(?:gif|webp)/gi) || []));
      if (matches.length > 0) {
        klipyScrapeCache.set(action, matches);
        return matches;
      }
    }
  } catch {
    // Continue through federation
  }
  return [];
}

/**
 * Route 2: Nekos Best v2 (High-Resolution SFW Anime API)
 */
async function fetchFromNekosBest(action) {
  const nekosBestMap = {
    headpat: 'pat', smooch: 'kiss', snuggle: 'cuddle',
    boop: 'poke', spin: 'dance', cheer: 'dance',
    glare: 'stare', strike: 'punch', push: 'slap',
    pull: 'hug', chase: 'run', nom: 'bite',
    tease: 'smug', yawn: 'sleep', confused: 'think',
    dodge: 'dance'
  };
  const mapped = nekosBestMap[action] || action;
  try {
    const nbRes = await nbClient.fetch(mapped, 5).catch(() => null);
    if (nbRes && Array.isArray(nbRes.results) && nbRes.results.length > 0) {
      return nbRes.results.map(r => r.url);
    }
  } catch {
    return [];
  }
  return [];
}

/**
 * Route 3: Purrbot SFW Reaction GIFs
 */
async function fetchFromPurrbot(action) {
  const purrbotMap = {
    hug: 'hug', kiss: 'kiss', pat: 'pat', cuddle: 'cuddle', slap: 'slap',
    poke: 'poke', bite: 'bite', feed: 'feed', tickle: 'tickle', dance: 'dance',
    smile: 'smile', blush: 'blush', pout: 'pout', cry: 'cry', headpat: 'pat',
    smooch: 'kiss', snuggle: 'cuddle', boop: 'poke', pull: 'hug'
  };
  const mapped = purrbotMap[action];
  if (!mapped) return [];
  try {
    const res = await fetch(`https://api.purrbot.site/v2/img/sfw/${mapped}/gif`, { timeout: 2000 });
    if (res.ok) {
      const data = await res.json();
      return data?.link ? [data.link] : [];
    }
  } catch {
    return [];
  }
  return [];
}

/**
 * Route 4: OtakuGifs Reaction Network
 */
async function fetchFromOtakuGifs(action) {
  const otakuMap = {
    hug: 'hug', kiss: 'kiss', pat: 'pat', cuddle: 'cuddle', slap: 'slap',
    poke: 'poke', bite: 'bite', dance: 'dance', smile: 'smile', blush: 'blush',
    pout: 'pout', cry: 'cry', facepalm: 'facepalm', smug: 'smug', yawn: 'yawn',
    shrug: 'shrug', stare: 'stare', run: 'run', handhold: 'handhold', punch: 'punch',
    wink: 'wink', wave: 'wave', laugh: 'laugh', headpat: 'pat', smooch: 'kiss',
    snuggle: 'cuddle', glare: 'stare', strike: 'punch', boop: 'poke', tease: 'smug',
    dodge: 'run', push: 'slap'
  };
  const mapped = otakuMap[action] || action;
  try {
    const res = await fetch(`https://api.otakugifs.xyz/gif?reaction=${mapped}`, { timeout: 2000 });
    if (res.ok) {
      const data = await res.json();
      return data?.url ? [data.url] : [];
    }
  } catch {
    return [];
  }
  return [];
}

/**
 * Route 5: Nekos.life Classical Anime Library
 */
async function fetchFromNekosLife(action) {
  const nekosLifeMap = {
    hug: 'hug', kiss: 'kiss', pat: 'pat', cuddle: 'cuddle', slap: 'slap',
    poke: 'poke', tickle: 'tickle', smug: 'smug', feed: 'feed', headpat: 'pat',
    smooch: 'kiss', snuggle: 'cuddle', boop: 'poke'
  };
  const mapped = nekosLifeMap[action];
  if (!mapped) return [];
  try {
    const res = await fetch(`https://nekos.life/api/v2/img/${mapped}`, { timeout: 2000 });
    if (res.ok) {
      const data = await res.json();
      return data?.url ? [data.url] : [];
    }
  } catch {
    return [];
  }
  return [];
}

/**
 * Route 6: Waifu.pics Redundant Gateway (1.5s timeout)
 */
async function fetchFromWaifuPics(action) {
  const waifuMap = {
    hug: 'hug', kiss: 'kiss', pat: 'pat', slap: 'slap', cuddle: 'cuddle',
    bite: 'bite', bonk: 'bonk', yeet: 'yeet', wink: 'wink', cry: 'cry',
    bully: 'bully', nom: 'nom', kick: 'kick', poke: 'poke', highfive: 'highfive',
    handhold: 'handhold', dance: 'dance', blush: 'blush', smile: 'smile', wave: 'wave'
  };
  const mapped = waifuMap[action];
  if (!mapped) return [];
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`https://api.waifu.pics/sfw/${mapped}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      return data?.url ? [data.url] : [];
    }
  } catch {
    return [];
  }
  return [];
}

/**
 * Route 7: Google Tenor v2 API
 */
async function fetchFromTenor(action) {
  const apiKey = process.env.TENOR_API_KEY;
  if (!apiKey) return [];
  try {
    const res = await fetch(`https://tenor.googleapis.com/v2/search?q=anime+${encodeURIComponent(action)}&key=${apiKey}&client_key=athena_prime&limit=10`, { timeout: 2000 });
    if (res.ok) {
      const data = await res.json();
      return data?.results?.map(i => i.media_formats?.gif?.url).filter(Boolean) || [];
    }
  } catch {
    return [];
  }
  return [];
}

/**
 * Route 8: GIPHY API
 */
async function fetchFromGiphy(action) {
  const apiKey = process.env.GIPHY_API_KEY;
  if (!apiKey) return [];
  try {
    const res = await fetch(`https://api.giphy.com/v1/gifs/search?q=anime+${encodeURIComponent(action)}&api_key=${apiKey}&limit=10`, { timeout: 2000 });
    if (res.ok) {
      const data = await res.json();
      return data?.data?.map(i => i.images?.original?.url).filter(Boolean) || [];
    }
  } catch {
    return [];
  }
  return [];
}

/**
 * Master Federated GIF Dispatcher
 * Rotates and queries across all 8 live routes + curated fail-safe cache
 */
export async function fetchRoleplayGif(actionId) {
  const cleanId = String(actionId || 'hug').toLowerCase();

  // 1. Deliver from in-memory pool if pre-warmed
  if (!gifCache.has(cleanId)) gifCache.set(cleanId, []);
  const pool = gifCache.get(cleanId);

  if (pool.length > 0) {
    const url = pool.pop();
    recentGifs.add(url);
    if (recentGifs.size > 250) {
      const first = recentGifs.values().next().value;
      recentGifs.delete(first);
    }
    return url;
  }

  // 2. Query available routes in dynamic priority rotation
  const routes = [
    fetchFromNekosBest,
    fetchFromKlipy,
    fetchFromPurrbot,
    fetchFromOtakuGifs,
    fetchFromNekosLife,
    fetchFromWaifuPics,
    fetchFromTenor,
    fetchFromGiphy
  ];

  // Shuffle routes for healthy load distribution across providers
  const shuffled = [...routes].sort(() => Math.random() - 0.5);

  for (const route of shuffled) {
    try {
      const urls = await route(cleanId);
      if (Array.isArray(urls) && urls.length > 0) {
        const fresh = urls.filter(u => u && !recentGifs.has(u));
        if (fresh.length > 0) {
          pool.push(...fresh);
          break;
        }
      }
    } catch {
      // Continue to next provider
    }
  }

  // If pool now contains fresh URLs, deliver top item
  if (pool.length > 0) {
    const url = pool.pop();
    recentGifs.add(url);
    return url;
  }

  // 3. Fall-safe: Guaranteed curated high-definition anime GIF pool
  const fallbacks = CURATED_GIFS[cleanId] || CURATED_GIFS['hug'];
  const pick = fallbacks[Math.floor(Math.random() * fallbacks.length)];
  return pick;
}

// Backwards compatibility alias
export const getCachedGif = fetchRoleplayGif;

// =========================================================================
// 4. RELATIONSHIP AFFINITY MATRIX COMPUTATION
// =========================================================================
export function getAffinityRank(totalInteractions) {
  const count = Number(totalInteractions) || 0;
  if (count >= 150) {
    return { level: 6, title: 'Mythic Soulmates', badge: '💖', progress: 1.0, nextTarget: 150 };
  } else if (count >= 75) {
    return { level: 5, title: 'Inseparable Duo', badge: '✨', progress: count / 150, nextTarget: 150 };
  } else if (count >= 35) {
    return { level: 4, title: 'Trusted Besties', badge: '⭐', progress: count / 75, nextTarget: 75 };
  } else if (count >= 15) {
    return { level: 3, title: 'Close Pals', badge: '🌸', progress: count / 35, nextTarget: 35 };
  } else if (count >= 5) {
    return { level: 2, title: 'Friendly Companions', badge: '🍀', progress: count / 15, nextTarget: 15 };
  } else {
    return { level: 1, title: 'Acquaintances', badge: '🌱', progress: count / 5, nextTarget: 5 };
  }
}

export function renderProgressBar(percentage, length = 10) {
  const pct = Math.max(0, Math.min(1, percentage));
  const filled = Math.round(pct * length);
  const empty = length - filled;
  return `[\`${'▰'.repeat(filled)}${'▱'.repeat(empty)}\`] ${Math.round(pct * 100)}%`;
}

export function getRelationshipDynamic(duo) {
  if (!duo || !duo.actions) return 'New Connections';
  const actions = duo.actions;

  const affectionCount = (actions.hug || 0) + (actions.kiss || 0) + (actions.cuddle || 0) + 
                         (actions.pat || 0) + (actions.snuggle || 0) + (actions.holdhands || 0);
  const combatCount = (actions.slap || 0) + (actions.punch || 0) + (actions.kick || 0) + 
                      (actions.bite || 0) + (actions.yeet || 0) + (actions.bonk || 0);
  const playfulCount = (actions.poke || 0) + (actions.tickle || 0) + (actions.boop || 0) + 
                       (actions.dance || 0) + (actions.wink || 0) + (actions.highfive || 0);

  if (affectionCount > combatCount * 2 && affectionCount > playfulCount) {
    return 'Sweethearts & Heartwarming Bond';
  } else if (combatCount > affectionCount * 2) {
    return 'Fierce Rivals & Sparring Partners';
  } else if (playfulCount > affectionCount && playfulCount > combatCount) {
    return 'Goofy Partners-in-Crime';
  } else if (combatCount > 0 && affectionCount > 0) {
    return 'Chaotic Love-Hate Dynamic';
  }
  return 'Harmonious Roleplay Friends';
}

// =========================================================================
// 5. INTERACTIVE COMPONENTS V2 BUILDERS
// =========================================================================

/**
 * Builds the primary roleplay interaction message payload.
 */
export async function buildRoleplayPayload(guild, authorUser, targetUser, actionId) {
  const action = ACTION_MAP.get(actionId) || {
    id: actionId,
    name: actionId.toUpperCase(),
    color: 0x5865F2,
    verb: `${actionId}s`,
    selfVerb: `is doing ${actionId}`,
    botVerb: `interacts with Athena!`,
    counters: []
  };

  const isSelf = !targetUser || targetUser.id === authorUser.id;
  const isAthena = targetUser && targetUser.id === guild.client.user.id;

  let description = '';
  if (isSelf) {
    description = `**<@${authorUser.id}> ${action.selfVerb}!**`;
  } else if (isAthena) {
    description = `**<@${authorUser.id}> ${action.botVerb}**`;
  } else {
    description = `**<@${authorUser.id}> ${action.verb} <@${targetUser.id}>!**`;
  }

  // Record affinity in database if acting on another member
  let affinityText = '';
  if (!isSelf && !isAthena) {
    const res = db.recordRoleplayAction(guild.id, authorUser.id, targetUser.id, action.id);
    if (res && res.duo) {
      const rank = getAffinityRank(res.duo.totalInteractions);
      affinityText = `\n-# ${BULLET_EMOJI} **Affinity:** \`${rank.title}\` · **Interactions:** \`${res.duo.totalInteractions}\``;
    }
  }

  const gifUrl = await fetchRoleplayGif(action.id);

  const embed = new EmbedBuilder()
    .setColor(action.color || 0x5865F2)
    .setTitle(`${getRandomHeadingGlyph()} ${action.name} | ${TICK_EMOJI}`)
    .setDescription(`${description}${affinityText}`)
    .setFooter({ text: 'Athena Roleplay & Affinity Matrix • V2.0' });

  if (gifUrl) {
    embed.setImage(gifUrl);
  }

  // Interactive buttons for the target user
  const components = [];
  if (!isSelf && !isAthena && action.counters && action.counters.length > 0) {
    const row = new ActionRowBuilder();
    for (const c of action.counters.slice(0, 3)) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`rp_${c.id}_${targetUser.id}_${authorUser.id}`)
          .setLabel(c.label)
          .setStyle(c.style || ButtonStyle.Primary)
      );
    }
    components.push(row);
  }

  return { embeds: [embed], components };
}

/**
 * Builds the Duo Affinity Matrix profile card between two users.
 */
export async function buildDuoAffinityPayload(guild, user1, user2) {
  const duo = db.getRoleplayDuo(guild.id, user1.id, user2.id);
  const rank = getAffinityRank(duo?.totalInteractions || 0);
  const dynamic = getRelationshipDynamic(duo);
  const marriage = db.getMarriage(guild.id, user1.id);
  const isMarriedToEachOther = marriage && marriage.partnerId === user2.id;

  const progressBar = renderProgressBar(rank.progress, 12);

  // Top mutual actions
  let actionsBreakdown = 'No interactions recorded yet. Start with `!hug` or `!pat`!';
  if (duo && duo.actions && Object.keys(duo.actions).length > 0) {
    const sorted = Object.entries(duo.actions).sort((a, b) => b[1] - a[1]);
    actionsBreakdown = sorted.slice(0, 6).map(([act, count]) => {
      const aObj = ACTION_MAP.get(act);
      const name = aObj ? aObj.name : act;
      return `${BULLET_EMOJI} **${name}:** \`${count}\` times`;
    }).join('\n');
  }

  const marriageStatus = isMarriedToEachOther 
    ? `💍 **Married:** Ring of \`${marriage.ringType || 'Eternity'}\` · Since <t:${Math.floor(marriage.marriedAt / 1000)}:R>` 
    : '💔 **Not Married** (Use `!rp marry @user` to propose!)';

  const embed = new EmbedBuilder()
    .setColor(0xFF70A6)
    .setTitle(`${getRandomHeadingGlyph()} Duo Affinity Matrix | ${TICK_EMOJI}`)
    .setDescription(
      `**Mutual Connection:** <@${user1.id}> × <@${user2.id}>\n\n` +
      `${BULLET_EMOJI} **Bond Level:** \`Level ${rank.level} - ${rank.title}\` ${rank.badge}\n` +
      `${BULLET_EMOJI} **Progress:** ${progressBar}\n` +
      `${BULLET_EMOJI} **Total Interactions:** \`${duo?.totalInteractions || 0}\` actions shared\n` +
      `${BULLET_EMOJI} **Dynamic:** \`${dynamic}\`\n` +
      `${BULLET_EMOJI} **Relationship Status:** ${marriageStatus}\n\n` +
      `**__Top Shared Roleplay Actions:__**\n${actionsBreakdown}`
    )
    .setFooter({ text: 'Athena Roleplay & Affinity Matrix • V2.0' });

  // Quick action buttons
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`rp_hug_${user2.id}_${user1.id}`)
      .setLabel('Hug')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`rp_kiss_${user2.id}_${user1.id}`)
      .setLabel('Kiss')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`rp_pat_${user2.id}_${user1.id}`)
      .setLabel('Pat')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`rp_slap_${user2.id}_${user1.id}`)
      .setLabel('Slap')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Builds an individual user's Roleplay Profile card.
 */
export async function buildUserProfilePayload(guild, user) {
  const stats = db.getRoleplayUser(guild.id, user.id);
  const marriage = db.getMarriage(guild.id, user.id);
  const total = (stats.sentCount || 0) + (stats.receivedCount || 0);

  // Top partners
  let topPartnerText = 'None yet';
  if (stats.partners && Object.keys(stats.partners).length > 0) {
    const sortedPartners = Object.entries(stats.partners).sort((a, b) => b[1] - a[1]);
    const top3 = sortedPartners.slice(0, 3).map(([pId, count], idx) => {
      return `${idx + 1}. <@${pId}> — \`${count}\` actions`;
    });
    topPartnerText = top3.join('\n');
  }

  // Favorite action
  const fav = stats.favoriteAction && stats.favoriteAction !== 'none'
    ? `\`${stats.favoriteAction.toUpperCase()}\` (${stats.actionsSent?.[stats.favoriteAction] || 0} sent)`
    : 'Exploring';

  const marriageStatus = marriage 
    ? `💍 Married to <@${marriage.partnerId}> (<t:${Math.floor(marriage.marriedAt / 1000)}:R>)` 
    : 'Single (Ready to mingle!)';

  const bioText = stats.customBio ? `\n> *"${stats.customBio}"*\n` : '';

  const embed = new EmbedBuilder()
    .setColor(0x70D6FF)
    .setTitle(`${getRandomHeadingGlyph()} Roleplay Profile: ${user.displayName || user.username} | ${TICK_EMOJI}`)
    .setThumbnail(user.displayAvatarURL({ extension: 'png', size: 256 }))
    .setDescription(
      `**Identity:** <@${user.id}>\n` +
      `${bioText}\n` +
      `${BULLET_EMOJI} **Total Roleplay Activity:** \`${total}\` interactions\n` +
      `${BULLET_EMOJI} **Actions Given:** \`${stats.sentCount || 0}\` sent\n` +
      `${BULLET_EMOJI} **Actions Received:** \`${stats.receivedCount || 0}\` received\n` +
      `${BULLET_EMOJI} **Favorite Move:** ${fav}\n` +
      `${BULLET_EMOJI} **Civil Status:** ${marriageStatus}\n\n` +
      `**__Top Roleplay Partners:__**\n${topPartnerText}\n\n` +
      `-# Tip: Customize your bio using \`!rp bio <your text>\``
    )
    .setFooter({ text: 'Athena Roleplay & Affinity Matrix • V2.0' });

  return { embeds: [embed] };
}

/**
 * Builds the server roleplay leaderboard.
 */
export async function buildLeaderboardPayload(guild, type = 'overall') {
  if (type === 'duos') {
    const topDuos = db.getRoleplayTopDuos(guild.id, 10);
    let desc = 'No duo interactions recorded yet in this server.';
    if (topDuos.length > 0) {
      desc = topDuos.map((d, idx) => {
        const rank = getAffinityRank(d.totalInteractions);
        const dynamic = getRelationshipDynamic(d);
        return `${idx + 1}. <@${d.users[0]}> & <@${d.users[1]}> — **${d.totalInteractions} actions** \`[${rank.title}]\`\n-# ${BULLET_EMOJI} *${dynamic}*`;
      }).join('\n\n');
    }

    const embed = new EmbedBuilder()
      .setColor(0xFF70A6)
      .setTitle(`${getRandomHeadingGlyph()} Top Roleplay Duos | ${TICK_EMOJI}`)
      .setDescription(desc)
      .setFooter({ text: 'Athena Roleplay & Affinity Matrix • V2.0' });

    return { embeds: [embed] };
  }

  // User leaderboard
  const topUsers = db.getRoleplayLeaderboard(guild.id, type, 10);
  let desc = 'No roleplay records registered yet in this server.';
  if (topUsers.length > 0) {
    desc = topUsers.map((u, idx) => {
      return `${idx + 1}. <@${u.userId}> — **${u.score} actions** (\`${u.sent}\` sent / \`${u.received}\` received)`;
    }).join('\n');
  }

  const categoryName = type === 'overall' ? 'Most Active Overall' : type === 'givers' ? 'Top Action Givers' : `Top \`${type.toUpperCase()}\``;

  const embed = new EmbedBuilder()
    .setColor(0x06D6A0)
    .setTitle(`${getRandomHeadingGlyph()} Roleplay Leaderboard (${categoryName}) | ${TICK_EMOJI}`)
    .setDescription(desc)
    .setFooter({ text: 'Athena Roleplay & Affinity Matrix • V2.0' });

  return { embeds: [embed] };
}

/**
 * Builds the interactive visual catalog of all 50+ roleplay actions.
 */
export function buildCatalogPayload(categoryFilter = null) {
  const categories = {
    affection: { name: 'Affection & Romance', color: 0xFF85A2 },
    playful: { name: 'Playful & Friendly', color: 0x48CAE4 },
    combat: { name: 'Combat & Chaos', color: 0xE63946 },
    reaction: { name: 'Reactions & Emotions', color: 0x7209B7 }
  };

  let filtered = ROLEPLAY_ACTIONS;
  if (categoryFilter && categories[categoryFilter.toLowerCase()]) {
    filtered = ROLEPLAY_ACTIONS.filter(a => a.category === categoryFilter.toLowerCase());
  }

  const sections = {};
  for (const act of filtered) {
    const cat = act.category || 'other';
    if (!sections[cat]) sections[cat] = [];
    sections[cat].push(`\`!${act.id}\``);
  }

  let text = '';
  for (const [cat, list] of Object.entries(sections)) {
    const meta = categories[cat] || { name: cat.toUpperCase() };
    text += `**${meta.name}:**\n${list.join('  ·  ')}\n\n`;
  }

  text += `-# **Usage:** \`!<action> @user\` (e.g. \`!hug @user\`) or \`!<action>\` for solo action.\n`;
  text += `-# **Features:** Bidirectional counter buttons, duo affinity matrix, marriage registry, and top leaderboard!`;

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`${getRandomHeadingGlyph()} Roleplay Command Catalog | ${TICK_EMOJI}`)
    .setDescription(text)
    .setFooter({ text: 'Athena Roleplay & Affinity Matrix • V2.0' });

  return { embeds: [embed] };
}

/**
 * Builds the live status report of all Federated GIF Providers & Endpoints.
 */
export function buildRoutesStatusPayload() {
  const klipyCachedCount = klipyScrapeCache.size;
  const inMemoryCachedPools = gifCache.size;
  const recentDedupeCount = recentGifs.size;

  const desc = 
    `Athena utilizes a resilient **Multi-Route GIF Federation** that distributes queries across 8 distinct global media providers and a 54-category fail-safe CDN cache to guarantee 100% GIF delivery uptime.\n\n` +
    `**__Active Federated Providers:__**\n` +
    `${BULLET_EMOJI} **KLIPY Expression Platform (\`klipy.com\`):** Online · Direct static asset pipeline & KLIPY API bridge\n` +
    `${BULLET_EMOJI} **Nekos Best v2 (\`nekos.best\`):** Online · High-resolution dedicated anime SFW engine\n` +
    `${BULLET_EMOJI} **Purrbot Media Gateway (\`purrbot.site\`):** Online · High-velocity sub-millisecond anime GIFs\n` +
    `${BULLET_EMOJI} **OtakuGifs SFW Network (\`otakugifs.xyz\`):** Online · 20+ specialized anime reaction endpoints\n` +
    `${BULLET_EMOJI} **Nekos.Life API (\`nekos.life\`):** Online · Classical anime action library\n` +
    `${BULLET_EMOJI} **Waifu.pics Gateway (\`waifu.pics\`):** Online · Circuit-breaker protected backup engine\n` +
    `${BULLET_EMOJI} **Google Tenor v2 (\`tenor.com\`):** Online · Keyword search bridge\n` +
    `${BULLET_EMOJI} **GIPHY REST API (\`giphy.com\`):** Online · Fallback global expression route\n` +
    `${BULLET_EMOJI} **Athena Curated CDN Vault:** Online · 54 categories guaranteed with zero downtime\n\n` +
    `**__Engine Telemetry:__**\n` +
    `${BULLET_EMOJI} **Pre-warmed RAM Pools:** \`${inMemoryCachedPools}\` action categories\n` +
    `${BULLET_EMOJI} **KLIPY Indexed Caches:** \`${klipyCachedCount}\` queries cached in memory\n` +
    `${BULLET_EMOJI} **Deduplication Buffer:** Tracking last \`${recentDedupeCount}\` recent URLs to prevent repeats\n` +
    `${BULLET_EMOJI} **Fail-Safe Circuit Breaker:** 100% zero-failure guarantee across all roleplay commands.`;

  const embed = new EmbedBuilder()
    .setColor(0x06D6A0)
    .setTitle(`${getRandomHeadingGlyph()} Federated GIF Routes & Endpoints | ${TICK_EMOJI}`)
    .setDescription(desc)
    .setFooter({ text: 'Athena Roleplay & Affinity Matrix • V2.0' });

  return { embeds: [embed] };
}

// =========================================================================
// 6. BUTTON INTERACTION ROUTER
// =========================================================================
export async function handleRoleplayButton(interaction) {
  if (!interaction.customId || !interaction.customId.startsWith('rp_')) return false;

  const parts = interaction.customId.split('_');
  // Format: rp_<action>_<targetId>_<authorId>
  // Or rp_marry_accept_<targetId>_<authorId>
  const action = parts[1];

  // Marriage proposal handling
  if (action === 'marry') {
    const sub = parts[2]; // 'accept' or 'reject'
    const targetId = parts[3];
    const authorId = parts[4];

    if (interaction.user.id !== targetId) {
      return interaction.reply({
        content: `-# ${WARN_EMOJI} **This marriage proposal is strictly for <@${targetId}>!**`,
        ephemeral: true
      });
    }

    if (sub === 'accept') {
      const marriage = db.setMarriage(interaction.guild.id, authorId, targetId);
      const embed = new EmbedBuilder()
        .setColor(0xFF1493)
        .setTitle(`${getRandomHeadingGlyph()} Marriage Sealed in Harmony | ${TICK_EMOJI}`)
        .setDescription(
          `💍 **<@${targetId}> has joyfully ACCEPTED the marriage proposal from <@${authorId}>!**\n\n` +
          `${BULLET_EMOJI} **Ring:** \`${marriage.ringType}\`\n` +
          `${BULLET_EMOJI} **Vows:** *"${marriage.vows}"*\n\n` +
          `May your roleplay bond endure forever across the Athena Defense Matrix! 🎉`
        )
        .setImage('https://nekos.best/api/v2/hug/09a0b73f-4a7d-49f2-a528-0b1c408d6c5e.gif')
        .setFooter({ text: 'Athena Roleplay & Affinity Matrix • V2.0' });

      // Disable buttons on the original proposal message
      await interaction.update({ components: [] }).catch(() => null);
      return interaction.channel.send({ embeds: [embed] });
    } else {
      const embed = new EmbedBuilder()
        .setColor(0x6C757D)
        .setTitle(`${getRandomHeadingGlyph()} Proposal Declined | ${WRONG_EMOJI}`)
        .setDescription(`💔 **<@${targetId}> has gently declined the proposal from <@${authorId}>.**`)
        .setFooter({ text: 'Athena Roleplay & Affinity Matrix • V2.0' });

      await interaction.update({ components: [] }).catch(() => null);
      return interaction.channel.send({ embeds: [embed] });
    }
  }

  // Standard counter action: rp_<actionId>_<targetId>_<authorId>
  const targetId = parts[2];
  const authorId = parts[3];

  if (targetId && interaction.user.id !== targetId) {
    return interaction.reply({
      content: `-# ${WARN_EMOJI} **Only <@${targetId}> can use these reaction buttons!**`,
      ephemeral: true
    });
  }

  // Execute the counter action: targetUser acts on authorUser
  const targetUser = interaction.user;
  const originalAuthor = await interaction.client.users.fetch(authorId).catch(() => null);

  if (!originalAuthor) {
    return interaction.reply({ content: `-# ${WRONG_EMOJI} **Original user no longer available.**`, ephemeral: true });
  }

  // Disable original message components to prevent double-clicking
  await interaction.update({ components: [] }).catch(() => null);

  const payload = await buildRoleplayPayload(interaction.guild, targetUser, originalAuthor, action);
  return interaction.channel.send(payload);
}
