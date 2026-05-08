/**
 * Unit tests for application use cases
 * Validates basic functionality and structure
 */

import {
  FetchVideoInfoUseCase,
  CreateDownloadTaskUseCase,
  ExecuteDownloadUseCase,
  ManageQueueUseCase,
  UpdateSettingsUseCase
} from '../../electron/main/application';

describe('Use Cases - Structure Validation', () => {
  describe('FetchVideoInfoUseCase', () => {
    it('should be defined and have execute method', () => {
      expect(FetchVideoInfoUseCase).toBeDefined();
      expect(typeof FetchVideoInfoUseCase.prototype.execute).toBe('function');
    });
  });

  describe('CreateDownloadTaskUseCase', () => {
    it('should be defined and have execute method', () => {
      expect(CreateDownloadTaskUseCase).toBeDefined();
      expect(typeof CreateDownloadTaskUseCase.prototype.execute).toBe('function');
    });
  });

  describe('ExecuteDownloadUseCase', () => {
    it('should be defined and have execute method', () => {
      expect(ExecuteDownloadUseCase).toBeDefined();
      expect(typeof ExecuteDownloadUseCase.prototype.execute).toBe('function');
    });
  });

  describe('ManageQueueUseCase', () => {
    it('should be defined and have pause, resume, cancel methods', () => {
      expect(ManageQueueUseCase).toBeDefined();
      expect(typeof ManageQueueUseCase.prototype.pause).toBe('function');
      expect(typeof ManageQueueUseCase.prototype.resume).toBe('function');
      expect(typeof ManageQueueUseCase.prototype.cancel).toBe('function');
    });
  });

  describe('UpdateSettingsUseCase', () => {
    it('should be defined and have execute method', () => {
      expect(UpdateSettingsUseCase).toBeDefined();
      expect(typeof UpdateSettingsUseCase.prototype.execute).toBe('function');
    });
  });
});
