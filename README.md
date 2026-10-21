# Marine Contacts Register

An installable app for searching, indexing and scanning business cards. It works offline on phones and computers.

**Open the app:** https://aarshrmishra-lang.github.io/marine-cards/

## What it does

- Search every card by name, company, email, phone digits, title, country or notes.
- Browse an A–Z company index.
- Scan a card with the phone camera, or choose, drop or paste a photo on a computer. The card is read on the device and the details are filled in for you to check before saving.
- Warns when a card is already in your register and offers to add the new details to it.
- Back up to a file, restore from a file, or export a spreadsheet (.csv).

## Privacy

This repository contains only the app. No contact data is stored here or on the website.
Cards are saved only on the device where you add them. Anyone who opens the app starts with an empty register of their own.

## Install

- **iPhone / iPad:** open the link in Safari, tap Share, then **Add to Home Screen**.
- **Android:** open the link in Chrome, open the ⋮ menu, then **Install app**.
- **Windows / Mac:** open the link in Chrome or Edge and click the install icon at the right end of the address bar. In Safari on a Mac, choose File → **Add to Dock**.

Then, on each device:

1. Tap **Import backup file** and choose your backup (.json) file to load your cards.
2. Open **Backup** and tap **Get ready for offline scanning**. This downloads the card reader once (about 6 MB) so scanning works without internet.

## Keeping devices in step

Each device keeps its own copy. To copy new cards across, use **Backup → Export backup** on one device and **Backup → Import backup** on the other. Importing never deletes cards.

## Technical notes

- Plain HTML, CSS and JavaScript, with no build step. It is served by GitHub Pages from the `main` branch.
- Card reading uses [Tesseract.js](https://github.com/naptha/tesseract.js) 5.1.1. The engine loads from jsDelivr on first use and is then kept for offline use; the English language data is bundled in `lang/`.
- Cards are stored in the browser's IndexedDB. A service worker (`sw.js`) caches the app for offline use. Raise `VERSION` in `sw.js` when you publish changes so installed apps pick them up.
