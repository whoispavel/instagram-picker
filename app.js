const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const SHEET_ID = process.env.GOOGLE_SHEET_ID || '10-IqbkG36MaOzUzKh7ouR_HBuewQmiq2nabw5ixVZkU';
const SHEET_GID = process.env.GOOGLE_SHEET_GID || process.env.SHEET_GID || '0';
const SHEET_REFRESH_MS = Number(process.env.SHEET_REFRESH_MS) || 5000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const UNKNOWN_NOTIFY_COOLDOWN_MS = Number(process.env.UNKNOWN_NOTIFY_COOLDOWN_MS) || 60 * 1000;
const DEBUG_TOKEN = process.env.DEBUG_TOKEN;

const FALLBACK_PATH = path.join(__dirname, 'campaigns.json');

const state = {
  campaigns: new Map(),
  meta: {
    lastSync: null,
    lastError: null,
    source: 'fallback',
    rowCount: 0,
    shortcodes: [],
    lastDurationMs: null,
    totalComments: 0,
    sample: [],
  },
};

const rotationState = new Map();
const notifyCooldown = new Map();

app.use(cors());
app.use(express.json());

applyCampaigns(convertLegacyCampaigns(loadFallbackCampaigns()), 'fallback');

function toAbsoluteInstagramUrl(raw = '') {
  if (!raw) return '';
  if (/^[\w.-]+$/i.test(raw)) {
    return `https://www.instagram.com/reel/${raw}/`;
  }
  if (!/^https?:\/\//i.test(raw)) {
    return `https://${raw}`;
  }
  return raw;
}

function extractPostInfo(rawUrl = '') {
  try {
    const absolute = toAbsoluteInstagramUrl(rawUrl.trim());
    const url = new URL(absolute);
    const match = url.pathname.match(/\/(p|reel|tv)\/([^/?#]+)/i);
    if (!match) return null;
    const type = match[1].toLowerCase();
    const shortcode = match[2];
    return {
      type,
      shortcode,
      canonicalUrl: `https://www.instagram.com/${type}/${shortcode}/`,
      embedUrl: `https://www.instagram.com/${type}/${shortcode}/embed`,
    };
  } catch (error) {
    return null;
  }
}

function sanitizeUrl(value = '') {
  try {
    return new URL(value.trim()).toString();
  } catch (error) {
    return '';
  }
}

function parseNumber(value) {
  if (value == null) return 0;
  const digits = String(value).replace(/[^0-9]/g, '');
  return digits ? Number(digits) : 0;
}

function parseWinners(raw = '') {
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .flatMap((line) => line.split(/\s*[;,]\s*/))
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const urlMatch = entry.match(/https?:\/\/\S+/);
      const profileUrl = urlMatch ? sanitizeUrl(urlMatch[0]) : '';
      const handleMatch = entry.match(/@[\w._-]+/);
      let username = handleMatch ? handleMatch[0].replace('@', '') : '';
      if (!username && profileUrl) {
        const parts = profileUrl.split('/').filter(Boolean);
        username = parts[parts.length - 1] || '';
      }
      if (!username) {
        username = entry.split(/\s+/)[0].replace('@', '');
      }
      username = username.replace(/[^a-zA-Z0-9._-]/g, '');
      if (!username) {
        return null;
      }
      const cleanedEntry = entry
        .replace(urlMatch?.[0] || '', '')
        .replace(handleMatch?.[0] || '', '')
        .trim();
      return {
        username,
        profileUrl,
        comment: cleanedEntry,
      };
    })
    .filter(Boolean);
}

function parseRecentEntries(raw = '') {
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .flatMap((line) => line.split(/\s*[;,]\s*/))
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const handleMatch = entry.match(/@([\w._-]+)/);
      if (!handleMatch) {
        return null;
      }
      const username = handleMatch[1];
      const commentMatch = entry.match(/"([^"]*)"/);
      const comment = commentMatch
        ? commentMatch[1]
        : entry.replace(handleMatch[0], '').replace(/"/g, '').trim();
      return {
        username,
        comment,
      };
    })
    .filter(Boolean);
}

function shuffle(list = []) {
  const array = [...list];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function ensureRotation(shortcode, winners) {
  if (!winners.length) return;
  const key = winners.map((winner) => `${winner.username}-${winner.profileUrl}`).join('|');
  const existing = rotationState.get(shortcode);
  if (existing && existing.key === key) {
    return;
  }
  rotationState.set(shortcode, {
    order: shuffle(winners.map((_, idx) => idx)),
    cursor: 0,
    key,
  });
}

function loadFallbackCampaigns() {
  try {
    if (!fs.existsSync(FALLBACK_PATH)) {
      return [];
    }
    const raw = fs.readFileSync(FALLBACK_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.warn('Fallback campaigns parse error:', error.message);
    return [];
  }
}

function convertLegacyCampaigns(entries = []) {
  return entries
    .map((item) => {
      const info = extractPostInfo(item.postUrl || '');
      if (!info) return null;
      const winners = (item.accounts || [])
        .map((account) => ({
          username: account.username,
          profileUrl: account.profileUrl,
          comment: account.comment,
        }))
        .filter((account) => account.username);
      if (!winners.length) {
        return null;
      }
      return {
        shortcode: info.shortcode,
        type: info.type,
        canonicalUrl: info.canonicalUrl,
        embedUrl: info.embedUrl,
        winners,
        recent: parseRecentEntries(String(item.recent || '')),
        commentsCount: item.stats?.totalComments || winners.length,
      };
    })
    .filter(Boolean);
}

function applyCampaigns(list = [], source = 'sheet') {
  if (!Array.isArray(list) || !list.length) {
    return;
  }
  const nextMap = new Map();
  list.forEach((campaign) => {
    if (!campaign || !campaign.shortcode || !campaign.winners.length) {
      return;
    }
    nextMap.set(campaign.shortcode, campaign);
    ensureRotation(campaign.shortcode, campaign.winners);
  });
  if (!nextMap.size) {
    return;
  }
  state.campaigns = nextMap;
  state.meta.lastSync = new Date().toISOString();
  state.meta.source = source;
  state.meta.lastError = null;
  state.meta.rowCount = list.length;
  state.meta.shortcodes = Array.from(nextMap.keys());
  state.meta.totalComments = list.reduce((sum, campaign) => sum + (campaign.commentsCount || 0), 0);
  state.meta.sample = list.slice(0, 3).map((campaign) => campaign.canonicalUrl);
  console.log(`📊 Synced ${list.length} campaign(s) from ${source}.`);

  Array.from(rotationState.keys()).forEach((shortcode) => {
    if (!nextMap.has(shortcode)) {
      rotationState.delete(shortcode);
    }
  });
}

function buildStats(campaign) {
  return {
    totalComments: campaign.commentsCount,
    uniqueUsers: campaign.winners.length,
    eligibleUsers: campaign.winners.length,
    entries: campaign.winners.length,
  };
}

function buildComments(campaign) {
  return campaign.winners.map((winner, idx) => ({
    username: winner.username,
    text: winner.comment || 'No caption provided',
    profileUrl: winner.profileUrl,
    order: idx + 1,
  }));
}

function buildRecentTrack(campaign) {
  return (campaign.recent || []).map((entry, idx) => ({
    username: entry.username,
    comment: entry.comment || '',
    order: idx + 1,
  }));
}

function getCampaignByUrl(postUrl = '') {
  const info = extractPostInfo(postUrl);
  if (!info) {
    return null;
  }
  return state.campaigns.get(info.shortcode) || null;
}

function pickWinner(campaign) {
  if (!campaign.winners.length) {
    return null;
  }
  const stateEntry = rotationState.get(campaign.shortcode);
  if (!stateEntry || !stateEntry.order.length) {
    ensureRotation(campaign.shortcode, campaign.winners);
    return pickWinner(campaign);
  }
  const winnerIndex = stateEntry.order[stateEntry.cursor];
  stateEntry.cursor = (stateEntry.cursor + 1) % stateEntry.order.length;
  if (stateEntry.cursor === 0) {
    stateEntry.order = shuffle(stateEntry.order);
  }
  const winner = campaign.winners[winnerIndex];
  return {
    username: winner.username,
    profileUrl: winner.profileUrl,
    comment: winner.comment,
    order: winnerIndex + 1,
  };
}

function parseSheetRows(rows = []) {
  return rows
    .map((row) => {
      const cells = row.c || [];
      const rawUrl = cells[0]?.v || cells[0]?.f;
      if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.includes('instagram.com')) {
        return null;
      }
      const info = extractPostInfo(rawUrl);
      if (!info) {
        return null;
      }
      const commentsCount = parseNumber(cells[1]?.v ?? cells[1]?.f);
      const winnersRaw = cells[2]?.v || cells[2]?.f || '';
      const recentRaw = cells[3]?.v || cells[3]?.f || '';
      const winners = parseWinners(String(winnersRaw));
      if (!winners.length) {
        return null;
      }
      return {
        shortcode: info.shortcode,
        type: info.type,
        canonicalUrl: info.canonicalUrl,
        embedUrl: info.embedUrl,
        winners,
        recent: parseRecentEntries(String(recentRaw)),
        commentsCount: commentsCount || winners.length,
      };
    })
    .filter(Boolean);
}

async function fetchSheetData() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${SHEET_GID}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Google Sheets request failed: ${response.status}`);
  }
  const text = await response.text();
  const jsonString = text.replace(/^[^\(]+\(/, '').replace(/\);?$/, '');
  const payload = JSON.parse(jsonString);
  const rows = payload.table?.rows || [];
  return parseSheetRows(rows);
}

async function syncFromSheet() {
  if (!SHEET_ID) {
    return;
  }
  const started = Date.now();
  try {
    const campaigns = await fetchSheetData();
    if (campaigns.length) {
      applyCampaigns(campaigns, 'sheet');
      state.meta.lastDurationMs = Date.now() - started;
    }
  } catch (error) {
    console.error('Sheet sync failed:', error.message);
    state.meta.lastError = error.message;
    if (!state.campaigns.size) {
      const fallbackCampaigns = convertLegacyCampaigns(loadFallbackCampaigns());
      applyCampaigns(fallbackCampaigns, 'fallback');
    }
  }
}

function getCampaignStats(campaign) {
  return buildStats(campaign);
}

function buildResponsePayload(campaign, winner) {
  return {
    success: true,
    stats: getCampaignStats(campaign),
    comments: buildComments(campaign),
    winner,
    previewUrl: campaign.embedUrl,
    canonicalUrl: campaign.canonicalUrl,
    syncedAt: state.meta.lastSync,
  };
}

function scheduleSheetSync() {
  if (!SHEET_ID) {
    console.warn('GOOGLE_SHEET_ID is not configured. Using fallback data only.');
    applyCampaigns(convertLegacyCampaigns(loadFallbackCampaigns()), 'fallback');
    return;
  }

  syncFromSheet();
  setInterval(syncFromSheet, SHEET_REFRESH_MS);
}

async function notifyUnknownLink(postUrl) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return;
  }
  const now = Date.now();
  const info = extractPostInfo(postUrl);
  const key = info?.canonicalUrl || postUrl;
  const lastNotified = notifyCooldown.get(key) || 0;
  if (now - lastNotified < UNKNOWN_NOTIFY_COOLDOWN_MS) {
    return;
  }
  notifyCooldown.set(key, now);
  try {
    const text = `Unknown Instagram link submitted: ${postUrl}`;
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
    });
  } catch (error) {
    console.error('Telegram notification failed:', error.message);
  }
}

app.post('/api/scrape/comments', async (req, res) => {
  const { postUrl } = req.body || {};
  if (!postUrl) {
    return res.status(400).json({ success: false, error: 'Post URL is required' });
  }

  const campaign = getCampaignByUrl(postUrl);
  if (!campaign) {
    await notifyUnknownLink(postUrl);
    return res.status(404).json({ success: false, error: 'We could not reach this post. Please try another link.' });
  }

  const winner = pickWinner(campaign);
  if (!winner) {
    return res.status(500).json({ success: false, error: 'No eligible commenters detected for this post.' });
  }

  res.json(buildResponsePayload(campaign, winner));
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    campaigns: state.campaigns.size,
    rotationState: rotationState.size,
    meta: state.meta,
  });
});

app.get('/debug/campaigns', (req, res) => {
  if (DEBUG_TOKEN && req.query.token !== DEBUG_TOKEN) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  res.json({
    campaigns: state.campaigns.size,
    shortcodes: Array.from(state.campaigns.keys()),
    meta: state.meta,
  });
});

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Instagram picker API is running',
    campaigns: state.campaigns.size,
    lastSync: state.meta.lastSync,
  });
});

scheduleSheetSync();

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
