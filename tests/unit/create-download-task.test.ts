import * as path from 'path';
import { CreateDownloadTaskUseCase } from '../../electron/main/application/CreateDownloadTaskUseCase';
import { DownloadQueue } from '../../electron/main/domain/entities';
import { FileSanitizer, Logger, SettingsStore } from '../../electron/main/infrastructure';

describe('CreateDownloadTaskUseCase', () => {
  it('uses distinct output paths for queued videos with the same title', async () => {
    const queue: DownloadQueue = {
      id: 'test-queue',
      tasks: [],
      maxConcurrent: 3,
      addTask(task) { this.tasks.push(task); },
      removeTask(taskId) { this.tasks = this.tasks.filter(task => task.id !== taskId); },
      getNextPendingTask() { return this.tasks.find(task => task.status === 'pending') || null; },
      getActiveTasksCount() { return 0; },
      canStartNewTask() { return true; }
    };
    const sanitizer: FileSanitizer = {
      sanitize: value => value,
      ensureUnique: (_directory, filename, extension) => `${filename}${extension}`
    };
    const settingsStore = {
      load: jest.fn().mockResolvedValue({
        theme: 'light',
        downloadDirectory: path.join(process.cwd(), 'downloads'),
        concurrentLimit: 3
      })
    } as unknown as SettingsStore;
    const logger = {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    } as unknown as Logger;
    const useCase = new CreateDownloadTaskUseCase(queue, sanitizer, settingsStore, logger);
    const request = {
      url: 'https://example.com/video',
      videoTitle: 'Same title',
      format: 'mp4' as const,
      quality: 'best'
    };

    await useCase.execute(request);
    await useCase.execute({ ...request, url: 'https://example.com/another-video' });

    expect(queue.tasks).toHaveLength(2);
    expect(path.basename(queue.tasks[0].filePath)).toBe('Same title.mp4');
    expect(path.basename(queue.tasks[1].filePath)).toBe('Same title (1).mp4');
  });
});
