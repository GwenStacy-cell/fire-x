import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createCanvas } from './canvas.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const landGeojsonPath = path.join(__dirname, '../assets/world_land.json');

let landData = null;
try {
  if (fs.existsSync(landGeojsonPath)) {
    landData = JSON.parse(fs.readFileSync(landGeojsonPath, 'utf8'));
  }
} catch (e) {
  console.error('[WeatherMap] Failed to load world_land.json:', e);
}

/**
 * Resolves location input from raw text, coordinates, or Google Maps links
 */
export async function resolveLocationInput(input) {
  let str = (input || '').trim();
  if (!str) return null;

  // 1. Google Maps or shortened URL
  if (str.startsWith('http://') || str.startsWith('https://')) {
    try {
      if (str.includes('goo.gl') || str.includes('maps.app') || str.includes('page.link')) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const headRes = await fetch(str, { method: 'HEAD', redirect: 'follow', signal: controller.signal }).catch(() => null);
        clearTimeout(timeout);
        if (headRes && headRes.url) {
          str = headRes.url;
        }
      }
    } catch {}

    // Pattern A: @lat,lon
    const atMatch = str.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) {
      return {
        query: `${atMatch[1]},${atMatch[2]}`,
        lat: parseFloat(atMatch[1]),
        lon: parseFloat(atMatch[2]),
        isGoogleMap: true,
        sourceUrl: str
      };
    }

    // Pattern B: q=lat,lon or q=Place
    const qMatch = str.match(/[?&]q=([^&]+)/);
    if (qMatch) {
      const qVal = decodeURIComponent(qMatch[1].replace(/\+/g, ' '));
      const coordMatch = qVal.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
      if (coordMatch) {
        return {
          query: `${coordMatch[1]},${coordMatch[2]}`,
          lat: parseFloat(coordMatch[1]),
          lon: parseFloat(coordMatch[2]),
          isGoogleMap: true,
          sourceUrl: str
        };
      }
      return { query: qVal, isGoogleMap: true, sourceUrl: str };
    }

    // Pattern C: /place/Name/...
    const placeMatch = str.match(/\/place\/([^/@]+)/);
    if (placeMatch) {
      const placeName = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
      return { query: placeName, isGoogleMap: true, sourceUrl: str };
    }
  }

  // 2. Direct Coordinates: lat,lon or lat lon
  const directCoord = str.match(/^(-?\d+\.?\d*)\s*[, ]\s*(-?\d+\.?\d*)$/);
  if (directCoord) {
    const lat = parseFloat(directCoord[1]);
    const lon = parseFloat(directCoord[2]);
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return { query: `${lat},${lon}`, lat, lon, isCoordinates: true };
    }
  }

  // 3. Standard city / territory / address query
  return { query: str };
}

/**
 * Fetches comprehensive meteorological data from wttr.in
 */
export async function fetchWeatherData(query) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const url = `https://wttr.in/${encodeURIComponent(query)}?format=j1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'curl/7.68.0' },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('[Weather] Fetch error:', err);
    return null;
  }
}

/**
 * Generates an Equirectangular Satellite World Map PNG card with tactical targeting crosshairs
 */
export function generateWeatherWorldMap(lat, lon, locationTitle, tempC, condition, humidity, wind) {
  const width = 1024;
  const height = 512;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 1. Deep Space Cyber Navy Background
  ctx.fillStyle = '#060a14';
  ctx.fillRect(0, 0, width, height);

  // 2. Parallels & Meridians Grid (Every 30 degrees)
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
  ctx.lineWidth = 1;
  for (let y = 0; y <= height; y += height / 6) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  for (let x = 0; x <= width; x += width / 12) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  // 3. Equator & Prime Meridian Guidance Lines
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.28)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0, 240, 255, 0.22)';
  ctx.beginPath();
  ctx.moveTo(width / 2, 0);
  ctx.lineTo(width / 2, height);
  ctx.stroke();
  ctx.setLineDash([]);

  // 4. Render Continents & Landmasses from Natural Earth GeoJSON
  if (landData && landData.features) {
    ctx.fillStyle = '#141e33';
    ctx.strokeStyle = '#223456';
    ctx.lineWidth = 1;

    for (const feature of landData.features) {
      const geom = feature.geometry;
      if (!geom) continue;
      const polyList = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
      for (const poly of polyList) {
        for (const ring of poly) {
          ctx.beginPath();
          for (let i = 0; i < ring.length; i++) {
            const [pLon, pLat] = ring[i];
            const px = (pLon + 180) * (width / 360);
            const py = (90 - pLat) * (height / 180);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
    }
  }

  // 5. Projected Target Coordinates on Equirectangular Grid
  const clampedLat = Math.max(-90, Math.min(90, lat));
  const clampedLon = Math.max(-180, Math.min(180, lon));
  const targetX = (clampedLon + 180) * (width / 360);
  const targetY = (90 - clampedLat) * (height / 180);

  // 6. Crosshair Target Lines (crisp dashed neon lines)
  ctx.strokeStyle = 'rgba(0, 255, 136, 0.40)';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(targetX, 0);
  ctx.lineTo(targetX, height);
  ctx.moveTo(0, targetY);
  ctx.lineTo(width, targetY);
  ctx.stroke();
  ctx.setLineDash([]);

  // 7. Tactical Concentric Radar Rings & Glowing Ping
  const rings = [6, 16, 28];
  rings.forEach((r, idx) => {
    ctx.strokeStyle = idx === 0 
      ? 'rgba(0, 255, 136, 0.95)' 
      : idx === 1 
      ? 'rgba(0, 240, 255, 0.70)' 
      : 'rgba(0, 240, 255, 0.35)';
    ctx.lineWidth = idx === 0 ? 1.8 : 1;
    ctx.beginPath();
    ctx.arc(targetX, targetY, r, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Center Target Beacon (glowing core)
  ctx.fillStyle = '#00ff88';
  ctx.beginPath();
  ctx.arc(targetX, targetY, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Compact Target Coordinate Reticle Tag
  const tagLat = (lat >= 0 ? lat.toFixed(2) + '°N' : Math.abs(lat).toFixed(2) + '°S');
  const tagLon = (lon >= 0 ? lon.toFixed(2) + '°E' : Math.abs(lon).toFixed(2) + '°W');
  const coordText = `⌖ ${tagLat}, ${tagLon}`;
  
  const badgeWidth = 98;
  const badgeHeight = 16;
  let badgeX = targetX + 12;
  let badgeY = targetY - 22;
  if (badgeX + badgeWidth > width - 10) badgeX = targetX - badgeWidth - 12;
  if (badgeY < 10) badgeY = targetY + 14;

  ctx.fillStyle = 'rgba(6, 10, 20, 0.92)';
  ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 1;
  ctx.strokeRect(badgeX, badgeY, badgeWidth, badgeHeight);
  ctx.fillStyle = '#00ff88';
  ctx.font = 'bold 9px monospace';
  ctx.fillText(coordText, badgeX + 5, badgeY + 11);

  // 8. Compact Organised Text on Left Ocean (Positioned towards bottom, natural mixed casing)
  // If target happens to be in the South Pacific (targetX < 260 && targetY > 280), shift text to South Atlantic
  let textX = 28;
  let textY = 345;
  if (targetX < 260 && targetY > 280 && targetY < 480) {
    textX = 380; // South Atlantic Ocean
  }

  const blockWidth = 220;
  const blockHeight = 104;

  // Tactical accent vertical guide bar (ultra-slim)
  ctx.fillStyle = '#00f0ff';
  ctx.fillRect(textX, textY, 2.5, blockHeight);

  // Subtle translucent glass backing (no heavy opaque card blocking landmasses)
  ctx.fillStyle = 'rgba(6, 10, 20, 0.45)';
  ctx.fillRect(textX + 6, textY - 4, blockWidth, blockHeight + 8);

  // Category header (Natural mixed case)
  ctx.fillStyle = '#00f0ff';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('Athena Prime // Global Weather Recon', textX + 12, textY + 11);

  // Location Title (Natural case - not all uppercase)
  const cleanTitle = (locationTitle || 'Target Location').trim();
  const displayTitle = cleanTitle.length > 28 ? cleanTitle.substring(0, 26) + '...' : cleanTitle;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13.5px sans-serif';
  ctx.fillText(displayTitle, textX + 12, textY + 30);

  // Coordinates Subtitle (Natural mixed case)
  const latStr = (lat >= 0 ? lat.toFixed(2) + '° N' : Math.abs(lat).toFixed(2) + '° S');
  const lonStr = (lon >= 0 ? lon.toFixed(2) + '° E' : Math.abs(lon).toFixed(2) + '° W');
  ctx.fillStyle = '#7dd3fc';
  ctx.font = '10px sans-serif';
  ctx.fillText(`Target Locked: ${latStr} | ${lonStr}`, textX + 12, textY + 46);

  // Weather telemetry: Compact Temp + Condition
  ctx.fillStyle = '#00ff88';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(`${tempC}°C`, textX + 12, textY + 74);

  // Condition (Natural case - not uppercase)
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 11.5px sans-serif';
  const condStr = (condition || 'Clear').trim();
  ctx.fillText(condStr, textX + 12, textY + 90);

  // Small telemetry metrics line (Natural mixed case)
  ctx.fillStyle = '#94a3b8';
  ctx.font = '9px sans-serif';
  ctx.fillText(`Humidity: ${humidity}%  •  Wind: ${wind}`, textX + 12, textY + 102);

  // 9. Ultra-sleek Bottom Telemetry Status Bar (Natural mixed case)
  ctx.fillStyle = 'rgba(6, 10, 20, 0.88)';
  ctx.fillRect(16, height - 32, width - 32, 22);
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.30)';
  ctx.lineWidth = 1;
  ctx.strokeRect(16, height - 32, width - 32, 22);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '9.5px sans-serif';
  ctx.fillText(
    `Equirectangular WGS84  |  Radar Status: Active  |  Tactical Satellite Telemetry`,
    26,
    height - 18
  );

  return canvas.toBuffer('image/png');
}

/**
 * Builds the full Discord Components V2 weather report payload
 */
export async function buildWeatherReportPayload(weatherData, locationInput, sourceUrl = null) {
  const cur = weatherData.current_condition?.[0] || {};
  const area = weatherData.nearest_area?.[0] || {};
  const weatherList = weatherData.weather || [];

  const areaName = area.areaName?.[0]?.value || locationInput;
  const region = area.region?.[0]?.value || '';
  const country = area.country?.[0]?.value || '';
  const fullLocation = [areaName, region, country].filter(Boolean).join(', ');

  const lat = parseFloat(area.latitude || 0);
  const lon = parseFloat(area.longitude || 0);

  const tempC = cur.temp_C || '0';
  const tempF = cur.temp_F || '32';
  const feelsLikeC = cur.FeelsLikeC || tempC;
  const feelsLikeF = cur.FeelsLikeF || tempF;
  const condition = cur.weatherDesc?.[0]?.value || 'Clear';
  const humidity = cur.humidity || '0';
  const windKmph = cur.windspeedKmph || '0';
  const windDir = cur.winddir16Point || 'N';
  const uvIndex = cur.uvIndex || '0';
  const visibility = cur.visibility || '10';
  const pressure = cur.pressure || '1013';
  const precip = cur.precipMM || '0.0';

  // Generate the world map canvas buffer
  const mapBuffer = generateWeatherWorldMap(
    lat,
    lon,
    fullLocation,
    tempC,
    condition,
    humidity,
    `${windKmph} km/h ${windDir}`
  );

  // Forecast Text (3 Days)
  const daysText = weatherList.slice(0, 3).map((w, idx) => {
    const dayLabel = idx === 0 ? 'Today' : idx === 1 ? 'Tomorrow' : `Day ${idx + 1}`;
    const maxC = w.maxtempC || '-';
    const minC = w.mintempC || '-';
    const maxF = w.maxtempF || '-';
    const minF = w.mintempF || '-';
    const desc = w.hourly?.[4]?.weatherDesc?.[0]?.value || 'Clear';
    return `> -# • **${dayLabel} (${w.date}):** \`${desc}\` • High: \`${maxC}°C\` (\`${maxF}°F\`) / Low: \`${minC}°C\` (\`${minF}°F\`)`;
  }).join('\n');

  // Astronomy
  const astro = weatherList[0]?.astronomy?.[0] || {};
  const sunrise = astro.sunrise || '06:00 AM';
  const sunset = astro.sunset || '06:00 PM';
  const moonPhase = astro.moon_phase || 'Waxing';

  // Google Maps link
  const googleMapsUrl = sourceUrl || `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;

  // Action Buttons
  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('View on Google Maps')
      .setStyle(ButtonStyle.Link)
      .setURL(googleMapsUrl),
    new ButtonBuilder()
      .setCustomId(`wtr_refresh_${encodeURIComponent(locationInput).substring(0, 50)}`)
      .setLabel('Refresh Telemetry')
      .setStyle(ButtonStyle.Primary)
  );

  const container = {
    type: 17,
    components: [
      {
        type: 12,
        items: [{ media: { url: 'attachment://weather_world_map.png' } }]
      },
      {
        type: 10,
        content: `## Weather Reconnaissance | <a:03_tick_circle:1565665642084827206>\n` +
                 `> -# <a:uptime:1552608831060844575> **Target Location:** **${fullLocation}**\n` +
                 `> -# • **Coordinates:** \`${lat.toFixed(4)}°, ${lon.toFixed(4)}°\` *(Target Locked on World Map)*\n` +
                 `> -# • **Conditions:** \`${condition}\` • **Temp:** \`${tempC}°C\` (\`${tempF}°F\`) • **Feels Like:** \`${feelsLikeC}°C\` (\`${feelsLikeF}°F\`)\n` +
                 `> -# • **Humidity:** \`${humidity}%\` • **Wind:** \`${windKmph} km/h ${windDir}\` • **UV Index:** \`${uvIndex}\`\n` +
                 `> -# • **Precipitation:** \`${precip}mm\` • **Pressure:** \`${pressure} hPa\` • **Visibility:** \`${visibility} km\`\n\n` +
                 `### 3-Day Meteorological Forecast\n` +
                 daysText + `\n\n` +
                 `### Solar & Lunar Telemetry\n` +
                 `> -# • **Sunrise:** \`${sunrise}\` • **Sunset:** \`${sunset}\` • **Moon Phase:** \`${moonPhase}\``
      },
      { type: 14, divider: true },
      actionRow.toJSON(),
      { type: 14, divider: true },
      { type: 10, content: `-# **Athena Prime Atmospheric Sentry \u2022 World Meteorological Engine**` }
    ]
  };

  return {
    components: [container],
    files: [{ attachment: mapBuffer, name: 'weather_world_map.png' }],
    flags: MessageFlags.IsComponentsV2
  };
}
