# Security policy

## Supported versions

Mirioflow is an unofficial fork and has no published releases yet. Security fixes are made on the `main` branch of this repository; rebuild the app to pick them up.

## Reporting a vulnerability

If you find a security issue in Mirioflow — for example unsafe handling of the Gladia API key, clipboard contents, local config/history data, or the paste / Accessibility integration — please report it privately.

Contact the maintainer of this fork privately with a clear description, impact assessment, and steps to reproduce when possible. Do not send Mirioflow reports to Gladia: Gladia does not maintain this fork.

Please do not open a public GitHub issue or pull request that discloses an unfixed vulnerability.

We aim to acknowledge reports within a few business days and to keep you informed while we investigate and ship a fix.

## Scope notes

- Mirioflow stores the API key and settings locally in the user config directory; treat that machine as trusted.
- Mirioflow builds are not signed by Gladia. Local builds use ad-hoc signing.
- Transcription audio and results are processed by the Gladia Live Transcription API under Gladia’s [privacy notice](https://www.gladia.io/privacy-notice) and [terms & conditions](https://www.gladia.io/terms-conditions). See [Privacy and data handling](README.md#privacy-and-data-handling) in the README for what leaves the device vs. what stays local. Report Gladia platform issues through Gladia’s support channels, not this repository, unless they are specific to this client’s usage.
