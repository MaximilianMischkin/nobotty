# Nobotty privacy

- Nobotty runs only on reddit.com pages.
- It reads comments and direct messages shown on the page to compute hints. This happens in your browser.
- To check account age and karma it asks Reddit's own public endpoints: the thread's comment data, account data for up to 100 accounts at once, and for accounts that look suspicious their public profile and post history. This is the same data anyone can see on a profile. Requests go only to reddit.com, first without your login cookies; only when Reddit's limit for those is used up, with your normal browser session. Results are cached on your device for 7 days.
- Nobotty does not send anything to the developer or to any third party, has no analytics and no accounts.
- Settings and the trusted list are stored with the browser's local extension storage.
- Hints are signals, not statements about a person.
