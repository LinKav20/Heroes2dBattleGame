import type { Extension, RegistryKeys } from '../index.ts';

export interface Channel extends Extension {
  readonly schemes: readonly string[];
}

export const INVALID_NPM_NAMES = [
  '',
  'Frost',
  'frost mechanics',
  '@acme',
  '@acme/',
  '/frost',
  '.frost',
  '_frost',
  '@Acme/frost',
];

export const SCHEMES: RegistryKeys<Channel> = {
  label: 'URL scheme',
  of: (channel) => channel.schemes,
  valid: (scheme) => /^[a-z][a-z0-9+.-]*:$/.test(scheme),
};

export class FirstCopy implements Extension {
  constructor(readonly name: string, readonly shortName: string) {}
}

export class SecondCopy implements Extension {
  constructor(readonly name: string, readonly shortName: string) {}
}

export function asExtension(value: unknown): Extension {
  return value as Extension;
}

export function asChannel(value: unknown): Channel {
  return value as Channel;
}
