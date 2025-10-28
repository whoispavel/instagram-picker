/**
 * Instagram Comment Picker - Production Backend
 * Реальний парсинг коментарів з Instagram через Puppeteer
 */

const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for deployment
app.set('trust proxy', 1);

// Middleware
app.use(cors());
app.use(express.json());

// Кеш для зменшення навантаження
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 хвилин

/**
 * Парсинг коментарів з Instagram
 */
async function scrapeInstagramComments(postUrl) {
  console.log(`🔍 Парсинг: ${postUrl}`);
  
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: process.env.NODE_ENV === 'production' ? 'new' : false, // Прихований на продакшні
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920x1080',
      ],
    });

    const page = await browser.newPage();
    
    // Встановити User-Agent
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Встановити viewport
    await page.setViewport({ width: 1920, height: 1080 });

    console.log('📄 Завантаження сторінки...');
    try {
      await page.goto(postUrl, {
        waitUntil: 'domcontentloaded', // Швидше ніж networkidle2
        timeout: 60000, // Збільшено до 60 сек
      });
    } catch (navError) {
      console.log('⚠️ Timeout навігації, продовжуємо...');
      // Продовжуємо навіть якщо повне завантаження не відбулося
    }

    // Почекати на завантаження коментарів
    console.log('⏳ Очікування завантаження контенту...');
    await page.waitForTimeout(5000); // Збільшено до 5 сек

    // Спроба натиснути "Показати більше коментарів"
    try {
      const loadMoreButtons = await page.$$('button');
      for (const button of loadMoreButtons) {
        const text = await page.evaluate(el => el.innerText, button);
        if (text && (text.includes('View') || text.includes('more') || text.includes('Load'))) {
          await button.click();
          await page.waitForTimeout(2000);
          break;
        }
      }
    } catch (e) {
      console.log('ℹ️ Кнопка "Показати більше" не знайдена');
    }

    // Прокрутка для завантаження коментарів
    console.log('📜 Прокручування коментарів...');
    await autoScroll(page);

    // Витягти коментарі
    console.log('📊 Витягування коментарів...');
    const comments = await page.evaluate(() => {
      const results = [];
      const seen = new Set();

      // Спроба 1: Через структуру списків
      const commentElements = document.querySelectorAll('ul ul li, ul li div[role="button"]');
      
      commentElements.forEach(el => {
        try {
          // Знайти username
          const usernameLink = el.querySelector('a[href*="/"]');
          const usernameEl = usernameLink || el.querySelector('span');
          
          if (!usernameEl) return;
          
          let username = usernameEl.innerText || usernameEl.textContent;
          username = username.trim().replace('@', '');
          
          if (!username || username.length > 30) return;
          
          // Знайти текст коментаря
          const textSpans = el.querySelectorAll('span');
          let text = '';
          
          for (const span of textSpans) {
            const spanText = (span.innerText || span.textContent || '').trim();
            if (spanText && spanText !== username && spanText.length > 0) {
              text = spanText;
              break;
            }
          }
          
          // Перевірка на дублікат
          const key = `${username}:${text}`;
          if (seen.has(key)) return;
          seen.add(key);
          
          if (username && username.length > 0) {
            results.push({
              username,
              text: text || '',
              avatar: username[0]?.toUpperCase() || '?',
              hasTags: /@\w+/.test(text),
              timestamp: Date.now(),
            });
          }
        } catch (err) {
          // Ігнорувати помилки парсингу окремих елементів
        }
      });

      return results;
    });

    console.log(`✅ Знайдено ${comments.length} коментарів`);

    // Видалити дублікати по username (залишити перший)
    const uniqueComments = [];
    const seenUsernames = new Set();
    
    for (const comment of comments) {
      if (!seenUsernames.has(comment.username)) {
        seenUsernames.add(comment.username);
        uniqueComments.push(comment);
      }
    }

    console.log(`✅ Унікальних користувачів: ${uniqueComments.length}`);

    return uniqueComments;

  } catch (error) {
    console.error('❌ Помилка парсингу:', error.message);
    console.error('Stack:', error.stack);
    
    // Детальніша інформація про помилку
    if (error.message.includes('timeout')) {
      throw new Error('Instagram завантажується занадто довго. Спробуйте ще раз або використайте ручний імпорт.');
    } else if (error.message.includes('net::')) {
      throw new Error('Проблема з мережею. Перевірте інтернет-з\'єднання.');
    } else {
      throw new Error(`Не вдалося обробити пост: ${error.message}`);
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Автоматична прокрутка сторінки
 */
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 300;
      const maxScrolls = 10;
      let scrolls = 0;
      
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        scrolls++;

        if (totalHeight >= scrollHeight || scrolls >= maxScrolls) {
          clearInterval(timer);
          resolve();
        }
      }, 500);
    });
  });
}

/**
 * Витягти ID поста з URL
 */
function extractPostId(url) {
  const match = url.match(/instagram\.com\/(?:p|reel|tv)\/([^/?]+)/);
  return match ? match[1] : null;
}

// ============================================
// API ENDPOINTS
// ============================================

/**
 * POST /api/instagram/comments
 * Отримати коментарі з Instagram поста
 */
app.post('/api/instagram/comments', async (req, res) => {
  const { postUrl } = req.body;

  if (!postUrl) {
    return res.status(400).json({
      success: false,
      error: 'postUrl є обов\'язковим параметром',
    });
  }

  // Валідація URL
  if (!postUrl.includes('instagram.com')) {
    return res.status(400).json({
      success: false,
      error: 'Невалідний URL Instagram',
    });
  }

  const postId = extractPostId(postUrl);
  if (!postId) {
    return res.status(400).json({
      success: false,
      error: 'Не вдалося витягти ID поста з URL',
    });
  }

  // Перевірка кешу
  const cacheKey = postId;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`💾 Повернуто з кешу: ${postId}`);
    return res.json({
      success: true,
      comments: cached.comments,
      count: cached.comments.length,
      cached: true,
    });
  }

  try {
    // Парсинг коментарів
    const comments = await scrapeInstagramComments(postUrl);

    if (comments.length === 0) {
      return res.json({
        success: true,
        comments: [],
        count: 0,
        message: 'Коментарі не знайдені. Можливо пост приватний або немає коментарів.',
      });
    }

    // Зберегти в кеш
    cache.set(cacheKey, {
      comments,
      timestamp: Date.now(),
    });

    res.json({
      success: true,
      comments,
      count: comments.length,
      cached: false,
    });

  } catch (error) {
    console.error('❌ Помилка:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      hint: 'Можливо Instagram змінив структуру або пост приватний',
    });
  }
});

/**
 * POST /api/instagram/random-winner
 * Вибрати випадкового переможця
 */
app.post('/api/instagram/random-winner', async (req, res) => {
  const { postUrl } = req.body;

  if (!postUrl) {
    return res.status(400).json({
      success: false,
      error: 'postUrl є обов\'язковим параметром',
    });
  }

  try {
    // Отримати коментарі
    const postId = extractPostId(postUrl);
    const cached = cache.get(postId);

    let comments;
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      comments = cached.comments;
    } else {
      comments = await scrapeInstagramComments(postUrl);
      cache.set(postId, { comments, timestamp: Date.now() });
    }

    if (comments.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Коментарі не знайдені',
      });
    }

    // Випадковий вибір
    const winner = comments[Math.floor(Math.random() * comments.length)];

    res.json({
      success: true,
      winner,
      totalParticipants: comments.length,
    });

  } catch (error) {
    console.error('❌ Помилка:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /health
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
    cache: {
      size: cache.size,
      entries: Array.from(cache.keys()),
    },
  });
});

/**
 * DELETE /cache
 * Очистити кеш
 */
app.delete('/cache', (req, res) => {
  const size = cache.size;
  cache.clear();
  res.json({
    success: true,
    message: `Кеш очищено (${size} записів)`,
  });
});

// ============================================
// ЗАПУСК СЕРВЕРА
// ============================================

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🎉 Instagram Comment Picker API                        ║
║                                                           ║
║   Сервер: http://localhost:${PORT}                          ║
║   Статус: http://localhost:${PORT}/health                   ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝

📡 Доступні ендпоінти:

   POST   /api/instagram/comments
          Отримати всі коментарі з поста

   POST   /api/instagram/random-winner
          Вибрати випадкового переможця

   GET    /health
          Перевірити статус сервера

   DELETE /cache
          Очистити кеш

💡 Приклад використання:

   curl -X POST http://localhost:${PORT}/api/instagram/comments \\
     -H "Content-Type: application/json" \\
     -d '{"postUrl": "https://www.instagram.com/p/XXXXX/"}'

🚀 Готово до роботи!
  `);
});

// Очищення кешу кожні 10 хвилин
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      cache.delete(key);
    }
  }
}, 10 * 60 * 1000);

// Обробка помилок
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
});

