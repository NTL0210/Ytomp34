// Renderer process entry point
console.log('Electron Video Downloader - Renderer Process Started');

// Verify electronAPI is available
if (window.electronAPI) {
  console.log('✓ Electron API is available');
} else {
  console.error('✗ Electron API is not available - check preload script');
}

// Basic initialization
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Content Loaded');
});
