# Примеры

Примеры JSON и кода. Форматы ещё могут поменяться.

Обновлено 5 октября 2026.

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
    "cols": 15, "rows": 11, "battlefield": "core:grass",
    "impassable": [[5, 3], [5, 4]],
    "hazards": [{ "hexes": [[8, 5]], "effect": "core:quicksand", "hidden": true }]
  },
  "obstacles": [{ "type": "core:rock-big", "anchor": [7, 6] }],
  "siege": null,
  "sides": [
    {
      "id": "attacker",
      "effects": ["demo-homm:commander-gelu-bonuses"],
      "abilities": ["demo-homm:commander-gelu-spellbook"],
      "deployment": { "zone": { "cols": [1, 2] }, "tactics": true },
      "units": [{ "id": "a1", "def": "demo-homm:marksman", "count": 40, "at": [1, 2] }]
    },
    { "id": "defender", "units": [] }
  ],
  "vars": { "reinforced": { "type": "boolean", "initial": false } },
  "triggers": [
    {
      "id": "reinforce",
      "on": { "event": "RoundStarted", "round": 3 },
      "once": true,
      "if": { "all": [
        { "fn": "sideStrengthBelow", "args": { "side": "defender", "pct": 50 } },
        { "not": { "var": "reinforced", "eq": true } }
      ] },
      "do": [
        { "op": "summon", "creature": "demo-homm:pikeman", "count": 20, "at": { "hex": [14, 5], "fallback": "nearestFree" } },
        { "op": "setVar", "var": "reinforced", "value": true }
      ]
    }
  ],
  "objectives": [
    { "id": "win-a", "type": "victory", "side": "attacker", "when": { "fn": "sideEliminated", "args": { "side": "defender" } } },
    { "id": "round-limit", "type": "defeat", "side": "attacker", "when": { "cmp": ">", "a": { "ref": "round" }, "b": 20 } }
  ]
}
```

## Конфигурация боя от хоста

Хост выбирает наш сценарий, передаёт параметры юнитов, которые накладываются на данные сценария, и перечисляет акторов с их правами и агентами.

```json
{
  "formatVersion": 1,
  "scenario": "demo-d20:tavern-brawl",
  "units": [
    {
      "unit": "lambert",
      "state": {
        "resources": { "hp": 23 },
        "effects": [{ "def": "core:inspired", "remaining": 1 }],
        "inventory": [{ "def": "demo-d20:healing-potion", "qty": 2 }],
        "usesSpent": { "demo-d20:double-shot": 1 }
      }
    }
  ],
  "actors": [
    { "id": "lead", "grant": "lead", "agent": { "kind": "ui" } },
    { "id": "enemies", "grant": { "preset": "commander", "sides": ["defender"] }, "agent": { "kind": "utility-ai", "profile": "aggressive" } }
  ],
  "rulesetOverrides": { "dice": { "default": "generator", "byPurpose": { "attack": "external" } } },
  "seed": null,
  "hostRef": "campaign-42/session-7/encounter-3"
}
```

Актор `lead` получает готовый набор прав «ведущий»: может всё и видит всё. Актор `enemies` получает набор «командующий» для обороняющихся, а действует от его имени ИИ. Готовые наборы и профили ИИ регистрируют адаптеры политики доступа и агентов, поэтому у них нет префикса пака.

Броски атаки по этой конфигурации вводятся извне. Запрос на бросок атаки обороняющихся политика направит актору `enemies`: его права относятся к стороне запроса, а такие права важнее общих. Запрос на бросок атакующих достанется `lead`, потому что других претендентов нет.

Координаты гексов считаются с нуля: на поле шириной 15 столбцы нумеруются от 0 до 14.

В `hostRef` хост пишет любую свою метку. Мы её не разбираем и возвращаем в результате, чтобы хост понял, к чему этот результат относится.

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
      "unit": "lambert", "side": "attacker", "alive": true,
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
        { type: 'createBattle', protocol: 1, requestId: crypto.randomUUID(), setup, client: { locale: 'ru', skin: 'default', timeScale: 1 } },
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
