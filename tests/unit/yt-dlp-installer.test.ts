import * as fs from 'fs';
import * as path from 'path';

jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => `${process.cwd()}/.test-tmp/yt-dlp-installer`)
  }
}));

import { FileLogger } from '../../electron/main/infrastructure/Logger';
import { YtDlpInstaller } from '../../electron/main/infrastructure/YtDlpInstaller';

interface InstallerInternals {
  ytDlpPath: string;
  downloadFile: (url: string, destination: string) => Promise<void>;
  verifyExecutable: (executablePath: string) => Promise<string>;
}

describe('YtDlpInstaller safe replacement', () => {
  const testAppDataDir = path.join(process.cwd(), '.test-tmp', 'yt-dlp-installer');
  const logger = {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  } as unknown as FileLogger;

  beforeEach(() => {
    jest.clearAllMocks();
    fs.rmSync(testAppDataDir, { recursive: true, force: true });
  });

  afterAll(() => {
    fs.rmSync(testAppDataDir, { recursive: true, force: true });
  });

  it('replaces the old binary only after the download is verified', async () => {
    const installer = new YtDlpInstaller(logger);
    const internals = installer as unknown as InstallerInternals;
    fs.writeFileSync(internals.ytDlpPath, 'old binary');

    jest.spyOn(internals, 'downloadFile').mockImplementation(async (_url, destination) => {
      fs.writeFileSync(destination, 'new binary');
    });
    jest.spyOn(internals, 'verifyExecutable').mockResolvedValue('2026.06.09');

    await expect(installer.update()).resolves.toEqual({ success: true });
    expect(fs.readFileSync(internals.ytDlpPath, 'utf-8')).toBe('new binary');
    expect(fs.readdirSync(path.dirname(internals.ytDlpPath)))
      .toEqual([path.basename(internals.ytDlpPath)]);
  });

  it('keeps the working binary when verification fails', async () => {
    const installer = new YtDlpInstaller(logger);
    const internals = installer as unknown as InstallerInternals;
    fs.writeFileSync(internals.ytDlpPath, 'old binary');

    jest.spyOn(internals, 'downloadFile').mockImplementation(async (_url, destination) => {
      fs.writeFileSync(destination, 'invalid download');
    });
    jest.spyOn(internals, 'verifyExecutable').mockRejectedValue(new Error('verification failed'));

    const result = await installer.update();

    expect(result.success).toBe(false);
    expect(result.error).toContain('verification failed');
    expect(fs.readFileSync(internals.ytDlpPath, 'utf-8')).toBe('old binary');
    expect(fs.readdirSync(path.dirname(internals.ytDlpPath)))
      .toEqual([path.basename(internals.ytDlpPath)]);
  });
});
