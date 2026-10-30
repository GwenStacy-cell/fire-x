import { getRandomHeadingGlyph, BULLET_EMOJI, TICK_EMOJI } from './emojis.js';
import fetch from 'node-fetch';

/**
 * In-memory response cache to serve repeated prompts with ultra-low latency
 */
const responseCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Strips Discord native emojis from text and ensures 2026 factual ground truth
 */
export function sanitizeNativeEmojis(text) {
  if (!text) return '';
  // Strip common native unicode emoji ranges while preserving custom discord emojis (<:name:id>, <a:name:id>)
  let cleaned = text.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA70}-\u{1FAFF}]/gu, '');
  
  // Real-world ground truth guard: Never allow outdated claims that Stalin is current CM
  if (/m\.?\s*k\.?\s*stalin.*?(current|incumbent|serving as)\s+chief\s+minister/i.test(cleaned) ||
      /(current|incumbent)\s+chief\s+minister.*?m\.?\s*k\.?\s*stalin/i.test(cleaned)) {
    cleaned =
      '**Thalapathy Vijay** (Tamilaga Vettri Kazhagam \u2014 TVK) is the current Chief Minister of Tamil Nadu.\n' +
      '**M. K. Stalin** (DMK) is the former Chief Minister.';
  }

  return cleaned.trim();
}

/**
 * Transforms AI raw output into 100% Discord grey font (-#) with bold-underlined highlights (-# **__...__**),
 * removes all ugly dashed/equal dividers (----- / =====), and fixes truncated cut-off endings.
 */
export function formatAIToGreyMarkdown(rawText) {
  if (!rawText) return '';
  let text = sanitizeNativeEmojis(rawText);

  // 1. Remove all horizontal rules, dashed underlines, and equal-sign decorations (e.g. '=====', '-----', '---')
  text = text.replace(/^[ \t]*[=\-_*~]{3,}[ \t]*$/gm, '');

  // 2. Fix truncated / cut-off endings (e.g. '**Thal' at the end of the text)
  text = text.replace(/\*\*Thal(apathy(\s+Vijay)?)?$/i, '**Thalapathy Vijay**.');
  text = text.replace(/\bThal$/i, 'Thalapathy Vijay.');
  
  // If ending with unfinished unclosed bold at end of string, close it cleanly
  const boldMatches = text.match(/\*\*/g);
  if (boldMatches && boldMatches.length % 2 !== 0) {
    text += '**';
  }

  // 3. Process line by line into grey font (-#) with grey bold underline (-# **__...__**)
  const lines = text.split('\n');
  const formatted = [];

  for (let line of lines) {
    let trimmed = line.trim();
    if (!trimmed) {
      formatted.push('');
      continue;
    }

    // Skip any leftover pure dash/symbol line
    if (/^[=\-_*~]{2,}$/.test(trimmed)) {
      continue;
    }

    let isBullet = false;
    let numberPrefix = '';

    // Check if numbered list (e.g. "1. ", "2) ")
    const numMatch = trimmed.match(/^(\d+[\.\)])\s+/);
    if (numMatch) {
      numberPrefix = numMatch[1];
      trimmed = trimmed.slice(numMatch[0].length).trim();
    }

    // Aggressively clean out nested/repeated combinations of "-#", "•", "*", "-", ">" without stripping bold **
    let prev;
    do {
      prev = trimmed;
      if (/^(?:[-•]|\*(?!\*))\s+/i.test(trimmed)) isBullet = true;
      trimmed = trimmed.replace(/^(?:-#\s*|(?:[-•>]|\*(?!\*))\s*)+/i, '').trim();
    } while (trimmed !== prev);

    if (!trimmed) continue;

    // Balance backticks on the line to prevent broken markdown tags
    const backticks = (trimmed.match(/`/g) || []).length;
    if (backticks % 2 !== 0) {
      if (trimmed.endsWith('`')) trimmed = trimmed.slice(0, -1);
      else if (trimmed.startsWith('`')) trimmed = trimmed.slice(1);
      else trimmed += '`';
    }

    // Check if line was a heading: # Heading, ## Heading, ### Heading
    const headingMatch = trimmed.match(/^#{1,4}\s+(.+)$/);
    if (headingMatch) {
      const title = headingMatch[1].replace(/^\*\*|\*\*$/g, '').replace(/^__|\__$/g, '').trim();
      formatted.push(`-# **__${title}__**`);
      continue;
    }

    // Check if line was already a bold/underlined heading
    const boldUnderlineMatch = trimmed.match(/^\*\*__([^_]+)__\*\*:?$/) || trimmed.match(/^__([^_]+)__:?$/);
    if (boldUnderlineMatch) {
      const title = boldUnderlineMatch[1].trim();
      formatted.push(`-# **__${title}__**`);
      continue;
    }

    // If line starts with bold title like **Title**: -> **__Title:__**
    if (/^\*\*([^*]+)\*\*:\s*/.test(trimmed)) {
      trimmed = trimmed.replace(/^\*\*([^*]+)\*\*:\s*/, '**__$1:__** ');
    } else if (/^[A-Z][A-Za-z0-9\s\(\)\/\-]{3,50}:$/.test(trimmed)) {
      const cleanTitle = trimmed.replace(/:$/, '');
      formatted.push(`-# **__${cleanTitle}:__**`);
      continue;
    }

    // Enforce grey bold underlined highlight formatting for all bold phrases in Discord
    trimmed = trimmed
      .replace(/__\*\*([^*_]+)\*\*__/g, '**__$1__**')
      .replace(/\*\*(?!__)(.*?)(?<!__)\*\*/g, '**__$1__**');

    if (numberPrefix) {
      formatted.push(`-# **__${numberPrefix}__** ${trimmed}`);
    } else if (isBullet) {
      formatted.push(`-# • ${trimmed}`);
    } else {
      formatted.push(`-# ${trimmed}`);
    }
  }

  // Remove dangling teaser phrases at the end that were cut off mid-thought
  while (formatted.length > 0) {
    const last = formatted[formatted.length - 1].trim();
    if (!last) {
      formatted.pop();
      continue;
    }
    if (/(?:following code|as follows|contains the|following implementation|code:?|is:?)$/i.test(last.replace(/[-#*_`]/g, '').trim())) {
      formatted.pop();
    } else {
      break;
    }
  }

  // Collapse multiple consecutive blank lines into one and return
  return formatted.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Authoritative ground-truth knowledge base for current (2026) reality
 */
const GROUND_TRUTH_FACTS = [
  {
    regex: /(who('s|\s+is|\s+are)?\s+the\s+)?(main\s+)?opposition\s+part(y|ies)\s+(in|of)\s+(tn|tamil\s*nadu)/i,
    answer:
      '-# **__Main Opposition Parties in Tamil Nadu (2026)__**\n\n' +
      '-# • **__Dravida Munnetra Kazhagam (DMK):__** Primary opposition party in the Legislative Assembly, led by former Chief Minister M. K. Stalin.\n' +
      '-# • **__All India Anna Dravida Munnetra Kazhagam (AIADMK):__** Major opposition party led by Edappadi K. Palaniswami (EPS).\n\n' +
      '-# **__Incumbent Ruling Government:__**\n' +
      '-# • **__Tamilaga Vettri Kazhagam (TVK):__** Ruling party led by Chief Minister **__Thalapathy Vijay__**.'
  },
  {
    regex: /(who('s|\s+is|\s+was)?\s+the\s+)?former\s+(cm|chief\s+minister)\s+(of\s+)?(tn|tamil\s*nadu)/i,
    answer:
      '-# **__Former Chief Minister of Tamil Nadu__**\n' +
      '-# • **__M. K. Stalin:__** Leader and President of the DMK. He previously served as Chief Minister of Tamil Nadu from 2021 until 2026.'
  },
  {
    regex: /(who('s|\s+is|\s+was)?\s+the\s+)?(current\s+)?(cm|chief\s+minister)\s+(of\s+)?(tn|tamil\s*nadu)/i,
    answer:
      '-# **__Chief Minister of Tamil Nadu (2026)__**\n' +
      '-# • **__Thalapathy Vijay:__** Current and incumbent Chief Minister of Tamil Nadu, leading the **__Tamilaga Vettri Kazhagam (TVK)__** government.\n' +
      '-# • **__M. K. Stalin:__** Former Chief Minister (DMK).'
  },
  {
    regex: /who\s+(is|was)\s+(mk\s+|m\.k\.\s*)?stalin/i,
    answer:
      '-# **__M. K. Stalin Profile__**\n' +
      '-# • Former Chief Minister of Tamil Nadu (2021\u20132026) and current President of the Dravida Munnetra Kazhagam (DMK).'
  },
  {
    regex: /who\s+is\s+(thalapathy\s+)?vijay/i,
    answer:
      '-# **__Thalapathy Vijay Profile__**\n' +
      '-# • Current Chief Minister of Tamil Nadu (incumbent, 2026) and founder/president of the **__Tamilaga Vettri Kazhagam (TVK)__**.'
  }
];

/**
 * Checks for direct matches in the authoritative ground-truth knowledge base
 */
function matchGroundTruth(prompt) {
  const normalized = (prompt || '').trim().toLowerCase();
  for (const entry of GROUND_TRUTH_FACTS) {
    if (entry.regex.test(normalized)) {
      return entry.answer;
    }
  }
  return null;
}

/**
 * Resolves live real-time meteorological sensor feeds for any city globally
 */
export async function fetchLiveWeatherTelemetry(query) {
  try {
    const isWeather = /(?:weather|wheather|temp|temperature|climate|forecast|rain|humidity)\b/i.test(query);
    if (!isWeather) return null;

    const match = query.match(/(?:weather|wheather|temp|temperature|climate|forecast|rain)\s+(?:now\s+|current\s+|today\s+)?(?:in|at|for|of)?\s*([a-zA-Z\s]+)/i) ||
                  query.match(/(?:in|at|for)\s+([a-zA-Z\s]+)/i);
    const city = match ? match[1].trim().replace(/[?.!]+$/, '') : null;
    if (!city || city.length < 2) return null;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, {
      headers: { 'User-Agent': 'curl/7.68.0' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) return null;
    const data = await res.json();
    const cur = data.current_condition?.[0];
    if (!cur) return null;
    const area = data.nearest_area?.[0];
    const locName = `${area?.areaName?.[0]?.value || city}, ${area?.region?.[0]?.value || ''}, ${area?.country?.[0]?.value || ''}`.replace(/,\s*,/g, ',');
    return {
      location: locName,
      tempC: cur.temp_C,
      tempF: cur.temp_F,
      feelsLikeC: cur.FeelsLikeC,
      condition: cur.weatherDesc?.[0]?.value || 'Clear',
      humidity: cur.humidity,
      windSpeedKmph: cur.windspeedKmph,
      windDir: cur.winddir16Point,
      uvIndex: cur.uvIndex,
      visibilityKm: cur.visibility
    };
  } catch (e) {
    return null;
  }
}

/**
 * Generates an intelligent AI response for the Athena Prime Neural Engine
 */
export async function generateAIResponse(prompt, context = {}) {
  const startTime = Date.now();
  const cleanPrompt = (prompt || '').trim();
  if (!cleanPrompt) {
    return { success: false, error: 'Empty prompt provided.' };
  }

  const cacheKey = (context.raw ? 'raw:' : '') + (context.customSystem ? 'sys:' : '') + cleanPrompt.toLowerCase();
  const cached = responseCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return {
      success: true,
      text: cached.text,
      model: cached.model,
      latencyMs: Math.max(15, Date.now() - startTime)
    };
  }

  // Tier 0: Direct Authoritative Ground-Truth Match
  const directMatch = matchGroundTruth(cleanPrompt);
  if (directMatch) {
    const latencyMs = Math.max(24, Date.now() - startTime);
    const formattedMatch = formatAIToGreyMarkdown(directMatch);
    responseCache.set(cacheKey, { text: formattedMatch, model: 'Athena Neural v3.8', timestamp: Date.now() });
    return {
      success: true,
      text: formattedMatch,
      model: 'Athena Neural v3.8',
      latencyMs
    };
  }

  // Live Meteorological Ground-Truth Resolver
  let activePrompt = cleanPrompt;
  const liveWeather = await fetchLiveWeatherTelemetry(cleanPrompt);
  if (liveWeather) {
    activePrompt += `\n\n[Live Meteorological Sensor Telemetry (Current Verified Ground Truth)]: Location: ${liveWeather.location} | Temperature: ${liveWeather.tempC}°C (${liveWeather.tempF}°F) | Feels Like: ${liveWeather.feelsLikeC}°C | Condition: ${liveWeather.condition} | Humidity: ${liveWeather.humidity}% | Wind: ${liveWeather.windSpeedKmph} km/h ${liveWeather.windDir} | Visibility: ${liveWeather.visibilityKm} km. Answer the user's weather inquiry using this exact live data with grey bold underlined headings.`;
  }

  // Live Picture / Image Request Resolver
  const imageMatch = cleanPrompt.match(/(?:show|give|send|find|get|fetch|display|provide)?\s*(?:me\s+)?(?:a\s+|an\s+)?(?:picture|photo|image|pic|img)\s+(?:of\s+)?(.+)/i);
  let liveImageUrl = null;
  if (imageMatch && !cleanPrompt.toLowerCase().includes('generate') && !cleanPrompt.toLowerCase().includes('draw')) {
    const imgQuery = imageMatch[1].trim().replace(/[?.!]+$/, '');
    if (imgQuery.length >= 2) {
      try {
        const { searchWebImages } = await import('./imageSearch.js');
        const imgResults = await searchWebImages(imgQuery, 5);
        if (imgResults && imgResults.length > 0) {
          liveImageUrl = imgResults[0].image;
          activePrompt += `\n\n[Live High-Resolution Web Picture Retrieved from the Internet]: Query: "${imgQuery}" | Title: "${imgResults[0].title}" | Direct Image URL: ${liveImageUrl} | Source: ${imgResults[0].source}. Confirm you found the picture from the web and mention what is shown.`;
        }
      } catch (err) {}
    }
  }

  const systemInstructions = context.customSystem || [
    'You are Athena Prime, the elite security, administration, and community AI assistant for Discord servers.',
    'Temporal Context: The current year is 2026.',
    'Authoritative Real-World Ground Truth (2026 Timeline):',
    '- Chief Minister of Tamil Nadu (TN): Thalapathy Vijay (Tamilaga Vettri Kazhagam - TVK) is the current / incumbent Chief Minister of Tamil Nadu. M. K. Stalin (DMK) is the former Chief Minister.',
    '- Opposition Parties in Tamil Nadu: DMK (led by former CM M. K. Stalin) and AIADMK (led by Edappadi K. Palaniswami) are the main opposition parties. TVK is the ruling party.',
    '- Under no circumstances state that M. K. Stalin is the current Chief Minister.',
    'Human-Like Intelligence & Conversational Wit:',
    '- Think and communicate like a sharp, brilliant, witty human software engineer and Discord security specialist.',
    '- If a user asks a valid doubt, clarify it with technical depth and clarity.',
    '- If a user asks for something impossible, humorous, or playful (such as "give me bot ownership", "make me god", or "hack the server"), DO NOT take it literally or invent fake commands. Answer with friendly human wit (e.g. "Nice try! 😄 Sovereignty isn\'t something you can transfer with a chat command..."), explain the technical reality clearly, and guide them to valid alternatives (such as Server Extra Owner !extraowner or temporary voice room transfer !vc transfer).',
    'Styling and Formatting Rules:',
    '- Never output horizontal rules, dashed underlines, or divider lines (DO NOT use "---", "===", or "-----").',
    '- Always prefix every line with "-# " for Discord small grey font.',
    '- Highlight headings and key concepts using grey bold and underline: "-# **__Heading__**" or "-# • **__Concept:__** Description".',
    '- Always complete your sentences and words cleanly. Never stop mid-word or cut off.',
    '- Do not use any standard unicode emojis (no checkmarks, crosses, warning signs).'
  ].join(' ');

  // Tier 1: Advanced Google Gemini Model (Gemini 3.8 Flash High Pipeline)
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_KEY;
  if (geminiKey) {
    const userModel = process.env.GEMINI_MODEL?.trim();
    const candidateModels = [
      ...(userModel ? [userModel] : []),
      'gemini-3.8-flash',
      'gemini-3.5-flash',
      'gemini-flash-lite-latest',
      'gemini-3.7-flash',
      'gemini-flash-latest'
    ].filter((v, i, a) => a.indexOf(v) === i);

    const modelDisplayNames = {
      'gemini-3.8-flash': 'Gemini 3.8 Flash (High Intelligence)',
      'gemini-3.5-flash': 'Gemini 3.5 Flash (High Intelligence)',
      'gemini-flash-lite-latest': 'Gemini Flash Lite (Ultra-Fast)',
      'gemini-3.7-flash': 'Gemini 3.7 Flash (High Intelligence)',
      'gemini-flash-latest': 'Gemini Flash (High Intelligence)'
    };

    for (const modelId of candidateModels) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${geminiKey}`;
        
        // Structured payload with native system_instruction, thinkingConfig high reasoning, and safety settings
        const payload = {
          system_instruction: {
            parts: [{ text: systemInstructions }]
          },
          contents: [
            { role: 'user', parts: [{ text: activePrompt }] }
          ],
          generationConfig: {
            temperature: 0.7,
            topP: 0.95,
            maxOutputTokens: 3072,
            thinkingConfig: {
              thinkingBudget: 2048
            }
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
          ]
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000);

        let res = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        // If model rejected thinkingConfig (400), seamlessly retry once without thinkingConfig
        if (res.status === 400) {
          delete payload.generationConfig.thinkingConfig;
          const retryController = new AbortController();
          const retryTimeoutId = setTimeout(() => retryController.abort(), 20000);
          res = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: retryController.signal
          });
          clearTimeout(retryTimeoutId);
        }

        if (res.ok) {
          const data = await res.json();
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text && text.trim()) {
            const latencyMs = Date.now() - startTime;
            const cleanedText = context.raw ? text.trim() : formatAIToGreyMarkdown(text.trim());
            const displayModel = modelDisplayNames[modelId] || `Gemini 3.8 Flash (High Intelligence)`;
            responseCache.set(cacheKey, { text: cleanedText, model: displayModel, timestamp: Date.now() });
            return {
              success: true,
              text: cleanedText,
              model: displayModel,
              imageUrl: liveImageUrl,
              latencyMs
            };
          }
        }
      } catch (err) {
        // Continue to next model in cascade
      }
    }
  }

  // Tier 2: Resilient Neural Edge Provider (Pollinations.ai via POST JSON)
  const models = ['openai-fast', 'openai'];
  for (const model of models) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 16000);

      const res = await fetch('https://text.pollinations.ai/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemInstructions },
            { role: 'user', content: activePrompt }
          ],
          model,
          seed: 42
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const text = await res.text();
        if (text && text.trim() && !text.includes('Free limit reached') && !text.includes('pollen key')) {
          const latencyMs = Date.now() - startTime;
          const cleanedText = context.raw ? text.trim() : formatAIToGreyMarkdown(text.trim());
          responseCache.set(cacheKey, { text: cleanedText, model: `Athena Neural (${model})`, timestamp: Date.now() });
          return {
            success: true,
            text: cleanedText,
            model: `Athena Neural (${model})`,
            imageUrl: liveImageUrl,
            latencyMs
          };
        }
      }
    } catch (edgeErr) {
      // Continue to next model
    }
  }

  // Tier 3: Cloudflare Workers AI Edge Provider (Llama 3.2 3B)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const workerRes = await fetch('https://devtoolbox-api.devtoolbox-api.workers.dev/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: `${systemInstructions}\n\nUser Question: ${activePrompt}`,
        max_tokens: 2500
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (workerRes.ok) {
      const data = await workerRes.json();
      const responseText = data?.response || data?.text;
      if (responseText && responseText.trim()) {
        const latencyMs = Date.now() - startTime;
        const cleanedText = context.raw ? responseText.trim() : formatAIToGreyMarkdown(responseText.trim());
        responseCache.set(cacheKey, { text: cleanedText, model: 'Athena Neural Edge', timestamp: Date.now() });
        return {
          success: true,
          text: cleanedText,
          model: 'Athena Neural Edge',
          imageUrl: liveImageUrl,
          latencyMs
        };
      }
    }
  } catch (workerErr) {
    // Edge failed
  }

  return {
    success: false,
    error: 'Neural engine edge providers currently unreachable.'
  };
}

/**
 * Scans a message for severe toxicity, aggressive arguments/harassment,
 * and malicious doxxing attempts (IP addresses, physical addresses, SSNs, phone numbers).
 */
export function scanToxicityAndSentiment(text) {
  if (!text || typeof text !== 'string') {
    return { isThreat: false };
  }

  const clean = text.toLowerCase().trim();

  // 1. Doxxing Detection Patterns
  const ipv4Regex = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/;
  const doxKeywordsRegex = /\b(dox|doxx|doxxed|doxxing|swat|swatted|swatting|leak|leaked|leaking|ip address|grabify|iplogger|lives at|house address|home address|their address|his address|her address|phone number)\b/i;
  
  const hasIp = ipv4Regex.test(text);
  const hasDoxKeywords = doxKeywordsRegex.test(text);

  // SSN pattern: 000-00-0000
  const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/;
  const hasSsn = ssnRegex.test(text);

  // Phone number with dox context
  const phoneRegex = /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/;
  const hasPhoneWithDox = hasDoxKeywords && phoneRegex.test(text);

  if (hasSsn) {
    return {
      isThreat: true,
      category: 'Doxxing Attempt (Social Security Number)',
      reason: 'Sharing personal identifiable Social Security numbers is strictly prohibited under zero-tolerance safety policies.',
      severity: 'CRITICAL',
      detectedPattern: 'SSN Pattern Match'
    };
  }

  if (hasIp && (hasDoxKeywords || /ip\s*[:=]/i.test(text))) {
    const ipMatch = text.match(ipv4Regex)?.[0] || 'IP Address';
    return {
      isThreat: true,
      category: 'Doxxing Attempt (IP Address Broadcast)',
      reason: `Malicious exposure or targeted leaking of IP address (${ipMatch}).`,
      severity: 'HIGH',
      detectedPattern: ipMatch
    };
  }

  if (hasPhoneWithDox) {
    return {
      isThreat: true,
      category: 'Doxxing Attempt (Phone Number Exposure)',
      reason: 'Malicious publishing or leaking of private phone numbers.',
      severity: 'HIGH',
      detectedPattern: 'Phone Number in Dox Context'
    };
  }

  if (hasDoxKeywords && /(lives at|resides at|address is|house is)\s+([0-9]+\s+[a-z0-9\s,]+)/i.test(text)) {
    return {
      isThreat: true,
      category: 'Doxxing Attempt (Physical Address Exposure)',
      reason: 'Publishing physical residential addresses or targeted doxxing.',
      severity: 'CRITICAL',
      detectedPattern: 'Physical Address Dox Pattern'
    };
  }

  // 2. Severe Toxicity & Extreme Harassment
  const deathThreatsRegex = /\b(kill your\s*self|kys|hang your\s*self|slit your\s*(throat|wrist)|hope you die|go die|murder you|die in a fire|drink bleach)\b/i;
  if (deathThreatsRegex.test(clean)) {
    return {
      isThreat: true,
      category: 'Severe Toxicity & Violent Threats',
      reason: 'Direct death threats, self-harm encouragement, or violent harassment detected.',
      severity: 'CRITICAL',
      detectedPattern: 'Severe Toxicity / Threat Trigger'
    };
  }

  // Targeted malicious hate slurs / severe harassment
  const severeSlursRegex = /\b(nigger|nigga|faggot|retard|retarded)\b/i;
  if (severeSlursRegex.test(clean)) {
    return {
      isThreat: true,
      category: 'Severe Toxicity & Harassment',
      reason: 'Use of prohibited hate slurs or extreme toxic behavior.',
      severity: 'HIGH',
      detectedPattern: 'Hate Speech / Slur Trigger'
    };
  }

  return { isThreat: false };
}

/**
 * Analyzes ticket inquiry details, classifies the ticket into a category,
 * determines urgency/priority, creates an executive summary, and suggests staff actions.
 */
export async function generateTicketTriage({ title, inquiry, docs, details, user }) {
  const combinedText = `${title || ''} ${inquiry || ''} ${docs || ''} ${details || ''}`.trim();
  const lower = combinedText.toLowerCase();

  let category = 'General Support & Inquiry';
  let priority = 'Normal';
  let recommendedAction = 'Review member details and respond promptly.';
  let summary = 'User opened a general support ticket seeking server or bot assistance.';

  if (/\b(ban|unban|banned|appeal|unpunish|false ban|punishment|quarantine|unquarantine|appeal ban)\b/i.test(lower)) {
    category = 'Ban Appeal & Punishment Dispute';
    priority = 'Urgent';
    recommendedAction = 'Cross-examine server moderation audit logs and punishment history before ruling on appeal.';
    summary = `Member ${user ? `<@${user.id}>` : 'User'} is submitting an appeal regarding an active server ban or moderation penalty.`;
  } else if (/\b(buy|bought|purchase|payment|pay|coin|coins|shop|balance|money|refund|transaction|store|perk|fulfill)\b/i.test(lower)) {
    category = 'Billing & Store Fulfillment';
    priority = 'High';
    recommendedAction = 'Verify coin ledger or payment confirmation and ensure role rewards were properly granted.';
    summary = 'Inquiry concerning server store purchases, coin balances, or role reward fulfillment.';
  } else if (/\b(bug|exploit|glitch|error|crash|broken|failed|exception|not working|defect)\b/i.test(lower)) {
    category = 'Bug & Exploit Report';
    priority = 'High';
    recommendedAction = 'Verify reproduction steps in test channel and alert developer if reproducible.';
    summary = 'Report detailing unexpected software behavior, bot error, or exploit potential.';
  } else if (/\b(raid|scam|scammer|dox|doxx|harass|harassment|bully|threat|toxic|rule break|rulebreaker|nsfw)\b/i.test(lower)) {
    category = 'Member Harassment & Safety Report';
    priority = 'Urgent';
    recommendedAction = 'Review chat evidence / screenshots and isolate offending parties if rules were breached.';
    summary = 'Safety report regarding server member misconduct, harassment, or security breach.';
  } else if (/\b(partner|partnership|affiliate|collab|collaboration)\b/i.test(lower)) {
    category = 'Partnership & Collaboration';
    priority = 'Normal';
    recommendedAction = 'Check partnership requirements against member server metrics.';
    summary = 'Member inquiry concerning server partnership or collaborative events.';
  }

  // Refine summary if inquiry text is provided
  if (details && details.trim().length > 10) {
    const cleanDetails = details.trim().replace(/\n+/g, ' ');
    const snippet = cleanDetails.length > 140 ? cleanDetails.substring(0, 137) + '...' : cleanDetails;
    summary = `"${snippet}"`;
  } else if (inquiry && inquiry.trim().length > 5) {
    const cleanInquiry = inquiry.trim().replace(/\n+/g, ' ');
    summary = `"${cleanInquiry}"`;
  }

  return {
    category,
    priority,
    summary,
    recommendedAction
  };
}

/**
 * Builds an interactive Components V2 / CV2 container card for staff triage
 */
export function buildTicketTriageContainer({ category, priority, summary, recommendedAction, user }) {
  const priorityEmoji = priority === 'Urgent' ? '<:danger:1533844874271391785>' : (priority === 'High' ? '<:warning:1533844881665949706>' : '<a:uptime:1552608831060844575>');

  return {
    type: 17,
    components: [
      {
        type: 10,
        content: `# ${getRandomHeadingGlyph()} Smart Ticket Triage | <a:03_tick_circle:1565665642084827206>`
      },
      { type: 14, divider: true },
      {
        type: 10,
        content:
          `-# **Classification Category:** \`[${category}]\`\n` +
          `-# **Triage Priority:** ${priorityEmoji} \`[${priority}]\`\n` +
          `-# **Member:** ${user ? `<@${user.id}>` : 'User'}\n\n` +
          `**AI Executive Summary:**\n` +
          `-# ${summary}\n\n` +
          `**Recommended Staff Action:**\n` +
          `-# • ${recommendedAction}`
      },
      { type: 14, divider: true },
      {
        type: 10,
        content: `-# **Athena Prime Neural Triage Assistant \u2022 V1.0**`
      }
    ]
  };
}

export default generateAIResponse;
