export interface Closable {
  close: () => Promise<void>;
}

// Drain in-flight jobs and close the worker before exiting, so a rolling deploy
// (SIGTERM) or a local Ctrl-C (SIGINT) never drops a job mid-process.
// A close() that rejects or never settles must still exit, or the container sits
// until the orchestrator SIGKILLs it and the drain is lost anyway.
export const SHUTDOWN_TIMEOUT_MS = 15_000;

export const gracefulShutdown = async (
  worker: Closable,
  exit: (code?: number) => void = process.exit,
  timeoutMs: number = SHUTDOWN_TIMEOUT_MS
): Promise<void> => {
  console.log('Shutting down gracefully...');
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      worker.close(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`worker.close() did not settle in ${timeoutMs}ms`)),
          timeoutMs
        );
        timer.unref?.();
      })
    ]);
    exit(0);
  } catch (error) {
    console.error('Shutdown failed, exiting non-zero:', error);
    exit(1);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/** Register SIGINT and SIGTERM to drain the worker. Returns the signals wired. */
export const registerShutdownHandlers = (
  worker: Closable,
  signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM']
): NodeJS.Signals[] => {
  for (const signal of signals) {
    process.on(signal, () => {
      void gracefulShutdown(worker);
    });
  }
  return signals;
};
