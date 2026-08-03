import { ManageQueueUseCase } from '../../electron/main/application/ManageQueueUseCase';
import { DownloadQueue, DownloadTask } from '../../electron/main/domain/entities';
import { Logger, QueuePersistence, YtDlpExecutor } from '../../electron/main/infrastructure';

function createTask(id: string, status: DownloadTask['status']): DownloadTask {
  return {
    id,
    url: `https://example.com/${id}`,
    videoTitle: id,
    status,
    progress: status === 'completed' ? 100 : 42,
    speed: '1 MiB/s',
    eta: '00:10',
    filePath: `C:\\Downloads\\${id}.mp4`,
    selectedFormat: 'mp4',
    selectedQuality: 'best',
    retryCount: status === 'error' ? 3 : 0,
    errorMessage: status === 'error' ? 'network failed' : undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
    processId: status === 'error' ? 123 : undefined
  };
}

describe('download history queue operations', () => {
  let queue: DownloadQueue;
  let persistence: { save: jest.Mock };
  let useCase: ManageQueueUseCase;

  beforeEach(() => {
    queue = {
      id: 'history-test',
      tasks: [
        createTask('completed-one', 'completed'),
        createTask('failed-one', 'error'),
        createTask('pending-one', 'pending'),
        createTask('completed-two', 'completed')
      ],
      maxConcurrent: 3,
      addTask(task) { this.tasks.push(task); },
      removeTask(taskId) { this.tasks = this.tasks.filter(task => task.id !== taskId); },
      getNextPendingTask() { return this.tasks.find(task => task.status === 'pending') || null; },
      getActiveTasksCount() { return this.tasks.filter(task => task.status === 'downloading').length; },
      canStartNewTask() { return this.getActiveTasksCount() < this.maxConcurrent; }
    };
    persistence = { save: jest.fn().mockResolvedValue(undefined) };
    const executor = {} as YtDlpExecutor;
    const logger = {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    } as unknown as Logger;

    useCase = new ManageQueueUseCase(
      queue,
      executor,
      persistence as unknown as QueuePersistence,
      logger
    );
  });

  afterEach(() => {
    useCase.stopPeriodicPersistence();
  });

  it('clears only completed records and persists immediately', async () => {
    const response = await useCase.clearCompleted();

    expect(response).toEqual({ success: true, removedCount: 2 });
    expect(queue.tasks.map(task => task.id)).toEqual(['failed-one', 'pending-one']);
    expect(persistence.save).toHaveBeenCalledWith(queue);
  });

  it('removes one completed history item but refuses active items', async () => {
    await expect(useCase.removeHistoryTask({ taskId: 'completed-one' }))
      .resolves.toEqual({ success: true });
    await expect(useCase.removeHistoryTask({ taskId: 'pending-one' }))
      .resolves.toEqual({
        success: false,
        error: 'Only completed downloads can be removed from history'
      });
    expect(queue.tasks.some(task => task.id === 'completed-one')).toBe(false);
    expect(queue.tasks.some(task => task.id === 'pending-one')).toBe(true);
  });

  it('resets a failed task for a manual retry', async () => {
    const response = await useCase.retryDownload({ taskId: 'failed-one' });
    const task = queue.tasks.find(item => item.id === 'failed-one');

    expect(response).toEqual({ success: true });
    expect(task).toMatchObject({
      status: 'pending',
      progress: 0,
      retryCount: 0,
      errorMessage: undefined,
      processId: undefined
    });
    expect(persistence.save).toHaveBeenCalledWith(queue);
  });
});
