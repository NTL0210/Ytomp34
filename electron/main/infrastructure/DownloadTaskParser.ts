import { DownloadTask } from '../domain/entities';

/**
 * DownloadTaskParser
 * Serializes and deserializes DownloadTask for persistence
 */
export class DownloadTaskParser {
  static toJSON(task: DownloadTask): string {
    return JSON.stringify({
      id: task.id,
      url: task.url,
      videoTitle: task.videoTitle,
      status: task.status,
      progress: task.progress,
      speed: task.speed,
      eta: task.eta,
      filePath: task.filePath,
      selectedFormat: task.selectedFormat,
      selectedQuality: task.selectedQuality,
      retryCount: task.retryCount,
      errorMessage: task.errorMessage,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      processId: task.processId
    }, null, 2);
  }
  
  static fromJSON(json: string): DownloadTask {
    const obj = JSON.parse(json);
    return {
      ...obj,
      createdAt: new Date(obj.createdAt),
      updatedAt: new Date(obj.updatedAt)
    };
  }
}
