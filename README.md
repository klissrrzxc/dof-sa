# DOF-SA FMS

Закрытая RP-система Министерства финансов San Andreas. Next.js App Router, TypeScript strict, Supabase Auth/PostgreSQL/private Storage, Tailwind CSS. Русский интерфейс. Разработка по [ТЗ](docs/specification.md).

## Состояние

См. [фактический статус](docs/implementation-status.md) и [нормативную матрицу](docs/legal-mapping.md). Отсутствие облачных настроек не подменяется демо-входом. Реализован финансовый цикл и все шесть модулей; производственная приёмка остаётся по checklist в deployment.md. Реальные переводы и публикация на форуме не автоматизируются.

## Запуск

Node.js 24, pnpm 11.25.0. На Windows используйте `pnpm.cmd`, если PowerShell блокирует скрипты.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
# Внести URL и publishable key отдельного Supabase-проекта FMS.
pnpm dev
```

Без переменных открывается только страница входа с сообщением об отсутствии настройки. Вход не симулируется. Сервер: http://localhost:3000.

Локальный полный Supabase требует Docker Desktop:

```sh
pnpm exec supabase start
pnpm exec supabase db reset
```

CLI 3.1.0 закреплён в lockfile. Уточняйте флаги через `--help`. Локальный конфиг запрещает signup/анонимные аккаунты, включает TOTP. Настройки облачного Auth не применяются автоматически миграциями: повторите их в Dashboard.

## Проверки

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

SQL-тесты запускают миграции в PGlite/PostgreSQL с настоящими ролями и RLS; только служебные схемы Auth/Storage и JWT-контекст воспроизводятся тестовым кодом. Это не проверка работающего GoTrue, PostgREST, SMTP или облачного Storage. Playwright проверяет закрытые SSR-маршруты, заголовки, страницу входа и мобильную вёрстку. Полный авторизованный e2e требует отдельного Supabase-стенда, не продакшн.

## Структура

- `src/app`: страницы App Router, Server Actions, обработчик приглашения.
- `src/lib`: серверная сессия и модель полномочий.
- `src/components`: формы с обратной связью.
- `supabase/migrations`: SQL, индексы, защищённые функции, RLS.
- `supabase/bootstrap-admin.sql`: одноразовый ручной bootstrap владельцем.
- `tests`: модульные, SQL и браузерные проверки.
- `docs`: нормативная матрица, архитектура, статус, эксплуатация.

Инструкции развёртывания и необходимые доступы: [deployment.md](docs/deployment.md). Управление: [admin-guide.md](docs/admin-guide.md). Никаких готовых паролей или реальных финансовых seed-данных нет.
