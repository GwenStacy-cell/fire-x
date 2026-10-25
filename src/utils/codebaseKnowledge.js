import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_DIR = path.resolve(__dirname, '..');

// In-memory cache of codebase files: Map<relativePath, { content: string, lines: string[], mtimeMs: number, meta?: object }>
let codebaseCache = null;
let lastCacheBuild = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute TTL for development refreshes

const IGNORED_DIRS = new Set(['assets', 'fonts', 'node_modules', '.git']);

// Conversational Tanglish (Tamil + English) stopwords and phrasing particles
export const TANGLISH_VOCABULARY = [
  'enna', 'edhu', 'edhula', 'enga', 'engae', 'epdi', 'eppadi', 'yaaru', 'yaarukku',
  'panradhu', 'pananum', 'pannum', 'pannuradhu', 'panna', 'pannunga', 'panni',
  'solli', 'sollu', 'sollunga', 'solrathu', 'kudu', 'kudunga', 'kaatu', 'kaatunga',
  'irukku', 'irukka', 'illa', 'illai', 'onnum', 'therila', 'theriyuma', 'mudiyuma',
  'podu', 'podanum', 'poduradhu', 'edukanum', 'vaikkanum', 'mathu', 'maathanum', 'mathuradhu',
  'velai', 'seiyala', 'aagala', 'aachu', 'aagum', 'seri', 'sari', 'romba',
  'nalla', 'super', 'puriya', 'purinjidhu', 'sariya', 'thappa', 'thappu',
  'adhula', 'idhula', 'adhu', 'idhu', 'ippo', 'aprom', 'appuram', 'kooda', 'mattum',
  'enakku', 'unakku', 'ungakitta', 'ennaala'
];

// Grammatical and filler stopwords for search indexing (extractSearchTokens)
export const SEARCH_STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'and', 'or', 'to', 'in', 'on', 'at', 'by',
  'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after',
  'above', 'below', 'from', 'up', 'down', 'in', 'out', 'off', 'over', 'under', 'again',
  'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any',
  'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only',
  'own', 'same', 'so', 'than', 'too', 'very', 'can', 'will', 'just', 'should', 'now',
  'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'am', 'been', 'being',
  'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'right', 'available', 'available?',
  'please', 'tell', 'me', 'bot', 'athena', 'use', 'using', 'used', 'cmd', 'command', 'commands',
  'work', 'works', 'working', 'help', 'explain', 'show', 'make', 'give', 'get', 'want', 'need', 'i',
  'like', 'also', 'know', 'see', 'look', 'find', 'call', 'called', 'would', 'could', 'way', 'ways',
  ...TANGLISH_VOCABULARY
]);

// Full conversational and domain vocabulary that must NEVER be fuzzy-matched into command typos
export const NON_TYPO_VOCABULARY = new Set([
  ...SEARCH_STOPWORDS,
  ...TANGLISH_VOCABULARY,
  'setting', 'settings', 'option', 'options', 'setup', 'setups', 'configure', 'configuration',
  'message', 'messages', 'channel', 'channels', 'category', 'categories', 'role', 'roles',
  'member', 'members', 'user', 'users', 'count', 'counts', 'counting', 'feature', 'features',
  'system', 'systems', 'server', 'servers', 'guild', 'guilds', 'code', 'database', 'embed',
  'embeds', 'button', 'buttons', 'menu', 'menus', 'dropdown', 'dropdowns', 'variable',
  'variables', 'placeholder', 'placeholders', 'text', 'texts', 'mode', 'modes', 'type',
  'types', 'format', 'formats', 'value', 'values', 'details', 'detail', 'guide', 'tutorial',
  'instructions', 'instruction', 'example', 'examples', 'info', 'information', 'card', 'cards',
  'panel', 'panels', 'status', 'view', 'list', 'check', 'test', 'run', 'execute', 'turn',
  'toggle', 'enable', 'disable', 'reset', 'clear', 'add', 'remove', 'delete', 'update',
  'edit', 'change', 'send', 'post', 'display', 'screen', 'action', 'actions', 'rule', 'rules',
  'level', 'levels', 'rank', 'ranks', 'voice', 'sound', 'audio', 'image', 'images', 'banner',
  'avatar', 'icon', 'color', 'colorway', 'theme', 'themes', 'time', 'timer', 'duration',
  'timeout', 'audit', 'logs', 'log', 'logging', 'permission', 'permissions', 'clearance',
  'admin', 'administrator', 'moderator', 'owner', 'security', 'protection', 'defense',
  'antinuke', 'bypass', 'whitelist', 'quarantine', 'join', 'leave', 'welcome', 'greet',
  'greeting', 'farewell', 'boost', 'boosts', 'streak'
]);

export const COMMON_STOPWORDS = SEARCH_STOPWORDS;

/**
 * Dynamically extracts metadata from any source file without hardcoded dictionaries
 * @param {string} relPath - Relative path from src/
 * @param {string} content - Full source text
 * @param {string[]} lines - Split text lines
 */
export function extractFileMetadata(relPath = '', content = '', lines = []) {
  const norm = relPath.replace(/^src\//, '').replace(/\\/g, '/');
  const fileLines = lines.length > 0 ? lines : content.split('\n');
  const baseName = path.basename(norm, '.js');

  // 1. Commands module analysis
  if (norm.startsWith('commands/')) {
    const commands = [];
    const len = fileLines.length;

    for (let i = 0; i < len; i++) {
      const line = fileLines[i];
      const nameMatch = line.match(/^(\s{2,6})name:\s*['"]([a-zA-Z0-9_-]+)['"]/);
      if (nameMatch) {
        const indent = nameMatch[1].length;
        const cmdName = nameMatch[2];
        let description = '';
        let category = '';
        let aliases = [];
        let choices = [];
        let options = [];
        let hasPrefix = false;
        let hasSlash = false;
        let slashHidden = false;
        let isExecutable = false;

        let inOptions = false;
        let currOpt = null;

        for (let j = i + 1; j < Math.min(len, i + 300); j++) {
          const l = fileLines[j];
          const nextCmdMatch = l.match(/^(\s{2,6})name:\s*['"]([a-zA-Z0-9_-]+)['"]/);
          if (nextCmdMatch && nextCmdMatch[1].length <= indent) {
            break;
          }

          if (!description) {
            const descMatch = l.match(/description:\s*['"]([^'"]+)['"]/);
            if (descMatch) description = descMatch[1];
          }
          if (!category) {
            const catMatch = l.match(/category:\s*['"]([^'"]+)['"]/);
            if (catMatch) category = catMatch[1];
          }
          if (aliases.length === 0) {
            const aliasMatch = l.match(/aliases:\s*\[([^\]]*)\]/);
            if (aliasMatch) {
              aliases = aliasMatch[1].split(',').map(s => s.replace(/['"\s]/g, '')).filter(Boolean);
            }
          }
          const chMatch = l.match(/value:\s*['"]([a-zA-Z0-9_-]+)['"]/);
          if (chMatch && !choices.includes(chMatch[1])) {
            choices.push(chMatch[1]);
          }

          if (l.includes('options:') && l.includes('[')) {
            inOptions = true;
          }
          if (inOptions) {
            const optMatch = l.match(/name:\s*['"]([a-zA-Z0-9_-]+)['"]/);
            if (optMatch && optMatch[1] !== cmdName) {
              currOpt = { name: optMatch[1], required: false };
              options.push(currOpt);
            }
            if (currOpt && l.includes('required: true')) {
              currOpt.required = true;
            }
            if (l.includes('executePrefix') || l.includes('executeSlash')) {
              inOptions = false;
            }
          }

          if (l.includes('executePrefix')) {
            hasPrefix = true;
            isExecutable = true;
          }
          if (l.includes('executeSlash')) {
            hasSlash = true;
            isExecutable = true;
          }
          if (l.includes('slashHidden: true') || l.includes('slashHidden:true')) {
            slashHidden = true;
          }
        }

        if (slashHidden) {
          hasSlash = false;
        }

        if (!hasPrefix && !hasSlash) {
          if (content.includes('executePrefix')) hasPrefix = true;
          if (content.includes('executeSlash') && !content.includes('slashHidden: true')) hasSlash = true;
          if (hasPrefix || hasSlash) isExecutable = true;
        }

        let executionMode = 'Prefix Only';
        if (hasPrefix && hasSlash) {
          executionMode = 'Dual Execution (Prefix & Slash Supported)';
        } else if (hasPrefix && !hasSlash) {
          executionMode = 'Prefix Only';
        } else if (!hasPrefix && hasSlash) {
          executionMode = 'Slash Command Only';
        } else {
          executionMode = 'Prefix Supported';
          hasPrefix = true;
        }

        let optionsSyntax = '';
        if (options.length > 0) {
          optionsSyntax = options.map(o => o.required ? `<${o.name}>` : `[${o.name}]`).join(' ');
        } else if (choices.length > 0) {
          optionsSyntax = `[${choices.slice(0, 4).join('|')}]`;
        }

        const primaryPrefixSyntax = optionsSyntax ? `!${cmdName} ${optionsSyntax}` : `!${cmdName}`;
        const slashAlternative = hasSlash 
          ? `/${cmdName}${optionsSyntax ? ' ' + optionsSyntax : ''} (Slash Command Available)`
          : 'Not Available as a Slash Command (Prefix Only)';

        if (isExecutable && !commands.some(c => c.name === cmdName)) {
          commands.push({
            name: cmdName,
            description,
            category: category || baseName,
            aliases,
            choices,
            options,
            hasPrefix,
            hasSlash,
            slashHidden,
            executionMode,
            optionsSyntax,
            primaryPrefixSyntax,
            slashAlternative,
            lineNum: i + 1
          });
        }
      }
    }

    // Fallback if no command matched isExecutable, but file declares name: '...'
    if (commands.length === 0) {
      const singleName = content.match(/name:\s*['"]([a-zA-Z0-9_-]+)['"]/);
      if (singleName) {
        const cmdName = singleName[1];
        const hasP = content.includes('executePrefix');
        const hasS = content.includes('executeSlash') && !content.includes('slashHidden: true');
        const mode = (hasP && hasS) ? 'Dual Execution (Prefix & Slash Supported)' : (hasP ? 'Prefix Only' : (hasS ? 'Slash Command Only' : 'Prefix Supported'));
        commands.push({
          name: cmdName,
          description: '',
          category: baseName,
          aliases: [],
          choices: [],
          options: [],
          hasPrefix: hasP || !hasS,
          hasSlash: hasS,
          slashHidden: !hasS,
          executionMode: mode,
          optionsSyntax: '',
          primaryPrefixSyntax: `!${cmdName}`,
          slashAlternative: hasS ? `/${cmdName} (Slash Command Available)` : 'Not Available as a Slash Command (Prefix Only)',
          lineNum: 1
        });
      }
    }

    let summary = '';
    if (commands.length > 0) {
      const namesList = commands.map(c => {
        if (c.choices.length > 0) {
          return `!${c.name} [${c.choices.slice(0, 3).join('|')}${c.choices.length > 3 ? '...' : ''}]`;
        }
        return `!${c.name}`;
      }).slice(0, 4).join(', ');
      summary = `${(commands[0].category || baseName).toUpperCase()} Commands (${namesList}${commands.length > 4 ? ` +${commands.length - 4} more` : ''})`;
    } else {
      summary = `${baseName.toUpperCase()} Command Module`;
    }

    return { type: 'command', commands, summary };
  }

  // 2. Utils module analysis
  if (norm.startsWith('utils/')) {
    const exports = [];
    for (let i = 0; i < fileLines.length; i++) {
      const fnMatch = fileLines[i].match(/export\s+(?:async\s+)?(?:function|class|const)\s+([a-zA-Z0-9_]+)/);
      if (fnMatch && !exports.includes(fnMatch[1])) {
        exports.push(fnMatch[1]);
      }
    }

    let topDesc = '';
    const jsDocMatch = content.match(/^\/\*\*[\s\S]*?\*\//);
    if (jsDocMatch) {
      const docLines = jsDocMatch[0].split('\n').map(l => l.replace(/^\s*\/?\*+\/?\s*/, '').trim()).filter(Boolean);
      if (docLines.length > 0) topDesc = docLines[0];
    }

    const summary = topDesc ? `${topDesc} (${baseName})` : `Utility Engine: ${exports.slice(0, 3).join(', ')} (${baseName})`;
    return { type: 'util', exports, summary };
  }

  // 3. Database module analysis
  if (norm === 'database.js') {
    return {
      type: 'database',
      summary: 'SQLite Database Schema & State Persistence Store'
    };
  }

  return { type: 'core', summary: `Core Bot Engine Module (${baseName})` };
}

/**
 * Returns a dynamically computed role summary for any source file
 * @param {string} relPath - File path
 * @param {object} [fileData] - Pre-loaded file data
 */
export function describeFileRole(relPath = '', fileData = null) {
  if (fileData && fileData.meta && fileData.meta.summary) {
    return fileData.meta.summary;
  }
  if (codebaseCache) {
    const cached = codebaseCache.get(relPath.replace(/^src\//, '').replace(/\\/g, '/'));
    if (cached && cached.meta && cached.meta.summary) {
      return cached.meta.summary;
    }
  }
  return extractFileMetadata(relPath, fileData?.content || '', fileData?.lines || []).summary;
}

/**
 * Loads all JS source files from src/ into memory cache and indexes metadata
 */
export async function loadCodebaseCache(force = false) {
  const now = Date.now();
  if (codebaseCache && !force && (now - lastCacheBuild < CACHE_TTL_MS)) {
    return codebaseCache;
  }

  const cache = new Map();

  async function walkDir(dir) {
    let entries = [];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (IGNORED_DIRS.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walkDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        try {
          const stats = await fs.promises.stat(fullPath);
          const content = await fs.promises.readFile(fullPath, 'utf8');
          const relPath = path.relative(SRC_DIR, fullPath).replace(/\\/g, '/');
          const lines = content.split('\n');
          const meta = extractFileMetadata(relPath, content, lines);

          cache.set(relPath, {
            content,
            lines,
            mtimeMs: stats.mtimeMs,
            name: entry.name,
            meta
          });
        } catch {}
      }
    }
  }

  await walkDir(SRC_DIR);
  codebaseCache = cache;
  lastCacheBuild = now;
  return codebaseCache;
}

/**
 * Extracts substantive search tokens and phrases from a user query
 */
export function extractSearchTokens(query = '') {
  const clean = query.toLowerCase().replace(/[?!.,;:()\[\]{}"'\\\/]/g, ' ').trim();
  const rawTokens = clean.split(/\s+/).filter(Boolean);
  const keywords = rawTokens.filter(t => t.length > 2 && !COMMON_STOPWORDS.has(t));

  // Decompose compound tokens (e.g., "rateedit" -> "rate", "edit"; "ticketpanel" -> "ticket", "panel")
  const compoundSubwords = ['rate', 'edit', 'ticket', 'panel', 'theme', 'rank', 'voice', 'channel', 'role', 'nuke', 'anti', 'lock', 'limit', 'slow', 'mode', 'stats', 'reward', 'quote', 'logs'];
  for (const token of [...keywords]) {
    for (const sub of compoundSubwords) {
      if (token.length > sub.length + 2 && token.includes(sub)) {
        if (!keywords.includes(sub)) keywords.push(sub);
        const remainder = token.replace(sub, '');
        if (remainder.length > 2 && !COMMON_STOPWORDS.has(remainder) && !keywords.includes(remainder)) {
          keywords.push(remainder);
        }
      }
    }
  }

  const phrases = [];
  for (let len = 4; len >= 2; len--) {
    for (let i = 0; i <= rawTokens.length - len; i++) {
      const first = rawTokens[i];
      const last = rawTokens[i + len - 1];
      if (!COMMON_STOPWORDS.has(first) && !COMMON_STOPWORDS.has(last)) {
        const slice = rawTokens.slice(i, i + len);
        if (slice.some(word => keywords.includes(word))) {
          const phrase = slice.join(' ');
          if (phrase.length > 4 && !phrases.includes(phrase)) phrases.push(phrase);
        }
      }
    }
  }

  return { phrases, keywords, rawTokens };
}

/**
 * Authoritative semantic intents that map natural-language user queries to real bot commands
 */
export const SEMANTIC_INTENTS = [
  { match: /\b(ai\s*announce|aiannounce|smart\s*announce|ai\s*announcement|announcement\s*studio|make\s*announcement|craft\s*announcement|announcement\s*builder)\b/i, commands: ['aiannounce', 'announce', 'studio'] },
  { match: /\b(rate\s*edit|rateedit|edit\s*rate|editrate|star\s*rating|rate\s*an?\s*edit)\b/i, commands: ['rate', 'ratelb'] },
  { match: /\b(ticket\s*panel|ticketpanel|support\s*ticket|open\s*ticket|smart\s*triage|ban\s*appeal\s*ticket)\b/i, commands: ['ticketpanel', 'ticket'] },
  { match: /\b(slow\s*mode|slowmode|slow\s*down|slow\s*chat|chat\s*delay|rate\s*limit\s*per\s*user|channel\s*speed)\b/i, commands: ['slowmode'] },
  { match: /\b(antinuke|anti\s*nuke|bulletproof|firewall|anti\s*raid|anti\s*bot|mass\s*ban\s*protect|damage\s*repair)\b/i, commands: ['security', 'antinuke'] },
  { match: /\b(backup|restore\s*server|server\s*backup|cloud\s*backup)\b/i, commands: ['db', 'backup'] },
  { match: /\b(rank(s)?\s*(card|theme|reward|xp)s?|(card|theme|xp|reward)s?\s*(for\s*)?rank(s)?|ranktheme|god\s*of\s*war\s*theme|hogwarts\s*theme)\b/i, commands: ['ranktheme', 'leveling', 'profile'] },
  { match: /\b(rank\s*rewards?|level\s*roles?|role\s*rewards?)\b/i, commands: ['rankrewards', 'leveling'] },
  { match: /\b(quarantine|isolate\s*user|quarantined\s*role)\b/i, commands: ['quarantine', 'setupquarantine'] },
  { match: /\b(youtube\s*stats?|ytstats|sub\s*counter|subscriber\s*vc)\b/i, commands: ['ytstats'] },
  { match: /\b(server\s*stats?|stats\s*vc|member\s*count\s*vc)\b/i, commands: ['serverstats'] },
  { match: /\b(voice\s*drag|vcdrag|mass\s*move|mass\s*dc|mass\s*disconnect)\b/i, commands: ['vcdrag', 'massmove', 'massdc'] },
  { match: /\b(auto\s*media|setmedia|media\s*downloader|download\s*reels?|tiktok\s*downloader)\b/i, commands: ['setmedia', 'utility'] },
  { match: /\b(auto\s*quote|setquote|quote\s*channel|quotemaker)\b/i, commands: ['quote', 'quotemaker'] },
  { match: /\b(counting|count\s*channel|counting\s*game)\b/i, commands: ['counting'] },
  { match: /\b(weather|wtr|climate|forecast|temperature|temp|world\s*map|radar|satellite\s*map)\b/i, commands: ['weather'] },
  { match: /\b(image|pic|img|photo|picture|searchimg|pictures|photos|search\s*image|find\s*pic)\b/i, commands: ['image'] },
  { match: /\b(pinterest|pintrest|pin\.it|pinimg|pin\s*image|pinterest\s*link|pinterest\s*download)\b/i, commands: ['pinterest'] },
  { match: /\b(auto\s*role|autorole|join\s*role)\b/i, commands: ['autorole'] },
  { match: /\b(welcome|welcomer|greet|leave(\s*message)?|farewell|member\s*count\s*(in\s*)?(welcome|leave|greet)|(welcome|leave).*member\s*count)\b/i, commands: ['welcome'] },
  { match: /\b(member\s*count|mem\s*count|membercount|members\s*count)\b/i, commands: ['welcome', 'serverstats'] },
  { match: /\b(server\s*logs?|log\s*channel|audit\s*logs?|bind\s*logs?)\b/i, commands: ['serverlogs'] },
  { match: /\b(reaction\s*roles?|rr\s*setup|button\s*roles?)\b/i, commands: ['rr'] },
  { match: /\b(sticky\s*message|stick\s*message)\b/i, commands: ['sticky'] },
  { match: /\b(snipe|deleted\s*messages?|sniped)\b/i, commands: ['snipe'] },
  { match: /\b(24\s*7\s*vc|sethomevc|stay\s*in\s*vc|voice\s*bot)\b/i, commands: ['sethomevc', 'utility'] },
  { match: /\b(mod\s*mode|modmode|maintenance\s*mode)\b/i, commands: ['modmode'] },
  { match: /\b(news|newsfeed|rss\s*feed|rss|automated\s*news|bbc\s*news|news\s*channel|news\s*setup|news\s*disable)\b/i, commands: ['news'] },
  { match: /\b(bot\s*ownership|give\s*(me\s*)?(bot\s*)?ownership|transfer\s*(bot\s*)?ownership|make\s*(me\s*)?(a\s*)?bot\s*owner|become\s*(a\s*)?bot\s*owner|owner\s*privileges|transfer\s*bot)\b/i, commands: ['owner', 'extraowner', 'vc', 'jtc'] }
];

/**
 * Returns all top-level executable commands discovered in the codebase
 */
export async function getAllBotCommands() {
  const cache = await loadCodebaseCache();
  const allCmds = [];
  for (const [relPath, data] of cache.entries()) {
    if (data.meta && data.meta.commands) {
      for (const cmd of data.meta.commands) {
        allCmds.push({
          ...cmd,
          file: relPath
        });
      }
    }
  }
  return allCmds;
}

/**
 * Searches the real codebase dynamically for code snippets relevant to the query
 * @param {string} query - The user query
 * @param {object} options - Search configuration
 * @returns {Promise<Array<{ file: string, startLine: number, endLine: number, code: string, score: number, reason: string, role: string }>>}
 */
export async function searchCodebase(query = '', { maxSnippets = 5, snippetLines = 45 } = {}) {
  const cache = await loadCodebaseCache();
  const { phrases, keywords, rawTokens } = extractSearchTokens(query);

  if (phrases.length === 0 && keywords.length === 0) {
    return [];
  }

  // Detect semantic intents matching the query
  const matchedIntentCmds = new Set();
  for (const intent of SEMANTIC_INTENTS) {
    if (intent.match.test(query)) {
      for (const cmd of intent.commands) {
        matchedIntentCmds.add(cmd.toLowerCase());
      }
    }
  }

  const matches = [];

  for (const [relPath, fileData] of cache.entries()) {
    // Avoid self-matching internal meta search engine files
    if (relPath.includes('botGuideKnowledge') || relPath.includes('codebaseKnowledge')) continue;

    const isCommand = relPath.startsWith('commands/');
    const isUtil = relPath.startsWith('utils/');
    const isDatabase = relPath === 'database.js';

    let fileMultiplier = 1.0;
    if (isCommand) fileMultiplier = 2.0;
    else if (isUtil) fileMultiplier = (relPath.includes('antinuke') || relPath.includes('antiStrip')) ? 2.5 : 1.6;
    else if (isDatabase) fileMultiplier = 1.4;

    // Check if filename matches a keyword (e.g. learn.js matches learn, antinuke.js matches nuke)
    const baseName = path.basename(relPath, '.js').toLowerCase();
    const fileNameMatch = keywords.some(k => baseName === k || (k.length >= 5 && baseName.startsWith(k)) || (baseName.length >= 5 && k.startsWith(baseName)));
    if (fileNameMatch) {
      fileMultiplier *= 2.2;
    }

    // Check if command metadata or aliases match keywords
    if (fileData.meta?.commands?.some(c => keywords.includes(c.name.toLowerCase()) || (c.aliases || []).some(a => keywords.includes(a.toLowerCase())))) {
      fileMultiplier *= 2.0;
    }

    // Apply high multiplier if file satisfies user's semantic intent
    if (matchedIntentCmds.size > 0) {
      const hasIntentCmd = fileData.meta?.commands?.some(c => matchedIntentCmds.has(c.name.toLowerCase()) || (c.aliases || []).some(a => matchedIntentCmds.has(a.toLowerCase())));
      if (hasIntentCmd || matchedIntentCmds.has(baseName)) {
        fileMultiplier *= 3.5;
      }
    }

    // De-prioritize internal/hidden or owner-only commands (e.g., enuke.js) unless explicitly queried by name
    const isHiddenOrOwner = fileData.content.includes('hidden: true') || fileData.content.includes("category: 'owner'") || fileData.content.includes('category: "owner"');
    if (isHiddenOrOwner) {
      const explicitMention = rawTokens.includes(baseName) || keywords.includes(baseName);
      if (!explicitMention) {
        fileMultiplier *= 0.05;
      }
    }

    // Isolate domain-specific commands: do not match chess.js unless user query actually mentions chess/board/checkmate
    if (baseName === 'chess' && !rawTokens.some(t => ['chess', 'board', 'move', 'checkmate', 'lichess', 'stockfish'].includes(t))) {
      fileMultiplier *= 0.02;
    }

    // De-prioritize server activity statsDB unless querying message/voice activity tracking
    if (baseName === 'statsdb' && !rawTokens.some(t => ['activity', 'voice_seconds', 'messages', 'tracking', 'history', 'retention'].includes(t))) {
      fileMultiplier *= 0.05;
    }

    const lowerContent = fileData.content.toLowerCase();

    // 1. Exact phrase matches (e.g. "god of war", "security enable all", "panic lockdown")
    for (const phrase of phrases) {
      if (lowerContent.includes(phrase)) {
        let matchIdx = -1;
        while ((matchIdx = lowerContent.indexOf(phrase, matchIdx + 1)) !== -1) {
          const preText = fileData.content.slice(0, matchIdx);
          const lineNum = preText.split('\n').length;
          matches.push({
            file: relPath,
            lineNum,
            score: (130 + phrase.length * 3) * fileMultiplier,
            reason: `Exact phrase "${phrase}"`
          });
          if (matches.length > 60) break;
        }
      }
    }

    // 2. Line by line keyword, definition, function export, and choice matches
    for (let i = 0; i < fileData.lines.length; i++) {
      const line = fileData.lines[i].toLowerCase();
      let lineScore = 0;

      for (const kw of keywords) {
        // High priority: Command definition name match (e.g. name: 'learn' or name: 'ranktheme')
        const nameDecl = line.match(/^\s*name:\s*['"]([a-zA-Z0-9_-]+)['"]/);
        if (nameDecl) {
          const declaredName = nameDecl[1].toLowerCase();
          if (declaredName === kw || (declaredName.length >= 5 && kw.startsWith(declaredName)) || (kw.length >= 5 && declaredName.startsWith(kw))) {
            lineScore += 300;
          }
        }
        // Exported utility engine function match (e.g. export async function rawBan, executeIntelligentChannelRepair)
        if ((line.includes('export async function') || line.includes('export function')) && line.includes(kw)) {
          lineScore += 250;
        }
        // Aliases match
        if (line.includes(`'${kw}'`) && line.includes('aliases:')) {
          lineScore += 160;
        }
        // Choices/options match
        if (line.includes(`value: '${kw}'`) || line.includes(`value: "${kw}"`)) {
          lineScore += 140;
        }
        // General keyword presence
        if (line.includes(kw)) {
          lineScore += (kw.length > 4 ? 10 : 5);
        }
      }

      if (lineScore > 0) {
        matches.push({
          file: relPath,
          lineNum: i + 1,
          score: lineScore * fileMultiplier,
          reason: `Matched keyword & syntax definitions`
        });
      }
    }
  }

  if (matches.length === 0) return [];

  matches.sort((a, b) => b.score - a.score);

  // Group nearby line matches in the same file into cohesive blocks
  const selectedBlocks = [];
  const coveredRanges = new Map(); // relPath -> Array<[start, end]>

  for (const match of matches) {
    if (selectedBlocks.length >= maxSnippets) break;

    const fileData = cache.get(match.file);
    if (!fileData) continue;

    let startLine = Math.max(1, match.lineNum - 10);
    // If it's a command file, expand backwards to the command declaration if nearby
    if (match.file.startsWith('commands/')) {
      for (let j = match.lineNum - 1; j >= Math.max(0, match.lineNum - 28); j--) {
        const l = fileData.lines[j];
        if (l && (l.includes("name: '") || l.includes('name: "'))) {
          startLine = Math.max(1, j + 1);
          break;
        }
      }
    }

    let endLine = Math.min(fileData.lines.length, startLine + snippetLines - 1);
    if (endLine - startLine < snippetLines - 1) {
      startLine = Math.max(1, endLine - snippetLines + 1);
    }

    // Check overlap with existing block in same file
    const existing = coveredRanges.get(match.file) || [];
    const overlaps = existing.some(([s, e]) => {
      return (startLine >= s && startLine <= e) || (endLine >= s && endLine <= e) || (startLine <= s && endLine >= e);
    });

    if (overlaps) continue;

    existing.push([startLine, endLine]);
    coveredRanges.set(match.file, existing);

    const snippet = fileData.lines.slice(startLine - 1, endLine).join('\n');
    const role = describeFileRole(match.file, fileData);

    selectedBlocks.push({
      file: `src/${match.file}`,
      startLine,
      endLine,
      code: snippet,
      score: match.score,
      reason: match.reason,
      role
    });
  }

  return selectedBlocks;
}

/**
 * Formats retrieved codebase snippets into clean markdown for AI ingestion
 */
export function formatCodebaseContext(snippets = []) {
  if (!snippets || snippets.length === 0) return '';

  const out = [];
  out.push('=== RELEVANT BOT SOURCE CODE FROM REPOSITORY (GROUND TRUTH) ===');
  out.push('The following code snippets were dynamically extracted directly from the bot codebase for this query.');
  out.push('Conduct an exhaustive deep-dive into this source code. Use it as authoritative ground truth for command names, syntax, arguments, execution logic, and options.');
  out.push('CRITICAL REQUIREMENT: In your final answer, you MUST include a dedicated section citing the exact source code files and line ranges where you deep-dived and analyzed the answer from.\n');

  for (const snip of snippets) {
    out.push(`--- File: ${snip.file} (Lines ${snip.startLine}-${snip.endLine}) [Module: ${snip.role} | Match: ${snip.reason}] ---`);
    out.push('```javascript');
    out.push(snip.code);
    out.push('```\n');
  }

  return out.join('\n');
}

/**
 * Calculates Damerau-Levenshtein distance between two strings
 * Handles insertions, deletions, substitutions, and adjacent character transpositions.
 */
export function damerauLevenshteinDistance(a = '', b = '') {
  const al = a.length;
  const bl = b.length;
  if (!al) return bl;
  if (!bl) return al;

  const d = [];
  for (let i = 0; i <= al; i++) d[i] = [i];
  for (let j = 0; j <= bl; j++) d[0][j] = j;

  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,       // deletion
        d[i][j - 1] + 1,       // insertion
        d[i - 1][j - 1] + cost // substitution
      );

      // Transposition
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }

  return d[al][bl];
}

/**
 * Checks if a string is a subsequence of another string
 */
function isSubsequence(sub = '', str = '') {
  if (sub.length > str.length) return false;
  let i = 0;
  let j = 0;
  while (i < sub.length && j < str.length) {
    if (sub[i] === str[j]) i++;
    j++;
  }
  return i === sub.length;
}

/**
 * Fuzzy matches a candidate token against the bot command matrix and aliases
 */
export function findFuzzyCommandMatch(token = '', allCommands = [], minScoreThreshold = 0.65) {
  const clean = token.toLowerCase().replace(/[^a-z0-9_-]/g, '').trim();
  if (clean.length < 3) return null;

  let bestMatch = null;
  let highestScore = -999;

  for (const cmd of allCommands) {
    const candidates = [cmd.name, ...(cmd.aliases || [])];

    for (const cand of candidates) {
      const cleanCand = cand.toLowerCase().trim();
      if (!cleanCand) continue;

      // Exact match - not a typo
      if (clean === cleanCand) {
        return {
          command: cmd,
          matchedName: cleanCand,
          isExact: true,
          distance: 0,
          score: 1.0
        };
      }

      // If the candidate token is a common dictionary / conversational word,
      // never fuzzy match it to an inexact command name!
      if (NON_TYPO_VOCABULARY.has(clean)) {
        continue;
      }

      // Check distance and similarity
      const dist = damerauLevenshteinDistance(clean, cleanCand);
      const maxLen = Math.max(clean.length, cleanCand.length);
      let score = 1 - (dist / maxLen);

      // Bonus for subsequence (e.g. rkthme in ranktheme)
      if (isSubsequence(clean, cleanCand)) {
        score += 0.25;
      }
      // Bonus if starts with same 2 characters
      if (clean.length >= 2 && cleanCand.startsWith(clean.slice(0, 2))) {
        score += 0.15;
      }

      // Threshold check based on token length:
      // If it is a subsequence (e.g. rkthme in ranktheme), allow up to 4 edits
      const isSub = isSubsequence(clean, cleanCand);
      const maxAllowedDist = isSub ? 4 : (clean.length <= 4 ? 1 : clean.length <= 7 ? 2 : 3);

      if (dist <= maxAllowedDist && score >= minScoreThreshold && score > highestScore) {
        highestScore = score;
        bestMatch = {
          command: cmd,
          matchedName: cleanCand,
          isExact: false,
          distance: dist,
          score
        };
      }
    }
  }

  return bestMatch;
}

/**
 * Detects and auto-corrects typos across a user prompt using the 254-command catalog.
 */
export function detectAndCorrectTypos(userQuery = '', allCommands = []) {
  if (!userQuery || typeof userQuery !== 'string' || !allCommands || allCommands.length === 0) {
    return { hasTypo: false, correctedQuery: userQuery, originalToken: '', correctedCommand: '', interpretedAs: '' };
  }

  // Tokenize user query while preserving words
  const words = userQuery.split(/\s+/);

  // 1. Check if the user query ALREADY contains an exact match for a top-level command or alias.
  // If an exact command is already present (e.g. "welcome", "news", "ticket", "rate", "security"),
  // the user is asking about that specific command. Other words are parameters, features, or context,
  // NOT typos of other commands.
  const META_COMMANDS = new Set(['explain', 'help', 'ask', 'athena', 'guide', 'info', 'cmd', 'command', 'shortcuts']);
  let exactCommandFound = null;
  for (const raw of words) {
    const clean = raw.toLowerCase().replace(/[^a-z0-9_-]/g, '').trim();
    if (clean.length < 3) continue;
    const match = findFuzzyCommandMatch(clean, allCommands);
    if (match && match.isExact) {
      if (!META_COMMANDS.has(match.command.name.toLowerCase())) {
        exactCommandFound = match;
        break; // Priority to specific feature command!
      } else if (!exactCommandFound) {
        exactCommandFound = match; // Fallback to meta command if no other command is found
      }
    }
  }

  // If the query explicitly references a real command, suppress typo detection across other words
  if (exactCommandFound) {
    return {
      hasTypo: false,
      correctedQuery: userQuery,
      originalToken: '',
      correctedCommand: exactCommandFound.command.name,
      interpretedAs: `!${exactCommandFound.command.name}`
    };
  }

  let detectedTypo = null;
  let correctedWords = [...words];

  for (let idx = 0; idx < words.length; idx++) {
    const rawWord = words[idx];
    const cleanWord = rawWord.toLowerCase().replace(/[^a-z0-9_-]/g, '').trim();

    // Skip short words, non-typo vocabulary/stopwords, numbers, or prefix symbols
    if (cleanWord.length < 4 || NON_TYPO_VOCABULARY.has(cleanWord) || /^\d+$/.test(cleanWord)) {
      continue;
    }

    // Check if word is already an exact match for any command/alias
    const match = findFuzzyCommandMatch(cleanWord, allCommands);
    if (match) {
      if (match.isExact) {
        // Word is already a real command, no correction needed for this word
        continue;
      } else if (!detectedTypo || match.score > detectedTypo.score) {
        // High confidence typo found!
        const topLevel = allCommands.find(c => c.name.toLowerCase() === match.matchedName.toLowerCase());
        const resolvedName = topLevel ? topLevel.name : match.command.name;
        detectedTypo = {
          originalToken: cleanWord,
          rawWord,
          wordIndex: idx,
          correctedCommand: resolvedName,
          interpretedAs: `!${resolvedName}`,
          score: match.score,
          distance: match.distance
        };
      }
    }
  }

  if (detectedTypo) {
    // Replace the typo token in the query
    correctedWords[detectedTypo.wordIndex] = detectedTypo.correctedCommand;
    const correctedQuery = correctedWords.join(' ');

    return {
      hasTypo: true,
      originalToken: detectedTypo.originalToken,
      correctedCommand: detectedTypo.correctedCommand,
      interpretedAs: detectedTypo.interpretedAs,
      correctedQuery,
      distance: detectedTypo.distance
    };
  }

  return {
    hasTypo: false,
    correctedQuery: userQuery,
    originalToken: '',
    correctedCommand: '',
    interpretedAs: ''
  };
}
