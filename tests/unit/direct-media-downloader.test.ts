import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { AddressInfo } from 'net';
import { downloadDirectMedia } from '../../electron/main/infrastructure/DirectMediaDownloader';

const testDir = path.join(process.cwd(), '.test-tmp', 'direct-media');

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

describe('DirectMediaDownloader', () => {
    beforeEach(() => {
        fs.rmSync(testDir, { recursive: true, force: true });
        fs.mkdirSync(testDir, { recursive: true });
    });

    afterAll(() => {
        fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('downloads a direct file and reports completion', async () => {
        const payload = Buffer.from('video-bytes-'.repeat(1024));
        const server = http.createServer((request, response) => {
            if (request.url === '/redirect') {
                response.writeHead(302, { Location: '/video.mp4' });
                response.end();
                return;
            }
            response.writeHead(200, {
                'Content-Type': 'video/mp4',
                'Content-Length': payload.length
            });
            response.end(payload);
        });
        const port = await listen(server);
        const progress: number[] = [];
        const outputPath = path.join(testDir, 'video.mp4');

        try {
            const result = await downloadDirectMedia(
                `http://127.0.0.1:${port}/redirect`,
                outputPath,
                {
                    onProgress: data => progress.push(data.percentage)
                }
            );

            expect(result.filePath).toBe(outputPath);
            expect(fs.readFileSync(outputPath)).toEqual(payload);
            expect(fs.existsSync(`${outputPath}.part`)).toBe(false);
            expect(progress[progress.length - 1]).toBe(100);
        } finally {
            await close(server);
        }
    });

    it('rejects an HTML response instead of saving a web page', async () => {
        const server = http.createServer((_request, response) => {
            response.writeHead(200, { 'Content-Type': 'text/html' });
            response.end('<html>not media</html>');
        });
        const port = await listen(server);
        const outputPath = path.join(testDir, 'page.mp4');

        try {
            await expect(downloadDirectMedia(
                `http://127.0.0.1:${port}/page`,
                outputPath,
                { onProgress: () => undefined }
            )).rejects.toThrow('web page');

            expect(fs.existsSync(outputPath)).toBe(false);
        } finally {
            await close(server);
        }
    });

    it('can be cancelled with an AbortSignal', async () => {
        const server = http.createServer((_request, response) => {
            response.writeHead(200, {
                'Content-Type': 'video/mp4',
                'Content-Length': 10 * 1024 * 1024
            });
            response.write(Buffer.alloc(1024));
            // Keep the connection open so the abort arrives mid-download.
        });
        const port = await listen(server);
        const controller = new AbortController();
        const outputPath = path.join(testDir, 'cancel.mp4');

        try {
            const download = downloadDirectMedia(
                `http://127.0.0.1:${port}/slow.mp4`,
                outputPath,
                { onProgress: () => undefined, signal: controller.signal }
            );
            controller.abort();

            await expect(download).rejects.toThrow('cancelled');
        } finally {
            await close(server);
        }
    });
});
