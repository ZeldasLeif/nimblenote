# NimbleNote

A command line for everyday life. One input box: the first characters decide whether you **store** a fact, **retrieve** something, **calculate**, or **trigger** an action.

- Local-first: no accounts, no backend, no network calls, no ads, no analytics, no AI. Everything is rule-based and deterministic.
- Fast: opens with the keyboard up, shows what Enter will do while you type, evaluates math live, and shows one best answer only when it is clearly right.
- Built with React Native + Expo **SDK 57** (TypeScript), runs in **Expo Go** on Android. (SDK 57 because the Play Store Expo Go does not support SDK 58 yet; moving up later is a version bump.)

---

## 1. Run it on your Android phone (Windows)

### One-time setup

1. **Node.js**: install the current **LTS** (22.x or 24.x) from <https://nodejs.org> (Windows Installer, `.msi`). Accept the defaults.
   Check in a new PowerShell window:
   ```powershell
   node -v
   npm -v
   ```
2. **Git**: install from <https://git-scm.com/download/win> (defaults are fine).
3. **Expo Go**: on your phone, install **Expo Go** from the Google Play Store. Update it to the current Play Store version (it must support SDK 57).

### Get the code and start

```powershell
git clone https://github.com/zeldasleif/nimblenote.git
cd nimblenote
git checkout claude/affectionate-babbage-9thwz1   # until this branch is merged
npm install
npx expo start
```

A QR code appears in the terminal.

4. Make sure the phone and the PC are on the **same Wi-Fi** network.
5. Open **Expo Go** → **Scan QR code** → scan the code from the terminal. The app builds (first time ~30 s) and opens with the keyboard up.
6. If Windows Firewall asks about Node.js, allow it on **Private networks**.

**Can't connect?** (guest Wi-Fi, VPN, company network, or the QR loads forever) use the tunnel:

```powershell
npx expo start --tunnel
```

Accept the prompt to install `@expo/ngrok`. The tunnel is slower but works across networks. Press `r` in the terminal to reload the app, `j` for the debugger.

> How this project was created, for reference (you don't need to run it):
> `npx create-expo-app@latest nimblenote --template blank-typescript`, then the Expo Go-bundled versions of
> expo-sqlite, expo-notifications, expo-local-authentication, expo-secure-store, expo-location,
> expo-image-picker, expo-file-system, expo-crypto, expo-sharing, expo-document-picker, expo-clipboard,
> expo-haptics, react-native-reanimated, react-native-gesture-handler and react-native-safe-area-context.
> `.npmrc` sets `legacy-peer-deps=true` because one Expo package declares a peer range that does not include the
> worklets version Expo Go actually bundles; without it npm nests packages and Jest breaks.

### Tests and type checks

```powershell
npm test            # 159 Jest tests: parser, calculator, dates, matching, SQLite store, and a full UI flow
npm run typecheck   # tsc --noEmit
npm run check       # both
```

The store tests use Node's built-in SQLite (`node:sqlite`, Node 22.5+). You will see an "ExperimentalWarning: SQLite" line; that is expected.

---

## 2. Grammar reference

| You type | What happens | Needs Enter |
|---|---|---|
| `groceries` | Read. Shows the one best match live (card under the input). Enter opens it or lists all results. | Enter = full results |
| `dad birthday` · `birthday dad` · `when is my dad's birthday?` | Same answer: filler words (when, is, my, the, what, where, …) are dropped, plurals and possessives normalized, order ignored. | |
| `+ groceries eggs, milk, olive oil` | Write: adds 3 items. First write creates the list. Splits on commas, `;` and the word **and**, never on spaces ("olive oil" stays one item). Text is stored exactly as typed, no autocorrect. | yes |
| `add …` / `new …` | Same as `+`. `add to groceries eggs` works too (a leading "to" is ignored), as does `add eggs to groceries` for existing lists. `new list groceries` creates the list, or, if it exists, adds to it with a one-line note. | yes |
| `+groceries eggs:5, flour:1kg, water:200ml` | Amounts: `item:amount` stores the amount in its own column. Writing an item that is already on the list with a new amount updates it. In a brand-new category write it tight (`eggs:5`); `pin: 4533` with a space is a fact. | yes |
| `+ bank pin: 4533` | Fact: a colon separates key (`pin`) and value (`4533`) in category `bank`. | yes |
| `+pw bankpin2 4321` | Fact without colon: the last token is the value if it looks like one (number, date, time, code with digits, email, phone). `pw` is an alias for `passwords`. | yes |
| `+ movies the matrix` | Last token is not value-like → list items. | yes |
| `+ keys sofa` | Where's-what: records "keys are at sofa" with a timestamp. Built-in items (keys, wallet, glasses, passport, phone, car, …) and any text starting with in/on/under/behind/… (`+ remote under the couch`) are locations. Force it with `+loc drill garage`. | yes |
| `keys` · `where keys` | Latest location and how long ago. Opening it shows history and one-tap chips of your most frequent recent spots. | |
| `5+5` · `(2+3)*4` · `10 % 3` · `200*10%` | Calculator, evaluated live. `+ - * / %` (binary `%` = modulo, trailing `%` = percent), parentheses, `x` `×` `÷`. Enter replaces the input with the result. No `eval`. | |
| `n called landlord` (or `r …`) | Timestamped note. | yes |
| `n today` · `n yesterday` · `n last week` · `n this month` · `n monday` · `n last 3 days` · `n` | Notes in that range (weeks start Monday; "last week" = previous Mon–Sun). | |
| `timer 1` · `t 5` · `t 1h30m tea` | Timer. Bare numbers are minutes; `90s`, `30m`, `1h`, `1h30m`, `1.5h`, `10 min` all work. | yes |
| `a water plants 1h` · `a 7:30 wake up` · `alarm 7pm` | Alarm/timer with a label, after a duration or at the next clock time. | yes |
| `loc` | Current coordinates and street address (if available). "Save as note" stores it. | yes |
| `photo keys` | Opens the camera; the photo is attached to `keys` and shown with it. | yes |
| `l` · `l groceries` | All categories · open one directly (also works for names that clash with commands). | |
| `undo` · `settings` · `help` | Commands. | |

**Reserved names.** `l a t n r` and words like `timer`, `note`, `loc`, `photo` are commands. Creating a category with such a name works, but the preview warns you and you open it with `l <name>`.

**Reading is forgiving, writing is strict.** Reads tolerate word order, filler words, plurals, possessives and partial last words. Writes never change your text, never merge words and never create a second category with the same name (`Groceries`, `grocery` and `groceries` are the same category).

**Category type** (list, facts, location) is set by the first entry and can be switched in the hidden menu.

**Layout and gestures.** The app name stays at the top; the input sits directly on the keyboard, and answers appear just above it (centered card: bold name, one labelled line such as "Location: bathroom"). Every entry is its own command: after saving, the input is a normal command line again. Swipe a result card **left** to throw it off the screen (it is only hidden, nothing is deleted). Swipe **right** on the empty home screen for "Your lists" (all categories); swipe left or tap the title to come back. `l` opens it too.

**Delete and edit.** Swipe an entry left, or long-press it for Edit / Copy / Delete. Every write and delete shows an Undo button; `undo` also works. Tap a category's title (or `⋯`) for the hidden menu: rename, change type, split on spaces, hide & encrypt, photo, delete.

**Aliases.** Built-in: `pw pwd pass password pin → passwords`, `bday birthday → birthdays`, `addr address → addresses`, `shopping shop grocery → groceries`, `todos to-do → todo`. Add or remove your own in Settings.

---

## 3. Features and settings

- Lists, facts, locations, timestamped notes, timers/alarms, `loc`, photos, as above.
- **Settings** (⚙ or type `settings`): Theme (System / Light / Dark, persisted), Show answers while typing (On / On Enter only, default On), Animations (Smooth / Minimal / Off, default Smooth; automatically Off when Android's "Remove animations" is on), App lock, street-address lookup, alias editor, per-list "split on spaces", JSON export / import, delete all (two taps, undoable), and the measured startup time.
- **Optional lock.** App lock asks for fingerprint / face / device PIN on open and after 5 minutes in the background. Categories can be marked hidden; `passwords` is hidden by default. Hidden values are shown as `••••••` until you authenticate (valid for 60 s, values re-hide after 30 s).

### Security, honestly

- Hidden values are encrypted at rest with AES-256-GCM (`expo-crypto`). The key is generated on the phone and stored in `expo-secure-store` (Android Keystore-backed).
- Names, list items, keys and everything not marked hidden are stored **unencrypted** in the app's private SQLite database. Android's app sandbox protects it from other apps, not from someone with root access or your unlocked phone and enough time.
- The key is **not** tied to your fingerprint: the app decrypts after the app-level authentication check. A rooted device or a compromised app process could read it. In Expo Go, the app runs inside Expo Go's sandbox, so its storage belongs to Expo Go.
- If the phone has no screen lock, authentication cannot be enforced; values are shown without a prompt (the settings screen tells you).
- Exports contain hidden values in **plain text** (you are asked to authenticate first). Treat export files as sensitive.
- This is a convenience feature. **NimbleNote is not a password manager**: no audited crypto design, no breach monitoring, no sync, no recovery.

---

## 4. What does not work in Expo Go, and what a development build unlocks

| Topic | In Expo Go (this prototype) | With a development build |
|---|---|---|
| Home-screen shortcut / widget that opens straight into the input | Not possible (out of scope) | App shortcuts, a widget, a quick-settings tile |
| App name and icon in the launcher | Runs inside Expo Go | Own icon, own "NimbleNote" app |
| Exact-time alarms | Local notifications are scheduled for the exact time, but without the exact-alarm permission Android delivers them on a best-effort basis. Notifications can arrive late, especially in Doze/battery saver. No full-screen alarm UI. | `SCHEDULE_EXACT_ALARM` (already declared in `app.json`), on-time delivery, alarm sound/full-screen intent |
| Remote push | Not available since SDK 53 (not used anyway) | Available (not needed) |
| Whole-database encryption (SQLCipher) | Not available; only hidden values are encrypted | `expo-sqlite` with SQLCipher |
| Cold-start speed | Includes Expo Go start and loading the JS bundle from your PC over Wi-Fi | Real release build: bundle on device, Hermes bytecode, much faster |
| Expo Go warning about `expo-notifications` | A yellow "not fully supported in Expo Go" notice can appear the first time you set a timer | Gone |

Everything else (SQLite, secure store, crypto, biometrics, location, camera, file system, sharing, document picker, clipboard, haptics, Reanimated, gesture handler) is bundled in Expo Go SDK 57 and works.

---

## 5. Performance

- The input renders on the first frame; SQLite opens after it. `SafeAreaProvider` uses initial window metrics so nothing waits for native layout. `expo-notifications` is loaded only when you set your first timer.
- Every keystroke runs the pure parser synchronously; lookups run against an in-memory index (SQLite is only for persistence), debounced 150 ms.
  Measured on Node (desktop): **~7 ms per keystroke with 12,100 documents** (parse + search + confidence check). A mid-range phone running Hermes is slower, but realistic personal data (hundreds to a few thousand entries) stays well under 100 ms.
- **Settings → About** shows "Startup to focused input" in ms, measured from the first line of app JavaScript to the input receiving focus. To verify that animations don't slow startup: set Animations to Off, force-close Expo Go, reopen, note the number; repeat with Smooth. By design nothing animates on the first frame (the home view has no entering animations), and Reanimated is loaded either way, so the numbers should match within noise. Expo Go's own start and the bundle download are not included in the number.
- Animations are Reanimated layout animations (UI thread): result cards fade in 120 ms, list items fade/slide 170 ms, deletes collapse, new items flash. The live answer card swaps with a 70 ms fade-in and no exit, so nothing chains or stacks while typing. The input, keyboard and cursor are never animated.

---

## 6. Known limitations

- **Not tested on a physical phone by the author of this prototype.** The type checker, 159 Jest tests (including a full simulated UI flow) and an Android production bundle (`npx expo export --platform android`) pass, but gestures, keyboard behaviour, permissions and notifications need a real-device pass.
- Where's-what detection uses a fixed list of item names and prepositions. `+ drill garage` (no preposition, not a known item) becomes a list called "drill" containing "garage". Reading `drill` still shows "garage", and you can switch the type in the hidden menu or use `+loc`.
- Live answers require high confidence: two-letter prefixes and ties between equally good matches show nothing until Enter. This is intentional (no flicker) but can feel conservative.
- Writes are strict: no fuzzy matching of category names on write (a typo creates a new category; delete it with undo).
- Timers live in notifications plus an in-app countdown; they can't be undone, but each has a × to cancel. Settings changes are not on the undo stack.
- The search index is rebuilt from memory after each change (fine for thousands of entries, ~150 ms on desktop at 12k entries, slower on phones at that size).
- Photos are not included in JSON export. Imports merge (no duplicates) rather than replace.
- Undo history lasts for the session; soft-deleted rows are purged 24 h after deletion on the next launch.
- English-only grammar (filler words, plurals, date words).

## 7. Proposed next step

Do a **one-week real-device pass in Expo Go**: use it daily, keep a list of the inputs that did the wrong thing, and turn each one into a parser test before changing rules. That will settle the open product questions, especially location detection (prepositions vs. explicit `+loc`) and the live-answer confidence threshold. Then build an **EAS development build** to get a launcher icon, a home-screen shortcut straight into the input, and exact-time alarms. These are the three biggest friction wins that Expo Go cannot provide.

---

## Project layout

```
index.ts, App.tsx        entry, theme/motion providers, app lock
src/core/                pure TypeScript, no React Native (parser, calc, durations, dates, matching, preview text)
src/core/__tests__/      Jest tests for the grammar
src/data/                SQLite schema, Store (memory + SQLite, undo, soft delete, encryption, export/import)
src/data/__tests__/      store tests on node:sqlite
src/services/            device features: storage instance, auth, timers, location, photos, export/import
src/ui/                  screens and components; src/ui/__tests__ has the end-to-end UI test
```
