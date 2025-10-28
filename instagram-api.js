/**
 * Instagram Comment Picker - API Integration Module
 * Модуль для підключення справжніх коментарів з Instagram
 */

// ============================================
// КОНФІГУРАЦІЯ
// ============================================

const CONFIG = {
  // Варіант 1: Ваш бекенд API
  BACKEND_URL: 'http://localhost:3000/api/instagram/comments',
  
  // Варіант 2: RapidAPI (потребує ключ)
  RAPIDAPI_KEY: 'YOUR_RAPIDAPI_KEY_HERE',
  RAPIDAPI_HOST: 'instagram-scraper-api.p.rapidapi.com',
  
  // Варіант 3: Instagram Graph API (тільки для своїх постів)
  INSTAGRAM_ACCESS_TOKEN: 'YOUR_ACCESS_TOKEN_HERE',
};

// ============================================
// МЕТОД 1: Через ваш бекенд
// ============================================

/**
 * Отримати коментарі через ваш власний бекенд
 * @param {string} postUrl - URL поста Instagram
 * @returns {Promise<Array>} - Масив коментарів
 */
async function fetchCommentsViaBackend(postUrl) {
  try {
    const response = await fetch(CONFIG.BACKEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ postUrl }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return normalizeComments(data.comments);
  } catch (error) {
    console.error('Backend API Error:', error);
    throw new Error('Не вдалося завантажити коментарі з бекенду');
  }
}

// ============================================
// МЕТОД 2: RapidAPI Instagram Scraper
// ============================================

/**
 * Отримати коментарі через RapidAPI
 * @param {string} postUrl - URL поста Instagram
 * @returns {Promise<Array>} - Масив коментарів
 */
async function fetchCommentsViaRapidAPI(postUrl) {
  if (CONFIG.RAPIDAPI_KEY === 'YOUR_RAPIDAPI_KEY_HERE') {
    throw new Error('Потрібно налаштувати RAPIDAPI_KEY в конфігурації');
  }

  try {
    const response = await fetch('https://instagram-scraper-api.p.rapidapi.com/comments', {
      method: 'POST',
      headers: {
        'X-RapidAPI-Key': CONFIG.RAPIDAPI_KEY,
        'X-RapidAPI-Host': CONFIG.RAPIDAPI_HOST,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: postUrl }),
    });

    if (!response.ok) {
      throw new Error(`RapidAPI Error: ${response.status}`);
    }

    const data = await response.json();
    return normalizeComments(data.comments || data.data);
  } catch (error) {
    console.error('RapidAPI Error:', error);
    throw new Error('Не вдалося завантажити коментарі через RapidAPI');
  }
}

// ============================================
// МЕТОД 3: Instagram Graph API (тільки свої пости)
// ============================================

/**
 * Отримати коментарі через Instagram Graph API
 * Працює ТІЛЬКИ для ваших власних постів!
 * @param {string} mediaId - ID медіа з Instagram
 * @returns {Promise<Array>} - Масив коментарів
 */
async function fetchCommentsViaGraphAPI(mediaId) {
  if (CONFIG.INSTAGRAM_ACCESS_TOKEN === 'YOUR_ACCESS_TOKEN_HERE') {
    throw new Error('Потрібно налаштувати INSTAGRAM_ACCESS_TOKEN');
  }

  try {
    const url = `https://graph.instagram.com/${mediaId}/comments?fields=id,text,username,timestamp&access_token=${CONFIG.INSTAGRAM_ACCESS_TOKEN}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Graph API Error: ${response.status}`);
    }

    const data = await response.json();
    return normalizeComments(data.data);
  } catch (error) {
    console.error('Graph API Error:', error);
    throw new Error('Не вдалося завантажити коментарі через Graph API');
  }
}

// ============================================
// МЕТОД 4: Ручний імпорт (найпростіший)
// ============================================

/**
 * Парсинг коментарів з текстового формату
 * Формат: @username: текст коментаря
 * @param {string} text - Текст з коментарями
 * @returns {Array} - Масив коментарів
 */
function parseManualComments(text) {
  const lines = text.split('\n').filter(line => line.trim());
  const comments = [];

  lines.forEach((line, index) => {
    // Формат 1: @username: текст
    let match = line.match(/^@?(\w+):\s*(.+)$/);
    if (match) {
      comments.push({
        username: match[1],
        text: match[2],
        avatar: match[1][0].toUpperCase(),
        hasTags: /@\w+/.test(match[2]),
      });
      return;
    }

    // Формат 2: username | текст
    match = line.match(/^(\w+)\s*\|\s*(.+)$/);
    if (match) {
      comments.push({
        username: match[1],
        text: match[2],
        avatar: match[1][0].toUpperCase(),
        hasTags: /@\w+/.test(match[2]),
      });
      return;
    }

    // Формат 3: просто username (якщо текст порожній)
    match = line.match(/^@?(\w+)$/);
    if (match) {
      comments.push({
        username: match[1],
        text: '',
        avatar: match[1][0].toUpperCase(),
        hasTags: false,
      });
    }
  });

  return comments;
}

// ============================================
// УТИЛІТИ
// ============================================

/**
 * Нормалізація коментарів до єдиного формату
 * @param {Array} comments - Сирі дані коментарів
 * @returns {Array} - Нормалізовані коментарі
 */
function normalizeComments(comments) {
  if (!Array.isArray(comments)) {
    return [];
  }

  return comments.map(comment => {
    const username = comment.username || comment.user?.username || comment.owner?.username || 'unknown';
    const text = comment.text || comment.comment || comment.content || '';
    
    return {
      username,
      text,
      avatar: username[0]?.toUpperCase() || '?',
      hasTags: /@\w+/.test(text),
      timestamp: comment.timestamp || comment.created_time || Date.now(),
    };
  });
}

/**
 * Витягти ID поста з URL Instagram
 * @param {string} url - URL поста
 * @returns {string|null} - ID поста або null
 */
function extractPostId(url) {
  // Формати:
  // https://www.instagram.com/p/CODE/
  // https://www.instagram.com/reel/CODE/
  // https://www.instagram.com/tv/CODE/
  
  const match = url.match(/instagram\.com\/(?:p|reel|tv)\/([^/?]+)/);
  return match ? match[1] : null;
}

/**
 * Конвертація короткого коду поста в медіа ID
 * (потрібно для Graph API)
 */
function shortcodeToMediaId(shortcode) {
  // Це складна конвертація, краще використовувати бекенд
  console.warn('Конвертація shortcode → mediaId потребує додаткової логіки');
  return shortcode;
}

// ============================================
// ГОЛОВНА ФУНКЦІЯ
// ============================================

/**
 * Універсальна функція для отримання коментарів
 * Автоматично вибирає найкращий доступний метод
 * @param {string} postUrl - URL поста Instagram
 * @param {string} method - Метод: 'auto', 'backend', 'rapidapi', 'graphapi'
 * @returns {Promise<Array>} - Масив коментарів
 */
async function getInstagramComments(postUrl, method = 'auto') {
  console.log(`Завантаження коментарів з ${postUrl} методом: ${method}`);

  // Перевірка URL
  if (!postUrl.includes('instagram.com')) {
    throw new Error('Невалідний URL Instagram');
  }

  // Вибір методу
  if (method === 'auto') {
    // Спробувати методи по черзі
    try {
      return await fetchCommentsViaBackend(postUrl);
    } catch (e1) {
      console.warn('Backend не доступний, пробуємо RapidAPI...');
      try {
        return await fetchCommentsViaRapidAPI(postUrl);
      } catch (e2) {
        console.warn('RapidAPI не налаштовано');
        throw new Error('Немає доступних методів для завантаження коментарів');
      }
    }
  }

  // Конкретний метод
  switch (method) {
    case 'backend':
      return await fetchCommentsViaBackend(postUrl);
    case 'rapidapi':
      return await fetchCommentsViaRapidAPI(postUrl);
    case 'graphapi':
      const postId = extractPostId(postUrl);
      return await fetchCommentsViaGraphAPI(postId);
    default:
      throw new Error(`Невідомий метод: ${method}`);
  }
}

// ============================================
// ЕКСПОРТ
// ============================================

// Для використання в HTML
if (typeof window !== 'undefined') {
  window.InstagramAPI = {
    getComments: getInstagramComments,
    parseManualComments,
    extractPostId,
    CONFIG,
  };
}

// Для Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getInstagramComments,
    parseManualComments,
    fetchCommentsViaBackend,
    fetchCommentsViaRapidAPI,
    fetchCommentsViaGraphAPI,
    extractPostId,
    normalizeComments,
  };
}

