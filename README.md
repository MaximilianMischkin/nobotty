# Botless

**Spot likely bots, scams and sales pitches on Reddit.** Botless is a small browser extension that puts a label on comments from very new or low-karma accounts, hides scam and bot direct messages, and lets you choose whether sales pitches are hidden too. One click opens anything it collapsed.

It gives signals, not proof. A new account can be a real person, so Botless only labels and collapses. It never deletes or blocks.

Everything runs in your browser. No tracking, no server, no accounts. See [PRIVACY.md](PRIVACY.md).

## What it does

- **Comments:** labels accounts that are days old or have little karma, with the reason shown. Flags the same text posted by two different accounts in one thread. Strong signals collapse to one line.
- **Direct messages:** hides scam and bot messages (crypto, "add me on Telegram", new accounts that send links). Sales pitches ("I can build your website", SEO offers, free audits) have their own switch.
- **Settings:** turn it on or off, collapse strong signals, mark medium signals, DM filter, hide bots and scams, hide sales pitches, and a list of trusted accounts that are never marked.

## Install

### Chrome, Edge, Brave
1. Download this repository (Code, then Download ZIP) and unzip it.
2. Open `chrome://extensions` and turn on Developer mode.
3. Click Load unpacked and choose the unzipped folder.

### Firefox
Open `about:debugging#/runtime/this-firefox`, click Load Temporary Add-on and choose `manifest.json`.

### Safari
Safari needs an Xcode wrapper. With Xcode installed run:

```
xcrun safari-web-extension-converter /path/to/botless
```

Build and run the generated app, then enable the extension in Safari Settings, Extensions. While developing you may need Develop, Allow Unsigned Extensions.

## How it decides

Comments: account age and karma (from Reddit's public `about.json`, cached for 7 days, one request per second), auto-style usernames, identical text from two accounts, and stock phrases. Direct messages: scam patterns, sales-pitch patterns and new accounts that send links. The patterns are plain regular expressions in `content.js`, so you can read and change them.

## Known limits

- It cannot know who is a bot. Expect false positives and misses.
- Reddit changes its page markup often. The selectors are in one place (`SEL` and `DM_SEL` in `content.js`). The new chat interface is not verified yet. Please open an issue with the page's HTML if a selector stops working.
- Tested against a local fixture, not yet against live Reddit at scale.

## Tests

```
npm install
npx playwright install chromium
npm test
```

The tests load the content script into a mock comment page and a mock inbox and check which items get labelled.

## Contributing

Issues and pull requests are welcome, especially new patterns, selector fixes and translations of the popup.

## License

MIT, see [LICENSE](LICENSE).
