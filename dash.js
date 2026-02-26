/**
 * MEDAI ENTERPRISE ENGINE v3.5.0 (Production-Ready)
 * High-performance medical imaging interface with robust state management.
 * 
 * @author MedAI Team
 * @version 3.5.0
 * @license Proprietary
 */

(() => {
    "use strict";

    /* ==================== 1. ENHANCED CONFIGURATION ==================== */
    const CONFIG = {
        API: {
            BASE: window.ENV_API_BASE || "https://ai-p17b.onrender.com",
            AUTH: window.ENV_AUTH_API_BASE || "https://m-backend-n2pd.onrender.com",
            TIMEOUT: 30000,
            RETRIES: 3,
            RETRYABLE_STATUS: [408, 429, 500, 502, 503, 504]
        },
        STORAGE_KEYS: {
            HISTORY: 'medai_history',
            TOKEN: 'medai_token',
            USER: 'medai_user',
            CSRF: 'csrf_token',
            SETTINGS: 'medai_settings',
            QUEUE: 'medai_request_queue'
        },
        COMPRESSION: {
            ENABLED: true,
            QUALITY: 0.85,
            MAX_WIDTH: 1920,
            MAX_HEIGHT: 1080,
            MIN_SIZE: 1024 * 1024 // 1MB
        },
        UI: {
            NOTIFICATION_DURATION: 4000,
            MAX_HISTORY_ITEMS: 50,
            DEBOUNCE_DELAY: 300
        },
        LOG_LEVELS: { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 },
        
        // Feature flags
        FEATURES: {
            ENABLE_OFFLINE_QUEUE: true,
            ENABLE_COMPRESSION: true,
            ENABLE_HEALTH_CHECKS: !window.location.hostname.includes('localhost')
        }
    };

    /* ==================== 2. ENHANCED UTILITIES ==================== */
    const Utils = {
        /**
         * Generate unique ID with optional prefix
         */
        id: (prefix = 'id') => {
            const random = crypto.randomUUID ? crypto.randomUUID().split('-')[0] : 
                Math.random().toString(36).substring(2, 10);
            return `${prefix}_${random}_${Date.now().toString(36)}`;
        },
        
        /**
         * Sanitize HTML content to prevent XSS
         */
        sanitize: (str) => {
            if (!str) return '';
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        },

        /**
         * Debounce function for performance
         */
        debounce: (fn, delay = CONFIG.UI.DEBOUNCE_DELAY) => {
            let timeout;
            return (...args) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => fn(...args), delay);
            };
        },

        /**
         * Throttle function for performance
         */
        throttle: (fn, limit = 200) => {
            let inThrottle;
            return (...args) => {
                if (!inThrottle) {
                    fn(...args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            };
        },

        /**
         * Sleep utility
         */
        sleep: (ms) => new Promise(r => setTimeout(r, ms)),

        /**
         * Format bytes to human readable
         */
        formatBytes: (bytes, decimals = 2) => {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const dm = decimals < 0 ? 0 : decimals;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
        },

        /**
         * Get device information
         */
        getDeviceInfo: () => ({
            ua: navigator.userAgent,
            online: navigator.onLine,
            screen: `${window.innerWidth}x${window.innerHeight}`,
            touch: 'ontouchstart' in window,
            language: navigator.language,
            platform: navigator.platform
        }),

        /**
         * Retry function with exponential backoff
         */
        retry: async (fn, maxAttempts = CONFIG.API.RETRIES, baseDelay = 1000) => {
            for (let i = 0; i < maxAttempts; i++) {
                try {
                    return await fn();
                } catch (error) {
                    if (i === maxAttempts - 1) throw error;
                    await Utils.sleep(baseDelay * Math.pow(2, i));
                }
            }
        },

        /**
         * Deep clone object
         */
        clone: (obj) => JSON.parse(JSON.stringify(obj))
    };

    /* ==================== 3. ENHANCED SERVICES ==================== */

    /**
     * Logger Service with queue and sanitization
     */
    class Logger {
        constructor() {
            this.queue = [];
            this.level = window.location.hostname.includes('localhost') ? 0 : 1;
            this.flushInterval = setInterval(() => this.flush(), 30000);
        }

        log(level, msg, data = null) {
            if (level < this.level) return;
            
            const entry = {
                id: Utils.id('log'),
                timestamp: new Date().toISOString(),
                level: Object.keys(CONFIG.LOG_LEVELS)[level],
                message: msg,
                data: this._maskSensitive(data),
                device: Utils.getDeviceInfo()
            };

            // Console output with styling
            const styles = [
                'color: #6c757d',                    // DEBUG - gray
                'color: #0d6efd',                     // INFO - blue
                'color: #ffc107; font-weight: bold',  // WARN - orange
                'color: #dc3545; font-weight: bold'   // ERROR - red
            ];
            
            console.log(
                `%c[${entry.level}] ${msg}`,
                styles[level],
                data ? data : ''
            );
            
            this.queue.push(entry);
            
            // Prevent memory issues
            if (this.queue.length > 100) {
                this.queue = this.queue.slice(-50);
            }
        }

        debug(msg, data) { this.log(CONFIG.LOG_LEVELS.DEBUG, msg, data); }
        info(msg, data) { this.log(CONFIG.LOG_LEVELS.INFO, msg, data); }
        warn(msg, data) { this.log(CONFIG.LOG_LEVELS.WARN, msg, data); }
        error(msg, data) { this.log(CONFIG.LOG_LEVELS.ERROR, msg, data); }

        _maskSensitive(data) {
            if (!data) return null;
            const sensitive = ['token', 'password', 'secret', 'auth', 'key', 'csrf'];
            
            try {
                const copy = JSON.parse(JSON.stringify(data));
                const mask = (obj) => {
                    if (!obj || typeof obj !== 'object') return;
                    
                    for (let key in obj) {
                        if (sensitive.some(s => key.toLowerCase().includes(s))) {
                            obj[key] = '[REDACTED]';
                        } else if (typeof obj[key] === 'object') {
                            mask(obj[key]);
                        }
                    }
                };
                mask(copy);
                return copy;
            } catch {
                return { error: 'Could not mask data' };
            }
        }

        async flush() {
            if (!navigator.onLine || !this.queue.length) return;
            
            const logs = [...this.queue];
            this.queue = [];
            
            try {
                await fetch(`${CONFIG.API.BASE}/logs`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-Request-ID': Utils.id('log_flush')
                    },
                    body: JSON.stringify(logs)
                });
            } catch (e) {
                // Re-queue logs on failure
                this.queue.unshift(...logs);
                console.warn('Failed to send logs, queued for retry');
            }
        }

        destroy() {
            clearInterval(this.flushInterval);
            this.flush();
        }
    }

    /**
     * Authentication Service with CSRF protection
     */
    class AuthService {
        constructor() {
            this.token = localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
            this.user = null;
            this.csrfToken = this._generateCSRFToken();
            this.listeners = [];
        }

        _generateCSRFToken() {
            const token = crypto.randomUUID ? crypto.randomUUID() : 
                Array.from(crypto.getRandomValues(new Uint8Array(32)))
                    .map(b => b.toString(16).padStart(2, '0'))
                    .join('');
            
            sessionStorage.setItem(CONFIG.STORAGE_KEYS.CSRF, token);
            return token;
        }

        getCSRFToken() {
            return sessionStorage.getItem(CONFIG.STORAGE_KEYS.CSRF) || this._generateCSRFToken();
        }

        getToken() {
            return this.token;
        }

        async validateToken() {
            if (!this.token) return false;
            
            try {
                const response = await fetch(`${CONFIG.API.AUTH}/auth/me`, {
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'X-CSRF-Token': this.getCSRFToken()
                    }
                });
                
                if (response.ok) {
                    this.user = await response.json();
                    this._notifyListeners(true);
                    return true;
                }
                
                this.logout();
                return false;
                
            } catch {
                return false; // Network error, assume valid
            }
        }

        setToken(token) {
            this.token = token;
            localStorage.setItem(CONFIG.STORAGE_KEYS.TOKEN, token);
        }

        logout() {
            this.token = null;
            this.user = null;
            localStorage.removeItem(CONFIG.STORAGE_KEYS.TOKEN);
            localStorage.removeItem(CONFIG.STORAGE_KEYS.USER);
            sessionStorage.removeItem(CONFIG.STORAGE_KEYS.CSRF);
            this._notifyListeners(false);
            window.location.href = '/login.html';
        }

        onAuthChange(callback) {
            this.listeners.push(callback);
        }

        _notifyListeners(authenticated) {
            this.listeners.forEach(cb => cb({ authenticated, user: this.user }));
        }

        sanitizeInput(str) {
            return Utils.sanitize(str);
        }
    }

    /**
     * History Service with caching and stats
     */
    class HistoryService {
        constructor() {
            this.key = CONFIG.STORAGE_KEYS.HISTORY;
            this.cache = new Map();
            this.maxItems = CONFIG.UI.MAX_HISTORY_ITEMS;
        }

        save(item) {
            try {
                const history = this.getAll();
                const entry = { 
                    ...item, 
                    id: Utils.id('hist'), 
                    date: new Date().toISOString(),
                    version: '1.0'
                };
                
                history.unshift(entry);
                
                // Trim to max items
                const trimmed = history.slice(0, this.maxItems);
                localStorage.setItem(this.key, JSON.stringify(trimmed));
                
                // Clear cache
                this.cache.clear();
                
                return entry;
            } catch (error) {
                console.error('Failed to save history:', error);
                return null;
            }
        }

        getAll() {
            try {
                // Check cache first
                if (this.cache.has('all')) {
                    return this.cache.get('all');
                }
                
                const history = JSON.parse(localStorage.getItem(this.key)) || [];
                this.cache.set('all', history);
                return history;
            } catch {
                return [];
            }
        }

        getById(id) {
            // Check cache first
            if (this.cache.has(id)) {
                return this.cache.get(id);
            }
            
            const item = this.getAll().find(i => i.id === id);
            if (item) this.cache.set(id, item);
            return item;
        }

        delete(id) {
            try {
                const history = this.getAll().filter(i => i.id !== id);
                localStorage.setItem(this.key, JSON.stringify(history));
                this.cache.clear();
                return true;
            } catch {
                return false;
            }
        }

        clear() { 
            localStorage.removeItem(this.key);
            this.cache.clear();
        }

        getStats() {
            const history = this.getAll();
            if (!history.length) {
                return { total: 0, avgConfidence: 0, byType: {} };
            }
            
            const total = history.length;
            const avgConfidence = Math.round(
                history.reduce((sum, i) => sum + (i.confidence || 0), 0) / total
            );
            
            const byType = history.reduce((acc, i) => {
                const type = i.type || 'unknown';
                acc[type] = (acc[type] || 0) + 1;
                return acc;
            }, {});
            
            return { total, avgConfidence, byType };
        }
    }

    /**
     * Request Queue for offline support
     */
    class RequestQueue {
        constructor() {
            this.queue = [];
            this.processing = false;
            this.storageKey = CONFIG.STORAGE_KEYS.QUEUE;
            this._loadFromStorage();
            this._setupListeners();
        }

        _setupListeners() {
            window.addEventListener('online', () => this.process());
            window.addEventListener('beforeunload', () => this._saveToStorage());
        }

        _loadFromStorage() {
            try {
                const saved = localStorage.getItem(this.storageKey);
                if (saved) this.queue = JSON.parse(saved);
            } catch {}
        }

        _saveToStorage() {
            try {
                localStorage.setItem(this.storageKey, JSON.stringify(this.queue));
            } catch {}
        }

        async add(request) {
            const item = {
                ...request,
                id: Utils.id('req'),
                timestamp: Date.now(),
                retries: 0
            };
            
            this.queue.push(item);
            this._saveToStorage();
            
            if (navigator.onLine) this.process();
        }

        async process() {
            if (this.processing || !this.queue.length || !navigator.onLine) return;
            
            this.processing = true;
            
            while (this.queue.length > 0) {
                const request = this.queue[0];
                
                try {
                    await this._execute(request);
                    this.queue.shift(); // Remove on success
                    this._saveToStorage();
                } catch (error) {
                    request.retries++;
                    
                    if (request.retries >= 3) {
                        this.queue.shift(); // Remove failed request
                    }
                    
                    break; // Stop on error
                }
            }
            
            this.processing = false;
        }

        async _execute(request) {
            const response = await fetch(request.url, {
                ...request.options,
                headers: {
                    ...request.options?.headers,
                    'X-Queue-ID': request.id,
                    'X-Retry-Count': request.retries
                }
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response;
        }

        get length() { return this.queue.length; }
    }

    /**
     * Image Processor for compression and validation
     */
    class ImageProcessor {
        constructor(logger) {
            this.logger = logger;
        }

        async validateFile(file) {
            // Check file size
            if (file.size > 50 * 1024 * 1024) {
                throw new Error(`File too large: ${Utils.formatBytes(file.size)}`);
            }

            // Validate file signature
            const header = await this._readFileHeader(file);
            
            // Check image signatures
            const signatures = {
                jpeg: [0xFF, 0xD8],
                png: [0x89, 0x50],
                gif: [0x47, 0x49],
                webp: [0x52, 0x49]
            };
            
            const isValid = Object.values(signatures).some(sig => 
                header[0] === sig[0] && header[1] === sig[1]
            );
            
            if (!isValid) {
                throw new Error('Invalid or unsupported file format');
            }
            
            return true;
        }

        async _readFileHeader(file) {
            return new Uint8Array(await file.slice(0, 12).arrayBuffer());
        }

        async compress(file) {
            if (!CONFIG.FEATURES.ENABLE_COMPRESSION || 
                file.size < CONFIG.COMPRESSION.MIN_SIZE) {
                return file;
            }

            return new Promise((resolve, reject) => {
                const img = new Image();
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                const url = URL.createObjectURL(file);
                
                img.onload = () => {
                    URL.revokeObjectURL(url);
                    
                    let { width, height } = this._calculateDimensions(
                        img.width, img.height
                    );
                    
                    canvas.width = width;
                    canvas.height = height;
                    
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    canvas.toBlob((blob) => {
                        if (blob) {
                            this.logger.info('Image compressed', {
                                original: Utils.formatBytes(file.size),
                                compressed: Utils.formatBytes(blob.size),
                                ratio: Math.round(blob.size / file.size * 100) + '%'
                            });
                            resolve(blob);
                        } else {
                            reject(new Error('Compression failed'));
                        }
                    }, 'image/jpeg', CONFIG.COMPRESSION.QUALITY);
                };
                
                img.onerror = () => {
                    URL.revokeObjectURL(url);
                    reject(new Error('Failed to load image'));
                };
                
                img.src = url;
            });
        }

        _calculateDimensions(width, height) {
            const max = CONFIG.COMPRESSION.MAX_WIDTH;
            
            if (width <= max && height <= max) {
                return { width, height };
            }
            
            const ratio = Math.min(max / width, max / height);
            
            return {
                width: Math.round(width * ratio),
                height: Math.round(height * ratio)
            };
        }

        async captureFrame(videoElement) {
            const canvas = document.createElement('canvas');
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            
            ctx.drawImage(videoElement, 0, 0);
            
            return new Promise(resolve => {
                canvas.toBlob(resolve, 'image/jpeg', CONFIG.COMPRESSION.QUALITY);
            });
        }
    }

    /* ==================== 4. MAIN APPLICATION ==================== */

    class MedAIApp {
        constructor() {
            // Initialize services
            this.logger = new Logger();
            this.auth = new AuthService();
            this.history = new HistoryService();
            this.queue = new RequestQueue();
            this.imageProcessor = new ImageProcessor(this.logger);
            
            // State management
            this.state = {
                isProcessing: false,
                isOnline: navigator.onLine,
                stream: null,
                activeTab: 'scanner',
                lastError: null,
                retryCount: 0
            };
            
            // DOM elements
            this.dom = {};
            
            // Resource tracking
            this.timeouts = [];
            this.listeners = [];
            this.canvas = null;
            
            // Bound methods
            this.debouncedRenderHistory = Utils.debounce(this.renderHistory.bind(this));
            this.throttledResize = Utils.throttle(this._handleResize.bind(this));
        }

        /**
         * Initialize the application
         */
        async init() {
            try {
                this.logger.info("System Bootstrap Initiated");
                
                // Check authentication
                if (!await this._checkAuth()) {
                    return;
                }
                
                this._cacheDOM();
                this._bindEvents();
                await this.initCamera();
                this._setupNetworkListeners();
                this._setupKeyboardShortcuts();
                
                // Initial render
                this.switchTab(this.state.activeTab);
                
                this.logger.info("MedAI Engine Ready", {
                    environment: window.location.hostname,
                    features: CONFIG.FEATURES
                });
                
            } catch (error) {
                this.logger.error("Initialization Failed", error);
                this._showFatalError(error);
            }
        }

        /**
         * Check authentication status
         */
        async _checkAuth() {
            // Integrate with existing auth system
            if (window.MedAI?.isAuthenticated?.()) {
                return true;
            }
            
            // Validate stored token
            if (this.auth.getToken()) {
                const valid = await this.auth.validateToken();
                if (valid) return true;
            }
            
            // Not authenticated
            window.location.href = '/login.html';
            return false;
        }

        /**
         * Cache DOM elements
         */
        _cacheDOM() {
            const $ = (id) => document.getElementById(id);
            
            this.dom = {
                video: $("camera-stream"),
                captureBtn: $("capture-trigger"),
                uploadBtn: $("upload-local"),
                torchBtn: $("toggle-torch"),
                results: $("results-panel"),
                status: $("ai-status"),
                statusContainer: $("ai-status-container"),
                historyList: $("history-list"),
                notification: $("notification"),
                closeResults: $("close-results"),
                navItems: document.querySelectorAll('.nav-item'),
                sections: {
                    scanner: $("scanner-section"),
                    history: $("history-section"),
                    analytics: $("analytics-section")
                },
                scanTypeBtns: document.querySelectorAll('.type-btn'),
                searchInput: document.querySelector('.search-input')
            };
        }

        /**
         * Bind event listeners
         */
        _bindEvents() {
            // Capture button
            if (this.dom.captureBtn) {
                this.dom.captureBtn.addEventListener('click', () => this.handleCapture());
            }
            
            // Upload button
            if (this.dom.uploadBtn) {
                this.dom.uploadBtn.addEventListener('click', () => this._triggerFileUpload());
            }
            
            // Close results
            if (this.dom.closeResults) {
                this.dom.closeResults.addEventListener('click', () => {
                    this.dom.results?.classList.add('hidden');
                });
            }
            
            // Navigation
            this.dom.navItems.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const tab = e.currentTarget.dataset.tab;
                    if (tab) this.switchTab(tab);
                });
            });
            
            // Scan type selection
            this.dom.scanTypeBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    this.dom.scanTypeBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                });
            });
            
            // Search input
            if (this.dom.searchInput) {
                this.dom.searchInput.addEventListener('input', (e) => {
                    this.debouncedRenderHistory(e.target.value);
                });
            }
            
            // Window resize
            window.addEventListener('resize', this.throttledResize);
        }

        /**
         * Set up keyboard shortcuts
         */
        _setupKeyboardShortcuts() {
            const handler = (e) => {
                // Skip if typing in input
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
                
                // Ctrl/Cmd + C: Capture
                if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                    e.preventDefault();
                    this.handleCapture();
                }
                
                // Esc: Close results
                if (e.key === 'Escape' && !this.dom.results?.classList.contains('hidden')) {
                    this.dom.results?.classList.add('hidden');
                }
                
                // Alt + 1,2,3: Tab navigation
                if (e.altKey && ['1', '2', '3'].includes(e.key)) {
                    const tabs = ['scanner', 'history', 'analytics'];
                    this.switchTab(tabs[parseInt(e.key) - 1]);
                }
            };
            
            window.addEventListener('keydown', handler);
            this.listeners.push({ target: window, type: 'keydown', handler });
        }

        /**
         * Set up network listeners
         */
        _setupNetworkListeners() {
            const onlineHandler = () => {
                this.state.isOnline = true;
                this._updateStatus("AI READY", "online");
                this.queue.process();
                this.notify("Back Online", "success");
            };
            
            const offlineHandler = () => {
                this.state.isOnline = false;
                this._updateStatus("OFFLINE", "offline");
                this.notify("Working Offline", "warning");
            };
            
            window.addEventListener('online', onlineHandler);
            window.addEventListener('offline', offlineHandler);
            
            this.listeners.push({ target: window, type: 'online', handler: onlineHandler });
            this.listeners.push({ target: window, type: 'offline', handler: offlineHandler });
        }

        /**
         * Initialize camera
         */
        async initCamera() {
            try {
                if (this.state.stream) {
                    this.state.stream.getTracks().forEach(t => t.stop());
                }

                const constraints = {
                    video: { 
                        facingMode: 'environment', 
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                        frameRate: { ideal: 30 }
                    },
                    audio: false
                };

                this.state.stream = await navigator.mediaDevices.getUserMedia(constraints);

                if (this.dom.video) {
                    this.dom.video.srcObject = this.state.stream;
                    this.dom.video.setAttribute('playsinline', true);
                    
                    try {
                        await this.dom.video.play();
                    } catch (playError) {
                        // Auto-play prevented, will play on interaction
                    }
                    
                    this._updateStatus("AI READY", "ready");
                }

            } catch (error) {
                this.logger.error("Camera Init Failed", error);
                
                let message = "Camera unavailable";
                if (error.name === 'NotAllowedError') {
                    message = "Camera access denied";
                } else if (error.name === 'NotFoundError') {
                    message = "No camera found";
                }
                
                this.notify(message, "error");
                this._updateStatus("CAMERA ERROR", "error");
            }
        }

        /**
         * Handle image capture
         */
        async handleCapture() {
            if (this.state.isProcessing || !this.state.isOnline) {
                if (!this.state.isOnline) this.notify("Cannot capture offline", "warning");
                return;
            }

            this.state.isProcessing = true;
            this._setLoading(true);

            try {
                // Capture frame
                const blob = await this.imageProcessor.captureFrame(this.dom.video);
                
                // Process and upload
                const result = await this._processImage(blob, 'capture.jpg');
                
                // Save to history
                this.history.save({
                    type: 'scan',
                    confidence: result.confidence,
                    diagnosis: result.diagnosis,
                    scanType: this._getActiveScanType()
                });

                // Display results
                this._displayResults(result);
                
                this.logger.info("Capture successful", {
                    confidence: result.confidence,
                    diagnosis: result.diagnosis
                });

            } catch (error) {
                this.logger.error("Capture Failed", error);
                this.notify(error.message || "Analysis failed", "error");
            } finally {
                this.state.isProcessing = false;
                this._setLoading(false);
            }
        }

        /**
         * Process image (upload to API)
         */
        async _processImage(blob, filename) {
            // Compress if needed
            const processed = await this.imageProcessor.compress(blob);
            
            // Prepare form data
            const formData = new FormData();
            formData.append('file', processed, filename);
            formData.append('type', this._getActiveScanType());
            formData.append('timestamp', Date.now().toString());

            // Upload with retry logic
            const response = await Utils.retry(async () => {
                return await fetch(`${CONFIG.API.BASE}/diagnostics/process`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.auth.getToken()}`,
                        'X-CSRF-Token': this.auth.getCSRFToken(),
                        'X-Request-ID': Utils.id('req')
                    },
                    body: formData
                });
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }

            return await response.json();
        }

        /**
         * Handle file upload
         */
        async _handleFileUpload(file) {
            if (!file) return;
            
            try {
                // Validate file
                await this.imageProcessor.validateFile(file);
                
                // Process
                this.state.isProcessing = true;
                this._setLoading(true);
                
                const result = await this._processImage(file, file.name);
                
                this.history.save({
                    type: 'upload',
                    confidence: result.confidence,
                    diagnosis: result.diagnosis,
                    filename: file.name,
                    size: file.size
                });
                
                this._displayResults(result);
                
            } catch (error) {
                this.logger.error("Upload Failed", error);
                this.notify(error.message, "error");
            } finally {
                this.state.isProcessing = false;
                this._setLoading(false);
            }
        }

        /**
         * Create and trigger file input
         */
        _triggerFileUpload() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*,.dcm,.dicom';
            input.multiple = false;
            
            input.addEventListener('change', (e) => {
                const file = e.target.files?.[0];
                if (file) this._handleFileUpload(file);
            });
            
            input.click();
        }

        /**
         * Switch between tabs
         */
        switchTab(tabName) {
            if (!tabName || !this.dom.sections[tabName]) return;
            
            this.state.activeTab = tabName;
            
            // Toggle section visibility
            Object.entries(this.dom.sections).forEach(([key, el]) => {
                if (el) el.classList.toggle('hidden', key !== tabName);
            });

            // Update navigation UI
            this.dom.navItems.forEach(item => {
                item.classList.toggle('active', item.dataset.tab === tabName);
            });

            // Load tab content
            switch(tabName) {
                case 'history':
                    this.renderHistory();
                    break;
                case 'analytics':
                    this._renderAnalytics();
                    break;
            }
        }

        /**
         * Render history list
         */
        renderHistory(searchTerm = '') {
            if (!this.dom.historyList) return;
            
            const items = this.history.getAll();
            
            if (!items.length) {
                this.dom.historyList.innerHTML = `
                    <div class="empty-state">
                        <p>No scans yet</p>
                        <small>Capture or upload an image to get started</small>
                    </div>
                `;
                return;
            }
            
            // Filter if search term provided
            const filtered = searchTerm 
                ? items.filter(item => 
                    item.diagnosis?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    item.type?.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                : items;
            
            this.dom.historyList.innerHTML = filtered.map(item => `
                <div class="history-card" data-id="${Utils.sanitize(item.id)}">
                    <div class="history-header">
                        <span class="badge ${item.type}">${Utils.sanitize(item.type || 'scan')}</span>
                        <span class="date">${new Date(item.date).toLocaleDateString()}</span>
                    </div>
                    <div class="history-body">
                        <strong>${Utils.sanitize(item.diagnosis || 'Analysis')}</strong>
                        <div class="confidence">
                            <div class="bar" style="width: ${item.confidence || 0}%"></div>
                            <span>${item.confidence || 0}%</span>
                        </div>
                    </div>
                    <button class="view-btn" onclick="window.medAIApp.viewHistoryItem('${item.id}')">
                        View Details
                    </button>
                </div>
            `).join('');
        }

        /**
         * View history item
         */
        viewHistoryItem(id) {
            const item = this.history.getById(id);
            if (item) {
                this._displayResults(item);
                this.switchTab('scanner');
            }
        }

        /**
         * Render analytics
         */
        _renderAnalytics() {
            const container = document.querySelector('.analytics-content');
            if (!container) return;
            
            const stats = this.history.getStats();
            
            container.innerHTML = `
                <div class="analytics-grid">
                    <div class="stat-card">
                        <h3>Total Scans</h3>
                        <p class="stat">${stats.total}</p>
                    </div>
                    <div class="stat-card">
                        <h3>Avg. Confidence</h3>
                        <p class="stat">${stats.avgConfidence}%</p>
                    </div>
                    <div class="stat-card">
                        <h3>Queue Size</h3>
                        <p class="stat">${this.queue.length}</p>
                    </div>
                </div>
                <div class="type-breakdown">
                    <h3>Scans by Type</h3>
                    ${Object.entries(stats.byType).map(([type, count]) => `
                        <div class="type-stat">
                            <span>${type}</span>
                            <span>${count}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        /**
         * Display analysis results
         */
        _displayResults(data) {
            if (!this.dom.results) return;
            
            this.dom.results.classList.remove('hidden');
            
            // Update result fields
            const titleEl = document.getElementById('result-title');
            const descEl = document.getElementById('result-description');
            const findingsEl = document.getElementById('findings-list');
            
            if (titleEl) titleEl.textContent = data.diagnosis || 'Analysis Complete';
            if (descEl) descEl.textContent = data.description || 'AI interpretation provided';
            
            // Update confidence
            this._updateConfidence(data.confidence || 0);
            
            // Update findings
            if (findingsEl && data.findings) {
                findingsEl.innerHTML = data.findings.map(f => `
                    <li class="finding-item">${Utils.sanitize(f)}</li>
                `).join('');
            }
            
            // Scroll to results on mobile
            if (window.innerWidth <= 768) {
                this.dom.results.scrollIntoView({ behavior: 'smooth' });
            }
        }

        /**
         * Update confidence display
         */
        _updateConfidence(score) {
            const value = Math.max(0, Math.min(100, Number(score)));
            
            const textEl = document.getElementById('confidence-text');
            const pathEl = document.getElementById('confidence-path');
            
            if (textEl) textEl.textContent = `${value}%`;
            
            if (pathEl) {
                pathEl.style.strokeDasharray = `${value},100`;
                
                // Color based on confidence
                if (value >= 80) pathEl.style.stroke = '#00c851';
                else if (value >= 60) pathEl.style.stroke = '#ffbb33';
                else pathEl.style.stroke = '#ff4444';
            }
        }

        /**
         * Get active scan type
         */
        _getActiveScanType() {
            const active = document.querySelector('.type-btn.active');
            return active?.dataset.type || 'standard';
        }

        /**
         * Update AI status indicator
         */
        _updateStatus(text, status) {
            if (this.dom.status) {
                this.dom.status.textContent = text;
            }
            if (this.dom.statusContainer) {
                this.dom.statusContainer.className = `ai-status-badge ${status}`;
            }
        }

        /**
         * Set loading state
         */
        _setLoading(isLoading) {
            if (this.dom.status) {
                this.dom.status.textContent = isLoading ? "PROCESSING..." : "AI READY";
            }
            if (this.dom.captureBtn) {
                this.dom.captureBtn.disabled = isLoading;
                this.dom.captureBtn.classList.toggle('processing', isLoading);
            }
        }

        /**
         * Show notification
         */
        notify(msg, type = 'info') {
            if (!this.dom.notification) return;
            
            this.dom.notification.textContent = msg;
            this.dom.notification.className = `notification show ${type}`;
            
            // Clear previous timeout
            if (this._notifyTimeout) {
                clearTimeout(this._notifyTimeout);
            }
            
            this._notifyTimeout = setTimeout(() => {
                this.dom.notification?.classList.remove('show');
            }, CONFIG.UI.NOTIFICATION_DURATION);
        }

        /**
         * Handle window resize
         */
        _handleResize() {
            // Adjust UI for mobile/tablet
        }

        /**
         * Show fatal error
         */
        _showFatalError(error) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'fatal-error';
            errorDiv.innerHTML = `
                <h3>System Error</h3>
                <p>${error.message}</p>
                <button onclick="location.reload()">Reload</button>
            `;
            document.body.prepend(errorDiv);
        }

        /**
         * Clean up resources
         */
        destroy() {
            this.logger.info("Shutting down");
            
            // Stop camera
            if (this.state.stream) {
                this.state.stream.getTracks().forEach(t => {
                    t.stop();
                    t.enabled = false;
                });
                this.state.stream = null;
            }
            
            // Clear timeouts
            this.timeouts.forEach(clearTimeout);
            this.timeouts = [];
            
            // Remove event listeners
            this.listeners.forEach(({ target, type, handler }) => {
                target.removeEventListener(type, handler);
            });
            
            // Clear canvas
            if (this.canvas) {
                this.canvas.width = 0;
                this.canvas.height = 0;
                this.canvas = null;
            }
            
            // Flush logs
            this.logger.flush();
        }
    }

    /* ==================== 5. GLOBAL EXPORTS ==================== */

    // Create global instance
    window.medAIApp = new MedAIApp();

    // Expose utilities for debugging
    window.MedAIUtils = {
        clearHistory: () => window.medAIApp?.history.clear(),
        getQueueLength: () => window.medAIApp?.queue.length,
        checkHealth: async () => {
            try {
                const response = await fetch(`${CONFIG.API.BASE}/health`);
                return { status: 'ok', online: navigator.onLine };
            } catch {
                return { status: 'error', online: navigator.onLine };
            }
        }
    };

    // Initialize when DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
        window.medAIApp.init().catch(error => {
            console.error('Init failed:', error);
        });
    });

    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
        window.medAIApp?.destroy();
    });

})();
