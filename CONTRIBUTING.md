# Contributing

[Русская версия](CONTRIBUTING.ru.md)

Thank you for helping with Heroes2dBattleGame. This page explains how to set up the
repository, make a change and get it merged.

## Before you start

- Contributions are accepted only with the signed [contributor license agreement](CLA.md).
  The CLA check asks you to sign it in your first pull request.
- For a large change, open an issue first, so that we can agree on the approach.
- Report security problems privately, not in a public issue. See [SECURITY.md](SECURITY.md).

## Setting up

Development requires Node.js 24 or newer and pnpm 12.

```bash
pnpm install
pnpm check
```

`pnpm check` runs the linter, the type check, the dependency rules, the package rules and the
tests. The code style is enforced by the linter, so a green `pnpm check` means the style is
right.

## Making a change

1. Create a branch from `main`.
2. Make the change. Put tests in the `tests` folder next to the code they test.
3. Run `pnpm check`.
4. If the change affects a published package, run `pnpm changeset` and describe the change for
   the changelog. Changes to tests and documentation need no changeset.
5. Open a pull request. CI runs the same checks and also builds the packages.

Code, comments and package READMEs are in English. The architecture documentation in
[docs/](docs/README.md) is in Russian.

## License

The project is licensed under the
[PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0),
with a separate [commercial license](COMMERCIAL-LICENSE.md). The CLA lets us include your
contribution in both.
