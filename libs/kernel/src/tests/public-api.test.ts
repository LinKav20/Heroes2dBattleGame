import { describe, expect, it } from 'vitest';
import * as kernel from '../index.ts';

describe('the public API of the kernel', () => {
  it('exports only these values', () => {
    expect(Object.keys(kernel).sort()).toStrictEqual([
      'KERNEL_EVENTS',
      'KERNEL_EXTENSION_KINDS',
      'KERNEL_PREFIX',
      'MAX_STACK_DEPTH',
      'MAX_STEPS_PER_COMMAND',
      'REJECTION_CODES',
      'REJECTION_REASONS',
      'VISIBLE_TO_ALL',
      'VISIBLE_TO_NONE',
      'canonicalJson',
      'createKernel',
      'createRegistry',
      'createRng',
      'extensionPrefix',
      'hashJson',
      'isExtensionName',
      'isKernelEvent',
      'rngNext',
      'rngRange',
      'summonedUnitId',
    ]);
  });

  it('freezes its constants', () => {
    const constants = [
      kernel.KERNEL_EVENTS,
      kernel.KERNEL_EXTENSION_KINDS,
      kernel.REJECTION_CODES,
      kernel.REJECTION_REASONS,
      kernel.VISIBLE_TO_NONE,
    ];

    expect(constants.every((constant) => Object.isFrozen(constant))).toBe(true);
  });

  it('names every event of the kernel with the prefix of the kernel', () => {
    const names = Object.values(kernel.KERNEL_EVENTS);

    expect(names.every((name) => name.startsWith(`${kernel.KERNEL_PREFIX}:`))).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });
});
