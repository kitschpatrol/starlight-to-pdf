import type { ILogBasic, ILogLayer } from 'lognow'
import { createLogger, injectionHelper } from 'lognow'
import { name } from '../../package.json' with { type: 'json' }

/**
 * The default logger instance for the library.
 */
export let log = createLogger(name)

/**
 * Replaces the logger the library writes its progress output to.
 *
 * @param logger - A LogLayer instance or a Console- or Stream-like log target.
 *   Call with no arguments to silence library logging entirely.
 */
export function setLogger(logger?: ILogBasic | ILogLayer<unknown>) {
	log = injectionHelper(logger)
}
