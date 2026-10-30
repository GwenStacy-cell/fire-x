import fetch from 'node-fetch';
import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

export const DEFAULT_ELEVENLABS_KEY = 'sk_845276d5fc9bc469f741269cf184beb48a9d44e03c104e04';

export const CELEBRITY_VOICES = {
  // --- WORLD LEADERS ---
  trump: {
    id: 'trump',
    aliases: ['donaldtrump', 'donald', 'potus45'],
    name: 'Donald Trump',
    category: 'World Leaders',
    elevenLabsVoiceId: 'pNInz6obpgDQGcFmaJgB', // Adam - Deep American Orator
    neuralVoice: 'en-US-RogerNeural',
    pitch: '-4Hz',
    rate: '-5%',
    baseLang: 'en-US',
    description: '45th U.S. President confident, low-mid resonant speech delivery',
    filter: 'equalizer=f=180:t=q:w=1.2:g=7,equalizer=f=1100:t=q:w=1.4:g=6,equalizer=f=2300:t=q:w=1.5:g=3.5,acompressor=threshold=-11dB:ratio=4.5:attack=12:release=75,atempo=0.96'
  },
  modi: {
    id: 'modi',
    aliases: ['narendramodi', 'pmmodi', 'namo'],
    name: 'Narendra Modi',
    category: 'World Leaders',
    elevenLabsVoiceId: 'VR6AewLTigWG4xSOukaG', // Arnold - Authoritative Orator
    neuralVoice: 'en-IN-PrabhatNeural',
    pitch: '-2Hz',
    rate: '-8%',
    baseLang: 'en-IN',
    description: 'Prime Minister authoritative orator voice with deep resonant cadence',
    filter: 'equalizer=f=145:t=q:w=1.8:g=8,equalizer=f=1900:t=q:w=1.2:g=4,acompressor=threshold=-13dB:ratio=3.8:attack=20:release=100,atempo=0.91'
  },
  obama: {
    id: 'obama',
    aliases: ['barackobama', 'barack', 'potus44'],
    name: 'Barack Obama',
    category: 'World Leaders',
    elevenLabsVoiceId: 'onwK4e9ZLuTAKqWW03F9', // Daniel - Deep Broadcaster
    neuralVoice: 'en-US-ChristopherNeural',
    pitch: '-6Hz',
    rate: '-10%',
    baseLang: 'en-US',
    description: '44th U.S. President measured, resonant speech cadence',
    filter: 'equalizer=f=195:t=q:w=1.5:g=6,equalizer=f=3100:t=q:w=1.2:g=3.5,acompressor=threshold=-12dB:ratio=3.2:attack=18:release=90,atempo=0.92'
  },

  // --- POP ICONS & SINGERS ---
  mj: {
    id: 'mj',
    aliases: ['michaeljackson', 'jackson', 'kingofpop'],
    name: 'Michael Jackson',
    category: 'Pop Icons',
    elevenLabsVoiceId: 'TX3LPaxmHKxFdv7VOQHJ', // Liam - Agile Pop Tenor
    neuralVoice: 'en-US-SteffanNeural',
    pitch: '+12Hz',
    rate: '+4%',
    baseLang: 'en-US',
    description: 'King of Pop energetic tenor voice with signature vocal vibrato',
    filter: 'asetrate=24000*1.12,atempo=0.89,highpass=f=220,equalizer=f=3800:t=q:w=1:g=8.5,equalizer=f=7500:t=q:w=1.2:g=5,vibrato=f=6.2:d=0.35'
  },
  taylor: {
    id: 'taylor',
    aliases: ['taylorswift', 'swift'],
    name: 'Taylor Swift',
    category: 'Pop Icons',
    elevenLabsVoiceId: 'XrExE9yKIg1WjnnlVkGX', // Matilda - Warm Melodic Pop Female
    neuralVoice: 'en-US-EmmaNeural',
    pitch: '+4Hz',
    rate: '-2%',
    baseLang: 'en-US',
    description: 'Pop superstar warm acoustic vocal with airy melodic brightness',
    filter: 'equalizer=f=4500:t=q:w=1.2:g=6,equalizer=f=9000:t=q:w=1.5:g=4,acompressor=threshold=-14dB:ratio=2.8:attack=15:release=100,aecho=0.8:0.85:20:0.15'
  },
  ariana: {
    id: 'ariana',
    aliases: ['arianagrande', 'grande'],
    name: 'Ariana Grande',
    category: 'Pop Icons',
    elevenLabsVoiceId: 'XrExE9yKIg1WjnnlVkGX', // Matilda - Soprano
    neuralVoice: 'en-US-AnaNeural',
    pitch: '+14Hz',
    rate: '0%',
    baseLang: 'en-US',
    description: 'Whistle-register pop soprano voice with airy treble shimmer',
    filter: 'equalizer=f=8000:t=q:w=1.5:g=5,aecho=0.8:0.9:30:0.22'
  },
  sabrina: {
    id: 'sabrina',
    aliases: ['sabrinacarpenter', 'carpenter'],
    name: 'Sabrina Carpenter',
    category: 'Pop Icons',
    elevenLabsVoiceId: 'EXAVITQu4vr4xnSDxMaL', // Sarah - Intimate Pop Female
    neuralVoice: 'en-US-JennyNeural',
    pitch: '+6Hz',
    rate: '+2%',
    baseLang: 'en-US',
    description: 'Modern smooth acoustic pop vocal with crisp intimate tone',
    filter: 'equalizer=f=3800:t=q:w=1:g=4.5,acompressor=threshold=-14dB:ratio=2.5'
  },
  bieber: {
    id: 'bieber',
    aliases: ['justinbieber', 'justin'],
    name: 'Justin Bieber',
    category: 'Pop Icons',
    elevenLabsVoiceId: 'TX3LPaxmHKxFdv7VOQHJ', // Liam - Pop Tenor
    neuralVoice: 'en-CA-LiamNeural',
    pitch: '+6Hz',
    rate: '+3%',
    baseLang: 'en-CA',
    description: 'Chart-topping pop tenor voice with smooth vocal compression',
    filter: 'equalizer=f=3000:t=q:w=1.2:g=4,acompressor=threshold=-15dB:ratio=3'
  },
  eminem: {
    id: 'eminem',
    aliases: ['slimshady', 'shady', 'marshall'],
    name: 'Eminem',
    category: 'Pop Icons',
    elevenLabsVoiceId: 'ErXwobaYiN019PkySvjV', // Antoni - Articulate Rapid Male
    neuralVoice: 'en-US-BrianNeural',
    pitch: '+4Hz',
    rate: '+18%',
    baseLang: 'en-US',
    description: 'Rapid, punchy rhythmic rap delivery with crisp articulation',
    filter: 'equalizer=f=2200:t=q:w=1:g=5,acompressor=threshold=-12dB:ratio=4:attack=10:release=80'
  },
  drake: {
    id: 'drake',
    aliases: ['champagnepapi', 'drizzy'],
    name: 'Drake',
    category: 'Pop Icons',
    elevenLabsVoiceId: 'IKne3meq5aSn9XLyUdCD', // Charlie - Relaxed Cadence
    neuralVoice: 'en-US-AndrewNeural',
    pitch: '-4Hz',
    rate: '-5%',
    baseLang: 'en-US',
    description: 'Smooth, relaxed Canadian/US hip-hop flow with warm vocal tone',
    filter: 'equalizer=f=180:t=q:w=1.5:g=4,equalizer=f=2400:t=q:w=1:g=3'
  },
  snoop: {
    id: 'snoop',
    aliases: ['snoopdogg', 'snoopdog', 'dogg'],
    name: 'Snoop Dogg',
    category: 'Pop Icons',
    elevenLabsVoiceId: 'JBFqnCBsd6RMkjVDRZzb', // George - Laid-Back Drawl
    neuralVoice: 'en-US-GuyNeural',
    pitch: '-6Hz',
    rate: '-14%',
    baseLang: 'en-US',
    description: 'Relaxed West Coast drawl with smooth laid-back cadence',
    filter: 'equalizer=f=150:t=q:w=2:g=4,lowpass=f=7500'
  },
  billie: {
    id: 'billie',
    aliases: ['billieeilish', 'eilish'],
    name: 'Billie Eilish',
    category: 'Pop Icons',
    elevenLabsVoiceId: 'EXAVITQu4vr4xnSDxMaL', // Sarah - Intimate Breathy Female
    neuralVoice: 'en-US-AriaNeural',
    pitch: '-2Hz',
    rate: '-8%',
    baseLang: 'en-US',
    description: 'Intimate breathy vocal with soft acoustic closeness',
    filter: 'equalizer=f=5000:t=q:w=1.5:g=4,acompressor=threshold=-20dB:ratio=4'
  },

  // --- VISIONARIES & LEGENDS ---
  freeman: {
    id: 'freeman',
    aliases: ['morganfreeman', 'morgan'],
    name: 'Morgan Freeman',
    category: 'Visionaries',
    elevenLabsVoiceId: 'onwK4e9ZLuTAKqWW03F9', // Daniel - Legendary Baritone
    neuralVoice: 'en-US-GuyNeural',
    pitch: '-12Hz',
    rate: '-14%',
    baseLang: 'en-US',
    description: 'Cinematic deep baritone voice with rich legendary gravitas',
    filter: 'equalizer=f=100:t=q:w=1.5:g=7,equalizer=f=220:t=q:w=1.5:g=4,acompressor=threshold=-16dB:ratio=3.5'
  },
  musk: {
    id: 'musk',
    aliases: ['elonmusk', 'elon'],
    name: 'Elon Musk',
    category: 'Visionaries',
    elevenLabsVoiceId: 'ErXwobaYiN019PkySvjV', // Antoni - Analytical Delivery
    neuralVoice: 'en-US-EricNeural',
    pitch: '-2Hz',
    rate: '+6%',
    baseLang: 'en-US',
    description: 'Tech innovator rapid analytical speech delivery',
    filter: 'equalizer=f=1800:t=q:w=1:g=3'
  },

  // --- ICONIC CHARACTERS ---
  vader: {
    id: 'vader',
    aliases: ['darthvader', 'darth'],
    name: 'Darth Vader',
    category: 'Iconic Characters',
    elevenLabsVoiceId: 'N2lVS1w4EtoT3dr4eOWO', // Callum - Deep Gritty Character
    neuralVoice: 'en-US-GuyNeural',
    pitch: '-20Hz',
    rate: '-18%',
    baseLang: 'en-GB',
    description: 'Galactic Empire dark lord mechanical deep resonance',
    filter: 'equalizer=f=90:t=q:w=2:g=8,flanger=delay=5:depth=2:regen=50:width=80:speed=0.5'
  },
  demon: {
    id: 'demon',
    aliases: ['monster', 'devil'],
    name: 'Demon / Monster',
    category: 'Iconic Characters',
    elevenLabsVoiceId: 'N2lVS1w4EtoT3dr4eOWO',
    neuralVoice: 'en-US-RogerNeural',
    pitch: '-25Hz',
    rate: '-20%',
    baseLang: 'en-US',
    description: 'Deep underworld terrifying monster roar with distortion',
    filter: 'asetrate=24000*0.65,atempo=1.54,volume=1.8'
  },
  robot: {
    id: 'robot',
    aliases: ['cyber', 'cyborg', 'mech'],
    name: 'Robot / Cyber',
    category: 'Iconic Characters',
    elevenLabsVoiceId: 'IKne3meq5aSn9XLyUdCD',
    neuralVoice: 'en-US-GuyNeural',
    pitch: '0Hz',
    rate: '0%',
    baseLang: 'en-US',
    description: 'Futuristic synthetic cybernetic vocoder',
    filter: 'tremolo=f=30:d=0.85,flanger'
  },
  ghost: {
    id: 'ghost',
    aliases: ['spirit', 'spooky'],
    name: 'Ghost / Spectral',
    category: 'Iconic Characters',
    elevenLabsVoiceId: 'EXAVITQu4vr4xnSDxMaL',
    neuralVoice: 'en-US-AriaNeural',
    pitch: '+10Hz',
    rate: '-10%',
    baseLang: 'en-US',
    description: 'Eerie supernatural spectral echo and reverberation',
    filter: 'vibrato=f=4.5:d=0.6,aecho=0.8:0.9:60:0.45'
  },
  chipmunk: {
    id: 'chipmunk',
    aliases: ['alvin', 'squeaky'],
    name: 'Chipmunk',
    category: 'Iconic Characters',
    elevenLabsVoiceId: 'XrExE9yKIg1WjnnlVkGX',
    neuralVoice: 'en-US-JennyNeural',
    pitch: '+30Hz',
    rate: '+25%',
    baseLang: 'en-US',
    description: 'High-speed squeaky animated cartoon voice',
    filter: 'asetrate=24000*1.55,atempo=0.65'
  },
  tactical: {
    id: 'tactical',
    aliases: ['athena', 'command', 'military', 'warroom', 'briefing', 'cute', 'operator'],
    name: 'Athena Prime Tactical AI (Cute Operator)',
    category: 'Defense Matrix',
    elevenLabsVoiceId: 'EXAVITQu4vr4xnSDxMaL',
    neuralVoice: 'en-US-AnaNeural',
    pitch: '+10Hz',
    rate: '+5%',
    baseLang: 'en-US',
    description: 'Cute, energetic high-tech anime tactical AI operator voice with clean communication filter',
    filter: 'equalizer=f=3200:t=q:w=1.2:g=4,equalizer=f=8000:t=q:w=1.5:g=3,acompressor=threshold=-12dB:ratio=3:attack=10:release=70'
  }
};

/**
 * Resolves user voice input to a canonical voice object.
 */
export function resolveVoice(input) {
  if (!input || typeof input !== 'string') return null;
  const clean = input.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!clean) return null;

  for (const [key, v] of Object.entries(CELEBRITY_VOICES)) {
    if (key === clean || v.id === clean || v.aliases.includes(clean)) {
      return v;
    }
  }
  return null;
}

/**
 * Applies audio DSP filters to raw audio buffer using ffmpeg.
 */
async function applyAudioFilter(inputBuffer, filterString) {
  if (!filterString) return inputBuffer;
  const tmpId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tmpIn = path.join(os.tmpdir(), `tts_filter_in_${tmpId}.mp3`);
  const tmpOut = path.join(os.tmpdir(), `tts_filter_out_${tmpId}.mp3`);

  try {
    await fs.promises.writeFile(tmpIn, inputBuffer);
    await new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath, ['-y', '-i', tmpIn, '-af', filterString, tmpOut]);
      const timer = setTimeout(() => {
        try { proc.kill(); } catch {}
        reject(new Error('Audio filter timeout'));
      }, 6000);

      proc.on('close', code => {
        clearTimeout(timer);
        code === 0 ? resolve() : reject(new Error('Filter exited ' + code));
      });
      proc.on('error', err => {
        clearTimeout(timer);
        reject(err);
      });
    });

    if (fs.existsSync(tmpOut)) {
      return await fs.promises.readFile(tmpOut);
    }
    return inputBuffer;
  } catch (err) {
    console.error('[ttsVoiceEngine] Audio filter error:', err.message);
    return inputBuffer;
  } finally {
    try { await fs.promises.unlink(tmpIn); } catch {}
    try { await fs.promises.unlink(tmpOut); } catch {}
  }
}

/**
 * Synthesizes voice audio using ElevenLabs Flash v2.5 API.
 */
async function generateElevenLabsAudio(text, voice) {
  const apiKey = process.env.ELEVENLABS_API_KEY || process.env.AI_VOICE_API_KEY || DEFAULT_ELEVENLABS_KEY;
  if (!apiKey) return null;

  const targetVoiceId = voice?.elevenLabsVoiceId || 'ErXwobaYiN019PkySvjV';

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${targetVoiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text: text.slice(0, 500).trim(),
      model_id: 'eleven_flash_v2_5',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.85
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`ElevenLabs API ${response.status}: ${errText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

/**
 * Synthesizes audio using Microsoft Edge Neural Speech engine with isolated per-request clients.
 */
async function generateMsEdgeAudio(text, voice, customLang = 'en') {
  const tts = new MsEdgeTTS();
  const neuralVoice = voice?.neuralVoice || (customLang === 'en-IN' ? 'en-IN-PrabhatNeural' : 'en-US-JennyNeural');
  await tts.setMetadata(neuralVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const prosodyOptions = {
    pitch: voice?.pitch || '+0Hz',
    rate: voice?.rate || '+0%'
  };

  const { audioStream } = tts.toStream(text, prosodyOptions);
  const chunks = [];

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('MsEdgeTTS audio stream timeout'));
    }, 6000);

    audioStream.on('data', chunk => chunks.push(chunk));
    audioStream.on('end', () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks));
    });
    audioStream.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Secondary fallback using Google Translate TTS.
 */
async function generateGoogleTtsAudio(text, lang = 'en') {
  const cleanText = text.slice(0, 200).trim();
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleanText)}&tl=${encodeURIComponent(lang)}&client=tw-ob`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  if (!response.ok) {
    throw new Error(`Google TTS returned status ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

/**
 * Generates speech audio buffer for specified text and voice profile.
 * Automatically utilizes ElevenLabs Flash v2.5 AI Voice Cloning with fallback to Neural Speech.
 */
export async function generateVoiceAudio(text, voiceOrCode, customLang = 'en') {
  const voice = typeof voiceOrCode === 'object' ? voiceOrCode : resolveVoice(voiceOrCode);
  const cleanText = text.slice(0, 500).trim();
  let rawBuffer = null;

  // 1. Primary: ElevenLabs Flash v2.5 AI Voice Synthesis
  try {
    rawBuffer = await generateElevenLabsAudio(cleanText, voice);
    if (rawBuffer && rawBuffer.length > 0) {
      if (voice && voice.filter) {
        return await applyAudioFilter(rawBuffer, voice.filter);
      }
      return rawBuffer;
    }
  } catch (err) {
    console.warn('[ttsVoiceEngine] ElevenLabs synthesis notice:', err.message);
  }

  // 2. Secondary: Microsoft Edge Neural Speech
  try {
    rawBuffer = await generateMsEdgeAudio(cleanText, voice, customLang);
  } catch (err) {
    // Graceful fallback to Google TTS when Edge TTS encounters WebSocket issues
    const fallbackLang = voice?.baseLang || customLang || 'en';
    try {
      rawBuffer = await generateGoogleTtsAudio(cleanText, fallbackLang);
    } catch (gErr) {
      console.warn('[ttsVoiceEngine] Google TTS fallback error:', gErr.message);
      throw gErr;
    }
  }

  if (voice && voice.filter && rawBuffer) {
    return await applyAudioFilter(rawBuffer, voice.filter);
  }

  return rawBuffer;
}

/**
 * Builds a structured Components V2 container listing all celebrity and character voices without native emojis.
 */
export function buildVoiceListContainer(prefix = '!') {
  const categories = {};
  for (const v of Object.values(CELEBRITY_VOICES)) {
    if (!categories[v.category]) categories[v.category] = [];
    categories[v.category].push(v);
  }

  const sections = [];
  for (const [catName, voices] of Object.entries(categories)) {
    let catContent = `### **${catName}**\n`;
    for (const v of voices) {
      catContent += `-# • **${v.name}** (\`${v.id}\`): *${v.description}*\n`;
    }
    sections.push(catContent.trim());
  }

  return {
    type: 17,
    components: [
      {
        type: 10,
        content:
          `# Athena Voice Studio // Celebrity & Neural Roster | <a:03_tick_circle:1565665642084827206>\n` +
          `-# High-fidelity AI speech synthesis powered by ElevenLabs Flash v2.5 & Neural Voice Modeling.\n\n` +
          `> -# **__Engine Status:__** \`ElevenLabs Flash v2.5 AI Engine (Active)\`\n` +
          `> -# **__How to Set Your Voice:__** \`${prefix}ttsvoice <name>\` or \`${prefix}tts voice <name>\` (e.g. \`${prefix}ttsvoice trump\`)\n` +
          `> -# **__On-The-Fly Voice Speech:__** \`${prefix}tts <name> <message>\` (e.g. \`${prefix}tts mj Shamone! Hee hee!\`)\n` +
          `> -# **__Reset to Default:__** \`${prefix}ttsvoice default\` or \`${prefix}tts voice default\``
      },
      { type: 14, divider: true },
      {
        type: 10,
        content: sections.join('\n\n')
      },
      { type: 14, divider: true },
      {
        type: 10,
        content: `-# Athena Prime Audio Engine • ElevenLabs Neural Real-Time Voice Broadcast`
      }
    ]
  };
}
