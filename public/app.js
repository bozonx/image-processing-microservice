// API Configuration
const API_BASE = '/api/v1';


// State
let currentFile = null;
let currentMimeType = null;
let currentBase64 = null;
let watermarkFile = null;
let exifFile = null;
let exifMimeType = null;
let exifBase64 = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initializeTabs();
  initializeProcessTab();
  initializeWatermark();
  initializeExifTab();
  initializeAccordions();
  checkHealth();

  // Check health every 30 seconds
  setInterval(checkHealth, 30000);
});

// Health Check
async function checkHealth() {
  const statusIndicator = document.querySelector('.status-indicator');
  const statusText = document.querySelector('.status-text');

  try {
    const response = await fetch(`${API_BASE}/health`);
    const data = await response.json();

    if (data.status === 'ok') {
      statusIndicator.classList.add('online');
      statusIndicator.classList.remove('offline');
      statusText.textContent = `Online • Queue: ${data.queue.size} (${data.queue.pending} pending)`;
    } else {
      throw new Error('Service not healthy');
    }
  } catch (error) {
    statusIndicator.classList.add('offline');
    statusIndicator.classList.remove('online');
    statusText.textContent = 'Offline';
  }
}

// Tabs
function initializeTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.tab;

      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));

      button.classList.add('active');
      document.getElementById(`${tabName}Tab`).classList.add('active');
    });
  });
}

// Accordions
function initializeAccordions() {
  const accordionHeaders = document.querySelectorAll('.accordion-header');

  accordionHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const content = header.nextElementSibling;
      const isActive = header.classList.contains('active');

      header.classList.toggle('active');
      content.classList.toggle('active');
    });
  });
}

// Process Tab
function initializeProcessTab() {
  const uploadArea = document.getElementById('uploadArea');
  const fileInput = document.getElementById('fileInput');
  const clearBtn = document.getElementById('clearBtn');
  const processBtn = document.getElementById('processBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const newProcessBtn = document.getElementById('newProcessBtn');

  // Upload area click
  uploadArea.addEventListener('click', () => fileInput.click());

  // File input change
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFileUpload(file);
  });

  // Drag and drop
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
  });

  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleFileUpload(file);
    }
  });

  // Clear button
  clearBtn.addEventListener('click', clearProcessForm);

  // Process button
  processBtn.addEventListener('click', processImage);

  // Download button
  downloadBtn.addEventListener('click', downloadResult);

  // New process button
  newProcessBtn.addEventListener('click', clearProcessForm);
}

async function handleFileUpload(file) {
  currentFile = file;
  currentMimeType = file.type;

  try {
    currentBase64 = await fileToBase64(file);

    // Show preview
    const previewContainer = document.getElementById('previewContainer');
    const previewImage = document.getElementById('previewImage');
    const imageInfo = document.getElementById('imageInfo');
    const uploadArea = document.getElementById('uploadArea');
    const controlsSection = document.getElementById('controlsSection');

    previewImage.src = `data:${currentMimeType};base64,${currentBase64}`;

    // Get image dimensions
    const img = new Image();
    img.onload = () => {
      imageInfo.innerHTML = `
                <strong>File:</strong> ${file.name}<br>
                <strong>Type:</strong> ${currentMimeType}<br>
                <strong>Size:</strong> ${formatBytes(file.size)}<br>
                <strong>Dimensions:</strong> ${img.width} × ${img.height}px
            `;
    };
    img.src = previewImage.src;

    uploadArea.style.display = 'none';
    previewContainer.style.display = 'block';
    controlsSection.style.display = 'block';
  } catch (error) {
    showToast('Failed to load image', 'error');
  }
}

function clearProcessForm() {
  currentFile = null;
  currentMimeType = null;
  currentBase64 = null;
  clearWatermark();

  document.getElementById('uploadArea').style.display = 'block';
  document.getElementById('previewContainer').style.display = 'none';
  document.getElementById('controlsSection').style.display = 'none';
  document.getElementById('resultsSection').style.display = 'none';
  document.getElementById('fileInput').value = '';
}

async function processImage() {
  if (!currentFile) {
    showToast('Please upload an image first', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('file', currentFile);

  // Add watermark file if present
  if (watermarkFile) {
    formData.append('watermark', watermarkFile);
  }

  const priority = parseInt(document.querySelector('input[name="priority"]:checked').value);
  const params = {
    priority,
    transform: buildTransformObject(),
    output: buildOutputObject()
  };
  formData.append('params', JSON.stringify(params));

  showLoading(true);

  try {
    const response = await fetch(`${API_BASE}/process`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Processing failed');
    }

    const blob = await response.blob();
    const mimeType = response.headers.get('Content-Type');
    displayProcessResult(blob, mimeType);
    showToast('Image processed successfully!', 'success');
  } catch (error) {
    showToast(error.message || 'Failed to process image', 'error');
  } finally {
    showLoading(false);
  }
}

function buildTransformObject() {
  const transform = {};

  // Auto orient
  const autoOrient = document.getElementById('autoOrient').checked;
  if (autoOrient !== undefined) {
    transform.autoOrient = autoOrient;
  }

  // Resize
  const width = parseInt(document.getElementById('resizeWidth').value);
  const height = parseInt(document.getElementById('resizeHeight').value);
  const maxDimension = parseInt(document.getElementById('maxDimension').value);
  const fit = document.getElementById('fitMode').value;
  const position = document.getElementById('position').value;
  const withoutEnlargement = document.getElementById('withoutEnlargement').checked;

  if (width || height || maxDimension) {
    transform.resize = {};
    if (width) transform.resize.width = width;
    if (height) transform.resize.height = height;
    if (maxDimension) transform.resize.maxDimension = maxDimension;
    if (fit && fit !== 'inside') transform.resize.fit = fit;
    if (position && position !== 'center') transform.resize.position = position;
    if (withoutEnlargement !== undefined) transform.resize.withoutEnlargement = withoutEnlargement;
  }

  // Crop
  const cropLeft = parseInt(document.getElementById('cropLeft').value);
  const cropTop = parseInt(document.getElementById('cropTop').value);
  const cropWidth = parseInt(document.getElementById('cropWidth').value);
  const cropHeight = parseInt(document.getElementById('cropHeight').value);

  if (cropWidth && cropHeight) {
    transform.crop = {
      width: cropWidth,
      height: cropHeight
    };
    if (cropLeft) transform.crop.left = cropLeft;
    if (cropTop) transform.crop.top = cropTop;
  }

  // Rotate
  const rotate = parseInt(document.getElementById('rotate').value);
  if (rotate) {
    transform.rotate = rotate;
  }

  // Flip & Flop
  const flip = document.getElementById('flip').checked;
  const flop = document.getElementById('flop').checked;
  if (flip) transform.flip = true;
  if (flop) transform.flop = true;

  // Flatten
  const flatten = document.getElementById('flattenColor').value.trim();
  if (flatten) {
    transform.flatten = flatten;
  }

  // Watermark
  if (watermarkFile) {
    const watermark = {};
    const mode = document.getElementById('watermarkMode').value;
    const position = document.getElementById('watermarkPosition').value;
    const opacity = parseFloat(document.getElementById('watermarkOpacity').value);
    const scale = parseInt(document.getElementById('watermarkScale').value);
    const spacing = parseInt(document.getElementById('watermarkSpacing').value);

    if (mode) watermark.mode = mode;
    if (position && mode === 'single') watermark.position = position;
    if (opacity !== undefined && !isNaN(opacity)) watermark.opacity = opacity;
    if (scale) watermark.scale = scale;
    if (spacing !== undefined && !isNaN(spacing) && mode === 'tile') watermark.spacing = spacing;

    transform.watermark = watermark;
  }

  return transform;
}

function buildOutputObject() {
  const output = {};

  const format = document.getElementById('outputFormat').value;
  if (format) output.format = format;

  const quality = parseInt(document.getElementById('quality').value);
  if (quality) output.quality = quality;

  const lossless = document.getElementById('lossless').checked;
  if (lossless) output.lossless = true;

  const stripMetadata = document.getElementById('stripMetadata').checked;
  if (stripMetadata) output.stripMetadata = true;

  const effort = parseInt(document.getElementById('effort').value);
  if (effort !== undefined && !isNaN(effort)) output.effort = effort;

  const compressionLevel = parseInt(document.getElementById('compressionLevel').value);
  if (compressionLevel !== undefined && !isNaN(compressionLevel)) output.compressionLevel = compressionLevel;

  const chromaSubsampling = document.getElementById('chromaSubsampling').value;
  if (chromaSubsampling) output.chromaSubsampling = chromaSubsampling;

  const progressive = document.getElementById('progressive').checked;
  if (progressive) output.progressive = true;

  const mozjpeg = document.getElementById('mozjpeg').checked;
  if (mozjpeg) output.mozjpeg = true;

  const palette = document.getElementById('palette').checked;
  if (palette) output.palette = true;

  const adaptiveFiltering = document.getElementById('adaptiveFiltering').checked;
  if (adaptiveFiltering) output.adaptiveFiltering = true;

  const colors = parseInt(document.getElementById('colors').value);
  if (colors) output.colors = colors;

  const dither = parseFloat(document.getElementById('dither').value);
  if (dither !== undefined && !isNaN(dither)) output.dither = dither;

  return output;
}

function displayProcessResult(blob, mimeType) {
  const resultsSection = document.getElementById('resultsSection');
  const resultImage = document.getElementById('resultImage');
  const statsGrid = document.getElementById('statsGrid');

  // Create Object URL for the blob
  const url = URL.createObjectURL(blob);
  resultImage.src = url;

  // Get image dimensions
  const img = new Image();
  img.onload = () => {
    const stats = [
      {
        label: 'Format',
        value: mimeType.replace('image/', '').toUpperCase()
      },
      {
        label: 'Dimensions',
        value: `${img.width} × ${img.height}px`
      },
      {
        label: 'File Size',
        value: formatBytes(blob.size)
      },
      {
        label: 'Original Size',
        value: formatBytes(currentFile.size)
      },
      {
        label: 'Size Reduction',
        value: `${((1 - blob.size / currentFile.size) * 100).toFixed(1)}%`,
        success: blob.size < currentFile.size
      }
    ];

    statsGrid.innerHTML = stats.map(stat => `
          <div class="stat-card">
              <div class="stat-label">${stat.label}</div>
              <div class="stat-value ${stat.success ? 'success' : ''}">${stat.value}</div>
          </div>
      `).join('');
  };
  img.src = url;

  // Show results
  document.getElementById('controlsSection').style.display = 'none';
  resultsSection.style.display = 'block';

  // Store result for download
  window.processedBlob = blob;
  window.processedMimeType = mimeType;
}

function downloadResult() {
  if (!window.processedBlob) return;

  const blob = window.processedBlob;
  const mimeType = window.processedMimeType;
  const extension = mimeType.split('/')[1];
  const filename = `processed-${Date.now()}.${extension}`;

  // Download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // We don't revoke here because it might be still needed for display
  // But strictly speaking, we should manage it better

  showToast('Image downloaded!', 'success');
}

// Watermark
function initializeWatermark() {
  const watermarkUploadArea = document.getElementById('watermarkUploadArea');
  const watermarkInput = document.getElementById('watermarkInput');
  const clearWatermarkBtn = document.getElementById('clearWatermarkBtn');
  const watermarkMode = document.getElementById('watermarkMode');

  // Upload area click
  watermarkUploadArea.addEventListener('click', () => watermarkInput.click());

  // File input change
  watermarkInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleWatermarkUpload(file);
  });

  // Clear button
  clearWatermarkBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearWatermark();
  });

  // Mode change - toggle position and spacing fields
  watermarkMode.addEventListener('change', (e) => {
    const mode = e.target.value;
    const positionField = document.getElementById('watermarkPositionField');
    const spacingField = document.getElementById('watermarkSpacingField');

    if (mode === 'tile') {
      positionField.style.display = 'none';
      spacingField.style.display = 'block';
    } else {
      positionField.style.display = 'block';
      spacingField.style.display = 'none';
    }
  });
}

async function handleWatermarkUpload(file) {
  // Validate file type
  const validTypes = ['image/png', 'image/svg+xml', 'image/webp', 'image/avif'];
  if (!validTypes.includes(file.type)) {
    showToast('Please upload a PNG, SVG, WebP, or AVIF file', 'error');
    return;
  }

  watermarkFile = file;

  try {
    // Show preview
    const watermarkUploadArea = document.getElementById('watermarkUploadArea');
    const watermarkPreviewContainer = document.getElementById('watermarkPreviewContainer');
    const watermarkPreview = document.getElementById('watermarkPreview');
    const watermarkFileName = document.getElementById('watermarkFileName');

    // Create preview URL
    const url = URL.createObjectURL(file);
    watermarkPreview.src = url;
    watermarkFileName.textContent = file.name;

    // Toggle visibility
    watermarkUploadArea.style.display = 'none';
    watermarkPreviewContainer.style.display = 'block';

    showToast('Watermark uploaded successfully', 'success');
  } catch (error) {
    showToast('Failed to load watermark', 'error');
    watermarkFile = null;
  }
}

function clearWatermark() {
  watermarkFile = null;

  const watermarkUploadArea = document.getElementById('watermarkUploadArea');
  const watermarkPreviewContainer = document.getElementById('watermarkPreviewContainer');
  const watermarkInput = document.getElementById('watermarkInput');
  const watermarkPreview = document.getElementById('watermarkPreview');

  // Clear input
  watermarkInput.value = '';

  // Revoke object URL if exists
  if (watermarkPreview.src) {
    URL.revokeObjectURL(watermarkPreview.src);
    watermarkPreview.src = '';
  }

  // Toggle visibility
  watermarkUploadArea.style.display = 'block';
  watermarkPreviewContainer.style.display = 'none';
}

// EXIF Tab
function initializeExifTab() {
  const uploadArea = document.getElementById('exifUploadArea');
  const fileInput = document.getElementById('exifFileInput');
  const clearBtn = document.getElementById('exifClearBtn');
  const extractBtn = document.getElementById('extractExifBtn');
  const newBtn = document.getElementById('exifNewBtn');

  // Upload area click
  uploadArea.addEventListener('click', () => fileInput.click());

  // File input change
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleExifFileUpload(file);
  });

  // Drag and drop
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
  });

  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleExifFileUpload(file);
    }
  });

  // Clear button
  clearBtn.addEventListener('click', clearExifForm);

  // Extract button
  extractBtn.addEventListener('click', extractExif);

  // New button
  newBtn.addEventListener('click', clearExifForm);
}

async function handleExifFileUpload(file) {
  exifFile = file;
  exifMimeType = file.type;

  try {
    exifBase64 = await fileToBase64(file);

    // Show preview
    const previewContainer = document.getElementById('exifPreviewContainer');
    const previewImage = document.getElementById('exifPreviewImage');
    const uploadArea = document.getElementById('exifUploadArea');
    const controlsSection = document.getElementById('exifControlsSection');

    previewImage.src = `data:${exifMimeType};base64,${exifBase64}`;

    uploadArea.style.display = 'none';
    previewContainer.style.display = 'block';
    controlsSection.style.display = 'block';
  } catch (error) {
    showToast('Failed to load image', 'error');
  }
}

function clearExifForm() {
  exifFile = null;
  exifMimeType = null;
  exifBase64 = null;

  document.getElementById('exifUploadArea').style.display = 'block';
  document.getElementById('exifPreviewContainer').style.display = 'none';
  document.getElementById('exifControlsSection').style.display = 'none';
  document.getElementById('exifResultsSection').style.display = 'none';
  document.getElementById('exifFileInput').value = '';
}

async function extractExif() {
  if (!exifFile) {
    showToast('Please upload an image first', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('file', exifFile);

  const priority = parseInt(document.querySelector('input[name="exifPriority"]:checked').value);
  const params = { priority };
  formData.append('params', JSON.stringify(params));

  showLoading(true);

  try {
    const response = await fetch(`${API_BASE}/exif`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'EXIF extraction failed');
    }

    const result = await response.json();
    displayExifResult(result);
    showToast('EXIF data extracted successfully!', 'success');
  } catch (error) {
    showToast(error.message || 'Failed to extract EXIF data', 'error');
  } finally {
    showLoading(false);
  }
}

function displayExifResult(result) {
  const resultsSection = document.getElementById('exifResultsSection');
  const exifData = document.getElementById('exifData');

  // Display EXIF data
  exifData.innerHTML = `<pre>${JSON.stringify(result.exif, null, 2)}</pre>`;

  // Show results
  document.getElementById('exifControlsSection').style.display = 'none';
  resultsSection.style.display = 'block';
}

// Utility Functions
async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function showLoading(show) {
  const overlay = document.getElementById('loadingOverlay');
  overlay.style.display = show ? 'flex' : 'none';
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}
