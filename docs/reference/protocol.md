# Протоколы

Форматы сообщений между частями системы. Это наброски, окончательные определения появятся в пакете `protocol`.

Обновлено 5 октября 2026.

## Протокол боя

По этому протоколу акторы общаются с арбитром. Он один и тот же для канала в памяти, WebSocket и BroadcastChannel.

```ts
type IntentEnvelope = {
  battleId: string;
  intentId: string;                 // уникален, ключ повторной отправки
  actor: ActorId;                   // кто отправил; ролей в протоколе нет
  agentKind: string;
  expectedSeq: number;              // номер последней записи журнала, который видел отправитель
  epoch: number;
  command: Command | SessionCommand;   // ответ на запрос ввода — команда Answer
};

type Ack =
  | { ok: true; intentId: string; seq: number }
  | { ok: false; intentId: string; currentSeq: number; detail?: string;
      code: 'STALE' | 'ILLEGAL' | 'FORBIDDEN' | 'DUPLICATE_MISMATCH' | 'NO_PENDING' | 'STALE_EPOCH' };   // FORBIDDEN — отказала политика доступа

type EventBatchForActor = {
  battleId: string;
  seq: number;                      // номер записи журнала; он же версия состояния после неё
  intentId: string;
  actor: ActorId | 'arbiter';
  events: BattleEvent[];            // уже в проекции получателя
};

type WireMessage =
  | { type: 'hello'; protocol: 1; battleId: string; actorToken?: string; lastSeq?: number }
  | { type: 'welcome'; actor: ActorId; visibility: Visibility; projection: Projection; seq: number; epoch: number }
  | { type: 'intent'; intent: IntentEnvelope }
  | { type: 'ack'; ack: Ack }
  | { type: 'batch'; batch: EventBatchForActor }
  | { type: 'resync'; fromSeq: number }
  | { type: 'resyncResult'; batches?: EventBatchForActor[]; projection?: Projection; seq: number }
  | { type: 'rewound'; toSeq: number; projection: Projection; seq: number }   // откат: всем приходит новая проекция
  | { type: 'agentRequest'; request: AgentRequest }
  | { type: 'ping' } | { type: 'pong' };
```

Если `intent` пришёл повторно с тем же `intentId`, арбитр возвращает тот же `ack`. Ответ `FORBIDDEN` значит, что политика доступа не разрешила актору эту команду. Ответ `STALE` значит, что состояние уже ушло вперёд, и клиенту нужно отправить `resync`. Ответ `STALE_EPOCH` значит, что арбитр переехал, и клиенту нужно переподключиться. Сообщение `agentRequest` получает только тот актор, которого назвала политика доступа. После отката все получают `rewound` со свежей проекцией.

Какие кнопки показывать, клиент узнаёт не из прав, а из подсказок `BattlePlay`: они уже отфильтрованы политикой доступа. Поэтому протокол не зависит от того, как политика хранит права.

## Протокол встраивания

По этому протоколу хост общается с нашим клиентом внутри iframe через `postMessage`. В каждом сообщении есть поле `protocol` с номером версии.

Конфигурация боя (`BattleSetup`) описывает только бой и попадает в журнал. Настройки экрана — язык, оформление, скорость анимаций — передаются отдельно в `ClientOptions` и в журнал не попадают.

```ts
type ClientOptions = { locale?: string; skin?: string; timeScale?: number };

type HostInbound =                                   // хост → клиент
  | { type: 'createBattle'; protocol: 1; requestId: string; setup: BattleSetup; client?: ClientOptions }
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

Клиент отправляет сообщения только на точный адрес хоста из списка разрешённых и принимает их только с разрешённых адресов. Каждое входящее сообщение он сверяет со схемой. По полю `requestId` ответ связывается с запросом.

## HTTP API сервера

Нужен только для сетевого боя.

| Метод | Путь | Что делает |
|---|---|---|
| `POST` | `/battles` | Создаёт бой по конфигурации и возвращает номер боя и ссылки для акторов |
| `GET` | `/battles/{id}` | Сообщает, идёт ли бой, и текущий раунд |
| `GET` | `/battles/{id}/result` | Возвращает результат боя |
| `GET` | `/battles/{id}/journal` | Возвращает журнал боя |
| `GET` | `/battles/{id}/ws` | Подключает актора по WebSocket с его токеном |
