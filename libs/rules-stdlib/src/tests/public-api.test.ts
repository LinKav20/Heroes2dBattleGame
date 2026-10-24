import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as stdlib from '../index.ts';

describe('the public API of rules-stdlib', () => {
  it('exports only these values', () => {
    expect(Object.keys(stdlib).sort()).toStrictEqual(VALUES);
  });

  it('exports only these types', () => {
    expect(exportedNames().filter((name) => !VALUES.includes(name))).toStrictEqual(TYPES);
  });

  it('registers every extension once under its prefix and freezes its constants', () => {
    const names = stdlib.RULES_STDLIB_EXTENSIONS.map(({ name }) => name);
    const tables = [stdlib.RULES_STDLIB_MECHANICS, stdlib.RULES_STDLIB_NAMES, stdlib.RULES_STDLIB_REASONS];

    expect(new Set(names).size).toBe(names.length);
    expect(names.every((name) => name.startsWith('rules-stdlib:'))).toBe(true);
    expect(Object.isFrozen(stdlib.RULES_STDLIB_EXTENSIONS)).toBe(true);
    expect(stdlib.RULES_STDLIB_EXTENSIONS.every((extension) => Object.isFrozen(extension))).toBe(true);
    expect(tables.every((table) => Object.isFrozen(table))).toBe(true);

    expect(tables.flatMap((table) => Object.values(table)).every((name) => name.startsWith('rules-stdlib:')))
      .toBe(true);
  });
});

const VALUES = [
  'BRACE_DEFENSE',
  'CHANCE_LUCK',
  'CHANCE_MORALE',
  'HEX_TOPOLOGY',
  'INITIATIVE_ORDER',
  'RULES_STDLIB_EXTENSIONS',
  'RULES_STDLIB_MECHANICS',
  'RULES_STDLIB_NAMES',
  'RULES_STDLIB_REASONS',
  'SIDES_ORDER',
  'SPEED_ORDER',
  'STACK_ATTACK',
];

const TYPES = [
  'AttackedPayload',
  'BonusParams',
  'BraceParams',
  'Chance',
  'ChanceParams',
  'ChanceResult',
  'ChanceVariant',
  'DamageParams',
  'HexParams',
  'InitiativeData',
  'InitiativeParams',
  'LuckParams',
  'MoraleRolledPayload',
  'RetaliationParams',
  'ShotParams',
  'SpeedData',
  'SpeedParams',
  'StackParams',
];

function exportedNames(): string[] {
  const entry = fileURLToPath(new URL('../index.ts', import.meta.url));
  const program = ts.createProgram([entry], {
    allowImportingTsExtensions: true,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    strict: true,
    target: ts.ScriptTarget.ES2023,
    types: [],
  });
  const source = program.getSourceFile(entry);
  const checker = program.getTypeChecker();
  const module = source === undefined ? undefined : checker.getSymbolAtLocation(source);

  if (module === undefined) throw new Error('The entry point of rules-stdlib has no exports.');

  return checker.getExportsOfModule(module).map((symbol) => symbol.getName()).sort();
}
