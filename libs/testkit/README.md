# @heroes2dgame/testkit

Test tools for the [Heroes2dBattleGame](https://github.com/LinKav20/Heroes2dBattleGame) battle engine. Only tests
depend on this package: production code never imports it.

## Installation

```bash
npm install --save-dev @heroes2dgame/kernel @heroes2dgame/testkit
```

The package is ESM and requires Node.js 22.12 or newer. The kernel is a peer dependency.

## Contract suites

`checkTopology` declares the tests of the contract of a field topology, as `TopologyExtension` of the kernel
describes it, on the fields you give: answers that repeat, neighbors, distances, costs, areas, the cells of a
creature and lines. It takes the `describe`, `it` and `expect` of the test runner as a `ContractRunner`, so it runs
in Vitest, Jest and runners with the same functions:

```ts
import { checkTopology } from '@heroes2dgame/testkit';
import { describe, expect, it } from 'vitest';

checkTopology(MY_TOPOLOGY, [{ width: 4, height: 3 }], { describe, expect, it });
```

Pass `fits` in the fourth argument to require creatures of these sizes to fit somewhere on every field; by default
the suite requires none. The suite walks every cell and every pair of cells, so keep the fields small.

## Projections

`projectionProblems(kernel, content, before, events)` checks the contract of projections after a batch of events,
for full visibility and for every set of sides, the empty one included:

- the projected events applied to the projection of the state before the batch give exactly the projection of the
  state after it;
- every event keeps its number, and only one `kernel:data-changed` numbered after the last event may follow them;
- `kernel:hidden` carries nothing but the counters `nextId` and `nextRequestId`, and no projection has the random
  number generator;
- in place of an event of the batch the actor does not see comes only `kernel:hidden`, `kernel:data-changed`, a
  hidden request, the closing of a request, or `kernel:phase-changed` in place of `kernel:turn-ended`;
- neither the projection nor the events of the kernel refer to a unit the actor does not see.

Whether the actor sees an event is read from the event of the batch, since the kernel marks the events it hides as
seen by all. The data and the events of packages are formats of the packages, so a package checks what it projects
in its own tests. The number of sets of sides doubles with every side, so keep few sides in the battles of the
tests. The function returns the problems it finds, so a package with extensions can expect an empty list after
every command of its tests:

```ts
import { projectionProblems } from '@heroes2dgame/testkit';

expect(projectionProblems(kernel, content, before, result.events)).toStrictEqual([]);
```

## Reference values

`RNG_REFERENCE` and `HASH_REFERENCE` hold reference values of the random number generator and the state hash. An
engine implementation, in TypeScript or in another language, checks that it produces exactly the same numbers and
hashes:

- `RNG_REFERENCE` gives, for several seeds, single values at chosen counters, draws from ranges with rejected values
  and draws that must fail because the counter has run out or the range is not allowed;
- `HASH_REFERENCE` gives JSON inputs with their canonical JSON and SHA-256, and `HASH_REJECTED` lists inputs that
  canonical JSON must reject.

The algorithms are specified in the documentation of the
[random number generator](https://github.com/LinKav20/Heroes2dBattleGame/blob/main/docs/architecture/topics/simulation.md#как-устроен-генератор)
and the
[state hash](https://github.com/LinKav20/Heroes2dBattleGame/blob/main/docs/architecture/topics/journal.md#что-внутри-журнала).

## License

[PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0).
Noncommercial use is free. Commercial use requires a
[commercial license](https://github.com/LinKav20/Heroes2dBattleGame/blob/main/COMMERCIAL-LICENSE.md).
