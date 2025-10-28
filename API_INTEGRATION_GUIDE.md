# Підключення справжнього рандомайзера по коментах Instagram

## Методи інтеграції

### 🔴 Проблема: Обмеження Instagram API
Instagram **заборонив публічний доступ** до коментарів через API з 2018 року. Доступні варіанти:

---

## Варіант 1: Instagram Graph API (Офіційний, потребує бізнес-акаунту)

### Вимоги:
1. **Facebook App** з правами Instagram Basic Display або Instagram Graph API
2. **Instagram Business/Creator Account**
3. **Access Token** користувача

### Кроки підключення:

#### 1. Створіть Facebook App
```
https://developers.facebook.com/apps/
- Створити додаток → Бізнес → Instagram
- Додати продукт "Instagram Graph API"
```

#### 2. Отримайте Access Token
```javascript
// Авторизація через OAuth 2.0
const APP_ID = 'ваш_app_id';
const REDIRECT_URI = 'http://localhost:8080/callback';
const SCOPE = 'instagram_basic,instagram_manage_comments';

// URL для авторизації
const authUrl = `https://api.instagram.com/oauth/authorize?client_id=${APP_ID}&redirect_uri=${REDIRECT_URI}&scope=${SCOPE}&response_type=code`;

// Після авторизації обмінюйте code на access_token
```

#### 3. Отримайте коментарі
```javascript
async function getInstagramComments(postId, accessToken) {
  const url = `https://graph.instagram.com/${postId}/comments?fields=id,text,username,timestamp&access_token=${accessToken}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data.data; // масив коментарів
  } catch (error) {
    console.error('Помилка:', error);
    return [];
  }
}
```

**Недоліки:**
- ❌ Працює ТІЛЬКИ з вашими власними постами
- ❌ Потребує бізнес-акаунт Instagram
- ❌ Складна процедура авторизації
- ❌ Не працює з чужими постами

---

## Варіант 2: Веб-скрапінг (Не рекомендується, але працює)

### ⚠️ Увага:
- Порушує Terms of Service Instagram
- IP може бути заблокований
- Потребує обхід капчі

### Приклад з Puppeteer (Node.js):
```javascript
const puppeteer = require('puppeteer');

async function scrapeInstagramComments(postUrl) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto(postUrl, { waitUntil: 'networkidle2' });
  
  // Прокрутка для завантаження всіх коментарів
  await page.evaluate(async () => {
    const scrollContainer = document.querySelector('div[role="dialog"]');
    if (scrollContainer) {
      for (let i = 0; i < 10; i++) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  });
  
  // Витягти коментарі
  const comments = await page.evaluate(() => {
    const commentElements = document.querySelectorAll('div[role="button"] span');
    return Array.from(commentElements).map(el => ({
      username: el.closest('div').querySelector('a')?.innerText || 'unknown',
      text: el.innerText
    }));
  });
  
  await browser.close();
  return comments;
}
```

**Недоліки:**
- ❌ Потребує сервер (не працює в браузері)
- ❌ Може ламатися при оновленні Instagram
- ❌ Ризик блокування

---

## ✅ Варіант 3: Проксі-бекенд (Рекомендується)

### Архітектура:
```
[Фронтенд] → [Ваш бекенд] → [Instagram API / Scraper]
```

### Переваги:
- ✅ Приховує API ключі
- ✅ Кешування результатів
- ✅ Обхід CORS
- ✅ Rate limiting

### Приклад бекенду (Node.js + Express):
```javascript
// server.js
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Ендпоінт для отримання коментарів
app.post('/api/instagram/comments', async (req, res) => {
  const { postUrl } = req.body;
  
  try {
    // Тут ваша логіка отримання коментарів
    // (через API, scraping, або стороннй сервіс)
    
    const comments = await fetchCommentsFromInstagram(postUrl);
    res.json({ success: true, comments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(3000, () => {
  console.log('Сервер запущено на порту 3000');
});
```

---

## Варіант 4: Сторонні сервіси (Найпростіший)

### RapidAPI / Apify
Готові API для скрапінгу Instagram:

```javascript
// Приклад з RapidAPI
async function getComments(postUrl) {
  const response = await fetch('https://instagram-scraper-api.p.rapidapi.com/comments', {
    method: 'POST',
    headers: {
      'X-RapidAPI-Key': 'ваш_ключ',
      'X-RapidAPI-Host': 'instagram-scraper-api.p.rapidapi.com',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ url: postUrl })
  });
  
  return await response.json();
}
```

**Популярні сервіси:**
- [RapidAPI Instagram](https://rapidapi.com/hub) - $0-50/місяць
- [Apify Instagram Scraper](https://apify.com/apify/instagram-scraper) - Pay-as-you-go
- [ScraperAPI](https://www.scraperapi.com/) - $49+/місяць

---

## 🎯 Рекомендація для вашого кейсу

Для локального тестування і демо:
1. **Використовуйте демо-дані** (як зараз) - найпростіше
2. **Додайте можливість ручного імпорту** - користувач копіює коментарі

Для продакшну:
1. **Якщо ваш контент** → Instagram Graph API
2. **Якщо чужий контент** → Сторонній сервіс (RapidAPI/Apify)
3. **Бюджетний варіант** → Ваш бекенд + Puppeteer

---

## Додаткова інформація

### Корисні посилання:
- [Instagram Graph API Docs](https://developers.facebook.com/docs/instagram-api/)
- [Puppeteer Documentation](https://pptr.dev/)
- [RapidAPI Instagram](https://rapidapi.com/search/instagram)

### Легальні альтернативи:
- Попросити користувачів авторизуватися через Instagram
- Використовувати офіційні віджети Instagram
- Інтеграція з Instagram Partnerships API (для великих брендів)

