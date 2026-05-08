import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { DownloadQueue } from '../domain/entities';

/**
 * QueuePersistence service
 * Persists and restores download queue state
 */
export class QueuePersistence {
  private queueFile: string;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.queueFile = path.join(userDataPath, 'queue.json');
  }

  async save(queue: DownloadQueue): Promise<void> {
    const data = {
      id: queue.id,
      maxConcurrent: queue.maxConcurrent,
      tasks: queue.tasks
    };
    
    const json = JSON.stringify(data, null, 2);
    await fs.promises.writeFile(this.queueFile, json, 'utf-8');
  }

  async load(): Promise<any | null> {
    try {
      if (!fs.existsSync(this.queueFile)) {
        return null;
      }
      
      const data = await fs.promises.readFile(this.queueFile, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }
}
