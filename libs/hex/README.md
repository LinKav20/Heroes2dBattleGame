# @heroes2dgame/hex

Hex grid geometry for the [Heroes2dBattleGame](https://github.com/LinKav20/Heroes2dBattleGame)
battle engine: coordinates, neighbors, distances, lines and areas. The package has no
dependencies and uses integer arithmetic only, so every runtime gets exactly the same results.

## Installation

```bash
npm install @heroes2dgame/hex
```

The package is ESM and requires Node.js 22.12 or newer. It also works in browsers and with
bundlers. On Node.js 22.12 and newer, `require()` loads it as well.

## Usage

Hexes are pointy-topped, and odd rows are shifted right by half a hex. Store and show them as
"column, row" with `offset`, and convert them to cube coordinates for calculations.

```ts
import {
  cubeDistance,
  cubeLine,
  cubeNeighbors,
  cubeToOffset,
  isInside,
  offset,
  offsetKey,
  offsetToCube,
} from '@heroes2dgame/hex';

const field = { width: 15, height: 11 };
const archer = offsetToCube(offset(1, 5));
const target = offsetToCube(offset(6, 3));

cubeDistance(archer, target);
// 6

cubeLine(archer, target).map((hex) => offsetKey(cubeToOffset(hex)));
// ['1,5', '2,5', '3,4', '4,4', '5,4', '5,3', '6,3']

cubeNeighbors(archer)
  .map(cubeToOffset)
  .filter((hex) => isInside(hex, field))
  .map(offsetKey);
// ['2,5', '2,4', '1,4', '0,5', '1,6', '2,6']
```

The JSDoc of every function describes its exact algorithm and ordering, so the results can be
reproduced in other languages.

## License

[PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0).
Noncommercial use is free. Commercial use requires a
[commercial license](https://github.com/LinKav20/Heroes2dBattleGame/blob/main/COMMERCIAL-LICENSE.md).
