# Heroes2dBattleGame

[Русская версия](README.ru.md)

An engine for turn-based tactical battles in the spirit of Heroes of Might and Magic III
and tabletop role-playing games. It is a set of libraries and swappable adapters
published as separate npm packages under the `@heroes2dgame` scope.

The project is in early development. No packages have been published yet.

## What the engine does

- Runs battles on a field of cells: hexes first, with square grids and 3D fields with
  elevation supported through the same field topology interface.
- Describes creatures, items, effects, abilities, rulesets and scenarios as data in
  JSON content packs, so new content needs no programming.
- Supports different mechanics: stacks or single figures, turn order by speed or by
  initiative, randomness from a generator or from real dice entered by a person.
- Keeps a full journal of every battle: step-by-step replay, rewind and forks.
- Works without a server in a single browser tab, or with an optional battle server when
  players join from their own devices.
- Treats everyone who acts in a battle as a faceless actor. An external access policy
  decides what each actor may do and see, and an agent makes decisions for each actor:
  a person through the UI, an AI or an external bot.
- Integrates into other systems through one contract: import the libraries directly,
  embed the client in an iframe, call the server over HTTP or write your own adapter.

The kernel is deterministic: the same journal produces the same result in the browser,
in a Web Worker and in Node.js.

## Packages

| Package | Description |
|---|---|
| `@heroes2dgame/hex` | Hex grid geometry: coordinates, neighbors, distances, lines and areas |
| `@heroes2dgame/kernel` | Deterministic battle kernel: state, commands, events and extension interfaces |

More libraries, adapters and content packs will be added as separate packages.

## Repository layout

| Folder | Contents |
|---|---|
| `libs/` | Libraries that any configuration is built from |
| `adapters/` | Adapters to ports, one package per technology |
| `apps/` | Applications built from libraries and adapters. They are not published |
| `packs/` | Content packs: rulesets, creatures, items, effects, scenarios |
| `docs/` | Architecture documentation and decision records, in Russian |

## Development

Development requires Node.js 24 or newer and pnpm 12. The published packages support Node.js 22.12 or newer.

```bash
pnpm install
pnpm check
```

`pnpm check` runs the linter, the type check, the dependency rules, the package rules and the tests.
Other commands:

| Command | What it does |
|---|---|
| `pnpm test` | Runs the tests |
| `pnpm build` | Builds all publishable packages |
| `pnpm packages` | Checks that every package follows the package rules |
| `pnpm verify-dist` | Checks the built packages: publint, type resolution, loading with `import` and `require` |
| `pnpm changeset` | Records a change for the next release |

Releases run in CI: after changes reach `main`, Changesets opens a pull request with the new versions,
and merging it publishes the packages to npm.

## Documentation

The architecture is described in [docs/](docs/README.md), in Russian. Start with the
[architecture overview](docs/architecture/README.md) and the
[decision records](docs/decisions/README.md).

## License

Everything in this repository is licensed under the
[PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0).
Noncommercial use is free. Commercial use requires a commercial license: see
[COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md) and [LICENSE.md](LICENSE.md).

## Contributing

We accept external contributions only with a signed [contributor license agreement](CLA.md)
(CLA), so that contributed code can be included in both the noncommercial and the commercial
license. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to set up the repository and send a
change, and [SECURITY.md](SECURITY.md) for how to report a vulnerability.
