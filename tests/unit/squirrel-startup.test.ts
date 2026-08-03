jest.mock('electron', () => ({
  app: {
    quit: jest.fn()
  }
}));

import { getSquirrelAction } from '../../electron/main/infrastructure/SquirrelStartup';

describe('Squirrel startup events', () => {
  it.each([
    ['--squirrel-install', 'createShortcut'],
    ['--squirrel-updated', 'createShortcut'],
    ['--squirrel-uninstall', 'removeShortcut'],
    ['--squirrel-obsolete', 'quit']
  ] as const)('maps %s to %s', (argument, expected) => {
    expect(getSquirrelAction(['Ytomp34.exe', argument], 'win32')).toBe(expected);
  });

  it('ignores normal launches and non-Windows platforms', () => {
    expect(getSquirrelAction(['Ytomp34.exe'], 'win32')).toBeNull();
    expect(getSquirrelAction(['Ytomp34', '--squirrel-install'], 'darwin')).toBeNull();
  });
});
