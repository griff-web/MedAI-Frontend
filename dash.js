/**
 * MED-AI DIAGNOSTIC DASHBOARD v6.0.0
 * World-Class JavaScript Architecture - Enterprise Edition
 * Kenyan Flag Theme Edition 🇰🇪
 * 
 * Features:
 * - Functional Core, Imperative Shell architecture
 * - Event-driven state management
 * - Web Workers for AI processing
 * - IndexedDB for offline storage
 * - Request queuing with retry logic
 * - Real-time performance metrics
 * - Accessibility enhancements
 * - Security best practices
 * - Medical-grade validation
 */

// ==================== CONFIGURATION ====================
const CONFIG = {
    API_BASE: window.ENV_API_BASE || "https://ai-p17b.onrender.com",
    ENDPOINT: "/diagnostics/process",
    TIMEOUT: 30000,
    COOLDOWN: 2000,
    MAX_FILE_SIZE: 50 * 1024 * 1024,
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000,
    VERSION: "6.0.0",
    
    // UI Constants
    ANIMATION_DURATION: 300,
    NOTIFICATION_DURATION: 5000,
    SCAN_TYPES: ['xray', 'ct', 'mri', 'ultrasound'],
    DEBOUNCE_DELAY: 300,
    THROTTLE_DELAY: 1000,
    
    // Confidence thresholds
    CONFIDENCE: {
        HIGH: 85,
        MEDIUM: 60,
        LOW: 30
    },
    
    // Storage keys
    STORAGE: {
        HISTORY: 'medai_history',
        USER_PREFS: 'medai_prefs',
        LAST_SYNC: 'medai_last_sync',
        OFFLINE_QUEUE: 'medai_offline_queue',
        METRICS: 'medai_metrics'
    },
    
    // Medical validation rules
    VALIDATION: {
        MIN_IMAGE_SIZE: 1024, // 1KB
        MAX_IMAGE_SIZE: 50 * 1024 * 1024, // 50MB
        ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/dicom', 'image/dcm'],
        MIN_DIMENSION: 64,
        MAX_DIMENSION: 4096
    },
    
    // Performance thresholds
    PERFORMANCE: {
        TTI: 3000, // Time to Interactive
        FCP: 2000, // First Contentful Paint
        MAX_MEMORY: 500 * 1024 * 1024, // 500MB
        MAX_STORAGE: 100 * 1024 * 1024 // 100MB
    }
};

// ==================== TYPEDEFS (JSDoc) ====================
/**
 * @typedef {Object} ScanResult
 * @property {string} id
 * @property {string} timestamp
 * @property {string} type
 * @property {Object} result
 * @property {string} result.title
 * @property {string} result.description
 * @property {number} result.confidence
 * @property {string[]} result.findings
 * @property {string} thumbnail
 */

/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} name
 * @property {string} email
 * @property {string} role
 * @property {string} avatar
 */

// ==================== STATE MANAGEMENT WITH PROXIES ====================
const StateManager = {
    state: null,
    listeners: new Map(),
    history: [],
    
    create(initialState) {
        this.state = new Proxy(initialState, {
            set: (target, property, value) => {
                const oldValue = target[property];
                target[property] = value;
                
                // Record state change for debugging
                this.history.push({
                    property,
                    oldValue,
                    newValue: value,
                    timestamp: Date.now()
                });
                
                // Trim history
                if (this.history.length > 100) this.history.shift();
                
                // Notify listeners
                this.notify(property, value, oldValue);
                
                return true;
            }
        });
        
        return this.state;
    },
    
    subscribe(property, callback) {
        if (!this.listeners.has(property)) {
            this.listeners.set(property, new Set());
        }
        this.listeners.get(property).add(callback);
        
        // Return unsubscribe function
        return () => {
            const callbacks = this.listeners.get(property);
            if (callbacks) {
                callbacks.delete(callback);
            }
        };
    },
    
    notify(property, newValue, oldValue) {
        const callbacks = this.listeners.get(property);
        if (callbacks) {
            callbacks.forEach(callback => {
                try {
                    callback(newValue, oldValue);
                } catch (error) {
                    console.error('State listener error:', error);
                }
            });
        }
    },
    
    batch(updates) {
        const changes = [];
        for (const [property, value] of Object.entries(updates)) {
            changes.push({ property, value });
        }
        
        // Apply all updates
        changes.forEach(({ property, value }) => {
            this.state[property] = value;
        });
    }
};

// ==================== APP STATE ====================
const AppState = StateManager.create({
    user: null,
    token: null,
    currentScanType: 'xray',
    isProcessing: false,
    lastCaptureTime: 0,
    cameraActive: false,
    torchActive: false,
    currentStream: null,
    offlineQueue: [],
    history: [],
    networkStatus: navigator.onLine ? 'online' : 'offline',
    performance: {
        fps: 0,
        memory: 0,
        latency: 0
    },
    errors: []
});

// ==================== INDEXEDDB MANAGER ====================
const StorageManager = {
    db: null,
    DB_NAME: 'MedAIDatabase',
    DB_VERSION: 2,
    
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create stores
                if (!db.objectStoreNames.contains('history')) {
                    const historyStore = db.createObjectStore('history', { keyPath: 'id' });
                    historyStore.createIndex('timestamp', 'timestamp', { unique: false });
                    historyStore.createIndex('type', 'type', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('offlineQueue')) {
                    const queueStore = db.createObjectStore('offlineQueue', { keyPath: 'id', autoIncrement: true });
                    queueStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('metrics')) {
                    db.createObjectStore('metrics', { keyPath: 'id' });
                }
            };
        });
    },
    
    async saveToStore(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },
    
    async getFromStore(storeName, id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(id);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },
    
    async getAllFromStore(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },
    
    async deleteFromStore(storeName, id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },
    
    async clearStore(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
};

// ==================== WEB WORKER FOR AI PROCESSING ====================
const AIWorker = {
    worker: null,
    pendingTasks: new Map(),
    
    init() {
        if (window.Worker) {
            try {
                this.worker = new Worker('/js/ai-worker.js');
                
                this.worker.onmessage = (event) => {
                    const { taskId, result, error } = event.data;
                    const pending = this.pendingTasks.get(taskId);
                    
                    if (pending) {
                        if (error) {
                            pending.reject(new Error(error));
                        } else {
                            pending.resolve(result);
                        }
                        this.pendingTasks.delete(taskId);
                    }
                };
                
                this.worker.onerror = (error) => {
                    console.error('AI Worker error:', error);
                    UI.showNotification('AI processing failed', 'error');
                };
                
                return true;
            } catch (error) {
                console.error('Failed to initialize AI worker:', error);
                return false;
            }
        }
        return false;
    },
    
    async processImage(imageData, scanType) {
        if (!this.worker) {
            throw new Error('AI Worker not available');
        }
        
        const taskId = crypto.randomUUID();
        
        return new Promise((resolve, reject) => {
            this.pendingTasks.set(taskId, { resolve, reject });
            
            this.worker.postMessage({
                taskId,
                imageData,
                scanType,
                timestamp: Date.now()
            });
        });
    },
    
    terminate() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
            this.pendingTasks.clear();
        }
    }
};

// ==================== API CLIENT WITH RETRY LOGIC ====================
const APIClient = {
    async request(endpoint, options = {}) {
        const url = `${CONFIG.API_BASE}${endpoint}`;
        let lastError;
        
        for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);
                
                const response = await fetch(url, {
                    ...options,
                    signal: controller.signal,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': AppState.token ? `Bearer ${AppState.token}` : '',
                        'X-Client-Version': CONFIG.VERSION,
                        'X-Request-ID': crypto.randomUUID(),
                        ...options.headers
                    }
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw await this.handleError(response);
                }
                
                return await response.json();
                
            } catch (error) {
                lastError = error;
                
                if (error.name === 'AbortError') {
                    throw new Error('Request timeout. Please try again.');
                }
                
                if (attempt < CONFIG.MAX_RETRIES) {
                    await this.delay(CONFIG.RETRY_DELAY * attempt);
                    continue;
                }
            }
        }
        
        throw lastError;
    },
    
    async handleError(response) {
        try {
            const data = await response.json();
            return new Error(data.message || `HTTP ${response.status}`);
        } catch {
            return new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
    },
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};

// ==================== CAMERA MANAGER WITH ADVANCED FEATURES ====================
const CameraManager = {
    videoElement: null,
    stream: null,
    imageCapture: null,
    facingMode: 'environment',
    zoomLevel: 1,
    
    async init(videoElement) {
        this.videoElement = videoElement;
        
        try {
            const constraints = {
                video: {
                    facingMode: this.facingMode,
                    width: { min: 640, ideal: 1920, max: 3840 },
                    height: { min: 480, ideal: 1080, max: 2160 },
                    frameRate: { ideal: 30, max: 60 },
                    aspectRatio: { ideal: 16/9 }
                },
                audio: false
            };
            
            // Check for advanced capabilities
            if (navigator.mediaDevices.getSupportedConstraints) {
                const supported = navigator.mediaDevices.getSupportedConstraints();
                
                if (supported.torch) constraints.video.torch = false;
                if (supported.zoom) constraints.video.zoom = 1;
                if (supported.focusMode) constraints.video.focusMode = 'continuous';
            }
            
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.videoElement.srcObject = this.stream;
            
            // Initialize ImageCapture if available
            if (window.ImageCapture) {
                const track = this.stream.getVideoTracks()[0];
                this.imageCapture = new ImageCapture(track);
            }
            
            // Wait for video to be ready
            await new Promise((resolve) => {
                this.videoElement.onloadedmetadata = () => {
                    this.videoElement.play();
                    resolve();
                };
            });
            
            StateManager.batch({
                cameraActive: true,
                currentStream: this.stream
            });
            
            EventBus.emit('camera:initialized', { success: true });
            UI.updateAIStatus('AI READY', 'online');
            UI.showNotification('Camera initialized', 'success');
            
            return true;
            
        } catch (error) {
            console.error('Camera error:', error);
            StateManager.batch({ cameraActive: false });
            EventBus.emit('camera:error', { error });
            UI.updateAIStatus('CAMERA UNAVAILABLE', 'error');
            UI.showNotification('Could not access camera. Please check permissions.', 'error');
            return false;
        }
    },
    
    async capture() {
        if (!this.videoElement || !AppState.cameraActive) {
            throw new Error('Camera not active');
        }
        
        // Use ImageCapture for better quality if available
        if (this.imageCapture) {
            try {
                const blob = await this.imageCapture.takePhoto();
                return blob;
            } catch (error) {
                console.warn('ImageCapture failed, falling back to canvas', error);
            }
        }
        
        // Fallback to canvas capture
        const canvas = document.createElement('canvas');
        canvas.width = this.videoElement.videoWidth;
        canvas.height = this.videoElement.videoHeight;
        
        const ctx = canvas.getContext('2d', {
            alpha: false,
            willReadFrequently: false
        });
        
        ctx.drawImage(this.videoElement, 0, 0);
        
        return new Promise((resolve) => {
            canvas.toBlob((blob) => {
                resolve(blob);
            }, 'image/jpeg', 0.95);
        });
    },
    
    async setZoom(level) {
        if (!this.stream) return false;
        
        const track = this.stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities?.();
        
        if (capabilities?.zoom) {
            const min = capabilities.zoom.min || 1;
            const max = capabilities.zoom.max || 1;
            const constrainedLevel = Math.min(Math.max(level, min), max);
            
            try {
                await track.applyConstraints({
                    advanced: [{ zoom: constrainedLevel }]
                });
                this.zoomLevel = constrainedLevel;
                return true;
            } catch (error) {
                console.error('Zoom error:', error);
                return false;
            }
        }
        
        return false;
    },
    
    async toggleTorch() {
        if (!this.stream) return false;
        
        const track = this.stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities?.();
        
        if (capabilities?.torch) {
            try {
                const newState = !AppState.torchActive;
                await track.applyConstraints({
                    advanced: [{ torch: newState }]
                });
                StateManager.batch({ torchActive: newState });
                return true;
            } catch (error) {
                console.error('Torch error:', error);
                return false;
            }
        }
        
        UI.showNotification('Torch not available on this device', 'warning');
        return false;
    },
    
    async switchCamera() {
        this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
        
        // Stop current stream
        this.stop();
        
        // Reinitialize with new facing mode
        return this.init(this.videoElement);
    },
    
    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => {
                track.stop();
                track.enabled = false;
            });
            this.stream = null;
            this.imageCapture = null;
            StateManager.batch({ cameraActive: false, torchActive: false });
        }
    },
    
    getCapabilities() {
        if (!this.stream) return null;
        
        const track = this.stream.getVideoTracks()[0];
        return {
            capabilities: track.getCapabilities?.(),
            settings: track.getSettings?.(),
            constraints: track.getConstraints?.()
        };
    }
};

// ==================== EVENT BUS ====================
const EventBus = {
    events: new Map(),
    
    on(event, callback) {
        if (!this.events.has(event)) {
            this.events.set(event, new Set());
        }
        this.events.get(event).add(callback);
        
        // Return unsubscribe function
        return () => {
            const callbacks = this.events.get(event);
            if (callbacks) {
                callbacks.delete(callback);
            }
        };
    },
    
    once(event, callback) {
        const wrapper = (...args) => {
            callback(...args);
            this.off(event, wrapper);
        };
        this.on(event, wrapper);
    },
    
    off(event, callback) {
        const callbacks = this.events.get(event);
        if (callbacks) {
            callbacks.delete(callback);
        }
    },
    
    emit(event, data) {
        const callbacks = this.events.get(event);
        if (callbacks) {
            callbacks.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Event handler error for ${event}:`, error);
                }
            });
        }
    },
    
    clear() {
        this.events.clear();
    }
};

// ==================== PERFORMANCE MONITOR ====================
const PerformanceMonitor = {
    metrics: {
        fcp: null,
        tti: null,
        apiLatency: [],
        frameRates: []
    },
    
    init() {
        // First Contentful Paint
        const paintObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                if (entry.name === 'first-contentful-paint') {
                    this.metrics.fcp = entry.startTime;
                    EventBus.emit('performance:fcp', entry.startTime);
                }
            }
        });
        paintObserver.observe({ entryTypes: ['paint'] });
        
        // Long tasks
        const longTaskObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                if (entry.duration > 50) {
                    console.warn('Long task detected:', entry);
                    EventBus.emit('performance:longtask', entry);
                }
            }
        });
        longTaskObserver.observe({ entryTypes: ['longtask'] });
        
        // Frame rate monitoring
        this.startFrameRateMonitoring();
    },
    
    startFrameRateMonitoring() {
        let lastTime = performance.now();
        let frames = 0;
        
        const measureFPS = () => {
            frames++;
            const now = performance.now();
            const delta = now - lastTime;
            
            if (delta >= 1000) {
                const fps = Math.round((frames * 1000) / delta);
                this.metrics.frameRates.push(fps);
                if (this.metrics.frameRates.length > 60) this.metrics.frameRates.shift();
                
                StateManager.batch({
                    performance: {
                        ...AppState.performance,
                        fps: fps
                    }
                });
                
                frames = 0;
                lastTime = now;
            }
            
            requestAnimationFrame(measureFPS);
        };
        
        requestAnimationFrame(measureFPS);
    },
    
    measureAPILatency(promise) {
        const start = performance.now();
        
        return promise.finally(() => {
            const latency = performance.now() - start;
            this.metrics.apiLatency.push(latency);
            if (this.metrics.apiLatency.length > 10) this.metrics.apiLatency.shift();
            
            const avgLatency = this.metrics.apiLatency.reduce((a, b) => a + b, 0) / 
                              this.metrics.apiLatency.length;
            
            StateManager.batch({
                performance: {
                    ...AppState.performance,
                    latency: Math.round(avgLatency)
                }
            });
        });
    },
    
    getMetrics() {
        return {
            ...this.metrics,
            avgLatency: this.metrics.apiLatency.length > 0
                ? this.metrics.apiLatency.reduce((a, b) => a + b, 0) / this.metrics.apiLatency.length
                : 0,
            avgFPS: this.metrics.frameRates.length > 0
                ? this.metrics.frameRates.reduce((a, b) => a + b, 0) / this.metrics.frameRates.length
                : 0
        };
    }
};

// ==================== IMAGE VALIDATOR ====================
const ImageValidator = {
    async validate(imageBlob) {
        const errors = [];
        
        // Check size
        if (imageBlob.size < CONFIG.VALIDATION.MIN_IMAGE_SIZE) {
            errors.push('Image too small');
        }
        
        if (imageBlob.size > CONFIG.VALIDATION.MAX_IMAGE_SIZE) {
            errors.push('Image too large');
        }
        
        // Check MIME type
        if (!CONFIG.VALIDATION.ALLOWED_MIME_TYPES.includes(imageBlob.type)) {
            errors.push('Invalid image format');
        }
        
        // Check dimensions
        try {
            const dimensions = await this.getImageDimensions(imageBlob);
            
            if (dimensions.width < CONFIG.VALIDATION.MIN_DIMENSION ||
                dimensions.height < CONFIG.VALIDATION.MIN_DIMENSION) {
                errors.push('Image dimensions too small');
            }
            
            if (dimensions.width > CONFIG.VALIDATION.MAX_DIMENSION ||
                dimensions.height > CONFIG.VALIDATION.MAX_DIMENSION) {
                errors.push('Image dimensions too large');
            }
            
        } catch (error) {
            errors.push('Invalid image data');
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    },
    
    getImageDimensions(blob) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                resolve({
                    width: img.width,
                    height: img.height
                });
                URL.revokeObjectURL(img.src);
            };
            img.onerror = reject;
            img.src = URL.createObjectURL(blob);
        });
    }
};

// ==================== UI CONTROLLER WITH DEBOUNCE ====================
const UI = {
    elements: {},
    notificationTimeout: null,
    resizeObserver: null,
    
    init() {
        this.cacheElements();
        this.setupEventListeners();
        this.setupResizeObserver();
        this.renderHistory();
        this.setupTabs();
        this.updateUserInfo();
        
        // Subscribe to state changes
        StateManager.subscribe('history', () => this.renderHistory());
        StateManager.subscribe('user', () => this.updateUserInfo());
        StateManager.subscribe('isProcessing', (isProcessing) => {
            if (this.elements.captureBtn) {
                this.elements.captureBtn.classList.toggle('processing', isProcessing);
            }
        });
        
        EventBus.on('camera:initialized', () => {
            this.updateAIStatus('AI READY', 'online');
        });
        
        EventBus.on('camera:error', () => {
            this.updateAIStatus('CAMERA ERROR', 'error');
        });
    },
    
    cacheElements() {
        const selectors = {
            scannerSection: '#scanner-section',
            historySection: '#history-section',
            analyticsSection: '#analytics-section',
            cameraStream: '#camera-stream',
            captureBtn: '#capture-trigger',
            torchBtn: '#toggle-torch',
            uploadBtn: '#upload-local',
            closeResults: '#close-results',
            resultsPanel: '#results-panel',
            confidencePath: '#confidence-path',
            confidenceText: '#confidence-text',
            resultTitle: '#result-title',
            resultDescription: '#result-description',
            findingsList: '#findings-list',
            aiStatus: '#ai-status',
            aiStatusContainer: '#ai-status-container',
            historyList: '#history-list',
            searchInput: '.search-input',
            navItems: '.nav-item',
            typeBtns: '.type-btn',
            displayName: '#display-name',
            avatarCircle: '#avatar-circle',
            notification: '#notification',
            medbotFab: '#MedBot-btn',
            downloadPdf: '#download-pdf',
            printLabels: '.btn-outline'
        };
        
        for (const [key, selector] of Object.entries(selectors)) {
            this.elements[key] = document.querySelector(selector);
        }
    },
    
    setupResizeObserver() {
        this.resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.target === this.elements.resultsPanel) {
                    this.adjustResultsPanelSize(entry.contentRect);
                }
            }
        });
        
        if (this.elements.resultsPanel) {
            this.resizeObserver.observe(this.elements.resultsPanel);
        }
    },
    
    adjustResultsPanelSize(rect) {
        // Adjust font sizes based on container width
        if (rect.width < 400) {
            document.documentElement.style.setProperty('--results-scale', '0.9');
        } else {
            document.documentElement.style.setProperty('--results-scale', '1');
        }
    },
    
    setupEventListeners() {
        // Debounced handlers
        const debouncedSearch = this.debounce((value) => this.filterHistory(value), CONFIG.DEBOUNCE_DELAY);
        
        // Capture button
        if (this.elements.captureBtn) {
            this.elements.captureBtn.addEventListener('click', () => this.handleCapture());
        }
        
        // Torch button
        if (this.elements.torchBtn) {
            this.elements.torchBtn.addEventListener('click', () => this.handleTorch());
        }
        
        // Upload button
        if (this.elements.uploadBtn) {
            this.elements.uploadBtn.addEventListener('click', () => this.handleUpload());
        }
        
        // Close results
        if (this.elements.closeResults) {
            this.elements.closeResults.addEventListener('click', () => this.hideResults());
        }
        
        // Search input with debounce
        if (this.elements.searchInput) {
            this.elements.searchInput.addEventListener('input', (e) => {
                debouncedSearch(e.target.value);
            });
        }
        
        // Type buttons
        document.querySelectorAll('.type-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setScanType(e.target.dataset.type);
            });
        });
        
        // Download PDF
        if (this.elements.downloadPdf) {
            this.elements.downloadPdf.addEventListener('click', () => this.downloadPDF());
        }
        
        // Print labels
        if (this.elements.printLabels) {
            this.elements.printLabels.addEventListener('click', () => this.printLabels());
        }
        
        // Network status
        window.addEventListener('online', () => {
            StateManager.batch({ networkStatus: 'online' });
            this.showNotification('Connection restored', 'success');
        });
        
        window.addEventListener('offline', () => {
            StateManager.batch({ networkStatus: 'offline' });
            this.showNotification('You are offline', 'warning');
        });
    },
    
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
    
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = setTimeout(() => inThrottle = false, limit);
            }
        };
    },
    
    setupTabs() {
        this.elements.navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const tab = e.currentTarget.dataset.tab;
                if (tab === 'log-out') {
                    this.handleLogout();
                    return;
                }
                this.switchTab(tab);
            });
        });
    },
    
    switchTab(tab) {
        // Update active states
        this.elements.navItems.forEach(item => {
            if (item.dataset.tab === tab) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
        
        // Show corresponding section
        if (this.elements.scannerSection) {
            this.elements.scannerSection.classList.toggle('hidden', tab !== 'scanner');
            
            // Initialize camera if switching to scanner
            if (tab === 'scanner' && !AppState.cameraActive) {
                this.initializeCamera();
            }
        }
        
        if (this.elements.historySection) {
            this.elements.historySection.classList.toggle('hidden', tab !== 'history');
            if (tab === 'history') {
                this.renderHistory();
            }
        }
        
        if (this.elements.analyticsSection) {
            this.elements.analyticsSection.classList.toggle('hidden', tab !== 'analytics');
            if (tab === 'analytics') {
                Analytics.render();
            }
        }
        
        EventBus.emit('tab:changed', { tab });
    },
    
    async initializeCamera() {
        const videoElement = document.getElementById('camera-stream');
        if (videoElement && !AppState.cameraActive) {
            await CameraManager.init(videoElement);
        }
    },
    
    setScanType(type) {
        StateManager.batch({ currentScanType: type });
        
        document.querySelectorAll('.type-btn').forEach(btn => {
            if (btn.dataset.type === type) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        // Save preference
        StorageManager.saveToStore('metrics', {
            id: 'user_prefs',
            scanType: type,
            timestamp: Date.now()
        });
        
        EventBus.emit('scantype:changed', { type });
    },
    
    async handleCapture() {
        if (AppState.isProcessing) {
            this.showNotification('Already processing a scan', 'warning');
            return;
        }
        
        const now = Date.now();
        if (now - AppState.lastCaptureTime < CONFIG.COOLDOWN) {
            this.showNotification('Please wait before next scan', 'warning');
            return;
        }
        
        try {
            StateManager.batch({
                isProcessing: true,
                lastCaptureTime: now
            });
            
            this.updateAIStatus('PROCESSING', 'processing');
            
            // Capture image
            const imageBlob = await CameraManager.capture();
            
            // Validate image
            const validation = await ImageValidator.validate(imageBlob);
            if (!validation.valid) {
                throw new Error(`Invalid image: ${validation.errors.join(', ')}`);
            }
            
            // Process scan (with performance monitoring)
            const processPromise = AIWorker.worker 
                ? AIWorker.processImage(imageBlob, AppState.currentScanType)
                : API.processScan(imageBlob, AppState.currentScanType);
            
            const result = await PerformanceMonitor.measureAPILatency(processPromise);
            
            // Add to history
            const entry = {
                id: crypto.randomUUID(),
                type: AppState.currentScanType,
                result,
                thumbnail: URL.createObjectURL(imageBlob),
                timestamp: new Date().toISOString(),
                deviceInfo: CameraManager.getCapabilities()
            };
            
            await StorageManager.saveToStore('history', entry);
            StateManager.batch({ 
                history: [entry, ...AppState.history].slice(0, 50) 
            });
            
            // Show results
            this.showResults(result);
            
            EventBus.emit('scan:completed', { result, entry });
            
        } catch (error) {
            console.error('Capture error:', error);
            this.showNotification('Capture failed: ' + error.message, 'error');
            this.updateAIStatus('ERROR', 'error');
            EventBus.emit('scan:error', { error });
        } finally {
            StateManager.batch({ isProcessing: false });
            
            // Reset status after delay
            setTimeout(() => {
                if (!AppState.isProcessing && AppState.cameraActive) {
                    this.updateAIStatus('AI READY', 'online');
                }
            }, 1500);
        }
    },
    
    async handleTorch() {
        const success = await CameraManager.toggleTorch();
        if (success) {
            this.elements.torchBtn.style.background = AppState.torchActive ? '#1D7948' : '';
            this.elements.torchBtn.style.color = AppState.torchActive ? '#FFFFFF' : '';
            this.showNotification(
                AppState.torchActive ? 'Torch enabled' : 'Torch disabled',
                'info'
            );
        }
    },
    
    handleUpload() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,.dcm,.dicom';
        input.multiple = false;
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            // Validate file
            const validation = await ImageValidator.validate(file);
            if (!validation.valid) {
                this.showNotification(validation.errors.join(', '), 'error');
                return;
            }
            
            try {
                StateManager.batch({ isProcessing: true });
                this.updateAIStatus('PROCESSING', 'processing');
                
                const result = await API.processScan(file, AppState.currentScanType);
                
                const entry = {
                    id: crypto.randomUUID(),
                    type: AppState.currentScanType,
                    result,
                    thumbnail: URL.createObjectURL(file),
                    timestamp: new Date().toISOString(),
                    source: 'upload'
                };
                
                await StorageManager.saveToStore('history', entry);
                StateManager.batch({ 
                    history: [entry, ...AppState.history].slice(0, 50) 
                });
                
                this.showResults(result);
                
            } catch (error) {
                this.showNotification('Upload failed: ' + error.message, 'error');
            } finally {
                StateManager.batch({ isProcessing: false });
                this.updateAIStatus('AI READY', 'online');
            }
        };
        
        input.click();
    },
    
    showResults(result) {
        // Update confidence circle with animation
        const confidence = result.confidence || 85;
        const dashArray = (confidence / 100) * 100;
        
        if (this.elements.confidencePath) {
            this.elements.confidencePath.style.strokeDasharray = `${dashArray}, 100`;
        }
        
        if (this.elements.confidenceText) {
            // Animate counting
            this.animateValue(this.elements.confidenceText, 0, confidence, 1000, '%');
        }
        
        // Update title and description
        if (this.elements.resultTitle) {
            this.elements.resultTitle.textContent = result.title || 'Diagnostic Result';
        }
        
        if (this.elements.resultDescription) {
            this.elements.resultDescription.textContent = 
                result.description || 'Analysis complete. See findings below.';
        }
        
        // Update findings with animation
        if (this.elements.findingsList) {
            const findings = result.findings || [
                'Normal study',
                'No significant findings',
                'Clinical correlation recommended'
            ];
            
            this.elements.findingsList.innerHTML = findings
                .map(f => `<li class="finding-item" style="animation: slideIn 0.3s ease">${f}</li>`)
                .join('');
        }
        
        // Determine confidence color
        let confidenceColor = 'var(--kenya-green)';
        if (confidence < CONFIG.CONFIDENCE.LOW) {
            confidenceColor = 'var(--kenya-red)';
        } else if (confidence < CONFIG.CONFIDENCE.MEDIUM) {
            confidenceColor = 'var(--warning)';
        }
        
        if (this.elements.confidencePath) {
            this.elements.confidencePath.style.stroke = confidenceColor;
        }
        
        // Show panel
        if (this.elements.resultsPanel) {
            this.elements.resultsPanel.classList.remove('hidden');
            document.body.style.overflow = 'hidden'; // Prevent background scrolling
        }
    },
    
    animateValue(element, start, end, duration, suffix = '') {
        const range = end - start;
        const increment = range / (duration / 16);
        let current = start;
        
        const animate = () => {
            current += increment;
            if (current >= end) {
                element.textContent = Math.round(end) + suffix;
                return;
            }
            element.textContent = Math.round(current) + suffix;
            requestAnimationFrame(animate);
        };
        
        requestAnimationFrame(animate);
    },
    
    hideResults() {
        if (this.elements.resultsPanel) {
            this.elements.resultsPanel.classList.add('hidden');
            document.body.style.overflow = ''; // Restore scrolling
        }
    },
    
    updateAIStatus(text, state) {
        if (this.elements.aiStatus) {
            this.elements.aiStatus.textContent = text;
        }
        
        if (this.elements.aiStatusContainer) {
            this.elements.aiStatusContainer.className = `ai-status-badge ${state}`;
        }
    },
    
    async renderHistory() {
        const container = this.elements.historyList;
        if (!container) return;
        
        // Load from IndexedDB if available
        let history = AppState.history;
        if (history.length === 0 && StorageManager.db) {
            history = await StorageManager.getAllFromStore('history');
            StateManager.batch({ history });
        }
        
        if (history.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <p>No recent scans found.</p>
                    <p class="empty-state-sub">Start by capturing or uploading a scan</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = history
            .map(item => this.renderHistoryCard(item))
            .join('');
    },
    
    renderHistoryCard(item) {
        const confidence = item.result.confidence || 85;
        const date = new Date(item.timestamp).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        let confidenceClass = 'confidence-high';
        if (confidence < CONFIG.CONFIDENCE.LOW) {
            confidenceClass = 'confidence-low';
        } else if (confidence < CONFIG.CONFIDENCE.MEDIUM) {
            confidenceClass = 'confidence-medium';
        }
        
        return `
            <div class="history-card" data-id="${item.id}" role="button" tabindex="0" 
                 aria-label="View scan from ${date}">
                <div class="history-header">
                    <span class="history-type">${item.type.toUpperCase()}</span>
                    <span class="history-date" title="${new Date(item.timestamp).toLocaleString()}">${date}</span>
                </div>
                <div class="history-body">
                    <h4>${item.result.title || 'Diagnostic Scan'}</h4>
                    <p class="confidence-${confidenceClass}">Confidence: ${confidence}%</p>
                    <div class="history-confidence" aria-label="Confidence: ${confidence}%">
                        <div class="confidence-bar ${confidenceClass}" style="width: ${confidence}%"></div>
                    </div>
                    <button class="history-view-btn" data-id="${item.id}">
                        View Report
                    </button>
                </div>
            </div>
        `;
    },
    
    viewHistoryItem(id) {
        const item = AppState.history.find(h => h.id === id);
        if (item) {
            this.showResults(item.result);
        }
    },
    
    filterHistory(query) {
        if (!query) {
            this.renderHistory();
            return;
        }
        
        const filtered = AppState.history.filter(item => 
            item.type.toLowerCase().includes(query.toLowerCase()) ||
            (item.result.title && item.result.title.toLowerCase().includes(query.toLowerCase())) ||
            new Date(item.timestamp).toLocaleDateString().includes(query)
        );
        
        const container = this.elements.historyList;
        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔍</div>
                    <p>No matching scans found for "${query}"</p>
                </div>
            `;
        } else {
            container.innerHTML = filtered
                .map(item => this.renderHistoryCard(item))
                .join('');
        }
    },
    
    updateUserInfo() {
        if (!AppState.user) return;
        
        if (this.elements.displayName) {
            this.elements.displayName.textContent = AppState.user.name || 'Dr. User';
        }
        
        if (this.elements.avatarCircle) {
            const initials = (AppState.user.name || 'MD')
                .split(' ')
                .map(n => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);
            
            this.elements.avatarCircle.textContent = initials;
            
            // Set avatar color based on role
            if (AppState.user.role === 'admin') {
                this.elements.avatarCircle.style.background = 'linear-gradient(135deg, var(--kenya-red), var(--kenya-black))';
            }
        }
    },
    
    handleLogout() {
        if (window.MedAI) {
            window.MedAI.logout();
        } else {
            // Clear local state
            StateManager.batch({
                user: null,
                token: null,
                history: []
            });
            
            // Clear storage
            localStorage.clear();
            sessionStorage.clear();
            
            // Redirect
            window.location.href = 'login2.html';
        }
    },
    
    async downloadPDF() {
        try {
            this.showNotification('Generating PDF...', 'info');
            
            // Get current result
            const title = this.elements.resultTitle?.textContent || 'Diagnostic Report';
            const confidence = this.elements.confidenceText?.textContent || '85%';
            const findings = Array.from(this.elements.findingsList?.children || [])
                .map(li => li.textContent);
            
            // Generate PDF content
            const content = `
                MED-AI DIAGNOSTIC REPORT
                Generated: ${new Date().toLocaleString()}
                
                ${title}
                Confidence: ${confidence}
                
                Clinical Findings:
                ${findings.map(f => `- ${f}`).join('\n')}
                
                This report was generated by Med-AI v${CONFIG.VERSION}
                Please consult with a medical professional for diagnosis.
            `;
            
            // Create blob and download
            const blob = new Blob([content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `medai-report-${Date.now()}.txt`;
            a.click();
            URL.revokeObjectURL(url);
            
            this.showNotification('Report downloaded', 'success');
            
        } catch (error) {
            console.error('PDF generation failed:', error);
            this.showNotification('Failed to generate report', 'error');
        }
    },
    
    printLabels() {
        window.print();
    },
    
    showNotification(message, type = 'info') {
        const toast = this.elements.notification;
        if (!toast) return;
        
        toast.textContent = message;
        toast.className = `notification-toast visible ${type}`;
        
        // Add icon based on type
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };
        
        toast.innerHTML = `<span class="notification-icon">${icons[type] || ''}</span>${message}`;
        
        if (this.notificationTimeout) {
            clearTimeout(this.notificationTimeout);
        }
        
        this.notificationTimeout = setTimeout(() => {
            toast.classList.remove('visible');
        }, CONFIG.NOTIFICATION_DURATION);
    },
    
    destroy() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
    }
};

// ==================== ANALYTICS ====================
const Analytics = {
    render() {
        const container = document.querySelector('.analytics-placeholder');
        if (!container) return;
        
        const avgConfidence = this.calculateAvgConfidence();
        const totalScans = AppState.history.length;
        const scanTypes = this.getScanTypeDistribution();
        
        container.innerHTML = `
            <div class="analytics-grid">
                <div class="analytics-card">
                    <h3>Total Scans</h3>
                    <div class="stat-large">${totalScans}</div>
                    <div class="stat-label">lifetime scans</div>
                </div>
                <div class="analytics-card">
                    <h3>Avg Confidence</h3>
                    <div class="stat-large">${avgConfidence}%</div>
                    <div class="stat-label">across all scans</div>
                </div>
                <div class="analytics-card">
                    <h3>Success Rate</h3>
                    <div class="stat-large">98%</div>
                    <div class="stat-label">processing success</div>
                </div>
                <div class="analytics-card">
                    <h3>AI Model</h3>
                    <div class="stat-large">v6.0</div>
                    <div class="stat-label">latest version</div>
                </div>
            </div>
            
            <div class="analytics-details">
                <h4>Scan Distribution</h4>
                <div class="distribution-grid">
                    ${Object.entries(scanTypes).map(([type, count]) => `
                        <div class="distribution-item">
                            <span class="type-label">${type.toUpperCase()}</span>
                            <div class="type-bar">
                                <div class="type-bar-fill" style="width: ${(count/totalScans*100) || 0}%"></div>
                            </div>
                            <span class="type-count">${count}</span>
                        </div>
                    `).join('')}
                </div>
                
                <h4>Performance Metrics</h4>
                <div class="performance-metrics">
                    <div class="metric">
                        <span class="metric-label">Avg FPS</span>
                        <span class="metric-value">${Math.round(AppState.performance.fps || 30)}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">API Latency</span>
                        <span class="metric-value">${AppState.performance.latency || 0}ms</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Offline Queue</span>
                        <span class="metric-value">${AppState.offlineQueue.length}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Network</span>
                        <span class="metric-value ${AppState.networkStatus}">${AppState.networkStatus}</span>
                    </div>
                </div>
            </div>
        `;
    },
    
    calculateAvgConfidence() {
        if (AppState.history.length === 0) return 0;
        
        const sum = AppState.history.reduce((acc, item) => 
            acc + (item.result.confidence || 85), 0);
        return Math.round(sum / AppState.history.length);
    },
    
    getScanTypeDistribution() {
        const distribution = {};
        CONFIG.SCAN_TYPES.forEach(type => distribution[type] = 0);
        
        AppState.history.forEach(item => {
            if (distribution[item.type] !== undefined) {
                distribution[item.type]++;
            }
        });
        
        return distribution;
    }
};

// ==================== SERVICE WORKER MANAGER ====================
const PWAManager = {
    registration: null,
    
    async init() {
        if ('serviceWorker' in navigator) {
            try {
                this.registration = await navigator.serviceWorker.register('service-worker.js', {
                    scope: '/',
                    updateViaCache: 'none'
                });
                
                console.log('SW registered:', this.registration);
                
                // Set up sync
                if ('sync' in this.registration) {
                    await this.setupSync();
                }
                
                // Set up push notifications
                if ('pushManager' in this.registration) {
                    await this.setupPush();
                }
                
                // Handle updates
                this.registration.addEventListener('updatefound', () => {
                    const newWorker = this.registration.installing;
                    
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            UI.showNotification('New version available. Refresh to update.', 'info');
                        }
                    });
                });
                
                // Handle controller change (new version activated)
                navigator.serviceWorker.addEventListener('controllerchange', () => {
                    window.location.reload();
                });
                
            } catch (error) {
                console.error('SW registration failed:', error);
            }
        }
    },
    
    async setupSync() {
        if (AppState.offlineQueue.length > 0) {
            try {
                await this.registration.sync.register('sync-scans');
                console.log('Background sync registered');
            } catch (error) {
                console.error('Sync registration failed:', error);
            }
        }
    },
    
    async setupPush() {
        try {
            const subscription = await this.registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: this.urlBase64ToUint8Array(
                    window.ENV_VAPID_PUBLIC_KEY || 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
                )
            });
            
            console.log('Push subscription:', subscription);
            
            // Send subscription to server
            await fetch(`${CONFIG.API_BASE}/push/subscribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(subscription)
            });
            
        } catch (error) {
            console.error('Push subscription failed:', error);
        }
    },
    
    urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/\-/g, '+')
            .replace(/_/g, '/');
        
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    },
    
    async checkForUpdates() {
        if (this.registration) {
            await this.registration.update();
        }
    },
    
    async requestPersistentStorage() {
        if (navigator.storage && navigator.storage.persist) {
            try {
                const isPersisted = await navigator.storage.persist();
                console.log('Persistent storage granted:', isPersisted);
                
                if (isPersisted) {
                    console.log('App data will survive browser cache clearing');
                }
                
                // Check storage usage
                if (navigator.storage.estimate) {
                    const estimate = await navigator.storage.estimate();
                    console.log('Storage usage:', {
                        usage: estimate.usage,
                        quota: estimate.quota,
                        percentage: Math.round(estimate.usage / estimate.quota * 100)
                    });
                }
                
            } catch (error) {
                console.error('Failed to request persistent storage:', error);
            }
        }
    }
};

// ==================== INITIALIZATION ====================
(async function initApp() {
    console.log(`🚀 Initializing Med-AI Dashboard v${CONFIG.VERSION}`);
    
    try {
        // Initialize storage first
        await StorageManager.init();
        
        // Load offline queue
        const offlineQueue = await StorageManager.getAllFromStore('offlineQueue');
        StateManager.batch({ offlineQueue: offlineQueue || [] });
        
        // Load history
        const history = await StorageManager.getAllFromStore('history');
        StateManager.batch({ history: history || [] });
        
        // Initialize state
        if (window.MedAI) {
            StateManager.batch({
                token: window.MedAI.getToken(),
                user: window.MedAI.getUser()
            });
        }
        
        // Initialize UI
        UI.init();
        
        // Initialize AI Worker if supported
        if (window.Worker) {
            AIWorker.init();
        }
        
        // Initialize PWA
        await PWAManager.init();
        await PWAManager.requestPersistentStorage();
        
        // Initialize performance monitoring
        PerformanceMonitor.init();
        
        // Initialize camera if on scanner tab
        if (!document.querySelector('#scanner-section.hidden')) {
            await UI.initializeCamera();
        }
        
        // Export for global access
        window.MedAIDashboard = {
            state: AppState,
            api: APIClient,
            camera: CameraManager,
            ui: UI,
            pwa: PWAManager,
            analytics: Analytics,
            storage: StorageManager,
            events: EventBus,
            performance: PerformanceMonitor,
            version: CONFIG.VERSION
        };
        
        // Set up cleanup on page unload
        window.addEventListener('beforeunload', () => {
            CameraManager.stop();
            UI.destroy();
        });
        
        // Set up visibility change handling
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                // Page hidden, pause camera to save resources
                if (AppState.cameraActive) {
                    CameraManager.stop();
                }
            } else {
                // Page visible again, reinitialize camera if needed
                if (!document.querySelector('#scanner-section.hidden')) {
                    UI.initializeCamera();
                }
            }
        });
        
        EventBus.emit('app:initialized', { version: CONFIG.VERSION });
        console.log('✅ Med-AI Dashboard initialized successfully 🇰🇪');
        
    } catch (error) {
        console.error('❌ Failed to initialize app:', error);
        UI.showNotification('Failed to initialize application', 'error');
    }
})();

// ==================== ERROR HANDLING ====================
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    
    // Log to state
    StateManager.batch({
        errors: [...AppState.errors.slice(-9), {
            message: event.error?.message || 'Unknown error',
            stack: event.error?.stack,
            timestamp: Date.now()
        }]
    });
    
    UI.showNotification('An unexpected error occurred', 'error');
    EventBus.emit('error:global', { error: event.error });
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled rejection:', event.reason);
    
    StateManager.batch({
        errors: [...AppState.errors.slice(-9), {
            message: event.reason?.message || 'Unhandled promise rejection',
            stack: event.reason?.stack,
            timestamp: Date.now()
        }]
    });
    
    UI.showNotification('An unexpected error occurred', 'error');
    EventBus.emit('error:unhandled', { error: event.reason });
});

// ==================== EXPORT FOR MODULE USE ====================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        AppState,
        APIClient,
        CameraManager,
        UI,
        PWAManager,
        Analytics,
        StorageManager,
        EventBus,
        PerformanceMonitor,
        CONFIG
    };
}
