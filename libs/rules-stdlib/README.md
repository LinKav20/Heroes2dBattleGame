# @heroes2dgame/rules-stdlib

Standard extensions of the [Heroes2dBattleGame](https://github.com/LinKav20/Heroes2dBattleGame) battle kernel: the
hex topology, three orders of turns, the attack of stacks, the defense that braces a unit, and morale and luck as
chances. The package depends only on `@heroes2dgame/kernel` and `@heroes2dgame/hex`, and its arithmetic is integer
only, so every runtime gets exactly the same battle.

## Installation

```bash
npm install @heroes2dgame/kernel @heroes2dgame/rules-stdlib
```

The package is ESM and requires Node.js 22.12 or newer. The kernel is a peer dependency.

## Usage

Register the extensions when you create the kernel, and choose them by their full names in a ruleset and a
scenario:

```ts
import { createKernel } from '@heroes2dgame/kernel';
import { RULES_STDLIB_EXTENSIONS } from '@heroes2dgame/rules-stdlib';

const kernel = createKernel({ extensions: RULES_STDLIB_EXTENSIONS });
```

```json
{
  "mechanics": {
    "kernel:turn-order": { "variant": "rules-stdlib:speed", "params": { "speed": "core:speed" } },
    "kernel:attack": { "variant": "rules-stdlib:stacks", "params": { "...": "see StackParams" } },
    "kernel:defense": { "variant": "rules-stdlib:brace", "params": { "effect": "core:defending" } },
    "rules-stdlib:morale": { "variant": "rules-stdlib:chance-morale", "params": { "...": "see ChanceParams" } }
  }
}
```

## Extensions

| Name | Extends | What it does |
|---|---|---|
| `rules-stdlib:hex` | a topology | A rectangular field of pointy-topped hexes with odd rows shifted right, `HexParams` |
| `rules-stdlib:speed` | the mechanic `kernel:turn-order` | Units with the tag `first`, for example siege machines, go first, then the fastest; waiting; morale gives one more turn or ends a turn, `SpeedParams` |
| `rules-stdlib:initiative` | the mechanic `kernel:turn-order` | Every unit rolls initiative once, and the order stays, `InitiativeParams` |
| `rules-stdlib:sides` | the mechanic `kernel:turn-order` | The sides take turns in the order of the scenario |
| `rules-stdlib:stacks` | the mechanic `kernel:attack` | Melee and shots of stacks with strikes back, penalties and luck, `StackParams` |
| `rules-stdlib:brace` | the mechanic `kernel:defense` | The unit gets an effect and its turn ends, `BraceParams` |
| `rules-stdlib:chance-morale` | the mechanic `rules-stdlib:morale` | Morale as a chance on a die, `ChanceParams` |
| `rules-stdlib:chance-luck` | the mechanic `rules-stdlib:luck` | Luck as a chance on a die, `ChanceParams` |

The JSDoc of every extension describes its exact rules, the events it gives and who sees them. The interfaces of
its parameters describe them, and the field `schema` of the extension holds their JSON Schema. The documentation of the
[simulation](https://github.com/LinKav20/Heroes2dBattleGame/blob/main/docs/architecture/topics/simulation.md)
describes the orders of turns and the attack in Russian.

## License

[PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0).
Noncommercial use is free. Commercial use requires a
[commercial license](https://github.com/LinKav20/Heroes2dBattleGame/blob/main/COMMERCIAL-LICENSE.md).
