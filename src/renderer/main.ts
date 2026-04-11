/**
 * Renderer Process Main Entry
 * Handles UI interactions and IPC communication
 */

// Get DOM elements
const urlInput = document.getElementById('url-input') as HTMLInputElement;
const pasteBtn = document.getElementById('paste-btn') as HTMLButtonElement;
const checkBtn = document.getElementById('check-btn') as HTMLButtonElement;
const validationMessages = document.getElementById('validation-messages') as HTMLDivElement;

const metadataSection = document.getElementById('metadata-section') as HTMLElement;
const thumbnail = document.getElementById('thumbnail') as HTMLImageElement;
const videoTitle = document.getElementById('video-title') as HTMLHeadingElement;
const videoDuration = document.getElementById('video-duration') as HTMLParagraphElement;
const formatSelect = document.getElementById('format-select') as HTMLSelectElement;
const downloadBtn = document.getElementById('download-btn') as HTMLButtonElement;

const progressSection = document.getElementById('progress-section') as HTMLElement;
const progressBar = document.getElementById('progress-bar') as HTMLDivElement;
const progressPercentage = document.getElementById('progress-percentage') as HTMLSpanElement;
const progressSpeed = document.getElementById('progress-speed') as HTMLSpanElement;
const progressEta = document.getElementById('progress-eta') as HTMLSpanElement;
const progressStatus = document.getElementById('progress-status') as HTMLParagraphElement;
const progressSize = document.getElementById('progress-size') as HTMLParagraphElement;
const cancelBtn = document.getElementById('cancel-btn') as HTMLButtonElement;

const errorSection = document.getElementById('error-section') as HTMLElement;
const errorMessage = document.getElementById('error-message') as HTMLParagraphElement;
const errorCloseBtn = document.getElementById('error-close-btn') as HTMLButtonElement;

const successSection = document.getElementById('success-section') as HTMLElement;
const successMessage = document.getElementById('success-message') as HTMLParagraphElement;
const successCloseBtn = document.getElementById('success-close-btn') as HTMLButtonElement;

// State
let currentMetadata: any = null;

// Event Listeners
pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    urlInput.value = text;
  } catch (error) {
    showError('Failed to read clipboard');
  }
});

checkBtn.addEventListener('click', async () => {
  const url = urlInput.value.trim();
  
  if (!url) {
    showValidationMessage('Please enter a URL', 'error');
    return;
  }

  checkBtn.disabled = true;
  checkBtn.textContent = '⏳ Checking...';

  try {
    // Validate URL
    const validation = await window.electronAPI.checkUrl(url);
    
    if (!validation.isValid) {
      showValidationMessage(validation.errors.join(', '), 'error');
      checkBtn.disabled = false;
      checkBtn.innerHTML = '<span>🔍</span> Check';
      return;
    }

    if (validation.warnings.length > 0) {
      showValidationMessage(validation.warnings.join(', '), 'warning');
    } else {
      showValidationMessage('URL is valid!', 'success');
    }

    // Fetch metadata
    checkBtn.textContent = '⏳ Fetching metadata...';
    const metadata = await window.electronAPI.fetchMetadata(url);
    
    currentMetadata = metadata;
    displayMetadata(metadata);
    
  } catch (error: any) {
    showError(error.message || 'Failed to check URL');
  } finally {
    checkBtn.disabled = false;
    checkBtn.innerHTML = '<span>🔍</span> Check';
  }
});

downloadBtn.addEventListener('click', async () => {
  const selectedFormat = formatSelect.value;
  
  if (!selectedFormat) {
    showError('Please select a format');
    return;
  }

  const url = urlInput.value.trim();

  try {
    // Hide metadata, show progress
    metadataSection.classList.add('hidden');
    progressSection.classList.remove('hidden');

    // Start download
    await window.electronAPI.downloadVideo({
      url,
      format: selectedFormat,
    });

  } catch (error: any) {
    showError(error.message || 'Download failed');
    progressSection.classList.add('hidden');
  }
});

cancelBtn.addEventListener('click', async () => {
  try {
    await window.electronAPI.cancelDownload();
  } catch (error: any) {
    showError(error.message || 'Failed to cancel download');
  }
});

errorCloseBtn.addEventListener('click', () => {
  errorSection.classList.add('hidden');
});

successCloseBtn.addEventListener('click', () => {
  successSection.classList.add('hidden');
  resetUI();
});

// IPC Event Listeners
window.electronAPI.onDownloadProgress((progress) => {
  progressBar.style.width = `${progress.percentage}%`;
  progressPercentage.textContent = `${Math.round(progress.percentage)}%`;
  progressSpeed.textContent = formatSpeed(progress.speed);
  progressEta.textContent = `ETA: ${formatTime(progress.eta)}`;
  progressStatus.textContent = progress.status;
  progressSize.textContent = `${formatBytes(progress.downloadedBytes)} / ${formatBytes(progress.totalBytes)}`;
});

window.electronAPI.onDownloadComplete((result) => {
  progressSection.classList.add('hidden');
  
  if (result.success) {
    successMessage.textContent = `Video downloaded successfully! (${formatBytes(result.fileSize)})`;
    successSection.classList.remove('hidden');
  } else {
    showError(result.error || 'Download failed');
  }
});

window.electronAPI.onDownloadError((error) => {
  progressSection.classList.add('hidden');
  showError(error.message);
});

// Helper Functions
function showValidationMessage(message: string, type: 'error' | 'warning' | 'success') {
  validationMessages.textContent = message;
  validationMessages.className = `validation-messages ${type}`;
  validationMessages.classList.remove('hidden');
}

function displayMetadata(metadata: any) {
  // Set thumbnail
  if (metadata.thumbnail) {
    thumbnail.src = metadata.thumbnail;
  }

  // Set title
  videoTitle.textContent = metadata.title;

  // Set duration
  videoDuration.textContent = `Duration: ${formatTime(metadata.duration)}`;

  // Populate formats
  formatSelect.innerHTML = '';
  for (const format of metadata.formats) {
    const option = document.createElement('option');
    option.value = format.formatId;
    option.textContent = `${format.resolution} - ${format.ext} (${formatBytes(format.filesize)})`;
    formatSelect.appendChild(option);
  }

  // Show metadata section
  validationMessages.classList.add('hidden');
  metadataSection.classList.remove('hidden');
}

function showError(message: string) {
  errorMessage.textContent = message;
  errorSection.classList.remove('hidden');
}

function resetUI() {
  urlInput.value = '';
  validationMessages.classList.add('hidden');
  metadataSection.classList.add('hidden');
  progressSection.classList.add('hidden');
  currentMetadata = null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function formatSpeed(bytesPerSecond: number): string {
  return formatBytes(bytesPerSecond) + '/s';
}

function formatTime(seconds: number): string {
  if (!seconds || seconds < 0) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

console.log('Renderer process initialized');
