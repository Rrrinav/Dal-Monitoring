// ========================================================================
// 1. OFFLINE STORAGE CLASS
// ========================================================================
class QueueStorage {
  constructor() {
    this.dbName = 'DroneCameraQueueDB';
    this.version = 1;
    this.storeName = 'images';
    this.db = null;
  }

  async init() {
    setInterval(() => this.deleteOldCompletedItems(60 * 60 * 1000), 10 * 60 * 1000);

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      request.onerror = (e) => reject("Error opening DB: " + e.target.errorCode);
      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve();
      };
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
          store.createIndex('status', 'status', { unique: false });
        }
      };
    });
  }

  async addToQueue(imageData, metadata = {}) {
    if (!this.db) await this.init();
    const item = { imageData, metadata, timestamp: Date.now(), status: 'pending', attempts: 0 };
    const transaction = this.db.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);
    return new Promise((resolve, reject) => {
      const request = store.add(item);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getPendingItems() {
    if (!this.db) await this.init();
    const transaction = this.db.transaction([this.storeName], 'readonly');
    const store = transaction.objectStore(this.storeName);
    const index = store.index('status');
    return new Promise((resolve, reject) => {
      const request = index.getAll('pending');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllItems() {
    if (!this.db) await this.init();
    const transaction = this.db.transaction([this.storeName], 'readonly');
    const store = transaction.objectStore(this.storeName);
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async updateItem(id, updates) {
    if (!this.db) await this.init();
    const transaction = this.db.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);
    return new Promise((resolve, reject) => {
      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        if (!getRequest.result) return reject('Item not found');
        const updatedItem = { ...getRequest.result, ...updates };
        const putRequest = store.put(updatedItem);
        putRequest.onsuccess = () => resolve(putRequest.result);
        putRequest.onerror = () => reject(putRequest.error);
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async clearQueue() {
    if (!this.db) await this.init();
    const transaction = this.db.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteItem(id) {
    if (!this.db) await this.init();
    const transaction = this.db.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteOldCompletedItems(maxAgeMs = 3600000) {
    if (!this.db) await this.init();
    const transaction = this.db.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);
    const index = store.index('status');

    const now = Date.now();
    return new Promise((resolve, reject) => {
      const request = index.openCursor('completed');
      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const item = cursor.value;
          if (item.completedAt && now - item.completedAt > maxAgeMs) {
            store.delete(item.id);
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }
}

// ========================================================================
// 2. S3 UPLOADER CLASS
// ========================================================================
class Uploader {
  constructor() {
    this.isUploading = false;
    this.maxAttempts = 3;
    this.uploadUrl = 'https://bis-backend-g2kj.onrender.com/upload';
    // this.uploadUrl = 'http://localhost:5000/upload';
  }

  dataURLtoBlob(dataURL) {
    const byteString = atob(dataURL.split(',')[1]);
    const mimeString = dataURL.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeString });
  }

  async uploadItem(item) {
    const blob = this.dataURLtoBlob(item.imageData);
    const filename = `drone-capture-${item.timestamp}-${item.id}.jpg`;
    const formData = new FormData();
    formData.append('file', blob, filename);
    formData.append('metadata', JSON.stringify(item.metadata));

    const response = await fetch(this.uploadUrl, { method: 'POST', body: formData });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown server error' }));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    return await response.json();
  }

  async processQueue(storage) {
    if (this.isUploading) return;
    if (!navigator.onLine) return;

    this.isUploading = true;
    try {
      // Retry pending or failed items
      const allItems = await storage.getAllItems();
      const candidates = allItems.filter(item =>
        ['pending', 'failed'].includes(item.status) &&
        item.attempts < this.maxAttempts
      );

      if (candidates.length === 0) {
        await storage.deleteOldCompletedItems(60 * 60 * 1000);
        return;
      }

      console.log(`Processing ${candidates.length} items from the queue...`);
      for (const item of candidates) {
        if (!navigator.onLine) break;

        const currentAttempts = item.attempts + 1;
        await storage.updateItem(item.id, { status: 'uploading', attempts: currentAttempts });

        try {
          const result = await this.uploadItem(item);
          await storage.updateItem(item.id, {
            status: 'completed',
            uploadUrl: result.url,
            completedAt: Date.now(),
          });
          console.log(`Uploaded item ${item.id}`);
          if (window.app) window.app.sessionUploads++;
          await storage.deleteItem(item.id);
        } catch (error) {
          const newStatus = currentAttempts >= this.maxAttempts ? 'failed' : 'pending';
          await storage.updateItem(item.id, {
            status: newStatus,
            lastError: error.message
          });
          console.warn(`Upload failed for item ${item.id}: ${error.message}`);
          await new Promise(res => setTimeout(res, 2000));
        }
      }

      await storage.deleteOldCompletedItems(60 * 60 * 1000);

    } catch (error) {
      console.error('Queue processing error:', error);
    } finally {
      this.isUploading = false;
    }
  }
}

// ========================================================================
// 3. MAIN DRONE CAMERA APP CLASS
// ========================================================================
class DroneCameraApp {
  constructor() {
    // Elements
    this.video = document.getElementById('video');
    this.retryCameraBtn = document.getElementById('retryCamera');
    this.simulateTriggerBtn = document.getElementById('simulateTrigger');
    this.clearQueueBtn = document.getElementById('clearQueue');
    this.startMotionBtn = document.getElementById('startMotion');
    this.captureOverlay = document.getElementById('captureOverlay');
    this.silentAudio = document.getElementById('silentAudio');

    this.statusElements = {
      camera: document.getElementById('cameraStatus'),
      button: document.getElementById('buttonStatus'),
      queue: document.getElementById('queueStatus'),
      network: document.getElementById('networkStatus'),
      motion: document.getElementById('motionStatus'),
      location: document.getElementById('locationStatus')
    };

    this.thresholdInput = document.getElementById('thresholdInput');
    this.cooldownInput = document.getElementById('cooldownInput');
    this.captureModeSelect = document.getElementById('captureMode');

    this.storage = new QueueStorage();
    this.uploader = new Uploader();
    this.stream = null;
    this.isCameraActive = false;
    this.currentLocation = null;

    this.motionState = 'IDLE';
    this.stillnessTimer = null;
    this.motionThreshold = 0.02;
    this.stillCooldown = 2000;
    this.captureMode = this.captureModeSelect ? this.captureModeSelect.value : 'both';
    this.sessionUploads = 0;

    this.init();
  }

  async init() {
    await this.storage.init();
    this.setupEventListeners();
    this.updateQueueStatus();
    this.updateNetworkStatus();
    await this.startCameraAutomatically();
    this.setupMediaSessionListener();
    this.setupLocationListener();

    setInterval(() => this.updateQueueStatus(), 2000);
    setInterval(() => this.uploader.processQueue(this.storage), 5000);
  }

  setupEventListeners() {
    this.retryCameraBtn?.addEventListener('click', () => this.startCameraAutomatically());
    this.simulateTriggerBtn?.addEventListener('click', () => this.manualCapture());
    this.clearQueueBtn?.addEventListener('click', () => this.clearQueue());
    this.startMotionBtn?.addEventListener('click', () => this.setupMotionListener());

    window.addEventListener('online', async () => {
      this.updateNetworkStatus();
      console.log('Back online — retrying uploads...');
      await this.uploader.processQueue(this.storage);
    });
    window.addEventListener('offline', () => this.updateNetworkStatus());

    document.addEventListener('keydown', (e) => {
      const triggerKeys = ['VolumeUp', 'VolumeDown', 'MediaPlayPause', 'Enter', 'Space'];
      if (triggerKeys.includes(e.code)) {
        e.preventDefault();
        this.manualCapture();
      }
    });

    this.captureModeSelect?.addEventListener('change', (e) => this.captureMode = e.target.value);
    this.thresholdInput?.addEventListener('input', (e) => this.motionThreshold = parseFloat(e.target.value));
    this.cooldownInput?.addEventListener('input', (e) => this.stillCooldown = parseInt(e.target.value));
  }

  setupLocationListener() {
    if (!('geolocation' in navigator)) {
      this.statusElements.location.textContent = 'Not Supported';
      return;
    }
    const success = (position) => {
      this.currentLocation = position.coords;
      const accuracy = Math.round(this.currentLocation.accuracy);
      this.statusElements.location.textContent = `Acquired (±${accuracy}m)`;
    };
    const error = () => {
      this.statusElements.location.textContent = 'Error/Denied';
    };
    navigator.geolocation.watchPosition(success, error, { enableHighAccuracy: true });
  }

  setupMediaSessionListener() {
    if (!('mediaSession' in navigator)) {
      this.statusElements.button.textContent = 'N/A';
      return;
    }
    this.statusElements.button.textContent = 'Ready';
    navigator.mediaSession.metadata = new MediaMetadata({ title: 'Drone Camera', artist: 'Ready' });
    try {
      navigator.mediaSession.setActionHandler('play', () => this.manualCapture());
      navigator.mediaSession.setActionHandler('pause', () => this.manualCapture());
    } catch {}
  }

  setupMotionListener() {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      DeviceMotionEvent.requestPermission().then(state => {
        if (state === 'granted') this.startMotionTracking();
        else this.statusElements.motion.textContent = 'Permission Denied';
      }).catch(console.error);
    } else {
      this.startMotionTracking();
    }
  }

  startMotionTracking() {
    if (!('DeviceMotionEvent' in window)) {
      this.statusElements.motion.textContent = 'Not Supported';
      return;
    }
    this.statusElements.motion.textContent = 'Active';
    let lastAccel = { x: null, y: null, z: null };

    window.addEventListener('devicemotion', (event) => {
      if (!event.accelerationIncludingGravity) return;
      const { x, y, z } = event.accelerationIncludingGravity;
      if (lastAccel.x !== null) {
        const dx = Math.abs(x - lastAccel.x);
        const dy = Math.abs(y - lastAccel.y);
        const dz = Math.abs(z - lastAccel.z);
        const isMoving = dx > this.motionThreshold || dy > this.motionThreshold || dz > this.motionThreshold;

        if (isMoving) {
          this.motionState = 'MOVING';
          this.statusElements.motion.textContent = 'Moving';
          if (this.stillnessTimer) {
            clearTimeout(this.stillnessTimer);
            this.stillnessTimer = null;
          }
        } else {
          if (this.motionState === 'MOVING') {
            this.motionState = 'STABILIZING';
            this.statusElements.motion.textContent = 'Stabilizing...';
            this.stillnessTimer = setTimeout(() => {
              this.statusElements.motion.textContent = 'Captured!';
              this.motionCapture();
              this.motionState = 'IDLE';
              this.stillnessTimer = null;
            }, this.stillCooldown);
          }
        }
      }
      lastAccel = { x, y, z };
    });
  }

  async startCameraAutomatically() {
    this.updateCameraStatus('initializing');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: 'environment' } });
      this.video.srcObject = this.stream;
      this.isCameraActive = true;
      this.updateCameraStatus('active');
      this.silentAudio?.play().catch(() => { });
    } catch (err) {
      this.updateCameraStatus('error');
    }
  }

  manualCapture() {
    if (this.captureMode === 'motion') return;
    this.captureImage('manual');
  }

  motionCapture() {
    if (this.captureMode === 'manual') return;
    this.captureImage('motion');
  }

  async captureImage(source = 'unknown') {
    if (!this.isCameraActive) return;
    this.showCaptureFlash();
    try {
      const canvas = document.createElement('canvas');
      canvas.width = this.video.videoWidth;
      canvas.height = this.video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(this.video, 0, 0);
      const imageData = canvas.toDataURL('image/jpeg', 0.9);

      const metadata = {
        width: canvas.width,
        height: canvas.height,
        timestamp: new Date().toISOString(),
        source
      };
      if (this.currentLocation) {
        metadata.location = {
          latitude: this.currentLocation.latitude,
          longitude: this.currentLocation.longitude,
          accuracy: this.currentLocation.accuracy
        };
        if (this.currentLocation.altitude != null) metadata.location.altitude = this.currentLocation.altitude;
        if (this.currentLocation.altitudeAccuracy != null) metadata.location.altitudeAccuracy = this.currentLocation.altitudeAccuracy;
        if (this.currentLocation.heading != null) metadata.location.heading = this.currentLocation.heading;
        if (this.currentLocation.speed != null) metadata.location.speed = this.currentLocation.speed;
      }
      await this.storage.addToQueue(imageData, metadata);
      this.updateQueueStatus();
    } catch (err) {
      console.error('Capture failed:', err);
    }
  }

  showCaptureFlash() {
    this.captureOverlay.classList.add('flash');
    setTimeout(() => this.captureOverlay.classList.remove('flash'), 100);
  }

  async updateQueueStatus() {
    const reportEl = document.getElementById('sessionReport');
    if (reportEl) {
      reportEl.textContent = `Session uploads: ${this.sessionUploads}`;
    }
    try {
      const items = await this.storage.getAllItems();
      if (this.statusElements.queue) {
        this.statusElements.queue.textContent = `${items.length} items`;
      }
      const queueList = document.getElementById('queueList');
      if (!queueList) return;
      queueList.innerHTML = '';
      items.sort((a, b) => b.timestamp - a.timestamp).forEach(item => {
        const div = document.createElement('div');
        const status = item.status || 'pending';
        div.textContent = `[${new Date(item.timestamp).toLocaleTimeString()}] Status: ${status.charAt(0).toUpperCase() + status.slice(1)}`;
        div.className = `queue-item`;
        queueList.appendChild(div);
      });
    } catch (e) {
      console.error("Failed to update queue status:", e);
    }
  }

  updateCameraStatus(status) {
    if (this.statusElements.camera) this.statusElements.camera.textContent = { initializing: 'Initializing...', active: 'Active', error: 'Error' }[status] || 'Error';
  }

  updateNetworkStatus() {
    if (this.statusElements.network) this.statusElements.network.textContent = navigator.onLine ? 'Online' : 'Offline';
  }

  async clearQueue() {
    if (confirm('Clear all items?')) {
      await this.storage.clearQueue();
      this.updateQueueStatus();
    }
  }
}

// ========================================================================
// 4. START APP
// ========================================================================
document.addEventListener('DOMContentLoaded', () => {
  window.app = new DroneCameraApp();
});
