import { log } from 'lognow'
import yoctoSpinner from 'yocto-spinner'

const spinner = yoctoSpinner()

function logWithPausedSpinner(emit: () => void, shouldResume: boolean) {
	const wasSpinning = spinner.isSpinning
	spinner.stop()
	emit()

	if (shouldResume && wasSpinning) {
		spinner.start()
	}
}

/**
 * Console logger that coordinates lognow output with the progress spinner. The
 * spinner is paused around each message so lines are not garbled, and is left
 * stopped after errors.
 */
export const logger = {
	debug(...messages: Array<number | string>) {
		logWithPausedSpinner(() => {
			log.debug(...messages)
		}, true)
	},
	error(...messages: Array<number | string>) {
		logWithPausedSpinner(() => {
			log.error(...messages)
		}, false)
	},
	/** Logs an error message together with the underlying cause. */
	errorWithCause(message: string, cause: unknown) {
		logWithPausedSpinner(() => {
			log.withError(cause).error(message)
		}, false)
	},
	info(...messages: Array<number | string>) {
		logWithPausedSpinner(() => {
			log.info(...messages)
		}, true)
	},
	/** Starts the progress spinner. */
	start() {
		spinner.start()
	},
	/** Stops the progress spinner. */
	stop() {
		spinner.stop()
	},
	warn(...messages: Array<number | string>) {
		logWithPausedSpinner(() => {
			log.warn(...messages)
		}, true)
	},
}
