# 🚀 ДЕПЛОЙ НА RENDER.COM - ГОТОВО ДО ЗАПУСКУ

## ✅ Що зроблено:

1. ✅ Код запушено на GitHub: https://github.com/whoispavel/instagram-picker
2. ✅ Видалено всі дзеркала WASK сайту (460 файлів)
3. ✅ Залишено тільки Instagram Picker (18 файлів)
4. ✅ Конфігурація Render готова

---

## 🎯 ЗАРАЗ НА ЕКРАНІ RENDER:

### Виправте ці поля:

#### Build Command:
```
npm install
```
(видаліть `; npm run build`)

#### Start Command:
```
node server.js
```
(залиште як є)

#### Instance Type:
Виберіть **Free** ($0/month)

---

## ⏭️ ПОТІМ:

1. Прокрутіть вниз
2. Натисніть **"Create Web Service"** або **"Deploy"**
3. Почекайте 5-10 хвилин

---

## ✅ Після деплою:

Ви отримаєте URL типу:
```
https://instagram-picker.onrender.com
```

### Перевірте що працює:
```bash
curl https://instagram-picker.onrender.com/health
```

---

## 🎨 ФРОНТЕНД (наступний крок):

### Варіант 1: Vercel (рекомендується)

```bash
# Встановити Vercel CLI
npm install -g vercel

# Деплой
cd "/Users/pavellizov/Desktop/Main_1/КСЮША РАБОТОДАТЕЛЬ/скам/us.sitesucker.mac.sitesucker-pro/www.wask.co"
vercel
```

### Варіант 2: Netlify Drop
1. Відкрийте: https://app.netlify.com/drop
2. Перетягніть **picker-local.html**
3. Готово!

### Перед деплоєм фронтенду:

Оновіть в `picker-local.html` (рядок ~628):
```javascript
let useRealAPI = true;
const API_URL = 'https://instagram-picker.onrender.com'; // Ваш URL з Render
```

---

## 📊 Фінальна структура:

```
✅ Бекенд (server.js) → Render.com
✅ Фронтенд (picker-local.html) → Vercel/Netlify
```

---

**ПРОДОВЖУЙТЕ ДЕПЛОЙ НА RENDER! Натисніть "Create Web Service"** 🚀

