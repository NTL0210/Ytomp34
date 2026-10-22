jest.mock('electron', () => ({
    app: { isPackaged: false }
}));

import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { AddressInfo } from 'net';
import { YtDlpExecutorImpl } from '../../electron/main/infrastructure/YtDlpExecutor';

const testDir = path.join(process.cwd(), '.test-tmp', 'direct-fallback');

function listen(server: http.Server): Promise<number> {
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            resolve((server.address() as AddressInfo).port);
        });
    });
}

function close(server: http.Server): Promise<void> {
    return new Promise(resolve => server.close(() => resolve()));
}

function download(
    executor: YtDlpExecutorImpl,
    url: string,
    format: string,
    outputPath: string,
    onOutputPath?: (value: string) => void
): Promise<void> {
    return new Promise((resolve, reject) => {
        executor.startDownload(
            url,
            format,
            'best',
            outputPath,
            () => undefined,
            reject,
            () => resolve(),
            () => undefined,
            onOutputPath
        ).catch(reject);
    });
}

describe('built-in fallback when yt-dlp cannot start', () => {
    beforeEach(() => {
        fs.rmSync(testDir, { recursive: true, force: true });
        fs.mkdirSync(testDir, { recursive: true });
    });

    afterAll(() => {
        fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('downloads a direct MP4 when the yt-dlp executable is missing', async () => {
        const payload = Buffer.from('fallback-video-'.repeat(2048));
        const server = http.createServer((_request, response) => {
            response.writeHead(200, {
                'Content-Type': 'video/mp4',
                'Content-Length': payload.length
            });
            response.end(payload);
        });
        const port = await listen(server);
        const outputPath = path.join(testDir, 'fallback.mp4');

        try {
            const executor = new YtDlpExecutorImpl();
            executor.setCommand(path.join(testDir, 'missing-yt-dlp.exe'));
            executor.setFfmpegAvailable(false);

            await download(executor, `http://127.0.0.1:${port}/video.mp4`, 'mp4', outputPath);

            expect(fs.readFileSync(outputPath)).toEqual(payload);
        } finally {
            await close(server);
        }
    });

    it('keeps the real extension when audio cannot be transcoded', async () => {
        const payload = Buffer.from('fallback-audio-'.repeat(1024));
        const server = http.createServer((_request, response) => {
            response.writeHead(200, {
                'Content-Type': 'audio/mp4',
                'Content-Length': payload.length
            });
            response.end(payload);
        });
        const port = await listen(server);
        const requestedPath = path.join(testDir, 'song.mp3');
        const actualPaths: string[] = [];

        try {
            const executor = new YtDlpExecutorImpl();
            executor.setCommand(path.join(testDir, 'missing-yt-dlp.exe'));
            executor.setFfmpegAvailable(false);

            await download(
                executor,
                `http://127.0.0.1:${port}/song.m4a`,
                'mp3',
                requestedPath,
                actual => actualPaths.push(actual)
            );

            const actualPath = actualPaths[actualPaths.length - 1];
            expect(actualPath.endsWith('.m4a')).toBe(true);
            expect(fs.existsSync(actualPath)).toBe(true);
            expect(fs.readFileSync(actualPath)).toEqual(payload);
            expect(fs.existsSync(requestedPath)).toBe(false);
        } finally {
            await close(server);
        }
    });
});
