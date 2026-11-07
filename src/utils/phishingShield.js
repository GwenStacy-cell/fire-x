/**
 * Automated Real-Time Anti-Phishing & Anti-Scam Shield
 * Inspects messages for domain spoofs, fake Nitro gifts, token stealers, and known phishing patterns.
 */

const PHISHING_DOMAINS_REGEX = /(discrod|dlscord|disord|discorde|discord-app|discord-nitro|nitro-discord|discordgift|discord-gifts|free-nitro|steam-nitro|claim-nitro|boost-nitro|discord-drop|discord-airdrop|discorcl|disc0rd|discrocl|steamcomminuty|steamcommuinity|steamcommunity-trade|steampowered-gift|steam-gift|roblox-promo|nitro-drop|discordapp\.click|discord-giveaway)\.[a-z]{2,}/i;

const FAKE_GIFT_PHRASES = /(free\s*nitro|claim\s*your\s*nitro|airdrop\s*nitro|steam\s*giftcard|claim\s*nitro|discord\s*nitro\s*free|free\s*discord\s*gift)/i;
const GENERIC_URL_REGEX = /https?:\/\/[^\s<]+/i;

/**
 * Checks content against deceptive phishing patterns and scam domain variants
 */
export function scanForPhishing(content) {
  if (!content || typeof content !== 'string') {
    return { isPhishing: false };
  }

  // Fast pre-flight check: Phishing domains and fake nitro URLs always contain a period or http
  if (!content.includes('.') && !content.includes('http')) {
    return { isPhishing: false };
  }

  // 1. Direct regex match against domain spoofs
  if (PHISHING_DOMAINS_REGEX.test(content)) {
    const match = content.match(PHISHING_DOMAINS_REGEX);
    return {
      isPhishing: true,
      reason: 'Deceptive Phishing Domain Impersonation',
      matchedDomain: match ? match[0] : 'Unknown Spoof'
    };
  }

  // 2. Scam phrasing paired with non-Discord URLs
  if (FAKE_GIFT_PHRASES.test(content) && GENERIC_URL_REGEX.test(content)) {
    const foundUrl = content.match(GENERIC_URL_REGEX)[0];
    const isOfficialDiscord = /https?:\/\/(canary\.|ptb\.)?(discord\.com|discord\.gg|discord\.gift)\//i.test(foundUrl);
    
    if (!isOfficialDiscord) {
      return {
        isPhishing: true,
        reason: 'Unverified External Fake Nitro / Gift Payload',
        matchedDomain: foundUrl
      };
    }
  }

  return { isPhishing: false };
}

export default scanForPhishing;
