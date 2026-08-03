import { spawn } from 'child_process';
import * as path from 'path';
import { app } from 'electron';

type SquirrelAction = 'createShortcut' | 'removeShortcut' | 'quit' | null;

export function getSquirrelAction(
  args: string[],
  platform: NodeJS.Platform
): SquirrelAction {
  if (platform !== 'win32') return null;

  switch (args[1]) {
    case '--squirrel-install':
    case '--squirrel-updated':
      return 'createShortcut';
    case '--squirrel-uninstall':
      return 'removeShortcut';
    case '--squirrel-obsolete':
      return 'quit';
    default:
      return null;
  }
}

/** Handle Squirrel setup events before normal application initialization. */
export function handleSquirrelStartup(): boolean {
  const action = getSquirrelAction(process.argv, process.platform);
  if (!action) return false;

  if (action === 'quit') {
    app.quit();
    return true;
  }

  const appFolder = path.dirname(process.execPath);
  const updateExe = path.resolve(appFolder, '..', 'Update.exe');
  const executableName = path.basename(process.execPath);
  const squirrelArgument = action === 'createShortcut' ? '--createShortcut' : '--removeShortcut';

  try {
    const child = spawn(updateExe, [squirrelArgument, executableName], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    child.unref();
  } catch (error) {
    // Setup must still exit promptly so Squirrel can complete its operation.
    console.error('Failed to handle Squirrel shortcut event:', error);
  }

  setTimeout(() => app.quit(), 1000);
  return true;
}
