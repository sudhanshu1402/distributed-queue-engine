import { gracefulShutdown, registerShutdownHandlers } from '../worker/shutdown';

describe('graceful shutdown', () => {
  it('closes the worker then exits with code 0', async () => {
    const close = jest.fn().mockResolvedValue(undefined);
    const exit = jest.fn();

    await gracefulShutdown({ close }, exit);

    expect(close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
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
