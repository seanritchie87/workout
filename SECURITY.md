# Security Setup Guide

## 1. Add GitHub Secrets

Go to your repo → **Settings → Secrets and variables → Actions → New repository secret**.

Add these two secrets:

| Secret name | Value |
|---|---|
| `SHEETS_URL` | `https://script.google.com/macros/s/AKfycbyPaLCzmqfjgBdyEoFNWCoUMvBLEav9GRhRtZghQ7M1tR41k2aMzL4W0pUuyIKQdhme/exec` |
| `AUTH_TOKEN` | `0eb732e98e687d62d204657e2ce93aeb` |

These are injected into the HTML at deploy time by GitHub Actions. They never appear in git history.

---

## 2. Set the AUTH_TOKEN in Google Apps Script

The Apps Script backend validates every request against a token stored in **Script Properties** (not in the code itself).

1. Open your Google Sheet → **Extensions → Apps Script**
2. Paste the contents of `apps-script.gs` (replacing all existing code)
3. In the function dropdown at the top, select **`initialSetup`**
4. Click **Run** — authorize when prompted
5. This stores `AUTH_TOKEN = 0eb732e98e687d62d204657e2ce93aeb` securely in Script Properties
6. You can optionally delete the token value from `initialSetup()` after running it (it's already saved)

---

## 3. Deploy the Apps Script as a Web App

1. Click **Deploy → New deployment**
2. Click the gear icon next to "Type" → select **Web app**
3. Set **Execute as**: Me
4. Set **Who has access**: Anyone
5. Click **Deploy** → **Authorize access** → follow prompts
6. Copy the **Web app URL** — this is your `SHEETS_URL` value (already set above)

> If you update the script code later: Deploy → Manage deployments → pencil icon → Version: **New version** → Deploy.

---

## 4. Enable Branch Protection on main

Go to repo → **Settings → Branches → Add branch ruleset** (or "Add rule"):

- Branch name pattern: `main`
- Check: **Require a pull request before merging**
- Check: **Require status checks to pass** (add the `deploy` job once it has run once)
- Check: **Do not allow bypassing the above settings**

This prevents anyone from pushing directly to main and bypassing the Actions workflow.

---

## 5. Google Sheets Audit Log

To see a history of all changes to your spreadsheet:

- Open the sheet → **File → Version history → See version history**
- Or: **Extensions → Apps Script → Executions** — shows every time the web app was called, with timestamps and success/error status

The rate limiter in `apps-script.gs` also tracks writes per hour in Script Properties (keys prefixed `rate_`). You can inspect these under **Project Settings → Script Properties** in the Apps Script editor.

---

## Secret Rotation

If you ever need to rotate the `AUTH_TOKEN`:

1. Generate a new token: `openssl rand -hex 16`
2. Update the `AUTH_TOKEN` GitHub Secret
3. Re-run `initialSetup()` in Apps Script with the new token value
4. Push any commit to main to trigger a new deploy
