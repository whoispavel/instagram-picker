const fs = require('fs');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_TTL = Number(process.env.CACHE_TTL_MS) || 5 * 60 * 1000;
const SESSION_ID = process.env.SESSION_ID;
const NAVIGATION_TIMEOUT = Number(process.env.NAVIGATION_TIMEOUT_MS) || 90 * 1000;
const USER_AGENT =
  process.env.USER_AGENT ||
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const BLOCKLIST = ['spam', 'bot'];
const FORCE_CHROMIUM = process.env.FORCE_CHROMIUM === 'true';
const HEADLESS = process.env.PUPPETEER_HEADLESS === 'false' ? false : true;
const DEFAULT_CHROME_PATHS = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  ],
  win32: [
    'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
    'C:\\\\Program Files (x86)\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
    'C:\\\\Program Files\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe',
  ],
};

if (!SESSION_ID) {
  console.warn('⚠️  SESSION_ID не задано в .env. Scraping не працюватиме.');
}

app.use(cors());
app.use(express.json());

const cache = new Map();

function validInstagramUrl(url = '') {
  return /https?:\/\/(www\.)?instagram\.com\/(p|reel|tv)\//i.test(url);
}

function resolveChromeExecutable() {
  const candidates = [
    process.env.CHROME_EXECUTABLE_PATH,
    process.env.GOOGLE_CHROME_BIN,
    ...(DEFAULT_CHROME_PATHS[process.platform] || []),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch (error) {
      console.warn(`Не вдалося перевірити ${candidate}:`, error.message);
    }
  }
  return null;
}

async function launchBrowser() {
  const customExecutable = resolveChromeExecutable();
  if (customExecutable && !FORCE_CHROMIUM) {
    return puppeteer.launch({
      executablePath: customExecutable,
      headless: HEADLESS,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  if (process.platform !== 'linux') {
    throw new Error(
      'Bundled Chromium підтримує лише Linux. Вкажіть CHROME_EXECUTABLE_PATH або встановіть Google Chrome локально.'
    );
  }

  const executablePath = await chromium.executablePath();
  if (!executablePath) {
    throw new Error('Не знайдено executablePath для Chromium. Спробуйте задати CHROME_EXECUTABLE_PATH.');
  }

  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: typeof chromium.headless === 'boolean' ? chromium.headless : HEADLESS,
  });
}

async function extractMediaId(postUrl) {
  if (!SESSION_ID) {
    throw new Error('SESSION_ID env variable is missing.');
  }

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.setCookie({
      name: 'sessionid',
      value: SESSION_ID,
      domain: '.instagram.com',
      httpOnly: true,
      secure: true,
    });

    await page.goto(postUrl, { waitUntil: 'networkidle2', timeout: NAVIGATION_TIMEOUT });

    const mediaId = await page.evaluate(() => {
      const extractFromData = (data) => {
        if (!data) return null;
        if (data.entry_data?.PostPage?.[0]?.graphql?.shortcode_media?.id) {
          return data.entry_data.PostPage[0].graphql.shortcode_media.id;
        }
        if (data.graphql?.shortcode_media?.id) {
          return data.graphql.shortcode_media.id;
        }
        if (data.items?.[0]?.id) {
          return data.items[0].id;
        }
        return null;
      };

      if (window.__additionalData) {
        const id = extractFromData(window.__additionalData);
        if (id) return id;
      }

      if (window.__initialData) {
        const id = extractFromData(window.__initialData);
        if (id) return id;
      }

      if (window.__additionalDataLoaded) {
        const entries = Object.values(window.__additionalDataLoaded);
        for (const entry of entries) {
          const maybeId = extractFromData(entry);
          if (maybeId) return maybeId;
        }
      }

      const scripts = Array.from(document.scripts).map((script) => script.textContent || '');
      for (const content of scripts) {
        const match = content.match(/"media_id":"(\d+)"/);
        if (match) {
          return match[1];
        }
      }

      const htmlMatch = document.body.innerHTML.match(/"media_id":"(\d+)"/);
      return htmlMatch ? htmlMatch[1] : null;
    });

    return mediaId;
  } finally {
    await browser.close();
  }
}

async function fetchInstagramComments(mediaId) {
  let url = `https://www.instagram.com/api/v1/media/${mediaId}/comments/?can_support_threading=true&permalink_enabled=false`;
  const all = [];

  while (url) {
    const response = await fetch(url, {
      headers: {
        'user-agent': USER_AGENT,
        cookie: `sessionid=${SESSION_ID};`,
        'x-ig-app-id': '936619743392459',
        accept: 'application/json',
      },
    });

    if (response.status === 404) {
      throw new Error('Post is private');
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Instagram request failed: ${response.status} ${text}`);
    }

    const data = await response.json();
    if (Array.isArray(data.comments)) {
      all.push(...data.comments);
    }

    if (data.next_max_id) {
      url = `https://www.instagram.com/api/v1/media/${mediaId}/comments/?can_support_threading=true&permalink_enabled=false&max_id=${data.next_max_id}`;
    } else {
      url = null;
    }
  }

  return all;
}

function filterComments(comments, { allowMultipleEntries = false } = {}) {
  const seenUsers = new Set();
  const filtered = [];
  const entries = [];

  comments.forEach((comment) => {
    const username = comment.user?.username || comment.owner?.username;
    const text = comment.text || '';
    if (!username || seenUsers.has(username)) {
      return;
    }

    if (BLOCKLIST.includes(username.toLowerCase())) {
      return;
    }

    const mentions = (text.match(/@[\w._-]+/g) || []).length;
    if (mentions < 1) {
      return;
    }

    seenUsers.add(username);
    filtered.push({ username, text, mentions });

    let tickets = 1;
    if (allowMultipleEntries) {
      tickets = Math.max(1, Math.floor(mentions / 3));
    }

    for (let i = 0; i < tickets; i += 1) {
      entries.push(username);
    }
  });

  return {
    comments: filtered,
    entries,
    stats: {
      totalComments: comments.length,
      uniqueUsers: seenUsers.size,
      eligibleUsers: filtered.length,
      entries: entries.length,
    },
  };
}

app.post('/api/scrape/comments', async (req, res) => {
  try {
    const { postUrl, allowMultipleEntries = false } = req.body || {};

    if (!postUrl || !validInstagramUrl(postUrl)) {
      return res.status(400).json({ success: false, error: 'Invalid post URL' });
    }

    if (!SESSION_ID) {
      return res.status(500).json({ success: false, error: 'SESSION_ID is not configured.' });
    }

    const cacheEntry = cache.get(postUrl);
    if (cacheEntry && Date.now() - cacheEntry.timestamp < CACHE_TTL) {
      return res.json({ ...cacheEntry.payload, cached: true });
    }

    const mediaId = await extractMediaId(postUrl);
    if (!mediaId) {
      return res.status(400).json({ success: false, error: 'Invalid post URL' });
    }

    const rawComments = await fetchInstagramComments(mediaId);
    if (!rawComments.length) {
      return res.status(404).json({ success: false, error: 'No comments found' });
    }

    const result = filterComments(rawComments, { allowMultipleEntries });

    if (!result.comments.length) {
      return res.status(404).json({ success: false, error: 'No comments found' });
    }

    const payload = { success: true, comments: result.comments, entries: result.entries, stats: result.stats };
    cache.set(postUrl, { timestamp: Date.now(), payload });

    res.json(payload);
  } catch (error) {
    console.error('Scrape error:', error.message);
    if (error.message.includes('Post is private')) {
      return res.status(403).json({ success: false, error: 'Post is private' });
    }
    res.status(500).json({ success: false, error: error.message || 'Unexpected error' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), cacheEntries: cache.size });
});

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Instagram picker API is running' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
