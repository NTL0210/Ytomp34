import * as fs from 'fs';
import * as path from 'path';

jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => `${process.cwd()}/.test-tmp/yt-dlp-installer`)
  }
}));

import { FileLogger } from '../../electron/main/infrastructure/Logger';
import {
  isYtDlpVersionOlderThan,
  YtDlpInstaller
} from '../../electron/main/infrastructure/YtDlpInstaller';

describe('yt-dlp version policy', () => {
  it('recognizes a release older than the required extractor fixes', () => {
    expect(isYtDlpVersionOlderThan('2026.03.17', '2026.06.09')).toBe(true);
  });

  it.each(['2026.06.09', '2026.07.01'])('accepts supported version %s', version => {
    expect(isYtDlpVersionOlderThan(version, '2026.06.09')).toBe(false);
  });

  it('does not replace an unrecognized custom build automatically', () => {
    expect(isYtDlpVersionOlderThan('nightly@abc123', '2026.06.09')).toBe(false);
  });
});

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
