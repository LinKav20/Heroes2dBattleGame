# Типы

Обновлено: 2026-10-03. Наброски, не окончательные определения.

## Входящие порты (`application`)

```ts
interface BattlePlay {
  submit(intent: IntentEnvelope): Promise<Ack>;
  view(viewer: Viewer): ViewSnapshot;
  subscribe(viewer: Viewer, fromSeq: number, onBatch: (b: EventBatchForViewer) => void): Unsubscribe;
  legalActions(viewer: Viewer, actor: ActorRef): LegalActions;
  path(viewer: Viewer, unit: UnitId, to: Hex): Hex[] | null;
  preview(viewer: Viewer, cmd: Command): ActionPreview;
  turnQueue(viewer: Viewer, rounds: number): UnitId[];
}

interface BattleHosting {
  create(setup: BattleSetup): Promise<{ battleId: string } | { errors: Diagnostic[] }>;
  resume(battleId: string): Promise<void>;
  result(battleId: string): Promise<BattleResult | null>;
  exportJournal(battleId: string): Promise<Journal>;
}

interface BattleHistory {
  stateAt(seq: number): Promise<ViewSnapshot>;
  rewind(toSeq: number, by: Principal): Promise<Ack>;
  fork(fromSeq: number): Promise<{ battleId: string }>;
}

interface BattleAdmin {
  pause(by: Principal): Promise<Ack>;
  resume(by: Principal): Promise<Ack>;
  assignAgent(seat: SeatId, agent: AgentRef, by: Principal): Promise<Ack>;
  override(edit: GmEdit, by: Principal): Promise<Ack>;
}
```

## Исходящие порты (`application`, `presentation`)

```ts
interface JournalStore {
  createBattle(header: JournalHeader): Promise<void>;
  append(battleId: string, entries: JournalEntry[]): Promise<void>;
  read(battleId: string, fromSeq: number): Promise<JournalEntry[]>;
  saveSnapshot(battleId: string, snapshot: Snapshot): Promise<void>;
  latestSnapshot(battleId: string, atOrBefore?: number): Promise<Snapshot | null>;
  saveResult(battleId: string, result: BattleResult): Promise<void>;
  list(): Promise<BattleSummary[]>;
}

interface Authority {
  readonly epoch: number;
  propose(intent: IntentEnvelope): Promise<Ack>;
  onCommitted(cb: (batch: EventBatch) => void): Unsubscribe;
}

interface Channel {
  send(message: WireMessage): void;
  onMessage(cb: (message: WireMessage) => void): Unsubscribe;
  status(): 'connected' | 'reconnecting' | 'offline';
  close(): void;
}

interface Agent {
  readonly kind: string;                       // 'ui' | 'utility-ai' | 'mcts' | 'llm' | 'remote' | ...
  decide(view: ViewSnapshot, request: DecisionRequest, signal: AbortSignal): Promise<Command>;
  notify?(batch: EventBatchForViewer): void;
}

interface HostBridge {
  onCommand(cb: (msg: HostInbound) => void): Unsubscribe;   // createBattle, resumeBattle, openReplay, getJournal
  send(msg: HostOutbound): void;                            // ready, battleStarted, battleProgress, battleFinished, journal, error
}

interface ContentSource {
  loadPacks(refs: PackRef[]): Promise<RawPack[]>;
}

interface Renderer {
  mount(host: HTMLElement | null, field: FieldView, catalog: ContentCatalog, skin: SkinManifest): void;
  applyState(state: DisplayedState): void;
  play(event: BattleEvent, ctx: CueContext): Promise<void> | void;
  finish(event: BattleEvent): void;
  highlight(h: Highlights): void;
  pick(x: number, y: number): PickResult;
  dispose(): void;
}

interface Clock { now(): number }
interface Entropy { seed(): string }
interface SeatPolicy { canAct(principal: Principal, seat: SeatId): boolean; seatsOf(principal: Principal): SeatId[] }
```

## Ядро (`kernel`)

```ts
interface Kernel {
  init(setup: ResolvedBattleSetup, content: ContentRegistry): { state: BattleState; events: BattleEvent[] };
  decide(state: BattleState, cmd: Command): Result<BattleEvent[], RuleError>;
  apply(state: BattleState, event: BattleEvent): BattleState;
  legalActions(state: BattleState, actor: ActorRef): LegalActions;
  reachable(state: BattleState, unit: UnitId): Reach[];
  preview(state: BattleState, cmd: Command): ActionPreview;
  turnQueue(state: BattleState, rounds: number): UnitId[];
  pendingDecision(state: BattleState): Decision | null;
  project(state: BattleState, viewer: Viewer): ViewSnapshot;
  projectEvents(events: BattleEvent[], viewer: Viewer, before: BattleState): BattleEvent[];
}

// Контракты расширений
interface OpHandler<P> { id: string; run(params: P, ctx: OpContext, state: BattleState): Step[] }
interface ConditionHandler<P> { id: string; test(params: P, ctx: OpContext, state: BattleState): boolean }
interface Scheduler { id: string; next(state: BattleState): { kind: 'activate'; unit: UnitId } | { kind: 'newRound' }; queue(state: BattleState, rounds: number): UnitId[] }
```

## Набор правил

```ts
type RulesetDef = {
  id: string;
  scheduler: string;                         // 'speed-phases' | 'initiative-roll'
  actionEconomy: 'single-activation' | 'action-move-bonus';
  unitModel: { stacks: boolean; maxStacksPerSide?: number };
  heroMode: 'commander' | 'combatant' | 'none';
  attack: { resolve: string; retaliation?: { perRound: number } };
  damage: { pipeline: string[] };
  wait: { enabled: boolean; oncePerRound: boolean };
  defend: { enabled: boolean; effect: string };
  morale?: { enabled: boolean; table: Record<string, number> };
  luck?: { enabled: boolean; table: Record<string, number> };
  dice: { default: DicePolicy; byPurpose?: Record<string, DicePolicy> };
  scopes: Scope[];
};
type DicePolicy = 'digital' | 'gm' | 'owner';
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
  | { op: 'if'; when: Predicate; then: Op[]; else?: Op[] }
  | { op: 'forEach'; targets: TargetSelector; do: Op[] }
  | { op: 'choose'; actor: Subject; options: { id: string; label: I18n; do: Op[] }[] };
```

## Эффект, триггер, способность, предмет

```ts
type EffectDef = {
  id: string;
  assetTags: string[];
  grantedTags?: string[];
  duration:
    | { kind: 'instant' | 'permanent' | 'battle' }
    | { kind: 'rounds' | 'turns'; n: ValueExpr; tickOn?: 'ownerTurnStart' | 'ownerTurnEnd' | 'roundEnd' };
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
  ui?: { name: I18n; description?: I18n; icon?: string; cue?: string; hidden?: boolean };
};

type TriggerDef = {
  on: GameEventKind;
  filter?: Predicate;
  ops?: Op[];
  replace?: Op[];
  limit?: { per: Scope; count: number };
  priority?: number;
};

type AbilityDef = {
  id: string;
  name: I18n;
  kind: 'attack' | 'shoot' | 'spell' | 'skill' | 'itemUse' | 'move';
  tags: string[];
  actionCost: 'activation' | 'action' | 'move' | 'bonus' | 'free';
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
  cues?: { cast?: string; travel?: string; impact?: string };
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

## Состояние, команды, события, запросы решений

```ts
type BattleState = {
  v: number;
  content: { packs: PackLock[]; hash: string; ruleset: string };
  seq: number;
  round: number;
  lastActedSide: SideId | null;
  phase:
    | { kind: 'deployment'; side: SideId }
    | { kind: 'roundStart' }
    | { kind: 'activation'; unit: UnitId; budget: ActionBudget }
    | { kind: 'ended'; outcome: Outcome };
  sides: Record<SideId, SideState>;
  units: Record<UnitId, UnitState>;
  field: FieldState;
  vars: Record<string, Json>;
  triggers: Record<string, { fired: number; enabled: boolean }>;
  stack: Step[];
  pending: Decision | null;
  rng: RngState;
};

type Command =
  | { t: 'Deploy'; unit: UnitId; to: Hex } | { t: 'EndDeployment' }
  | { t: 'Move'; unit: UnitId; to: Hex }
  | { t: 'Attack'; unit: UnitId; target: UnitId; from?: Hex }
  | { t: 'Shoot'; unit: UnitId; target: UnitId }
  | { t: 'Cast'; caster: CasterRef; spell: string; target: TargetSpec }
  | { t: 'UseAbility'; unit: UnitId; ability: string; target: TargetSpec }
  | { t: 'UseItem'; unit: UnitId; item: string; target: TargetSpec }
  | { t: 'Wait'; unit: UnitId } | { t: 'Defend'; unit: UnitId } | { t: 'EndActivation'; unit: UnitId }
  | { t: 'Retreat'; side: SideId } | { t: 'Surrender'; side: SideId }
  | { t: 'Resolve'; decisionId: string; answer: DecisionAnswer }
  | { t: 'GmOverride'; edit: GmEdit }
  | { t: 'AssignAgent'; seat: SeatId; agent: AgentRef }
  | { t: 'Rewind'; toSeq: number };

type BattleEvent = { id: string; causeId?: string; visibility: 'all' | SideId[] | 'gm'; cue?: Cue } & (
  | { e: 'BattleStarted' } | { e: 'RoundStarted'; round: number } | { e: 'ActivationStarted'; unit: UnitId }
  | { e: 'UnitMoved'; unit: UnitId; path: Hex[] }
  | { e: 'AttackResolved'; attacker: UnitId; target: UnitId; rolls: number[]; hit: boolean; crit: boolean }
  | { e: 'DamageDealt'; target: UnitId; amount: number; killed: number; countAfter: number; topHpAfter: number }
  | { e: 'Healed'; target: UnitId; amount: number; countAfter: number; topHpAfter: number }
  | { e: 'EffectApplied' | 'EffectExpired' | 'EffectTicked'; target: UnitId; effect: EffectInstance }
  | { e: 'ResourceChanged'; target: UnitId; res: string; after: number }
  | { e: 'ItemUsed'; unit: UnitId; item: string; qtyAfter: number }
  | { e: 'UnitDied' | 'UnitRevealed' | 'UnitHidden'; unit: UnitId }
  | { e: 'UnitSummoned'; unit: UnitState }
  | { e: 'DecisionRequested'; decision: Decision } | { e: 'DecisionResolved'; decisionId: string; answer: DecisionAnswer }
  | { e: 'DiceRolled'; purpose: string; values: number[]; source: DicePolicy }
  | { e: 'VarChanged'; name: string; value: Json } | { e: 'TriggerFired'; trigger: string }
  | { e: 'AgentAssigned'; seat: SeatId; agent: AgentRef; by: string }
  | { e: 'GmEdited'; edit: GmEdit } | { e: 'Rewound'; toSeq: number }
  | { e: 'BattleEnded'; outcome: Outcome; stateHash: string }
);

type Cue = { id: string; mode: 'blocking' | 'parallel' | 'persistentAdd' | 'persistentRemove'; group?: string };

type Decision =
  | { id: string; kind: 'roll'; spec: { dice: string; purpose: string; subject?: UnitId }; policy: DicePolicy; by?: SideId | 'gm' }
  | { id: string; kind: 'choice'; actor: SideId | 'gm'; options: { id: string; label: I18n }[]; default: string; deadlineMs?: number }
  | { id: string; kind: 'target'; actor: SideId; ability: string; legal: TargetOption[]; default?: TargetOption }
  | { id: string; kind: 'gmRuling'; question: I18n; options: { id: string; label: I18n }[] };
```

## Журнал

```ts
type JournalHeader = {
  formatVersion: number;
  battleId: string;
  createdAt: number;
  packs: PackLock[];
  contentHash: string;
  ruleset: string;
  setup: BattleSetup;
  seed: string;
  forkedFrom?: { battleId: string; seq: number };
};

type JournalEntry = {
  seq: number;
  epoch: number;
  intentId: string;
  actor: { seat: SeatId | 'system'; principal: string; agentKind: string };
  command: Command;
  events: BattleEvent[];
  stateHash: string;
};

type Snapshot = { seq: number; state: BattleState };
```
