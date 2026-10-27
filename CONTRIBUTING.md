# Contributing to Mirioflow

Thanks for helping improve Mirioflow, an unofficial fork of Saydrop and GladiaFlow (see the [README](README.md)). Bug fixes, platform work, documentation, and focused feature proposals are all welcome.

## Before you start

- Read the [README](README.md) for product overview, setup, and architecture.
- For larger changes, open an issue in this repository first so the design can be discussed before implementation.
- On macOS, Accessibility grants are tied to the app's code-signing identity. Changing the release signing certificate can require users to re-grant Accessibility.

## Development setup

1. Install [Node.js](https://nodejs.org/) 20.19+, [Rust](https://www.rust-lang.org/tools/install) stable, and the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform.
2. From your copy of this repository, install dependencies and start the desktop app:

```bash
cd mirioflow
npm ci
npm run tauri:dev
```

3. Enter a [Gladia API key](https://app.gladia.io/) in the onboarding screen when testing transcription end to end. Real microphone audio is streamed to Gladia under their [privacy notice](https://www.gladia.io/privacy-notice) and [terms](https://www.gladia.io/terms-conditions); see [Privacy and data handling](README.md#privacy-and-data-handling).

`npm run dev` is enough for UI-only work. Native audio, global shortcuts, clipboard paste, and Tauri commands require `npm run tauri:dev`.

## Making changes

1. Fork the repository and create a branch from `main`.
2. Keep the diff focused on one problem or feature.
3. Prefer tests when behavior changes:
   - Rust: `cargo test --manifest-path src-tauri/Cargo.toml`
   - Frontend / full suite: `npm test`
4. Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages, for example `fix: restore clipboard after dictation`.
5. Before opening a pull request, run the commands below. `npm run format` formats TypeScript, CSS, JSON and Markdown with Prettier and Rust with `rustfmt`; CI runs `npm run format:check` and fails on unformatted files.

```bash
npm run format
npm test
npm run build
```

For capture or lifecycle changes, also run:

```bash
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

## Pull requests

Open a PR that explains:

- the problem
- the approach
- how you tested it (platforms, devices, and permission states when relevant)

Maintainers may ask for follow-up on hotkey races, prepared-microphone lifecycle, Accessibility grant flow, or paste/clipboard behavior — those paths are easy to regress.

## Releasing

Maintainers release from GitHub Actions; nothing is tagged or built from a laptop.

1. Pick the next version with [semver](https://semver.org/) from the commits since the last tag (`git log --oneline $(git describe --tags --abbrev=0)..origin/main`): a breaking change (`!` or `BREAKING CHANGE`) is a major, any `feat` a minor, anything else a patch.
2. Run **Actions → Release → Run workflow** with that version (for example `1.2.0`). The workflow runs `scripts/set-version.mjs`, which writes the version into `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and `src-tauri/Cargo.lock`, then opens a `chore: release v1.2.0` PR from `release/v1.2.0` and dispatches CI on it.
3. Review the PR (version diff and commit list), wait for CI, approve and merge.
4. On merge, the workflow re-checks the versions on the merge commit, runs the format check and tests, builds the signed macOS DMG and the Windows installer, then creates the `v1.2.0` tag on that merge commit and publishes the GitHub release with notes generated from merged PR titles.

The tag is only created once every build has succeeded. If a job fails after merge, re-run the failed jobs for transient errors; otherwise fix it on `main` and release the next patch version.

The macOS build needs the signing and notarization secrets listed in [SIGNING.md](SIGNING.md). Changing the signing certificate makes users grant Accessibility again, so follow its rotation procedure.

## Security

Please do not open public issues for security vulnerabilities. See [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE). Brand and logo use is governed by [TRADEMARKS.md](TRADEMARKS.md), not the MIT license.
