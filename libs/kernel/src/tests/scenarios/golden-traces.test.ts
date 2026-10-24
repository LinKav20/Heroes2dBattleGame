import { describe, expect, it } from 'vitest';
import {
  abilityDefinition,
  creatureDefinition,
  hashJson,
  standsOnField,
  type BattleState,
  type Command,
  type ContentRegistry,
  type FieldGeometry,
  type Target,
  type Unit,
} from '../../index.ts';
import { act, answerRoll, deployed, DRIVE, endTurn, move, use, type Drive } from './driver.ts';
import { created, SKIRMISH, WORLD, worldWith } from './world.ts';

interface Trace {
  readonly hashes: readonly string[];
  readonly outcome: unknown;
}

describe('the traces of whole battles', () => {
  it('stay the same at the pass with rolls of the generator', () => {
    expect(trace(deployed(created()), DRIVE)).toStrictEqual(PASS_TRACE);
  });

  it('stay the same at the pass with rolls from outside', () => {
    const options = { ruleset: { randomSources: { 'demo:damage': 'external' as const } } };

    expect(trace(deployed(created(WORLD, options)), DRIVE)).toStrictEqual(EXTERNAL_TRACE);
  });

  it('stay the same when the sides take turns', () => {
    const drive = { ...DRIVE, content: SIDES };

    expect(trace(deployed(created(SIDES), drive), drive)).toStrictEqual(SIDES_TRACE);
  });
});

const SIDES: ContentRegistry = worldWith({}, {
  mechanics: { ...SKIRMISH.mechanics, 'kernel:turn-order': { variant: 'acme:sides' } },
  turnOwner: 'side',
});

const PASS_TRACE: Trace = {
  hashes: [
    '445d3bd6e3c6dba9',
    '9563a5c9562090c1',
    '94b481e56bda1730',
    'fbe059c06e1aea77',
    '1cfecbdf5304cc5e',
    '7bce0b04882fdae7',
    'ec656885244bb5bb',
    '8b2bf7090238ddaa',
    'ac22bb67304b7076',
    '74790f153af07fa8',
    'f9dcbc0f85d5baa3',
    'fa92bbb4a6e92f73',
    '61eb16e0666e8a19',
    '45071dba9810c611',
    '644889612383a14d',
    '56941f1b884a4689',
    '94e6374439364c2c',
    '3534339b6d4eb018',
    'a1ad906b25164e51',
    'c637725375a70dbf',
    '571fd56fa3fc9d41',
    '45ff848c15cc7297',
    'ed501a1d8006383a',
    '5a7f2582a87d0ecc',
    'bd944d4bd1992844',
    '094795e7c856e1a0',
    'f2826675538184af',
    'efa4c446d05906ac',
    'feac7aeeed855d93',
    'd54a5ca07003a9b6',
    'e3342ef2d0ed69be',
    'd39bbc1c512104be',
    'b6690d87b2b31e6a',
    '1ad7440d5c12a367',
    '8e850f53434c68ec',
    'dfc3afc7ae833451',
    '4609238ffd4ce7d4',
    'a5e0a52c8a5fddc8',
    'dafce0603d1c1fc2',
    '5ed36225120d9e35',
    'f8086d6cd8dadf36',
  ],
  outcome: { condition: 'held', kind: 'victory', side: 'defender', winners: ['defender'] },
};

const EXTERNAL_TRACE: Trace = {
  hashes: [
    '7eb05f32e47079e1',
    '23a217688c68fe68',
    'a6be0e90ece66e36',
    '9b11765356708749',
    '44f29b83bd2b545e',
    'faa2bb385c3abfb3',
    '9427033c694a268e',
    'cf767fac6c92b427',
    '43f834e9bc9a313c',
    '2c9a2db104309d6f',
    '8e122420ab726deb',
    '7c1865037a148948',
    '26263ee7025b0826',
    'bf74780183f93a26',
    'e5d741a7d4640f16',
    'e734b9d45c0ddbe2',
    '65f7fdd2e903f828',
    '6dde9ed9274e35cd',
    '32f83fa2f9831af0',
    '7285c29531477f0b',
    '1c4ee1303c4c2842',
    '58c1e31202b4986d',
    'fd3d9900e63701c7',
    '70f336911a636506',
    '9b17af9abfcad653',
    '6cd8c96ec27b64fb',
    '132b6036bccf37b8',
    'e9652f810fb24ca5',
    'bacfd5a47c2c4ab0',
    'bd12d7b8880b442e',
    '919edc6dc34aac29',
    'e379a6943d8cf6ed',
    '27b1f04795133b6d',
    'f60098b45386d0d9',
    '84b3f4fdfc433f2b',
    '70d76119e85ab777',
    '5c1f525a7f1b175a',
    'da6112f2ea18cdeb',
    '350d8f197d9133ef',
    '7a65e7c14e7e75a8',
    '06eb2fb5dd625036',
    '4edb7b36b4177a42',
    '12f0a70020945aff',
  ],
  outcome: { condition: 'held', kind: 'victory', side: 'defender', winners: ['defender'] },
};

const SIDES_TRACE: Trace = {
  hashes: [
    '4fd081d993804707',
    'e8cea66fc853fce4',
    'eedf06dd35edfb1d',
    '57926f75cff4c7d9',
    '5b122936b640ec5e',
    '27644b23c99be264',
    '7a849d41e90fcfa8',
    '14c49e4efd78b704',
    'abc4cd9446c6b83c',
    'a6beb47d4bd14b1d',
    '2caa7236ca372b4d',
    '6d9214546a05ecc4',
    '0a37593a710af0a2',
    'be3e5bee9fa15f06',
    'f216ceed37e267e3',
    '37f28741a032e52f',
    '15647660cf59e69c',
    '639008c0532d7b50',
    '770285d40810e08d',
    '32f7f6f3008b4bab',
    '273be1cf538af7a7',
    '4457784269a2e63c',
    'f26ae899c9304ddc',
    '9ca48aa2be25b63e',
    '7c7998eee4d5c636',
    '8422249c5f8d1c18',
    '71cdf9ac504cc275',
    'c7fe490427ffe524',
    '800e949c07c9a234',
    'c967cb29f0c139e7',
    '71e670a6983aaa8e',
    '774048279cde7f02',
    '58d03b03c570896d',
    'd05e448174208ab4',
    'cc0937504cd849d2',
    '2e40983d987ef5ae',
  ],
  outcome: { condition: 'wiped-out', kind: 'victory', side: 'defender', winners: ['defender'] },
};

function trace(first: BattleState, drive: Drive): Trace {
  const hashes: string[] = [];
  let state = first;

  while (state.phase.kind !== 'ended' && hashes.length < 300) {
    state = act(state, nextCommand(state, drive), drive).state;
    hashes.push(hashJson(state).slice(0, 16));
  }

  return { hashes, outcome: state.phase.kind === 'ended' ? state.phase.outcome : undefined };
}

function nextCommand(state: BattleState, { content, kernel }: Drive): Command {
  const { inputRequest, phase } = state;

  if (inputRequest?.kind === 'roll') {
    return answerRoll(inputRequest.id, ...Array.from({ length: inputRequest.count }, () => 1 + (inputRequest.id % 6)));
  }

  if (phase.kind !== 'turn') throw new Error(`No turn in ${phase.kind}`);

  const actors = state.units.filter((one) => standsOnField(one)
    && (phase.unit === undefined ? one.side === phase.side : one.id === phase.unit));

  for (const actor of actors) {
    for (const [ability, targets] of choices(state, actor, content)) {
      const request = { ability, targets, user: { kind: 'unit', unit: actor.id } } as const;

      if (kernel.checkAbility(state, request, content) === undefined) return use(actor.id, ability, ...targets);
    }

    const closer = approach(state, actor, kernel.field(state, content), content);

    if (closer !== undefined) return move(actor.id, closer);
  }

  return phase.unit === undefined ? { kind: 'game', side: phase.side, type: 'end-turn' } : endTurn(phase.unit);
}

function approach(state: BattleState, actor: Unit, field: FieldGeometry, content: ContentRegistry): string | undefined {
  if (actor.spentActions['core:move'] !== undefined) return undefined;

  const enemies = state.units.filter((one) => standsOnField(one) && one.side !== actor.side);
  const budget = creatureDefinition(content, actor.creature).attributes['core:move'] ?? 0;
  let best = actor.cell === undefined ? undefined : { cell: actor.cell, distance: nearest(field, actor.cell, enemies) };

  for (const { cell } of field.reachable(actor.id, budget)) {
    const distance = nearest(field, cell, enemies);

    if (best === undefined || distance < best.distance) best = { cell, distance };
  }

  return best?.cell === actor.cell ? undefined : best?.cell;
}

function nearest(field: FieldGeometry, cell: string, enemies: readonly Unit[]): number {
  return Math.min(...enemies.map((one) => field.distanceBetween([cell], field.cellsOf(one.id)) ?? 99));
}

function choices(
  state: BattleState,
  actor: Unit,
  content: ContentRegistry,
): ReadonlyArray<readonly [string, readonly Target[]]> {
  const living = state.units
    .filter((one) => standsOnField(one))
    .toSorted((left, right) => Number(left.side === actor.side) - Number(right.side === actor.side));

  return creatureDefinition(content, actor.creature).abilities.flatMap((ability) => {
    const { kind } = abilityDefinition(content, ability).target;

    return living.map((one): readonly [string, readonly Target[]] => [
      ability,
      [kind === 'area' ? { cell: one.cell ?? '', kind: 'cell' } : { kind: 'unit', unit: one.id }],
    ]);
  });
}
