jest.mock('electron', () => ({
    app: { isPackaged: false }
}));

import * as fs from 'fs';
import * as path from 'path';
import { YtDlpExecutorImpl } from '../../electron/main/infrastructure/YtDlpExecutor';

const testDir = path.join(process.cwd(), '.test-tmp', 'output-path-resolution');

function writeFile(filePath: string, timestamp: number): void {
    fs.writeFileSync(filePath, 'test');
    const date = new Date(timestamp);
    fs.utimesSync(filePath, date, date);
}

function resolveOutputPath(executor: YtDlpExecutorImpl) {
    const target = executor as unknown as {
        resolveOutputPath(
            candidates: Array<string | null | undefined>,
            fallbackPath?: string
        ): string | null;
    };

    return target.resolveOutputPath.bind(executor);
}

describe('completed output path resolution', () => {
    beforeEach(() => {
        fs.rmSync(testDir, { recursive: true, force: true });
        fs.mkdirSync(testDir, { recursive: true });
    });

    afterAll(() => {
        fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('finds the merged MKV instead of the requested MP4 path or a stream temp file', () => {
        const requestedPath = path.join(testDir, 'Title.mp4');
        const streamPath = path.join(testDir, 'Title.f137.mp4');
        const mergedPath = path.join(testDir, 'Title.mkv');

        writeFile(requestedPath, 1_000);
        writeFile(streamPath, 2_000);
        writeFile(mergedPath, 3_000);

        const resolve = resolveOutputPath(new YtDlpExecutorImpl());

        expect(resolve([streamPath, null], requestedPath)).toBe(mergedPath);
    });

    it('finds an actual WebM output when yt-dlp did not report a Merger line', () => {
        const requestedPath = path.join(testDir, 'Clip.mp4');
        const actualPath = path.join(testDir, 'Clip.webm');

        writeFile(actualPath, 1_000);

        const resolve = resolveOutputPath(new YtDlpExecutorImpl());

        expect(resolve([null], requestedPath)).toBe(actualPath);
    });
});
