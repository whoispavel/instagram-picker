/**
 * Instagram Comment Picker - Bookmarklet Script
 * Витягує коментарі прямо з DOM Instagram сторінки
 */

(function() {
  'use strict';

  // Перевірка чи ми на Instagram
  if (!window.location.hostname.includes('instagram.com')) {
    alert('⚠️ Цей інструмент працює тільки на сторінках Instagram!\n\nВідкрийте пост Instagram і спробуйте знову.');
    return;
  }

  // Витягнути коментарі з DOM
  function extractComments() {
    const comments = [];
    const seen = new Set();

    // Селектори для коментарів (Instagram часто міняє структуру)
    const selectors = [
      'ul ul li',
      'div[role="button"] > div',
      'article ul li',
    ];

    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      
      elements.forEach(el => {
        try {
          // Знайти username
          const userLink = el.querySelector('a[href*="/"]');
          const username = userLink ? userLink.innerText.trim().replace('@', '') : null;
          
          if (!username || username.length > 30 || username.length < 2) return;
          
          // Знайти текст коментаря
          const spans = el.querySelectorAll('span');
          let text = '';
          
          for (const span of spans) {
            const spanText = span.innerText || span.textContent || '';
            if (spanText && spanText !== username && spanText.length > 0 && spanText.length < 2000) {
              text = spanText.trim();
              break;
            }
          }
          
          // Уникнути дублікатів
          const key = `${username}:${text}`;
          if (seen.has(key)) return;
          seen.add(key);
          
          comments.push({
            username,
            text,
            avatar: username[0].toUpperCase(),
            hasTags: /@\w+/.test(text),
          });
        } catch (err) {
          // Ігнорувати помилки окремих елементів
        }
      });
    });

    return comments;
  }

  // Створити UI панель
  function createUI(comments) {
    // Видалити стару панель якщо є
    const oldPanel = document.getElementById('ig-picker-panel');
    if (oldPanel) oldPanel.remove();

    // Створити панель
    const panel = document.createElement('div');
    panel.id = 'ig-picker-panel';
    panel.innerHTML = `
      <style>
        #ig-picker-panel {
          position: fixed;
          top: 20px;
          right: 20px;
          width: 400px;
          max-height: 80vh;
          background: #fff;
          border-radius: 16px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          z-index: 999999;
          font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif;
          overflow: hidden;
          color: #1a1a1a;
        }
        
        #ig-picker-header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        #ig-picker-close {
          background: rgba(255, 255, 255, 0.2);
          border: none;
          color: white;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          cursor: pointer;
          font-size: 20px;
          line-height: 1;
        }
        
        #ig-picker-close:hover {
          background: rgba(255, 255, 255, 0.3);
        }
        
        #ig-picker-body {
          padding: 20px;
          max-height: calc(80vh - 140px);
          overflow-y: auto;
        }
        
        .ig-stat {
          display: flex;
          justify-content: space-between;
          padding: 12px;
          background: #f8f9fa;
          border-radius: 8px;
          margin-bottom: 8px;
        }
        
        .ig-stat-value {
          font-weight: 700;
          color: #667eea;
          font-size: 20px;
        }
        
        .ig-filter {
          margin: 16px 0;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .ig-filter input {
          width: 18px;
          height: 18px;
        }
        
        .ig-comment {
          padding: 12px;
          background: #f8f9fa;
          border-radius: 8px;
          margin: 8px 0;
          font-size: 14px;
        }
        
        .ig-comment.filtered {
          opacity: 0.4;
        }
        
        .ig-username {
          font-weight: 600;
          color: #667eea;
          margin-bottom: 4px;
        }
        
        .ig-btn {
          width: 100%;
          padding: 16px;
          border: none;
          border-radius: 8px;
          font-weight: 700;
          font-size: 16px;
          cursor: pointer;
          margin-top: 16px;
          transition: all 0.2s;
        }
        
        .ig-btn-primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }
        
        .ig-btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
        }
        
        .ig-winner {
          text-align: center;
          padding: 24px;
          background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
          border-radius: 12px;
          margin: 16px 0;
        }
        
        .ig-winner-avatar {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 36px;
          font-weight: 700;
          margin: 0 auto 16px;
        }
        
        .ig-winner-username {
          font-size: 24px;
          font-weight: 700;
          color: #667eea;
          margin-bottom: 8px;
        }
        
        .ig-winner-text {
          color: #666;
          font-size: 14px;
        }
      </style>
      
      <div id="ig-picker-header">
        <div>
          <div style="font-size: 18px; font-weight: 700;">🎉 Comment Picker</div>
          <div style="font-size: 12px; opacity: 0.9;">Instagram Giveaway</div>
        </div>
        <button id="ig-picker-close">×</button>
      </div>
      
      <div id="ig-picker-body">
        <div class="ig-stat">
          <span>Всього коментарів:</span>
          <span class="ig-stat-value" id="ig-total">0</span>
        </div>
        <div class="ig-stat">
          <span>Унікальних учасників:</span>
          <span class="ig-stat-value" id="ig-unique">0</span>
        </div>
        
        <div style="margin: 20px 0; padding-top: 16px; border-top: 2px solid #e0e0e0;">
          <strong style="display: block; margin-bottom: 12px;">⚙️ Фільтри:</strong>
          <label class="ig-filter">
            <input type="checkbox" id="ig-filter-duplicates" checked>
            <span>Видалити дублікати користувачів</span>
          </label>
          <label class="ig-filter">
            <input type="checkbox" id="ig-filter-tags">
            <span>Тільки з тегами друзів (@...)</span>
          </label>
        </div>
        
        <div id="ig-comments-list" style="margin: 16px 0;"></div>
        
        <div id="ig-winner-container"></div>
        
        <button class="ig-btn ig-btn-primary" id="ig-select-winner">
          🎲 ВИБРАТИ ПЕРЕМОЖЦЯ
        </button>
      </div>
    `;

    document.body.appendChild(panel);

    // State
    let allComments = comments;
    let filteredComments = [];

    // Elements
    const totalEl = document.getElementById('ig-total');
    const uniqueEl = document.getElementById('ig-unique');
    const listEl = document.getElementById('ig-comments-list');
    const winnerContainer = document.getElementById('ig-winner-container');
    const filterDuplicates = document.getElementById('ig-filter-duplicates');
    const filterTags = document.getElementById('ig-filter-tags');
    const selectWinnerBtn = document.getElementById('ig-select-winner');
    const closeBtn = document.getElementById('ig-picker-close');

    // Apply filters
    function applyFilters() {
      filteredComments = [...allComments];

      // Видалити дублікати
      if (filterDuplicates.checked) {
        const seen = new Set();
        filteredComments = filteredComments.filter(c => {
          if (seen.has(c.username)) return false;
          seen.add(c.username);
          return true;
        });
      }

      // Тільки з тегами
      if (filterTags.checked) {
        filteredComments = filteredComments.filter(c => c.hasTags);
      }

      updateUI();
    }

    // Update UI
    function updateUI() {
      totalEl.textContent = allComments.length;
      const unique = new Set(allComments.map(c => c.username)).size;
      uniqueEl.textContent = unique;

      // Показати перших 5 коментарів
      listEl.innerHTML = `
        <div style="font-size: 13px; color: #666; margin-bottom: 8px;">
          Учасників після фільтрації: <strong>${filteredComments.length}</strong>
        </div>
        ${filteredComments.slice(0, 5).map(c => `
          <div class="ig-comment">
            <div class="ig-username">@${c.username}</div>
            <div style="color: #666; font-size: 13px;">${c.text.substring(0, 100)}${c.text.length > 100 ? '...' : ''}</div>
          </div>
        `).join('')}
        ${filteredComments.length > 5 ? `<div style="text-align: center; color: #999; font-size: 13px; margin-top: 8px;">...і ще ${filteredComments.length - 5}</div>` : ''}
      `;
    }

    // Select winner
    selectWinnerBtn.addEventListener('click', () => {
      if (filteredComments.length === 0) {
        alert('❌ Немає учасників! Змініть фільтри.');
        return;
      }

      const winner = filteredComments[Math.floor(Math.random() * filteredComments.length)];
      
      winnerContainer.innerHTML = `
        <div class="ig-winner">
          <div class="ig-winner-avatar">${winner.avatar}</div>
          <div class="ig-winner-username">@${winner.username}</div>
          <div class="ig-winner-text">${winner.text}</div>
        </div>
      `;

      // Конфетті
      createConfetti();
    });

    // Confetti
    function createConfetti() {
      for (let i = 0; i < 30; i++) {
        setTimeout(() => {
          const confetti = document.createElement('div');
          confetti.style.cssText = `
            position: fixed;
            width: 10px;
            height: 10px;
            background: ${['#667eea', '#764ba2', '#48bb78', '#f6ad55'][Math.floor(Math.random() * 4)]};
            top: 100px;
            left: ${Math.random() * window.innerWidth}px;
            z-index: 9999999;
            animation: confettiFall 3s ease-out forwards;
            pointer-events: none;
          `;
          document.body.appendChild(confetti);
          setTimeout(() => confetti.remove(), 3000);
        }, i * 30);
      }
    }

    // Add confetti animation
    if (!document.getElementById('ig-picker-animations')) {
      const style = document.createElement('style');
      style.id = 'ig-picker-animations';
      style.textContent = `
        @keyframes confettiFall {
          to {
            transform: translateY(${window.innerHeight}px) rotate(360deg);
            opacity: 0;
          }
        }
      `;
      document.head.appendChild(style);
    }

    // Event listeners
    filterDuplicates.addEventListener('change', applyFilters);
    filterTags.addEventListener('change', applyFilters);
    closeBtn.addEventListener('click', () => panel.remove());

    // Initial render
    applyFilters();
  }

  // Витягти коментарі
  console.log('🔍 Витягування коментарів з Instagram...');
  const comments = extractComments();

  if (comments.length === 0) {
    alert('❌ Коментарі не знайдені!\n\n✅ Спробуйте:\n1. Прокрутити вниз для завантаження коментарів\n2. Натиснути "Показати більше коментарів"\n3. Запустити bookmarklet знову');
    return;
  }

  console.log(`✅ Знайдено ${comments.length} коментарів`);
  createUI(comments);

})();

