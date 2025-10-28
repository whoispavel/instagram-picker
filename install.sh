#!/bin/bash

# Instagram Comment Picker - Installation Script

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║   🎉 Instagram Comment Picker - Встановлення             ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Перевірка Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js не встановлено"
    echo "📥 Встановіть Node.js з https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v)
echo "✅ Node.js: $NODE_VERSION"

# Перевірка npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm не встановлено"
    exit 1
fi

NPM_VERSION=$(npm -v)
echo "✅ npm: $NPM_VERSION"
echo ""

# Встановлення залежностей
echo "📦 Встановлення залежностей..."
npm install

if [ $? -eq 0 ]; then
    echo ""
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║                                                           ║"
    echo "║   ✅ Встановлення завершено успішно!                     ║"
    echo "║                                                           ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo ""
    echo "🚀 Запустіть бекенд:"
    echo "   npm start"
    echo ""
    echo "🌐 Відкрийте інтерфейс:"
    echo "   http://localhost:8080/www.wask.co/picker-local.html"
    echo ""
else
    echo ""
    echo "❌ Помилка встановлення"
    echo "Спробуйте вручну: npm install"
    exit 1
fi

