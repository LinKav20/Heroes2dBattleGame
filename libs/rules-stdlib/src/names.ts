/**
 * The prefix of the names of the extensions of the package.
 */
export const PREFIX = 'rules-stdlib';

/**
 * The full names of the mechanics that the package asks a ruleset about: morale, which the order of turns by speed
 * asks, and luck, which the attack of stacks asks.
 */
export const RULES_STDLIB_MECHANICS = Object.freeze({
  luck: `${PREFIX}:luck`,
  morale: `${PREFIX}:morale`,
});

/**
 * The full names of the extensions of the package, of every kind in one table: the topology, the variants of
 * mechanics, the kinds of steps and of events, and the keys under which the orders of turns keep their data in the
 * state.
 */
export const RULES_STDLIB_NAMES = Object.freeze({
  attacked: `${PREFIX}:attacked`,
  brace: `${PREFIX}:brace`,
  chanceLuck: `${PREFIX}:chance-luck`,
  chanceMorale: `${PREFIX}:chance-morale`,
  hex: `${PREFIX}:hex`,
  initiative: `${PREFIX}:initiative`,
  initiativeRoll: `${PREFIX}:initiative-roll`,
  initiativeRolled: `${PREFIX}:initiative-rolled`,
  moraleCheck: `${PREFIX}:morale-check`,
  moraleRolled: `${PREFIX}:morale-rolled`,
  retaliate: `${PREFIX}:retaliate`,
  sides: `${PREFIX}:sides`,
  speed: `${PREFIX}:speed`,
  speedChanged: `${PREFIX}:speed-changed`,
  speedRound: `${PREFIX}:speed-round`,
  stacks: `${PREFIX}:stacks`,
  strike: `${PREFIX}:strike`,
});

/**
 * The reasons with which the extensions of the package forbid commands.
 */
export const RULES_STDLIB_REASONS = Object.freeze({
  cannotWait: `${PREFIX}:cannot-wait`,
  enemyNearby: `${PREFIX}:enemy-nearby`,
  noShots: `${PREFIX}:no-shots`,
  notAdjacent: `${PREFIX}:not-adjacent`,
  notAnEnemy: `${PREFIX}:not-an-enemy`,
  outOfSight: `${PREFIX}:out-of-sight`,
});
