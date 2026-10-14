/**
 * The deepest stack of steps a command may build.
 */
export const MAX_STACK_DEPTH = 256;

/**
 * The largest number of times one command may run a step. A step that runs again with a value it asked for counts
 * again, and an answer to an input request is a command of its own.
 */
export const MAX_STEPS_PER_COMMAND = 10_000;
