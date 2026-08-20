import { gracefulShutdown, registerShutdownHandlers } from '../worker/shutdown';

describe('graceful shutdown', () => {
  it('closes the worker then exits with code 0', async () => {
    const close = jest.fn().mockResolvedValue(undefined);
    const exit = jest.fn();

    await gracefulShutdown({ close }, exit);

    expect(close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('exits non-zero when close rejects instead of leaving the promise unhandled', async () => {
    const close = jest.fn().mockRejectedValue(new Error('redis gone'));
    const exit = jest.fn();

    await gracefulShutdown({ close }, exit);

    expect(exit).toHaveBeenCalledWith(1);
  });

  it('exits non-zero when close never settles, rather than hanging until SIGKILL', async () => {
    const close = jest.fn().mockReturnValue(new Promise<void>(() => {}));
    const exit = jest.fn();

    await gracefulShutdown({ close }, exit, 20);

    expect(exit).toHaveBeenCalledWith(1);
  });

  it('registers both SIGINT and SIGTERM by default', () => {
    const close = jest.fn().mockResolvedValue(undefined);
    const spy = jest.spyOn(process, 'on');

    const signals = registerShutdownHandlers({ close });

    expect(signals).toEqual(['SIGINT', 'SIGTERM']);
    const registered = spy.mock.calls.map((c) => c[0]);
    expect(registered).toEqual(expect.arrayContaining(['SIGINT', 'SIGTERM']));

    spy.mockRestore();
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
  });
});
