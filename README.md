# Daybreak: a kind habit tracker

Daybreak is a personal habit tracker that installs on your iPhone like a native app. It's made with
plain HTML, CSS and JavaScript, with no build step, no accounts and no servers. Everything stays on
your device, and it works offline.

It's designed to be encouraging: streaks are forgiving, missed days are never counted against
you, and the weekly review talks about *where to focus next* rather than what went wrong.

## What it does

- **Today screen**: habits grouped into Morning, Daytime and Evening, plus a "This week" section
  for weekly goals. Tap to tick, tap again to undo. Each tick gives satisfying feedback (a pop,
  a burst and floating points).
- **Morning window**: on days a countdown habit is scheduled (e.g. "Gym by 10am"), a small card
  shows the time left until the window closes (10:00 by default, adjustable).
- **Flexible schedules**: every day, specific weekdays, or a weekly target such as 2× a week
  (shown as 1/2, 2/2).
- **Points and rewards**: points per habit, a **Morning Win** bonus when every morning habit is
  done, daily and weekly scores, levels and 17 badges.
- **Forgiving streaks**: one grace day per week means a single missed day never wipes out a
  streak. Weekly goals forgive a single missed week.
- **Edit the past week**: use the day strip to fill in the last 7 days, so forgetting to log
  never breaks a streak.
- **Weekly review**: a chart of daily points, Morning Wins, streaks, your strongest habits, and
  gentle tips for the habits worth focusing on next.
- **Projects**: one-off checklists (e.g. "Office reset"). Finishing one can add a linked
  maintenance habit (e.g. "10-min desk tidy") so the result sticks.
- **Daily note**: a one-line "How was today?".
- **Your day, your rules**: "Day starts at" (default 4:00am) so late-night check-ins count
  towards the right day, a lights-out target time, Monday- or Sunday-start weeks, and a
  configurable Morning Win bonus. Habits can be added, renamed, removed (and restored),
  reordered, regrouped, rescheduled and re-pointed in Settings.
- **Backups**: export everything as a JSON file (on iPhone the share sheet opens, so you can
  "Save to Files"), and restore from that file. A gentle reminder appears if you haven't backed
  up for 7 days. Restoring keeps a safety copy so you can undo it.
- **Dark mode** that follows your system setting, and a header that shifts colour through
  the day.

### Starter habits

| Morning | Daytime | Evening | Weekly |
| --- | --- | --- | --- |
| Glass of water on waking | Deep-work block on content (90 min) | Fun-phone window ended before bed | Strength training (2× a week) |
| Slept 7–8 hours | Daily squats | Lights out by target time | |
| Morning sunlight | Vitamin D | Socialised today (call, message or meet) | |
| Phone-free until first real task is done | Learn a new skill (15+ min) | | |
| Gym by 10am (Mon, Wed, Fri) | Savour something for 20 min | | |
| | 10 min stillness | | |

All of them can be changed in Settings.

## Put it online with GitHub Pages

1. Make sure the app is on the `main` branch.
2. In the repository on GitHub, go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, then select **main** and
   **/ (root)**, and press **Save**.
4. After a minute or two, the app is live at `https://<your-username>.github.io/habit-tracker/`
   (for this repository: https://ks8kzn75rm-stack.github.io/habit-tracker/).

Every path in the app is relative, so it works from that sub-path (or any other) as-is.
The empty `.nojekyll` file tells GitHub Pages to serve the files exactly as they are.

## Install it on your iPhone

> **Install it to your Home Screen before you log anything.** An app added to the Home Screen
> keeps its data separately from Safari, so anything you log in a Safari tab won't appear in the
> installed app (and vice versa). Home Screen apps are also protected from Safari's automatic
> clean-up of website data.

1. Open the app's URL in **Safari** (not another browser).
2. Tap the **Share** button (the square with an arrow).
3. Scroll down and tap **Add to Home Screen**, then **Add**.
4. Open **Daybreak** from your Home Screen. It runs full screen, like a native app, and works
   offline.

Then, from time to time, back up: **Settings → Back up now → Save to Files**.

## How updates reach your phone

You don't need to reinstall. When you push a change to `main`:

1. Each time the app opens, or comes back to the foreground, its service worker quietly checks
   every app file with the server (unchanged files cost almost nothing).
2. If anything changed, the new files are downloaded into the offline copy and a banner appears:
   **"A fresh version of Daybreak is ready. Tap to refresh."**
3. Tap it and you're on the new version. If you ignore it, the new version loads the next time
   the app starts.

This works even if you forget to change the version number. Still, running `npm run bump` before
you deploy is good practice: it updates the version in `sw.js`, `js/version.js` and
`package.json`, and the new number shows in **Settings → About**, so you can confirm the update
landed. **Settings → About → Check for updates** checks straight away.

GitHub Pages caches files for up to 10 minutes, so a fix can take a few minutes to appear.

If an update ever goes wrong and the app won't start, a recovery screen offers **Repair & reload**,
which clears the offline copy of the app (never your data) and downloads it again.

## Your data

- Stored only on your device, in IndexedDB. The app asks the browser to make storage persistent
  where that's supported (Settings shows whether it was granted).
- No network requests leave the app's own site: no CDNs, analytics or web fonts. A Content
  Security Policy enforces this.
- Backups are plain JSON, so they're readable and future-proof.

## Development

Requires Node.js 22 or newer. There are no dependencies to install for the app or the unit tests.

```bash
npm run serve        # http://localhost:8080/habit-tracker/ (same sub-path as GitHub Pages)
npm test             # unit tests (node --test)
npm run test:e2e     # browser tests; needs Playwright: npm i -D playwright && npx playwright install chromium
npm run icons        # regenerate the PNG icons from scripts/generate-icons.mjs
npm run bump         # bump the version (patch); also: npm run bump -- minor | 1.2.0
```

Unit tests cover the day boundary (including DST changes in several time zones), streaks and
grace days (including randomised checks against a brute-force version), scheduling, points,
levels, the morning window, backup validation and the backup reminder. They also check that the
service worker caches exactly the app's files, the manifest and icons are valid, and nothing
references an external URL.

The browser tests run the real app in headless Chromium at iPhone size, served under
`/habit-tracker/` like GitHub Pages. They cover ticking, undo, Morning Wins, the morning window,
the 4am boundary, editing past days, weekly goals, notes, habit management, the weekly review,
projects, export (share sheet and download), import and undo, the backup reminder, dark mode,
offline use, and both update paths. Screenshots go to `tests/e2e/output/`.

**If you add a new file the app loads, add it to the `PRECACHE` list in `sw.js`.** The unit tests
will remind you if you forget.

### Project layout

```
index.html            App shell, iOS meta tags, Content Security Policy
manifest.json         Web app manifest (relative start_url and scope)
sw.js                 Service worker: offline cache and update checks
css/app.css           All styles (light and dark)
icons/                Generated PNG icons (180, 192, 512 and maskable 512)
js/app.js             Start-up, routing and tab bar
js/pwa.js             Service worker registration and the update banner
js/boot.js            Start-up safety net (Repair & reload)
js/core/              Pure logic: dates, schedules, streaks, scoring, review, backup…
js/data/              IndexedDB wrapper and the app store
js/ui/                Screens and components
scripts/              Icon generator, local server, version bump
tests/unit/           Unit tests
tests/e2e/            Browser tests
```
