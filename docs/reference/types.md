# Типы

Наброски интерфейсов и типов. Окончательные определения появятся в пакетах `kernel`, `protocol`, `application` и `presentation`.

Обновлено 5 октября 2026.

## Входящие порты (`application`)

```ts
interface BattlePlay {
  submit(intent: IntentEnvelope): Promise<Ack>;          // команды ядра и команды сессии
  view(actor: ActorId): Projection;                      // проекция в пределах области видимости актора
  subscribe(actor: ActorId, fromSeq: number, onBatch: (b: EventBatchForActor) => void): Unsubscribe;
  // Подсказки уже отфильтрованы политикой доступа: актор видит только то, что ему можно сделать
  legalActions(actor: ActorId, owner: TurnOwner): LegalActions;
  allowedSessionCommands(actor: ActorId): SessionCommand['t'][];
  path(actor: ActorId, unit: UnitId, to: Hex): Hex[] | null;
  preview(actor: ActorId, cmd: Command): ActionPreview;
  turnQueue(actor: ActorId, rounds: number): TurnOwner[];
}

interface BattleHosting {
  create(setup: BattleSetup): Promise<{ battleId: string } | { errors: Diagnostic[] }>;
  resume(battleId: string): Promise<void>;
  result(battleId: string): Promise<BattleResult | null>;
  exportJournal(battleId: string): Promise<Journal>;
}

interface BattleHistory {
  projectionAt(actor: ActorId, seq: number): Promise<Projection>;
  entries(actor: ActorId, fromSeq: number, toSeq: number): Promise<EventBatchForActor[]>;
  fork(actor: ActorId, fromSeq: number): Promise<{ battleId: string }>;
}

// Команды сессии. Ядро их не видит: их выполняет арбитр
type SessionCommand =
  | { t: 'Rewind'; toSeq: number }
  | { t: 'AssignAgent'; actor: ActorId; agent: AgentRef }
  | { t: 'Pause' } | { t: 'Resume' };
```

## Исходящие порты (`application`, `presentation`)

```ts
interface JournalStore {
  createBattle(header: JournalHeader): Promise<void>;
  append(battleId: string, entries: JournalEntry[]): Promise<void>;
  read(battleId: string, fromSeq: number, toSeq?: number): Promise<JournalEntry[]>;
  saveSnapshot(battleId: string, snapshot: Snapshot): Promise<void>;
  latestSnapshot(battleId: string, atOrBefore?: number): Promise<Snapshot | null>;
  saveResult(battleId: string, result: BattleResult): Promise<void>;
  list(): Promise<BattleSummary[]>;
}

interface Arbiter {
  readonly epoch: number;
  propose(intent: IntentEnvelope): Promise<Ack>;
  subscribe(actor: ActorId, fromSeq: number, cb: (batch: EventBatchForActor) => void): Unsubscribe;
}

interface Channel {
  send(message: WireMessage): void;              // в том числе запрос пропущенного (resync)
  onMessage(cb: (message: WireMessage) => void): Unsubscribe;
  status(): 'connected' | 'reconnecting' | 'offline';
  close(): void;
}

interface Agent {
  readonly kind: string;                         // 'ui' | 'utility-ai' | 'mcts' | 'llm' | 'remote' | ...
  decide(view: Projection, request: AgentRequest, signal: AbortSignal): Promise<Command>;
  notify?(batch: EventBatchForActor): void;
}

type AgentRequest =
  | { kind: 'turn'; owner: TurnOwner; legal: LegalActions }
  | { kind: 'input'; request: InputRequest };

type AgentRef = { kind: string; profile?: string; options?: Json };

// Запасной агент: отвечает, если основной агент не уложился в отведённое время или упал.
// Выбирает из допустимых вариантов; ядро о нём не знает
interface FallbackAgent {
  decide(view: Projection, request: AgentRequest): Command;
}

// Политика доступа. Ядро о ней не знает
interface AccessPolicy {
  canSubmit(actor: ActorId, cmd: Command | SessionCommand, state: BattleState): boolean;
  visibility(actor: ActorId): Visibility;
  routeTurn(owner: TurnOwner, state: BattleState): ActorId;        // кто действует в текущий ход
  routeInput(request: InputRequest, state: BattleState): ActorId;  // вызывается только для внешнего ввода
}

interface HostBridge {
  onMessage(cb: (msg: HostInbound) => void): Unsubscribe;   // createBattle, resumeBattle, openReplay, getJournal
  send(msg: HostOutbound): void;                            // ready, battleStarted, battleProgress, battleFinished, journal, error
}

interface ContentSource {
  loadPacks(refs: PackRef[]): Promise<RawPack[]>;
}

interface SkinSource {                           // presentation
  loadSkin(id: string): Promise<SkinManifest>;
}

interface Renderer {                             // presentation
  mount(container: HTMLElement | null, field: FieldView, catalog: ContentCatalog, skin: SkinManifest): void;
  applyState(state: DisplayedState): void;
  play(event: BattleEvent, entry: SkinEntry): Promise<void> | void;
  finish(event: BattleEvent): void;
  highlight(h: Highlights): void;
  pick(x: number, y: number): PickResult;
  dispose(): void;
}

interface Clock { now(): number }                // только прикладной слой: отметки в журнале, время на ответ агента
interface Entropy { seed(): string }             // зерно генератора для нового боя
```

## Доступ и видимость (`application`)

```ts
type ActorId = string;

type Visibility = 'all' | { sides: SideId[] };

type TurnOwner = { unit: UnitId } | { side: SideId };   // ход юнита или стороны целиком

// Набор прав для политики «по таблице». Другие политики могут хранить права иначе
type Grant = {
  play: { sides: SideId[] | 'all'; units?: UnitId[] };   // чьими ходами актор может распоряжаться
  answer: 'own-sides' | 'all' | 'none';                  // на какие запросы ввода отвечает
  edit: boolean;                                         // правки состояния
  session: SessionCommand['t'][];
  sees: Visibility;
};

// В конфигурации боя права задаются готовым набором или явно.
// Готовые наборы регистрирует адаптер политики: 'lead' (ведущий), 'commander' (командующий), 'observer' (наблюдатель)
type GrantRef = string | { preset: string; sides?: SideId[] } | Grant;
```

Если на внешний запрос ввода могут ответить несколько акторов, политика «по таблице» выбирает того, у кого права относятся к стороне запроса (`answer: 'own-sides'`). Актор с `answer: 'all'` получает запрос, только если такого нет.

## Ядро (`kernel`)

```ts
interface Kernel {
  init(setup: KernelSetup, content: ContentRegistry): { state: BattleState; events: BattleEvent[] };
  decide(state: BattleState, cmd: Command): Result<BattleEvent[], RuleError>;
  apply(state: BattleState, event: BattleEvent): BattleState;
  legalActions(state: BattleState, owner: TurnOwner): LegalActions;
  reachable(state: BattleState, unit: UnitId): Reach[];
  preview(state: BattleState, cmd: Command): ActionPreview;
  turnQueue(state: BattleState, rounds: number): TurnOwner[];
  pendingInput(state: BattleState): InputRequest | null;
  project(state: BattleState, visibility: Visibility): Projection;
  projectEvents(events: BattleEvent[], visibility: Visibility, before: BattleState): BattleEvent[];
}

// Всё, что нужно ядру для старта: ни акторов, ни прав, ни настроек экрана
type KernelSetup = {
  scenario: string;
  ruleset: RulesetDef;                             // уже с правками хоста
  units: UnitOverride[];                           // параметры юнитов поверх сценария
  seed: string;
};

// Интерфейсы расширений
interface OpHandler<P> { id: string; run(params: P, ctx: OpContext, state: BattleState): Step[] }
interface ConditionHandler<P> { id: string; test(params: P, ctx: OpContext, state: BattleState): boolean }
interface Scheduler {
  id: string;
  next(state: BattleState): { kind: 'turn'; owner: TurnOwner } | { kind: 'newRound' };
  queue(state: BattleState, rounds: number): TurnOwner[];
}
```

## Набор правил

Набор правил лежит в паке как JSON. Поля `scheduler`, `attack.resolve` и `damage.pipeline` ссылаются на варианты механик из реестров.

```ts
type RulesetDef = {
  id: string;
  turnOwner: 'unit' | 'side';                      // чей ход: отдельного юнита или стороны целиком
  scheduler: string;                               // 'speed-phases' | 'initiative-roll' | 'sides-alternate'
  turnBudget: 'one-action' | 'action-move-bonus';  // что можно успеть за ход
  unitModel: { stacks: boolean; maxStacksPerSide?: number };
  attack: { resolve: string; retaliation?: { perRound: number } };
  damage: { pipeline: string[] };
  wait: { enabled: boolean; oncePerRound: boolean };
  defend: { enabled: boolean; effect: string };
  morale?: { enabled: boolean; table: Record<string, number> };
  luck?: { enabled: boolean; table: Record<string, number> };
  dice: { default: DiceSource; byPurpose?: Record<string, DiceSource> };
  scopes: Scope[];
};
type DiceSource = 'generator' | 'external';        // generator — ядро бросает само; external — запрос ввода
type Scope = 'turn' | 'round' | 'battle';
```

## Модификаторы, формулы, условия, операции

```ts
type Modifier = {
  attr: string;
  op: 'addBase' | 'pctBase' | 'add' | 'pctAll' | 'mulCompound' | 'addFinal' | 'override' | 'floor' | 'cap';
  value: ValueExpr;
  bonusType?: string;
  stackingKey?: string;
  when?: Predicate;
  priority?: number;
};

type ValueExpr =
  | number
  | { dice: string }
  | { ref: string; snapshot?: boolean }
  | { op: 'add' | 'sub' | 'mul' | 'div' | 'min' | 'max'; args: ValueExpr[] }
  | { table: Record<string, number>; by: ValueExpr };

type Predicate =
  | { all: Predicate[] } | { any: Predicate[] } | { not: Predicate }
  | { tag: string; on: Subject; exact?: boolean }
  | { cmp: '>=' | '<=' | '==' | '>' | '<'; a: ValueExpr; b: ValueExpr }
  | { var: string; eq: Json }                      // переменная сценария
  | { fn: string; args?: unknown };

type Op =
  | { op: 'damage'; amount: ValueExpr; dmgType: string }
  | { op: 'heal'; amount: ValueExpr }
  | { op: 'attack'; profile: string; onHit?: Op[]; onMiss?: Op[] }
  | { op: 'check'; stat: string; dc: ValueExpr; onFail: Op[]; onSuccess?: Op[] }
  | { op: 'applyEffect'; effect: string; chance?: ValueExpr; to: TargetRef }
  | { op: 'removeEffects'; withTags: string[]; to: TargetRef }
  | { op: 'modifyResource'; res: string; amount: ValueExpr; to: TargetRef }
  | { op: 'summon'; creature: string; count: ValueExpr; at: HexSelector }
  | { op: 'move' | 'push' | 'teleport'; to: HexSelector }
  | { op: 'setVar'; var: string; value: Json }
  | { op: 'if'; when: Predicate; then: Op[]; else?: Op[] }
  | { op: 'forEach'; targets: TargetSelector; do: Op[] }
  | { op: 'choose'; side?: SideId; options: { id: string; label: I18n; do: Op[] }[] };
```

## Эффект, триггер, способность, предмет

```ts
type EffectDef = {
  id: string;
  name: I18n;                                      // текст контента; как показывать — решает манифест оформления
  description?: I18n;
  tags: string[];
  grantedTags?: string[];
  hiddenFrom?: 'enemies' | 'all';                  // игровое правило видимости
  duration:
    | { kind: 'instant' | 'permanent' | 'battle' }
    | { kind: 'rounds' | 'turns'; n: ValueExpr; tickOn?: 'carrierTurnStart' | 'carrierTurnEnd' | 'roundEnd' };
    // carrier — носитель эффекта; если ход у стороны, считается ход его стороны
  expireOn?: EventFilter[];
  modifiers?: Modifier[];
  applyRequires?: Predicate;
  ongoingRequires?: Predicate;
  removeEffectsWithTags?: string[];
  blockAbilitiesWithTags?: string[];
  stacking: {
    key?: string;
    scope: 'bySource' | 'byTarget';
    policy: 'stack' | 'refresh' | 'ignore' | 'highest' | 'replace';
    maxStacks?: number;
    onReapply?: 'refreshDuration' | 'addDuration' | 'keep';
    onExpire?: 'all' | 'oneStack';
  };
  onApply?: Op[];
  onTick?: Op[];
  onRemove?: Op[];
  triggers?: TriggerDef[];
  aura?: { radius: number; affects: Predicate; effect: string };
};

type TriggerDef = {
  on: BattleEvent['e'];
  filter?: Predicate;
  ops?: Op[];
  replace?: Op[];
  limit?: { per: Scope; count: number };
  priority?: number;
};

type ScenarioTrigger = {
  id: string;
  on: { event: BattleEvent['e']; round?: number };
  once?: boolean;
  priority?: number;
  if?: Predicate;
  do: Op[];
};

type AbilityDef = {
  id: string;
  name: I18n;
  owner: 'unit' | 'side';                          // способность юнита или стороны целиком
  kind: 'attack' | 'shoot' | 'spell' | 'skill' | 'itemUse' | 'move';
  tags: string[];
  actionCost: 'turn' | 'action' | 'move' | 'bonus' | 'free';   // 'turn' — тратит весь ход
  costs?: { res: string; amount: ValueExpr }[];
  cooldown?: { rounds: number };
  uses?: { max: ValueExpr; per: Scope };
  requires?: Predicate;
  blockedByTags?: string[];
  targeting: {
    mode: 'unit' | 'hex' | 'self' | 'area' | 'none';
    range: ValueExpr;
    area?: { shape: 'radius' | 'line' | 'cone'; size: number };
    filter?: Predicate;
    count?: number;
  };
  ops: Op[];
};

type ItemDef = {
  id: string;
  name: I18n;
  tags: string[];
  slots?: string[];
  maxStack?: number;
  weapon?: { profile: string; range: 'melee' | 'ranged'; properties: string[] };
  passive?: { effects: string[]; stackAcrossCopies?: boolean };
  grants?: string[];
  use?: {
    ability: string;
    consume: 'one' | 'charge';
    charges?: { max: number; recover?: { per: Scope; amount: ValueExpr } };
    destroyWhenEmpty?: boolean;
    usesPer?: { per: Scope; count: number };
  };
};
```

## Состояние, команды, события, запросы ввода

```ts
type BattleState = {
  v: number;
  content: { packs: PackLock[]; hash: string; ruleset: string };
  round: number;
  lastActedSide: SideId | null;
  phase:
    | { kind: 'deployment'; side: SideId }
    | { kind: 'roundStart' }
    | { kind: 'turn'; owner: TurnOwner; budget: TurnBudget }
    | { kind: 'ended'; outcome: Outcome };
  sides: Record<SideId, SideState>;                // эффекты и способности стороны
  units: Record<UnitId, UnitState>;
  field: FieldState;
  vars: Record<string, Json>;
  triggers: Record<string, { fired: number; enabled: boolean }>;
  stack: Step[];
  pending: InputRequest | null;
  rng: RngState;                                   // ядро бросает само и сдвигает генератор событием DiceRolled
};

// Команды ядра. Кто их отправил, ядро не знает
type Command =
  | { t: 'Deploy'; unit: UnitId; to: Hex } | { t: 'EndDeployment' }
  | { t: 'Move'; unit: UnitId; to: Hex }
  | { t: 'Attack'; unit: UnitId; target: UnitId; from?: Hex }
  | { t: 'Shoot'; unit: UnitId; target: UnitId }
  | { t: 'Cast'; caster: { unit: UnitId } | { side: SideId }; spell: string; target: TargetSpec }
  | { t: 'UseAbility'; owner: { unit: UnitId } | { side: SideId }; ability: string; target: TargetSpec }
  | { t: 'UseItem'; unit: UnitId; item: string; target: TargetSpec }
  | { t: 'Wait'; unit: UnitId } | { t: 'Defend'; unit: UnitId }
  | { t: 'EndTurn' }                                // владелец хода берётся из phase
  | { t: 'Retreat'; side: SideId } | { t: 'Surrender'; side: SideId }
  | { t: 'Answer'; inputId: string; answer: InputAnswer }
  | { t: 'Edit'; edit: StateEdit };                 // правка в обход правил: здоровье, эффекты, позиция

// Событие сообщает только, что произошло. Как его показать, решает слой визуализации
type BattleEvent = { id: string; causeId?: string; visibleTo: 'all' | SideId[] } & (   // [] — только при полной видимости
  | { e: 'BattleStarted' } | { e: 'RoundStarted'; round: number }
  | { e: 'TurnStarted'; owner: TurnOwner } | { e: 'TurnEnded'; owner: TurnOwner }
  | { e: 'UnitMoved'; unit: UnitId; path: Hex[] }
  | { e: 'AttackResolved'; attacker: UnitId; target: UnitId; rolls: number[]; hit: boolean; crit: boolean }
  | { e: 'DamageDealt'; target: UnitId; amount: number; killed: number; countAfter: number; topHpAfter: number }
  | { e: 'Healed'; target: UnitId; amount: number; countAfter: number; topHpAfter: number }
  | { e: 'EffectApplied' | 'EffectExpired' | 'EffectTicked'; target: { unit: UnitId } | { side: SideId }; effect: EffectInstance }
  | { e: 'ResourceChanged'; target: UnitId; res: string; after: number }
  | { e: 'ItemUsed'; unit: UnitId; item: string; qtyAfter: number }
  | { e: 'UnitDied' | 'UnitRevealed' | 'UnitHidden'; unit: UnitId }
  | { e: 'UnitSummoned'; unit: UnitState }
  | { e: 'InputRequested'; request: InputRequest } | { e: 'InputAnswered'; inputId: string; answer: InputAnswer }
  | { e: 'DiceRolled'; purpose: string; values: number[]; source: DiceSource; rngAfter?: RngState }
  | { e: 'VarChanged'; name: string; value: Json } | { e: 'TriggerFired'; trigger: string }
  | { e: 'Edited'; edit: StateEdit }
  | { e: 'BattleEnded'; outcome: Outcome; stateHash: string }
);

// Запрос внешнего ввода. Ядро указывает, к какой стороне он относится, но не кто ответит.
// Ответа по умолчанию у ядра нет: что делать, если никто не ответил, решает запасной агент
type InputRequest =
  | { id: string; kind: 'roll'; spec: { dice: string; purpose: string; subject?: UnitId }; side?: SideId }
  | { id: string; kind: 'choice'; side?: SideId; options: { id: string; label: I18n }[] }
  | { id: string; kind: 'target'; side?: SideId; ability: string; legal: TargetOption[] };
```

## Журнал (`application`)

```ts
type JournalHeader = {
  formatVersion: number;
  battleId: string;
  createdAt: number;
  packs: PackLock[];
  contentHash: string;
  ruleset: string;
  setup: BattleSetup;                              // без клиентских настроек экрана
  seed: string;
  forkedFrom?: { battleId: string; seq: number };
};

// seq — номер записи; он же номер версии состояния после записи
type JournalEntry = {
  seq: number;
  epoch: number;
  at: number;                                      // время от Clock; на расчёт боя не влияет
  intentId: string;
  actor: ActorId | 'arbiter';                      // 'arbiter' — действия самого арбитра
  agentKind?: string;
} & (
  | { kind: 'battle'; command: Command; events: BattleEvent[]; stateHash: string }
  | { kind: 'session'; command: SessionCommand }    // откат, пауза, смена агента
);

type EventBatch = { seq: number; intentId: string; actor: ActorId | 'arbiter'; events: BattleEvent[] };

type Snapshot = { seq: number; state: BattleState };
```
