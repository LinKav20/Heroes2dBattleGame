import { creatureDefinition, type ContentRegistry } from '../content/index.ts';
import { isKernelEvent, KERNEL_EVENTS } from '../events/index.ts';
import type { EventKind, FieldGeometry, TopologyExtension } from '../extensions/index.ts';
import { createFieldGeometry, type FieldCache } from '../geometry/index.ts';
import { findHazard, findUnit, type BattleEvent, type BattleState } from '../model/index.ts';
import type { Registry } from '../names/index.ts';
import { isRecord } from '../shared/index.ts';
import type { ReactionBatch } from './params.ts';

/**
 * What the view of an event needs: the content, the kinds of events, which tell whom an event is about, and what the
 * zones of the field need.
 */
export interface EventSetup {
  /** The content of the battle. */
  readonly content: ContentRegistry;
  /** The kinds of events. */
  readonly events: Registry<EventKind>;
  /** Field topologies, which tell the cells a big creature passes. */
  readonly topologies: Registry<TopologyExtension>;
  /** The cells of fields the kernel has asked topologies for, if the kernel keeps them. */
  readonly fields?: FieldCache;
}

/**
 * What the reactions to an event need to know about it, found once: whom it is about, and whether it touches a hazard
 * zone. An event touches a zone if it is about a unit that stands in the zone, or if it is `kernel:unit-moved` and the
 * way of the unit touches the zone, as `FieldGeometry.cellsAlong` describes; the way is measured on the state before
 * the move.
 */
export class EventView {
  private readonly setup: EventSetup;

  private readonly event: BattleEvent;

  private readonly before: BattleState;

  private readonly state: BattleState;

  private readonly known = new Map<string, boolean>();

  private found?: { readonly target: ReactionBatch['target'] };

  private field?: FieldGeometry;

  constructor(setup: EventSetup, event: BattleEvent, before: BattleState, state: BattleState) {
    this.setup = setup;
    this.event = event;
    this.before = before;
    this.state = state;
  }

  /**
   * Returns the unit or the side the event is about.
   *
   * @throws {TypeError} If the kind of event names a cell or something else than a unit or a side as its target.
   */
  target(): ReactionBatch['target'] {
    this.found ??= { target: targetOf(this.setup.events.get(this.event.type), this.event) };

    return this.found.target;
  }

  /** Tells whether the event touches a hazard zone. */
  touches(zone: string): boolean {
    const known = this.known.get(zone);

    if (known !== undefined) return known;

    const touches = this.find(zone);

    this.known.set(zone, touches);

    return touches;
  }

  private find(zone: string): boolean {
    const target = this.target();
    const unit = target?.kind === 'unit' ? findUnit(this.state, target.unit) : undefined;

    if (unit === undefined) return false;

    if (!isKernelEvent(this.event, KERNEL_EVENTS.unitMoved)) return unit.zones.includes(zone);

    const cells = new Set(findHazard(this.state, zone)?.cells);
    const { facing, path } = this.event.payload;
    const { movement, size } = creatureDefinition(this.setup.content, unit.creature);

    if (size === 1) return (movement === 'fly' ? path.slice(-1) : path).some((cell) => cells.has(cell));

    this.field ??= createFieldGeometry(this.before, this.setup.content, this.setup.topologies, this.setup.fields);

    return this.field.cellsAlong(unit.id, path, facing ?? unit.facing).some((cell) => cells.has(cell));
  }
}

function targetOf(kind: EventKind | undefined, event: BattleEvent): ReactionBatch['target'] {
  const target: unknown = kind?.target?.(event.payload);

  if (target === undefined) return undefined;

  if (isRecord(target) && target.kind === 'unit' && typeof target.unit === 'string') {
    return { kind: 'unit', unit: target.unit };
  }

  if (isRecord(target) && target.kind === 'side' && typeof target.side === 'string') {
    return { kind: 'side', side: target.side };
  }

  throw new TypeError(
    `The kind of event ${JSON.stringify(event.type)} names a target that is neither a unit nor a side.`,
  );
}
