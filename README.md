# Antibiotic Awareness Week — QR Participation System

A live, interactive registration system for the opening ceremony:
people scan a QR code, type their name, and a large syringe on the
stage screen fills up in real time as more people join.

This guide assumes no prior web development or Firebase experience.
Follow it top to bottom, in order.

---

## What's in this project

```
index.html      → Participant registration page (opens when the QR code is scanned)
stage.html       → Full-screen stage display (open this on the laptop connected to the projector)
admin.html        → Password-protected control panel for the organizer
qr.html          → Large QR code page, for projecting or printing

css/style.css      → Shared styling + participant page
css/stage.css      → Stage display styling
css/admin.css      → Admin dashboard styling
css/qr.css       → QR page styling

js/config.js        → ALL event settings (name, target, timings, colours) — edit this file
js/firebase-config.js  → Your Firebase project's connection details — you will edit this too
js/utils.js        → Shared helper functions
js/participant.js     → Registration form logic
js/stage.js        → Syringe animation, real-time listeners, auto-fill timer
js/admin.js        → Admin dashboard logic
js/qr.js         → QR code generation

firebase-rules.json    → Realtime Database security rules (paste into Firebase Console)
```

---

## Step 1 — Create the Firebase project

1. Go to <https://console.firebase.google.com>.
2. Click **Add project**.
3. Give it a name, e.g. `hsm-antibiotic-awareness`. Click through the
   prompts (Google Analytics is optional — you can turn it off).
4. Once the project is created, click **Continue** to land on the
   project dashboard.

## Step 2 — Register a Web App

1. On the project dashboard, click the **`</>`** (web) icon to add a
   web app.
2. Give it a nickname (e.g. "AAW Stage System"). You do **not** need
   Firebase Hosting checked at this step — you'll set hosting up
   later.
3. Click **Register app**. Firebase will show you a code block that
   looks like this:

   ```js
   const firebaseConfig = {
     apiKey: "...",
     authDomain: "...",
     projectId: "...",
     ...
   };
   ```

4. Copy these values — you'll need them in Step 5.

## Step 3 — Create the Realtime Database

1. In the left sidebar, click **Build → Realtime Database**.
2. Click **Create Database**.
3. Choose a location close to Malaysia (e.g. `asia-southeast1` —
   Singapore).
4. Start in **locked mode** (you'll paste in the real security rules
   in Step 6, so locked mode is fine as a starting point).
5. Once created, copy the **database URL** shown at the top of the
   page (it looks like
   `https://your-project-id-default-rtdb.asia-southeast1.firebasedatabase.app`).
   You'll need this in Step 5.

## Step 4 — Enable Authentication (for the admin page)

1. In the left sidebar, click **Build → Authentication**.
2. Click **Get started**.
3. Under **Sign-in method**, enable **Email/Password**.
4. Go to the **Users** tab and click **Add user**. Create one login
   (email + password) for yourself — this is what you'll use to sign
   in to `admin.html`. You can add more admin accounts the same way
   later.

## Step 5 — Fill in your Firebase config

1. Open `js/firebase-config.js` in this project.
2. Replace every placeholder value with the values from Step 2 and
   the database URL from Step 3:

   ```js
   const firebaseConfig = {
     apiKey: "YOUR_API_KEY",
     authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
     databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.asia-southeast1.firebasedatabase.app",
     projectId: "YOUR_PROJECT_ID",
     storageBucket: "YOUR_PROJECT_ID.appspot.com",
     messagingSenderId: "YOUR_SENDER_ID",
     appId: "YOUR_APP_ID"
   };
   ```

3. Save the file. This is safe to publish — it is not a secret key.
   Your data is protected by the security rules in Step 6, not by
   hiding this file.

## Step 6 — Paste in the security rules

1. Back in **Realtime Database**, click the **Rules** tab.
2. Delete everything there and paste in the entire contents of
   `firebase-rules.json` from this project.
3. Click **Publish**.

These rules make sure:
- Anyone can create their **own** registration, but nobody can edit
  or delete someone else's.
- Only a signed-in admin can remove a participant, change the
  target, start/reset the event, or force the celebration fill.
- Each device can only successfully register once.
- Participant names are limited in length and shape at the database
  level, as a second layer of protection alongside the sanitizing
  already done in the app.

## Step 7 — Set your event details

Open `js/config.js` and adjust the values at the top — event name,
`TARGET_PARTICIPANTS`, timer lengths, colours, and messages. This is
the only file you should need to touch to customize the event.
Nothing else in the project needs editing for day-to-day changes.

## Step 8 — Run it locally to test

You don't need to install anything complicated. From inside the
project folder, run a simple local web server. If you have Node.js
installed:

```bash
npx serve .
```

Or, if you have Python installed:

```bash
python3 -m http.server 8080
```

Then open in your browser:
- `http://localhost:8080/index.html` — the registration page
- `http://localhost:8080/stage.html` — the stage display
- `http://localhost:8080/admin.html` — the admin panel
- `http://localhost:8080/qr.html` — the QR code page

Open `admin.html` and `stage.html` side by side. Sign in to admin
with the account from Step 4, click **Start event**, then use
**+1 participant** / **+5 participants** to watch the stage syringe
fill and names appear — this lets you rehearse everything without
using real phones.

## Step 9 — Deploy it publicly (Firebase Hosting)

This makes the site reachable from any phone, not just your own
computer.

1. Install the Firebase CLI (one-time, needs Node.js):

   ```bash
   npm install -g firebase-tools
   ```

2. Sign in:

   ```bash
   firebase login
   ```

3. From inside this project folder, initialize hosting:

   ```bash
   firebase init hosting
   ```

   - Choose **Use an existing project** and select the project you
     created in Step 1.
   - When asked for your public directory, enter `.` (a single dot —
     this folder).
   - Answer **No** to "configure as a single-page app".
   - Answer **No** to overwriting `index.html` if asked (you already
     have one).

4. Deploy:

   ```bash
   firebase deploy --only hosting
   ```

5. Firebase will print a live URL, e.g.
   `https://your-project-id.web.app`. That's your public site.
   - Participant page: `https://your-project-id.web.app/index.html`
   - Stage display: `https://your-project-id.web.app/stage.html`
   - Admin: `https://your-project-id.web.app/admin.html`
   - QR page: `https://your-project-id.web.app/qr.html`

To publish updates later, just run `firebase deploy --only hosting`
again after editing files.

## Step 10 — Generate and display the QR code

1. Open `https://your-project-id.web.app/qr.html` in a browser.
2. It automatically generates a QR code pointing at your live
   `index.html` page — no extra setup needed.
3. Project this page on a screen near the entrance, or take a
   screenshot/print it for posters and table cards.
4. If you'd rather pin the QR to an exact URL (e.g. a custom domain),
   set `PARTICIPANT_URL` in `js/config.js`.

## Step 11 — Set up the stage screen on ceremony day

1. Connect the laptop to the projector/LED screen.
2. Open `https://your-project-id.web.app/stage.html` in a full-screen
   browser window (press F11 in Chrome/Edge for full screen).
3. The screen will show **"GET READY"** until the event is started.
4. On a second device (your phone or another laptop), open
   `admin.html`, sign in, and click **Start event** right as the
   ceremony opening begins.
5. The stage screen updates on its own from that point — you do not
   need to touch or refresh it again.

## Step 12 — Test everything before the real ceremony

Run through this checklist beforehand, ideally on the actual stage
laptop and projector:

- [ ] Scan the real QR code from a phone and register — confirm the
      stage syringe rises and your name appears.
- [ ] Try registering twice on the same phone — confirm the second
      attempt does not increase the count.
- [ ] In admin, use **+5 participants** and **+10 participants** to
      check the animation handles bursts of names without breaking.
- [ ] In admin, click **Start event**, then wait past
      `AUTO_FILL_DELAY_SECONDS` (default 60s) without reaching the
      target — confirm the syringe automatically animates to 100%
      and the celebration plays.
- [ ] Click **Revert to actual** and confirm the syringe drops back
      to the real percentage.
- [ ] Click **Reset event** and confirm participants, the timer, and
      the syringe all return to zero.
- [ ] Remove a test participant from the admin list and confirm the
      stage count updates.
- [ ] Load the stage page on the actual projector to check text size,
      colour contrast, and that nothing scrolls or overflows at
      1920×1080.

When you're confident, click **Reset event** one final time so the
count is at zero before real guests start scanning.

---

## How the auto-fill works, in plain terms

- The organizer clicks **Start event** — this records a start time.
- The stage page has its own countdown for `AUTO_FILL_DELAY_SECONDS`
  (default 60 seconds).
- If the real registration count hasn't reached the target by then,
  the stage animates the syringe up to 100% over
  `AUTO_FILL_DURATION_SECONDS` (default 20 seconds).
- This is purely visual. The actual number of registered people is
  always kept in the database and is what the admin panel shows —
  only the stage syringe's display is affected.
- New registrations keep being recorded normally even after the
  auto-fill animation plays.

## A couple of known limitations (by design, to keep this simple)

- Duplicate prevention is device-based (via the browser's local
  storage plus a database rule), not identity-based. Someone using a
  different phone, or clearing their browser data, could register
  again. For a ceremony headcount this is normally accurate enough;
  the admin panel lets you remove any duplicate you notice.
- If a registration is interrupted at the exact moment between
  claiming a device slot and finishing the write (e.g. the phone
  loses signal mid-submit), that device may need an admin to clear
  its `deviceRegistry` entry in the Firebase console before it can
  register again. This is rare in practice.
# qr-code-interactive-aaw
