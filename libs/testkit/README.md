# @heroes2dgame/testkit

Test tools for the [Heroes2dBattleGame](https://github.com/LinKav20/Heroes2dBattleGame) battle engine. Only tests
depend on this package: production code never imports it.

## Reference values

`RNG_REFERENCE` and `HASH_REFERENCE` hold reference values of the random number generator and the state hash. An
engine implementation, in TypeScript or in another language, checks that it produces exactly the same numbers and
hashes:

- `RNG_REFERENCE` gives, for several seeds, single values at chosen counters, draws from ranges with rejected values
  and draws that must fail because the counter has run out or the range is not allowed;
- `HASH_REFERENCE` gives JSON inputs with their canonical JSON and SHA-256, and `HASH_REJECTED` lists inputs that
  canonical JSON must reject.

The algorithms are specified in the documentation of the
[random number generator](https://github.com/LinKav20/Heroes2dBattleGame/blob/main/docs/architecture/topics/simulation.md#как-устроен-генератор)
and the
[state hash](https://github.com/LinKav20/Heroes2dBattleGame/blob/main/docs/architecture/topics/journal.md#что-внутри-журнала).

## License

[PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0).
Noncommercial use is free. Commercial use requires a
[commercial license](https://github.com/LinKav20/Heroes2dBattleGame/blob/main/COMMERCIAL-LICENSE.md).
