# Daybreak: a kind habit tracker

Daybreak is a personal habit tracker that installs on your iPhone like a native app. It's made with
plain HTML, CSS and JavaScript, with no build step, no accounts and no servers. Everything stays on
your device, and it works offline.

It's designed to be encouraging: streaks are forgiving, missed days are never counted against
you, and the weekly review talks about *where to focus next* rather than what went wrong.

Version 1.1 adds **Begin**: a one-minute daily ritual, a focus timer and a few quiet tools that
turn intentions into action. They're powered by joy rather than fear, and they always end in
doing something rather than reading something.

## Begin: from intention to action

- **The daily front door.** The first time you open Daybreak each day (after "Day starts at",
  and before 6pm) a short ritual opens before Today. Skip it with one tap; it won't ask again
  that day. It takes a minute or two, one idea per screen:
  1. **Arrive**: how are you arriving? Anxious, Stuck, Flat, Scattered or Fired up. This tailors
     the words and the card you see. "Fired up" goes straight to choosing.
  2. **Centre**: an optional 30, 45 or 60 second breathing animation (4 seconds in, 6 out).
  3. **A card** that suits how you arrived, plus one line from your own Foundations (a joy, your
     why, or what this season is for).
  4. **Choose** today's one main thing, from your active projects or in your own words, and
     optionally one thing you're consciously letting go of.
  5. **Begin**: "I'll start at __ for __ minutes" (5, 25, 50, 90 or custom), then a big Begin
     button that starts the focus timer. Choosing a later time is fine too.

  Finishing the ritual ticks a new morning habit, **Began my day with intention**, which counts
  towards your Morning Win.
- **Begin and I'm stuck, always on Today.** Begin starts a focus session. **I'm stuck** is a
  one-minute rescue: name the shape the Resistance is taking (perfectionism, distraction, "not
  ready yet", self-doubt or a reasonable-sounding excuse), get a reframe and one small step, and
  commit to just five minutes.
- **Focus sessions.** The ring fills as you go (it shows what you've done, not what's left).
  Sessions keep running if you lock the phone or close the app, and keep the screen awake where
  supported. A session of at least the deep-work length (90 minutes by default, editable in
  Settings) ticks **Deep-work block on content** for you; any habit can opt in to this.
- **Proof you show up.** Every session goes into an evidence log, drawn as a garden that grows:
  each session plants something, five-minute rescue starts grow seedlings, and anything you mark
  as shipped or released blooms. It shows momentum, not a score.
- **Foundations** (the third tab), all written by you: your why, a letter from your future self,
  your joys and energisers, and what this season is an opportunity for. It also holds your
  **active projects**, gently limited to three (fewer things in progress means each gets real
  attention), and a **parking lot** where other ideas wait, guilt-free, until there's room.
- **Evening reflection.** Under the daily note, a one-minute reflection: did I show up, what
  brought me joy, what am I letting go of, and one word for tomorrow. The word greets you in the
  next morning's ritual.
- **Weekly tune-up.** Inside the weekly review, a two-minute pass at improving your own system:
  see the week's evidence, favourite or hide the cards you met, park or activate a project, and
  refresh one Foundation.
- **Card library** (Settings → Card library): 66 original cards across Resistance, Turning pro,
  Finitude, Choosing, Joy of the craft, Patience, Present moment and Perspective. Favourite,
  hide or edit any of them (built-in cards can be restored), or write your own.
- **Perspective** (off until you turn it on in Settings): a **Life in weeks** grid from a birth
  date, with this week softly glowing, and **This season**: an end date you choose, shown as
  "N weeks to make count". Both are framed as appreciation and invitation, never as an alarm.
- **Improvement inbox** (Settings): jot down ideas for making the app better, then **Copy all**
  to paste them somewhere else, for example into a future coding session.

### Where the ideas come from

The cards and prompts draw on two books: *The War of Art* by Steven Pressfield (Resistance, and
turning pro: showing up whatever the mood) and *Four Thousand Weeks* by Oliver Burkeman (finite
time, choosing a few things, limiting work in progress, patience). Everything is written in
original words; nothing is quoted or reproduced from either book. Each card carries a short
credit line, such as "Idea from The War of Art by Steven Pressfield".

## What it does

- **Today screen**: habits grouped into Morning, Daytime and Evening, plus a "This week" section
  for weekly goals. Tap to tick, tap again to undo. Each tick gives satisfying feedback (a pop,
  a burst and floating points).
- **Morning window**: on days a countdown habit is scheduled (e.g. "Gym by 10am"), a small card
  shows the time left until the window closes (10:00 by default, adjustable).
- **Flexible schedules**: every day, specific weekdays, or a weekly target such as 2× a week
  (shown as 1/2, 2/2).
- **Points and rewards**: points per habit, a **Morning Win** bonus when every morning habit is
  done, daily and weekly scores, levels and 20 badges.
- **Forgiving streaks**: one grace day per week means a single missed day never wipes out a
  streak. Weekly goals forgive a single missed week.
- **Edit the past week**: use the day strip to fill in the last 7 days, so forgetting to log
  never breaks a streak.
- **Weekly review**: a chart of daily points, Morning Wins, streaks, your strongest habits,
  the week's evidence garden, the weekly tune-up, and gentle tips for the habits worth focusing
  on next.
- **Projects** (in Foundations): checklists with steps (e.g. "Office reset"). Finishing one can
  add a linked maintenance habit (e.g. "10-min desk tidy") so the result sticks.
- **Daily note**: a one-line "How was today?", with the evening reflection beneath it.
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
| Began my day with intention (ticked by the Begin ritual) | Deep-work block on content (90 min, ticked by a long focus session) | Fun-phone window ended before bed | Strength training (2× a week) |
| Glass of water on waking | Daily squats | Lights out by target time | |
| Slept 7–8 hours | Vitamin D | Socialised today (call, message or meet) | |
| Morning sunlight | Learn a new skill (15+ min) | | |
| Phone-free until first real task is done | Savour something for 20 min | | |
| Gym by 10am (Mon, Wed, Fri) | 10 min stillness | | |

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
> installed app (and vice versa). The installed app also isn't affected by Safari clearing data
> for websites you haven't visited recently, though deleting the app deletes its data, so back up.

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

### Updating to 1.1 (Begin)

Your installed app picks up 1.1 the same way: open it, wait for the banner, tap **Tap to
refresh** (or check straight away in **Settings → About → Check for updates**). Settings → About
should then say **Daybreak 1.1.0**. To be extra safe, back up first: **Settings → Back up now**.

On the first open after the update:

- Your habits, history, notes, streaks, points and projects are all kept. The update only adds.
- A short **"New in Daybreak: Begin"** note explains what's new. Choose **Try the ritual now**,
  or **Later** to meet it tomorrow morning.
- The new habit **Began my day with intention** joins your Morning. If you'd already ticked
  something that day, it starts the next day instead, so the day's score and Morning Win never
  change in the middle of a day.
- **Deep-work block on content** is set to tick itself after a 90-minute focus session (change
  this in the habit's settings, or the length in Settings → Begin & focus).
- If you had more than three open projects, the most recent extras move to the parking lot in
  Foundations, and the note tells you which. Swap them back whenever you like.

## Your data

- Stored only on your device, in IndexedDB. The app asks the browser to make storage persistent
  where that's supported (Settings shows whether it was granted).
- No network requests leave the app's own site: no CDNs, analytics or web fonts. A Content
  Security Policy enforces this.
- Backups are plain JSON, so they're readable and future-proof. They include everything:
  habits, history, notes, projects, settings, the ritual and reflection journal, focus sessions
  and shipped items, your card edits, favourites and hidden cards, your Foundations and the
  improvement inbox. Backups from version 1.0 still restore, and are upgraded as they load.
- When the way data is stored changes, the app upgrades it once, in a single step that only adds
  to what's there, and never deletes anything.

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
levels, the morning window, backup validation, the backup reminder, and that the encouraging
messages suit the time of day and never use negative words. For Begin, they cover the
once-a-day ritual and its day boundary, card choice, the deep-work auto-tick, the three-project
limit, focus timing, life-in-weeks and season week maths, the card library, and the upgrade of
version 1.0 data (including backups). They also check that the service worker caches exactly the
app's files, the manifest and icons are valid, and nothing references an external URL.

The browser tests run the real app in headless Chromium at iPhone size, served under
`/habit-tracker/` like GitHub Pages. They cover ticking, undo, Morning Wins, the morning window,
the 4am boundary, editing past days, weekly goals, notes, habit management, the weekly review,
projects, export (share sheet and download), import and undo, the backup reminder, dark mode,
offline use, and both update paths. For Begin: the ritual as the day's front door (including the
day boundary, skipping and the evening cut-off), the Fired up shortcut, focus sessions that
survive a reload and tick deep work, shipped work, "I'm stuck", the evening reflection and the
next morning's word, Foundations and the project limit, the card library, the weekly tune-up,
Perspective, the inbox's Copy all, a real version 1.0 database being upgraded, and backups that
carry all the new data. Screenshots go to `tests/e2e/output/`.

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
js/core/              Pure logic: dates, schedules, streaks, scoring, review, backup, cards,
                      the ritual, focus sessions, the project limit, perspective, migration
js/data/              IndexedDB wrapper and the app store
js/ui/                Screens and components (begin.js, focus-timer.js, stuck.js and
                      reflect.js are the calm full-screen flows)
scripts/              Icon generator, local server, version bump
tests/unit/           Unit tests
tests/e2e/            Browser tests (fixtures/ holds a real version 1.0 database)
```
