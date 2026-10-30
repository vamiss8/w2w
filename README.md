# w2w

What to watch on a date · Что посмотреть на свидании

[English](#english) · [Русский](#russian)

---

# ENGLISH

A small site for the two of us, Vika and Vlad: the films and series we want to
watch, the ones we watched and how we liked them, our wishlists, and a log of
everything we did there. Anyone with the address can read the lists; only the
two of us can change anything.

The site: https://w2w-35k.pages.dev

## What it does

- **Two lists**, not watched yet and watched already. A card has a state
  (planned, started, watched), dates, and a status of two digits, Vika's and
  Vlad's, where a 1 means that one of us had seen it before.
- **Hearts.** Each of us rates a watched card out of ten, in our own row only.
- **Comments**, one per card for each of us. They also keep how far into a
  series we are, an entry per evening (`9.25.2026 - ep2;`), and **+1** on a
  started card writes the next one down.
- **Search, filters and a pick for tonight**: one card at random from what the
  list shows.
- **Wishlists**, only for the two of us: a wish can be ticked off, edited, and
  carry as many links as it needs.
- **Activity**: everything we did, a day at a time, the same thing done again
  folded into one line.
- **Stats**: how many, month by month, our hearts, the ones we loved most and
  the ones we saw differently.

Every change shows up in the other browser as it is made.

## How it works

A static site with no build step: `index.html`, `style.css`, ES modules in
`src/`, and supabase-js in `vendor/`. Cloudflare Pages serves the repository
as it is, with the headers in `_headers`.

Everything else is Supabase: Postgres with row level security, realtime, and
sign-in by magic link.

```
browser                                     supabase
  src/db.js   ─── queries (rest/v1) ───────►  tables, row level security
  src/sync.js ◄── every change (realtime) ──  cards, logs, wishes, comments
  src/user.js ─── magic link (auth/v1) ────►  a session; app_user() says whose
```

Who may do what is decided by the database, not by the page. A guest reads the
cards and the activity. The two of us are the emails in `public.members`, and
only a session with one of them can change anything. Comments and wishlists
are ours alone, and every log line is signed by the database with whoever
wrote it.

## Layout

```
index.html        the page: every section and every dialog
style.css         the whole look, written for a phone first
src/
├── main.js       the entry point
├── db.js         every query, and the one supabase client
├── store.js      the cards and comments the page knows
├── sync.js       realtime, and a full pull on every reconnect
├── lists.js      the two lists: order, filters, drawing
├── cards.js      one card
├── router.js     the sections and their addresses
├── user.js       the magic link and who is signed in
├── version.js    says when the database is behind the page
└── ...           one module per feature: wishlists, activity, stats...
vendor/           supabase-js, served by the site itself
db/
├── schema.sql    the whole database, for a fresh project
└── migrations/   how the live one got here, one step at a time
tests/            the checks, below
_headers          the security headers cloudflare pages adds
```

## Running it

There is nothing to build. Any static server over the repository will do:

```bash
python -m http.server 5500
```

Then open http://localhost:5500. The page talks to the live database: reading
as a guest changes nothing, and a magic link brings you back to an address
only if Supabase allows it (Authentication, URL Configuration).

## The database

A fresh project starts from `db/schema.sql`, run in the SQL editor. Our two
emails go into `public.members` by hand, since the repository is public:

```sql
insert into public.members (email, name) values ('...', 'vlad'), ('...', 'vika');
```

Then, in the dashboard: the two users created by hand, sign-ups off, and the
site's address among the redirect URLs.

A change to the database is three things in one pull request: a new file in
`db/migrations`, the same change in `db/schema.sql`, and the number in
`public.schema_version()` and in `src/version.js` raised to the new file's.
The migration runs in the SQL editor right before that pull request is
merged. If it does not, the page tells one of us which one is missing.

## Checks

Everything lives in `tests/` and runs on every pull request
(`.github/workflows/ci.yml`):

```bash
cd tests
```

```bash
npm ci
```

```bash
npx playwright install chromium
```

```bash
npm test
```

- **lint**: ESLint over `src/` and `tests/`.
- **db**: the SQL on PGlite, Postgres compiled to WebAssembly. The migrations
  have to add up to `db/schema.sql`, keep every row of data shaped like ours,
  and let each of us, a guest and a stranger do exactly what they should.
- **e2e**: the site in Chromium against a stand-in for Supabase that lives in
  the page (`tests/fake/supabase.js`), on synthetic data from
  `tests/fixtures`. The site is served with the headers from `_headers`, and a
  test fails if the content security policy turned anything down.

Nothing in the checks reaches the real database.

## Third-party code

supabase-js by Supabase, MIT; the fonts from Google Fonts, SIL Open Font
License. Details in [THIRD_PARTY.md](THIRD_PARTY.md).

---

# RUSSIAN

Небольшой сайт для нас двоих, Вики и Влада: фильмы и сериалы, которые мы хотим
посмотреть, те, что посмотрели, и как они нам понравились, наши вишлисты и
журнал всего, что мы там делали. Читать списки может любой, у кого есть адрес;
менять что-либо можем только мы вдвоём.

Сайт: https://w2w-35k.pages.dev

## Что он умеет

- **Два списка**: ещё не посмотренное и уже посмотренное. У карточки есть
  состояние (planned, started, watched), даты и статус из двух цифр, Викиной и
  Влада, где 1 значит, что этот из нас уже видел её раньше.
- **Сердечки.** Каждый из нас оценивает посмотренную карточку из десяти, только
  в своей строке.
- **Комментарии**, по одному на карточку у каждого из нас. В них же хранится,
  докуда мы досмотрели сериал, по записи на вечер (`9.25.2026 - ep2;`), а
  **+1** на начатой карточке дописывает следующую.
- **Поиск, фильтры и выбор на вечер**: одна случайная карточка из тех, что
  показывает список.
- **Вишлисты**, только для нас двоих: желание можно отметить сбывшимся,
  отредактировать и дать ему сколько угодно ссылок.
- **Активность**: всё, что мы делали, по дням, а одно и то же действие подряд
  свёрнуто в одну строку.
- **Статистика**: сколько и по месяцам, наши сердечки, самое любимое и то, в
  чём мы разошлись.

Каждое изменение появляется в другом браузере в момент, когда его сделали.

## Как это устроено

Статический сайт без сборки: `index.html`, `style.css`, ES-модули в `src/` и
supabase-js в `vendor/`. Cloudflare Pages раздаёт репозиторий как есть, с
заголовками из `_headers`.

Всё остальное — Supabase: Postgres с row level security, realtime и вход по
magic link.

```
браузер                                     supabase
  src/db.js   ─── запросы (rest/v1) ───────►  таблицы, row level security
  src/sync.js ◄── каждое изменение (realtime)  cards, logs, wishes, comments
  src/user.js ─── magic link (auth/v1) ────►  сессия; app_user() говорит чья
```

Кто что может, решает база, а не страница. Гость читает карточки и активность.
Мы двое — это адреса в `public.members`, и что-то изменить может только сессия
с одним из них. Комментарии и вишлисты только наши, а каждую строку журнала
база подписывает тем, кто её написал.

## Структура

```
index.html        страница: все разделы и все диалоги
style.css         весь внешний вид, написан сначала под телефон
src/
├── main.js       точка входа
├── db.js         все запросы и единственный клиент supabase
├── store.js      карточки и комментарии, которые знает страница
├── sync.js       realtime и полная подгрузка при каждом переподключении
├── lists.js      два списка: порядок, фильтры, отрисовка
├── cards.js      одна карточка
├── router.js     разделы и их адреса
├── user.js       magic link и кто вошёл
├── version.js    говорит, когда база отстаёт от страницы
└── ...           по модулю на функцию: вишлисты, активность, статистика...
vendor/           supabase-js, который раздаёт сам сайт
db/
├── schema.sql    вся база целиком, для нового проекта
└── migrations/   как сюда пришла живая база, шаг за шагом
tests/            проверки, ниже
_headers          заголовки безопасности, которые добавляет cloudflare pages
```

## Запуск

Собирать нечего. Подойдёт любой статический сервер поверх репозитория:

```bash
python -m http.server 5500
```

Потом открыть http://localhost:5500. Страница ходит в живую базу: чтение
гостем ничего не меняет, а magic link вернёт на адрес, только если Supabase его
разрешает (Authentication, URL Configuration).

## База

Новый проект начинается с `db/schema.sql`, выполненного в SQL-редакторе. Наши
два адреса вносятся в `public.members` руками, потому что репозиторий
публичный:

```sql
insert into public.members (email, name) values ('...', 'vlad'), ('...', 'vika');
```

Потом в панели: двое пользователей, созданных руками, выключенная регистрация и
адрес сайта среди redirect URLs.

Изменение базы — это три вещи в одном пул-реквесте: новый файл в
`db/migrations`, то же изменение в `db/schema.sql` и номер в
`public.schema_version()` и в `src/version.js`, поднятый до номера нового
файла. Миграция выполняется в SQL-редакторе прямо перед тем, как этот
пул-реквест смержен. Если нет, страница скажет одному из нас, какой не хватает.

## Проверки

Всё лежит в `tests/` и запускается на каждый пул-реквест
(`.github/workflows/ci.yml`):

```bash
cd tests
```

```bash
npm ci
```

```bash
npx playwright install chromium
```

```bash
npm test
```

- **lint**: ESLint по `src/` и `tests/`.
- **db**: SQL на PGlite, Postgres, скомпилированном в WebAssembly. Миграции
  должны сходиться к `db/schema.sql`, сохранять каждую строку данных, устроенных
  как наши, и давать каждому из нас, гостю и чужому ровно то, что положено.
- **e2e**: сайт в Chromium против заменителя Supabase, который живёт в самой
  странице (`tests/fake/supabase.js`), на выдуманных данных из
  `tests/fixtures`. Сайт раздаётся с заголовками из `_headers`, и тест падает,
  если content security policy что-то заблокировала.

Ничто в проверках не ходит в настоящую базу.

## Сторонний код

supabase-js от Supabase, MIT; шрифты из Google Fonts, SIL Open Font License.
Подробности в [THIRD_PARTY.md](THIRD_PARTY.md).

---

## License

All rights reserved · Все права защищены
