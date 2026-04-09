# game

Локальный набор карточных игр:

- Белка
- Мю
- Подкидной дурак

В проекте есть:

- TypeScript-движки игр в `src/`
- веб-интерфейс на Vite в `web/`
- локальный auth API в `server/auth-server.js`

## Локальный запуск

Установка зависимостей:

```bash
npm install
```

Запуск фронтенда:

```bash
npm run dev
```

Запуск auth API:

```bash
node server/auth-server.js
```

Адреса по умолчанию:

- фронтенд: `http://localhost:5173/`
- auth API: `http://localhost:8787/`

## Сборка

Сборка TypeScript:

```bash
npm run build
```

Сборка веб-версии:

```bash
npm run build:web
```

## GitHub Pages

Для репозитория `https://github.com/remizovka/game` настроен workflow:

- `.github/workflows/deploy-pages.yml`

После включения GitHub Pages в режиме `GitHub Actions` сайт будет публиковаться автоматически из ветки `main`.

Ожидаемый адрес Pages:

- `https://remizovka.github.io/game/`

## Основные папки

- `src/engine/` — движок Белки
- `src/games/mu/` — движок Мю
- `src/games/durak/` — движок Дурака
- `web/src/` — фронтенд и стили
- `tests/` — тесты движков

## Git

Обычный цикл обновления:

```bash
git add .
git commit -m "Описание изменений"
git push
```
