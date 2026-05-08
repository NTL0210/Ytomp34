/**
 * TypeScript declarations for window.electronAPI
 * This file provides type definitions for the renderer process
 */

import { ElectronAPI } from './index';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
