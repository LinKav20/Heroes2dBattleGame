# Примеры

Обновлено: 2026-10-03. Наброски, не окончательные форматы.

## Манифест пака

```json
{
  "id": "demo-homm",
  "version": "1.2.0",
  "formatVersion": 1,
  "engine": { "min": "1.0.0", "max": "1.x" },
  "depends": [{ "id": "core", "range": "^1.0.0" }],
  "conflicts": [],
  "defaultLocale": "ru",
  "aliases": { "old-id": "new-id" }
}
```

## Сценарий

```json
{
  "formatVersion": 1,
  "id": "demo-homm:bridge",
  "name": { "$t": "bridge.name" },
  "ruleset": "core:homm-classic",
  "field": {
    "cols": 15, "rows": 11, "heroColumns": true, "battlefield": "core:grass",
    "impassable": [[5, 3], [5, 4]],
    "hazards": [{ "hexes": [[8, 5]], "effect": "core:quicksand", "hidden": true }]
  },
  "obstacles": [{ "type": "core:rock-big", "anchor": [7, 6] }],
  "siege": null,
  "sides": [
    {
      "id": "attacker", "seat": "a",
      "hero": { "def": "demo-homm:gelu", "level": 8 },
      "deployment": { "zone": { "cols": [1, 2] }, "tactics": true },
      "units": [{ "id": "a1", "def": "demo-homm:marksman", "count": 40, "at": [1, 2] }]
    },
    { "id": "defender", "seat": "b", "units": [] }
  ],
  "vars": { "reinforced": { "type": "boolean", "initial": false } },
  "triggers": [
    {
      "id": "reinforce",
      "on": { "event": "roundStarted", "round": 3 },
      "once": true,
      "if": { "all": [
        { "fn": "sideStrengthBelow", "args": { "side": "defender", "pct": 50 } },
        { "not": { "var": "reinforced", "eq": true } }
      ] },
      "do": [
        { "op": "summon", "creature": "demo-homm:pikeman", "count": 20, "at": { "hex": [15, 5], "fallback": "nearestFree" } },
        { "op": "setVar", "var": "reinforced", "value": true },
        { "op": "message", "text": { "$t": "bridge.reinforce" } }
      ]
    }
  ],
  "objectives": [
    { "id": "win-a", "type": "victory", "side": "attacker", "when": { "fn": "sideEliminated", "args": { "side": "defender" } } },
    { "id": "timeout", "type": "defeat", "side": "attacker", "when": { "cmp": ">", "a": { "ref": "round" }, "b": 20 } }
  ]
}
```

## Конфигурация боя от хоста

Хост выбирает наш сценарий и передаёт параметры участников поверх него.

```json
{
  "formatVersion": 1,
  "scenario": "demo-d20:tavern-brawl",
  "participants": [
    {
      "unit": "hero-lambert",
      "state": {
        "resources": { "hp": 23 },
        "effects": [{ "def": "core:inspired", "remaining": 1 }],
        "inventory": [{ "def": "demo-d20:healing-potion", "qty": 2 }],
        "usesSpent": { "demo-d20:double-shot": 1 }
      }
    }
  ],
  "seats": [
    { "id": "party", "sides": ["attacker"], "agent": { "kind": "ui" }, "role": "gm" },
    { "id": "enemies", "sides": ["defender"], "agent": { "kind": "utility-ai", "profile": "core:aggressive" } }
  ],
  "rulesetOverrides": { "dice": { "default": "digital", "byPurpose": { "attack": "gm" } } },
  "options": { "seed": null, "rewind": "gm-only", "locale": "ru", "skin": "default", "timeScale": 1 },
  "hostRef": "campaign-42/session-7/encounter-3"
}
```

`hostRef` — непрозрачная для нас метка хоста. Мы возвращаем её в результате, чтобы хост связал результат со своими данными.

## Результат боя

```json
{
  "formatVersion": 1,
  "battleId": "b-01J9...",
  "hostRef": "campaign-42/session-7/encounter-3",
  "outcome": { "kind": "victory", "winnerSides": ["attacker"], "objective": "win-a" },
  "rounds": 6,
  "units": [
    {
      "unit": "hero-lambert", "side": "attacker", "alive": true,
      "countStart": 1, "countEnd": 1,
      "resources": { "hp": 11 },
      "effects": [{ "def": "core:burning", "remaining": 1 }],
      "inventoryDelta": [{ "def": "demo-d20:healing-potion", "qty": -1 }],
      "usesSpent": { "demo-d20:double-shot": 2 }
    }
  ],
  "summoned": [],
  "casualties": [{ "side": "defender", "def": "demo-d20:guard", "count": 4 }],
  "vars": {},
  "stateHash": "…"
}
```

## Встраивание на стороне хоста

```ts
const ORIGIN = 'https://battles.example.com';
const frame = document.createElement('iframe');
frame.src = `${ORIGIN}/embed`;
container.append(frame);

window.addEventListener('message', (event) => {
  if (event.origin !== ORIGIN) return;
  const msg = event.data;
  switch (msg.type) {
    case 'ready':
      frame.contentWindow?.postMessage(
        { type: 'createBattle', protocol: 1, requestId: crypto.randomUUID(), setup },
        ORIGIN,
      );
      break;
    case 'battleStarted':
      saveBattleId(msg.battleId);                 // чтобы потом продолжить или открыть запись
      break;
    case 'battleFinished':
      applyResultToCampaign(msg.result);          // хост сам решает, как изменить своё состояние
      break;
    case 'error':
      showErrors(msg.errors);
      break;
  }
});
```
