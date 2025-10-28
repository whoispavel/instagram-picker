/**
 * Приклад простого бекенду для Instagram Comment Picker
 * 
 * Встановлення:
 * npm install express cors puppeteer
 * 
 * Запуск:
 * node backend-example.js
 */

const express = require('express');
const cors = require('cors');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// ============================================
// МЕТОД 1: Демо-дані (для тестування)
// ============================================

function getDemoComments() {
  return [
    { username: 'anna_fitness', text: 'Хочу виграти! 🎉 @maria_yoga', hasTags: true },
    { username: 'max_developer', text: 'Чудовий розіграш!', hasTags: false },
    { username: 'olena_travel', text: 'Мрію про цей приз @ivan_photo', hasTags: true },
    { username: 'dmytro_music', text: 'Супер! 🔥', hasTags: false },
    { username: 'sofia_art', text: 'Участь беру! @nick_design', hasTags: true },
  ].map(c => ({
    ...c,
    avatar: c.username[0].toUpperCase(),
    timestamp: Date.now(),
  }));
}

// ============================================
// МЕТОД 2: Puppeteer (Scraping) - НЕ РЕКОМЕНДУЄТЬСЯ
// ============================================

async function scrapeInstagramComments(postUrl) {
  // Увага: це порушує ToS Instagram!
  const puppeteer = require('puppeteer');
  
  try {
    const browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Встановити User-Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    await page.goto(postUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Прокрутка для завантаження коментарів
    await page.evaluate(async () => {
      const scrollContainer = document.querySelector('div[role="dialog"]');
      if (scrollContainer) {
        for (let i = 0; i < 5; i++) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    });
    
    // Витягти коментарі
    const comments = await page.evaluate(() => {
      const results = [];
      const commentElements = document.querySelectorAll('ul ul li');
      
      commentElements.forEach(el => {
        const usernameEl = el.querySelector('a[href*="instagram.com/"]');
        const textEl = el.querySelector('span');
        
        if (usernameEl && textEl) {
          const username = usernameEl.innerText || usernameEl.textContent;
          const text = textEl.innerText || textEl.textContent;
          
          results.push({
            username: username.trim(),
            text: text.trim(),
            avatar: username[0].toUpperCase(),
            hasTags: /@\w+/.test(text),
          });
        }
      });
      
      return results;
    });
    
    await browser.close();
    return comments;
  } catch (error) {
    console.error('Scraping error:', error);
    throw error;
  }
}

// ============================================
// API ЕНДПОІНТИ
// ============================================

// Головний ендпоінт для отримання коментарів
app.post('/api/instagram/comments', async (req, res) => {
  const { postUrl, method = 'demo' } = req.body;
  
  if (!postUrl) {
    return res.status(400).json({ 
      success: false, 
      error: 'postUrl обов\'язковий параметр' 
    });
  }
  
  try {
    let comments;
    
    switch (method) {
      case 'demo':
        // Демо-дані
        comments = getDemoComments();
        break;
        
      case 'scrape':
        // Scraping (не рекомендується)
        comments = await scrapeInstagramComments(postUrl);
        break;
        
      default:
        return res.status(400).json({ 
          success: false, 
          error: 'Невідомий метод' 
        });
    }
    
    res.json({ 
      success: true, 
      comments,
      count: comments.length 
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// ============================================
// ЗАПУСК СЕРВЕРА
// ============================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════╗
║  Instagram Comment Picker API                     ║
║  Сервер запущено на порту ${PORT}                    ║
╚═══════════════════════════════════════════════════╝

Доступні ендпоінти:
  POST http://localhost:${PORT}/api/instagram/comments
  GET  http://localhost:${PORT}/health

Приклад запиту:
  curl -X POST http://localhost:${PORT}/api/instagram/comments \\
    -H "Content-Type: application/json" \\
    -d '{"postUrl": "https://instagram.com/p/...", "method": "demo"}'
  `);
});

// ============================================
// ОБРОБКА ПОМИЛОК
// ============================================

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

