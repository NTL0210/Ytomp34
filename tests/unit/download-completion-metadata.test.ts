import { ExecuteDownloadUseCase } from '../../electron/main/application/ExecuteDownloadUseCase';
import { DownloadTask } from '../../electron/main/domain/entities';

function makeTask(): DownloadTask {
  return {
    id: 'task-1',
    url: 'https://example.com/video',
    videoTitle: 'Example',
    status: 'pending',
    progress: 0,
    speed: '0 B/s',
    eta: '--:--:--',
    filePath: 'C:\\Downloads\\Example.mp4',
    selectedFormat: 'mp4',
    selectedQuality: '1080p',
    retryCount: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

describe('download completion metadata', () => {
  it('stores verified actual output details on the task', async () => {
    const task = makeTask();
    const logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };
    const queue = {
      id: 'queue-1',
      tasks: [task],
      maxConcurrent: 1,
      addTask: jest.fn(),
      removeTask: jest.fn(),
      getNextPendingTask: jest.fn(() => null),
      getActiveTasksCount: jest.fn(() => 0),
      canStartNewTask: jest.fn(() => false)
    };
    const onProgress = jest.fn();
    const onStatusChange = jest.fn();
    const executor = {
      startDownload: jest.fn(async (
        _url: string,
        _format: string,
        _quality: string,
        _outputPath: string,
        _onProgress: unknown,
        _onError: unknown,
        onComplete: (metadata: unknown) => void
      ) => {
        onComplete({
          outputPath: 'C:\\Downloads\\Example.mkv',
          width: 3840,
          height: 2160,
          resolution: '3840 × 2160',
          qualityTier: '2160p',
          videoCodec: 'av1',
          audioCodec: 'opus',
          container: 'matroska,webm',
          hasVideo: true,
          hasAudio: true,
          verified: true,
          warning: 'Saved as MKV to preserve quality.'
        });
        return 1234;
      })
    };

    const useCase = new ExecuteDownloadUseCase(
      executor as never,
      queue as never,
      logger as never,
      onProgress,
      onStatusChange
    );

    await useCase.execute(task);

    expect(task.status).toBe('completed');
    expect(task.progress).toBe(100);
    expect(task.outputFilePath).toBe('C:\\Downloads\\Example.mkv');
    expect(task.actualWidth).toBe(3840);
    expect(task.actualHeight).toBe(2160);
    expect(task.actualResolution).toBe('3840 × 2160');
    expect(task.actualQuality).toBe('2160p');
    expect(task.actualVideoCodec).toBe('av1');
    expect(task.actualAudioCodec).toBe('opus');
    expect(task.actualContainer).toBe('matroska,webm');
    expect(task.verified).toBe(true);
    expect(task.hasAudio).toBe(true);
    expect(task.qualityNote).toBe('Saved as MKV to preserve quality.');
    expect(onStatusChange).toHaveBeenCalledWith('task-1', 'completed');
  });
});
