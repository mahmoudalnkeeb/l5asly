# Contributing

Thanks for helping with L5asly. Bug reports, fixes, and improvements are all welcome.

## Before you start

For anything bigger than a small fix, open an issue first and describe what you want to change. It's easier to agree on the approach before the code is written.

Security problems go through [SECURITY.md](SECURITY.md), not public issues.

## Setting up

[Getting started](docs/onboarding/getting-started.md) covers installing and running the app. Mock mode needs no API keys, so you can work on almost everything without accounts.

The [contributor docs](docs/README.md) explain how the code is organized. [AGENTS.md](AGENTS.md) is the coding standard for all TypeScript in the repository.

## Pull requests

- Keep each pull request to one change.
- Add or update tests for behavior you change. See [Testing](docs/guides/testing.md).
- Update the docs page that describes the behavior you changed, in the same pull request.
- Run `pnpm check` before you push. CI runs the same command.
- Write commit messages in the [Conventional Commits](https://www.conventionalcommits.org/) style used in the history, such as `fix(api): ...` or `docs: ...`.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
