# bnt-kit

The shared platform for bnt.hm apps. Read README.md for what it offers and how
to change it.

## Never name the apps

This repository is public; the apps that use it are private. Never name an app,
its domain, its data or its features in files, tests, examples, commit
messages, PR descriptions or comments. Say "an app" or "apps", and use generic
examples (`app.bnt.hm`, `/api/data`, `person@example.com`). Describe shared
behaviour on its own terms, not by where it came from.

`npm run check:names` (part of `npm run check`) enforces this when
PRIVATE_NAMES is set; CI always runs it with the repository secret. It never
prints the names it checks.
