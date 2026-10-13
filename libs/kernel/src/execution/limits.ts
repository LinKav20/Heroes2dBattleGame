/**
 * The deepest stack of steps a command may build.
 */
export const MAX_STACK_DEPTH = 256;

/**
 * The largest number of times one command may run a step. A step that runs again with a value it asked for counts
 * again, and an answer to an input request is a command of its own.
 */
export const MAX_STEPS_PER_COMMAND = 10_000;

/**
 * The largest number of dice in one roll a step asks for.
 */
export const MAX_DICE_PER_ROLL = 1000;

/**
 * The largest number of sides of a die, the size of the range the generator draws from.
 */
export const MAX_DIE_SIDES = 0x1_0000_0000;
