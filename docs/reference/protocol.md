# Протоколы

Обновлено: 2026-10-03. Наброски, не окончательные определения.

## Протокол боя

Между участниками и источником истины. Одинаков для канала в памяти, WebSocket и BroadcastChannel.

```ts
type IntentEnvelope = {
  battleId: string;
  intentId: string;                 // уникален, ключ повторной отправки
  seat: SeatId;
  principal: { id: string; role: 'gm' | 'player' | 'observer' | 'system' };
  agentKind: string;
  expectedSeq: number;              // версия состояния, на которую рассчитана команда
  epoch: number;
  decisionId?: string;              // если это ответ на запрос решения
  command: Command;
};

type Ack =
  | { ok: true; intentId: string; seq: number }
  | { ok: false; intentId: string; currentSeq: number; detail?: string;
      code: 'STALE' | 'ILLEGAL' | 'NOT_YOUR_SEAT' | 'DUPLICATE_MISMATCH' | 'NO_PENDING' | 'STALE_EPOCH' };

type EventBatchForViewer = {
  battleId: string;
  seq: number;
  fromRev: number;
  toRev: number;
  intentId: string;
  actor: SeatId | 'system';
  events: BattleEvent[];            // уже отфильтрованы для получателя
};

type WireMessage =
  | { type: 'hello'; protocol: 1; battleId: string; seatToken?: string; lastSeq?: number }
  | { type: 'welcome'; viewer: Viewer; snapshot: ViewSnapshot; epoch: number }
  | { type: 'intent'; intent: IntentEnvelope }
  | { type: 'ack'; ack: Ack }
  | { type: 'batch'; batch: EventBatchForViewer }
  | { type: 'resync'; fromSeq: number }
  | { type: 'resyncResult'; batches?: EventBatchForViewer[]; snapshot?: ViewSnapshot }
  | { type: 'decisionRequest'; request: DecisionRequest }
  | { type: 'ping' } | { type: 'pong' };
```

Правила:

- Повторная `intent` с тем же `intentId` возвращает тот же `ack`.
- `STALE`: состояние ушло вперёд, клиент делает `resync`.
- `STALE_EPOCH`: источник истины сменился, клиент переподключается.
- `decisionRequest` получает только участник, чей агент должен ответить.

## Протокол встраивания

Между хостом и нашим клиентом в iframe через `postMessage`. Все сообщения имеют поле `protocol` с версией.

```ts
type HostInbound =                                   // хост → клиент
  | { type: 'createBattle'; protocol: 1; requestId: string; setup: BattleSetup }
  | { type: 'resumeBattle'; protocol: 1; requestId: string; battleId: string }
  | { type: 'openReplay'; protocol: 1; requestId: string; battleId: string }
  | { type: 'getJournal'; protocol: 1; requestId: string; battleId: string };

type HostOutbound =                                  // клиент → хост
  | { type: 'ready'; protocol: 1; supported: number[] }
  | { type: 'battleStarted'; protocol: 1; requestId: string; battleId: string }
  | { type: 'battleProgress'; protocol: 1; battleId: string; round: number; seq: number }
  | { type: 'battleFinished'; protocol: 1; battleId: string; result: BattleResult }
  | { type: 'journal'; protocol: 1; requestId: string; battleId: string; journal: Journal }
  | { type: 'error'; protocol: 1; requestId?: string; errors: Diagnostic[] };
```

Правила:

- Клиент отправляет сообщения только на точный адрес хоста из списка разрешённых.
- Клиент принимает сообщения только с разрешённых адресов и проверяет каждое по схеме.
- `requestId` связывает ответ с запросом.

## HTTP API сервера

Только для сетевого боя.

| Метод | Путь | Что делает |
|---|---|---|
| `POST` | `/battles` | Создать бой из конфигурации. Ответ: идентификатор боя и ссылки для мест |
| `GET` | `/battles/{id}` | Состояние боя: идёт или окончен, раунд |
| `GET` | `/battles/{id}/result` | Результат боя |
| `GET` | `/battles/{id}/journal` | Журнал боя |
| `GET` | `/battles/{id}/ws` | Подключение участника по WebSocket с токеном места |
