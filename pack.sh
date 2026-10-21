#!/usr/bin/env sh
# Сборка для ВК: копирует игру в dist/ и упаковывает в durak-neon.zip
# (index.html лежит в корне архива — так требует хостинг мини-приложений).
set -e
cd "$(dirname "$0")"
rm -rf dist durak-neon.zip
mkdir -p dist/js/vendor
cp index.html style.css dist/
cp js/*.js dist/js/
cp js/vendor/* dist/js/vendor/
(cd dist && zip -qr ../durak-neon.zip .)
echo "Готово: папка dist/ и архив durak-neon.zip ($(du -h durak-neon.zip | cut -f1))"
