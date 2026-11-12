# Текущий хостинг: GitHub Pages

По последнему указанию владельца используется GitHub Pages, а не Vercel. Актуальный порядок — github-pages.md. В облаке применены 13 миграций. Старые инструкции Vercel ниже сохранены как история, выполнять их для Pages не нужно.

# Текущий порядок доступа

Публичная страница /register вызывает access-request (verify_jwt=false только для приёма заявок). Edge использует управляемый service-role ключ внутри Supabase; ключ не передаётся Next.js или браузеру. Прямой GoTrue signup остаётся выключенным. Учетная запись без одобренного профиля видит только статус заявки. Пароль выбирает пользователь. SQL ограничивает частоту заявок, администратор назначает фактические права. Для нового пути SMTP не нужен: внутренний адрес id-STATIC@users.dof-sa.invalid служит идентификатором Auth, письма на него не отправляются. Старый email-вход и восстановление владельца сохранены; разделы ниже о почтовых шаблонах относятся только к legacy email-учётным записям. Для Static ID без почты потерянный пароль пока требует помощи владельца Auth; самостоятельного безопасного восстановления по одному игровому телефону нет.

# Развёртывание · актуальная поставка

Репозиторий klissrrzxc/dof-sa, ветка codex/fms-foundation. Supabase yyoodoxfyiicxgambtbr уже подключён: 12 миграций применены, RLS и приватный bucket созданы, access-request Edge Function ACTIVE (публичный приём заявок). Локальные версии миграций соответствуют облачной истории. Повторно вручную выполнять SQL не нужно. Веб-деплой Vercel пока не выполнялся.

## Локально

Node 24, pnpm 11.25.0. `pnpm install --frozen-lockfile`, `.env.local` по `.env.example`, `pnpm dev` или `pnpm build && pnpm start`. URL http://localhost:3000. URL и publishable key уже находятся в игнорируемой `.env.local` этого рабочего checkout. Service-role key для Next.js не нужен.

Для отдельного локального Supabase нужен Docker Desktop: `pnpm exec supabase start`, затем `pnpm exec supabase db reset` (сначала просмотреть `--help`; reset удаляет данные только выбранного локального стенда). Seed не создаёт учётных записей, секретов или игровых денег.

## Supabase Auth

Публичный signup и анонимные sign-ins должны быть выключены. Приложение не использует MFA по указанию владельца; локальный TOTP выключен. Облачный флаг провайдера сам по себе не даёт доступа к данным. Минимальный пароль 12 символов. Site URL — текущий origin; Redirect URLs — точные `/auth/confirm` и `/auth/callback`. Для локальной работы рекомендуется один origin localhost; не смешивать localhost и 127.0.0.1 при переходе по PKCE-письму.

Шаблон Invite user:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite">Принять приглашение</a>
```

Стандартный Reset Password template с `{{ .ConfirmationURL }}` работает через PKCE callback. Альтернатива SSR:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Установить пароль</a>
```

При `otp_expired` сотрудник открывает `/auth/recover`, запрашивает новую ссылку для существующей учётной записи и открывает последнее письмо в том же браузере/origin. Пароль задаёт лично. Не публиковать ссылки, пароль, QR/секрет TOTP или коды в чат/Git.

Приглашения отправляет Edge Function staff-invite: проверяет getUser и users.manage/AAL2 через БД; служебный ключ используется только внутри Supabase. Gateway verify_jwt=false, потому что функция самостоятельно валидирует JWT и текущие полномочия. Без сессии она возвращает 401. Для другого проекта развёрнуть исходник из supabase/functions/staff-invite. В настройках секретов Edge Function задать APP_ORIGIN на production HTTPS origin; сейчас безопасное значение по умолчанию — http://localhost:3000. Не задавать произвольный redirect из пользовательского JSON.

Для штатной отправки писем требуется production SMTP и разумные лимиты Auth. Встроенная доставка Supabase может ограничивать адресатов и частоту. Реальное приглашение нового сотрудника через эту функцию ещё не проверялось; в ходе разработки письма не отправлялись.

Security Advisor показывает отдельное WARN: Leaked Password Protection Disabled. Владелец включает проверку скомпрометированных паролей при доступности функции на тарифе: [документация защиты паролей](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Замечаний к схеме/RLS/функциям после миграций не обнаружено.

## Vercel

1. Импортировать dof-sa в Vercel, выбрать ветку codex/fms-foundation, Root Directory — корень, Next.js, Node 24.
2. Install: `pnpm install --frozen-lockfile`. Build: `pnpm build`. Добавить NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, APP_ORIGIN. Секретный service-role в Vercel не требуется.
3. APP_ORIGIN — точный HTTPS URL сайта. То же значение задать для staff-invite в Supabase Edge secrets. Обновить Auth Site URL, Redirect URLs и шаблоны писем. Preview и Production лучше использовать с разными Supabase-проектами.
4. Настроить Vercel Firewall/rate limits входа, восстановления и приглашений. БД ограничивает успешные операционные RPC 60/мин на пользователя; это не заменяет защиту от потока анонимных HTTP-запросов.
5. До допуска проверить парольный вход, подачу и одобрение заявки, приватную загрузку/скачивание, отрицательные сценарии IDOR/отзыва роли, отсутствие индексации и вывод CSV. Не включать публичный Storage или demo обход авторизации.

## Проверки

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm exec playwright install chromium`, `pnpm test:e2e`. `pnpm test:live` — чтение анонимных API/Storage/Auth settings и отказ неавторизованного staff-invite; не создаёт пользователей/денег/писем.

supabase/tests/rls-smoke.sql и workflow-smoke.sql выполняются trusted owner в транзакции с ROLLBACK. Последний предназначен для пустого казначейства до реальных операций. Он воспроизводит JWT claims на SQL-уровне и проверяет настоящие политики/транзакции; это не тест криптографической валидации GoTrue. Для concurrency/load tests нескольких PostgreSQL-сессий нужен отдельный стенд и доступ к БД.

## Backup / restore

До миграций создать backup/PITR по возможностям тарифа. БД, Auth и байты Storage сохраняются отдельно: SQL dump не содержит файлов. Копии и секреты не хранить в Git. Проверить восстановление в отдельном проекте: схема/данные/авторство/аудит, Auth UUID mapping, файлы и контрольные суммы, затем RLS и парольный вход. Записать дату, длительность и результат; RPO/RTO определяет владелец. Реальный restore drill ещё не выполнялся.

## Release checklist

- [ ] Заданы реальные RP-реквизиты, классификаторы, период, остаток и лимиты по документам.
- [ ] Регистрация/одобрение проверены; загрузка/скачивание файлов пройдены на реальном стенде.
- [ ] Выполнен тест одновременного резервирования/платежа в независимых PostgreSQL-сессиях.
- [ ] Выбрана RP timezone; до этого интерфейс явно использует UTC.
- [ ] Настроены SMTP, лимиты, проверка скомпрометированных паролей, мониторинг.
- [ ] Проверены backup/restore и production Vercel.
- [ ] Подтверждены обязательные внешние публикации/регистрация. FMS не публикует на форуме автоматически.
