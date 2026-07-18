export interface Closable {
  close: () => Promise<void>;
}

// Drain in-flight jobs and close the worker before exiting, so a rolling deploy
// (SIGTERM) or a local Ctrl-C (SIGINT) never drops a job mid-process.
export const gracefulShutdown = async (
  worker: Closable,
  exit: (code?: number) => void = process.exit
): Promise<void> => {
  console.log('Shutting down gracefully...');
  await worker.close();
  exit(0);
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
