(() => {
"use strict";

/**
 * MEDAI ENTERPRISE ENGINE v3.4 (Production-Ready)
 * Integrated with MedAI Authentication System
 * 
 * @author MedAI Team
 * @version 3.4.0
 * @license Proprietary
 */

/* ==================== CONFIGURATION ==================== */

class Config {
    // API Base URLs
    static API_BASE = window.ENV_API_BASE || "https://ai-p17b.onrender.com";
    static AUTH_API_BASE = window.ENV_AUTH_API_BASE || "https://m-backend-n2pd.onrender.com";
    
    // Endpoints
    static ENDPOINT = "/diagnostics/process";
    static AUTH_ENDPOINT = "/auth/me";
    static LOGS_ENDPOINT = "/logs";
    static HEALTH_ENDPOINT = "/health";
    
    // Computed full URLs
    static get FULL_API_URL() { return this.API_BASE + this.ENDPOINT; }
    static get FULL_AUTH_URL() { return this.AUTH_API_BASE + this.AUTH_ENDPOINT; }
    static get FULL_LOGS_URL() { return this.API_BASE + this.LOGS_ENDPOINT; }
    static get FULL_HEALTH_URL() { return this.API_BASE + this.HEALTH_ENDPOINT; }
    
    // Request settings
    static REQUEST_TIMEOUT = 30000;
    static MAX_RETRIES = 2;
    static MAX_FILE_SIZE = 50 * 1024 * 1024;
    static COOLDOWN_MS = 3000;
    static RETRYABLE_STATUS = [502, 503, 504];
    static MAX_HISTORY_ITEMS = 50;
    
    // Image compression
    static COMPRESSION = {
        ENABLED: true,
        MIN_SIZE: 1024 * 1024, // 1MB
        MAX_WIDTH: 1920,
        MAX_HEIGHT: 1080,
        QUALITY: 0.8,
        FORMAT: 'image/jpeg'
    };
    
    // Environment detection
    static get ENVIRONMENT() {
        const hostname = window.location.hostname;
        if (hostname === 'localhost' || hostname === '127.0.0.1') return 'development';
        if (hostname.includes('staging')) return 'staging';
        return 'production';
    }
    
    // Feature flags per environment
    static get FEATURES() {
        const isDev = this.ENVIRONMENT === 'development';
        const isStaging = this.ENVIRONMENT === 'staging';
        
        return {
            ENABLE_TORCH: true,
            ENABLE_ANALYTICS: true,
            ENABLE_COMPRESSION: true,
            ENABLE_VIRTUAL_SCROLL: isDev || isStaging,
            ENABLE_OFFLINE_QUEUE: true,
            ENABLE_PERFORMANCE_MONITORING: isDev,
            ENABLE_DEBUG_LOGS: isDev,
            ENABLE_HEALTH_CHECKS: isDev || isStaging
        };
    }
    
    // Log levels
    static LOG_LEVELS = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3
    };
    
    static get CURRENT_LOG_LEVEL() {
        return this.FEATURES.ENABLE_DEBUG_LOGS ? this.LOG_LEVELS.DEBUG : this.LOG_LEVELS.INFO;
    }
    
    // Cache keys
    static STORAGE_KEYS = {
        HISTORY: 'medai_history',
        TOKEN: 'medai_token',
        USER: 'medai_user',
        CSRF: 'csrf_token',
        SETTINGS: 'medai_settings'
    };
}

/* ==================== UTILITIES ==================== */

class Utils {
    static sanitizeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
    
    static generateId(prefix = '') {
        return prefix + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }
    
    static debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }
    
    static throttle(func, limit) {
        let inThrottle;
        return (...args) => {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
    
    static formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
    
    static async retry(fn, maxAttempts = 3, delay = 1000) {
        for (let i = 0; i < maxAttempts; i++) {
            try {
                return await fn();
            } catch (error) {
                if (i === maxAttempts - 1) throw error;
                await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
            }
        }
    }
    
    static getDeviceInfo() {
        return {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            online: navigator.onLine,
            screenSize: `${window.screen.width}x${window.screen.height}`,
            touchPoints: navigator.maxTouchPoints
        };
    }
}

/* ==================== SERVICES ==================== */

class LoggerService {
    constructor() {
        this.currentLevel = Config.CURRENT_LOG_LEVEL;
        this.logQueue = [];
        this.flushInterval = setInterval(() => this.flushLogs(), 30000);
        this.maxQueueSize = 100;
    }
    
    getCurrentUserId() {
        return window.medAIApp?.state?.currentUser?.id || 'anonymous';
    }
    
    log(level, message, data = null) {
        if (level >= this.currentLevel) {
            const entry = this.createLogEntry(level, message, data);
            
            // Console output with styling
            this.consoleOutput(level, entry);
            
            if (Config.FEATURES.ENABLE_OFFLINE_QUEUE) {
                this.queueLog(entry);
            }
        }
    }
    
    createLogEntry(level, message, data) {
        return {
            id: Utils.generateId('log_'),
            timestamp: new Date().toISOString(),
            level: Object.keys(Config.LOG_LEVELS)[level],
            message,
            data: data ? this.sanitizeData(data) : null,
            userId: this.getCurrentUserId(),
            url: window.location.href,
            device: Utils.getDeviceInfo(),
            appVersion: '3.4.0'
        };
    }
    
    consoleOutput(level, entry) {
        const consoleMethod = Object.keys(Config.LOG_LEVELS)[level].toLowerCase();
        const styles = {
            DEBUG: 'color: #6c757d',
            INFO: 'color: #0d6efd',
            WARN: 'color: #ffc107; font-weight: bold',
            ERROR: 'color: #dc3545; font-weight: bold'
        };
        
        console[consoleMethod](
            `%c[${entry.level}] ${entry.timestamp}: ${entry.message}`,
            styles[entry.level],
            entry.data || ''
        );
    }
    
    sanitizeData(data) {
        const sensitiveFields = ['token', 'password', 'authorization', 'csrf', 'secret'];
        const sanitized = { ...data };
        
        const sanitizeObject = (obj) => {
            if (!obj || typeof obj !== 'object') return;
            
            Object.keys(obj).forEach(key => {
                if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
                    obj[key] = '[REDACTED]';
                } else if (typeof obj[key] === 'object') {
                    sanitizeObject(obj[key]);
                }
            });
        };
        
        sanitizeObject(sanitized);
        return sanitized;
    }
    
    queueLog(entry) {
        this.logQueue.push(entry);
        
        // Prevent memory issues
        if (this.logQueue.length > this.maxQueueSize) {
            this.logQueue = this.logQueue.slice(-this.maxQueueSize);
        }
    }
    
    async flushLogs() {
        if (this.logQueue.length === 0 || !navigator.onLine) return;
        
        const logs = [...this.logQueue];
        this.logQueue = [];
        
        try {
            await Utils.retry(async () => {
                const response = await fetch(Config.FULL_LOGS_URL, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-Request-ID': Utils.generateId('req_')
                    },
                    body: JSON.stringify({ logs, timestamp: new Date().toISOString() })
                });
                
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
            }, 2, 1000);
        } catch (error) {
            // Re-queue logs if failed
            this.logQueue.unshift(...logs);
            console.warn('Failed to send logs, queued for retry:', error.message);
        }
    }
    
    destroy() {
        clearInterval(this.flushInterval);
        this.flushLogs().catch(() => {});
    }
}

class AuthService {
    constructor() {
        this.token = null;
        this.user = null;
        this.listeners = [];
        this.csrfToken = this.generateCSRFToken();
        this.tokenRefreshInterval = null;
        this.setupTokenRefresh();
    }
    
    generateCSRFToken() {
        const token = crypto.randomUUID ? crypto.randomUUID() : 
            Array.from(crypto.getRandomValues(new Uint8Array(32)))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
        
        sessionStorage.setItem(Config.STORAGE_KEYS.CSRF, token);
        return token;
    }
    
    getCSRFToken() {
        return sessionStorage.getItem(Config.STORAGE_KEYS.CSRF) || this.generateCSRFToken();
    }
    
    async validateToken(token) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(Config.FULL_AUTH_URL, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-CSRF-Token': this.getCSRFToken(),
                    'X-Request-ID': Utils.generateId('auth_')
                },
                signal: controller.signal
            });
            
            clearTimeout(timeout);
            
            if (response.ok) {
                const data = await response.json();
                this.token = token;
                this.user = data.user;
                this.startTokenRefresh();
                return { valid: true, user: data.user };
            }
            
            if (response.status === 401) {
                this.clearToken();
            }
            
            return { valid: false };
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }
    
    getToken() {
        return this.token || localStorage.getItem(Config.STORAGE_KEYS.TOKEN) || "";
    }
    
    getUser() {
        return this.user;
    }
    
    clearToken() {
        this.token = null;
        this.user = null;
        localStorage.removeItem(Config.STORAGE_KEYS.TOKEN);
        localStorage.removeItem(Config.STORAGE_KEYS.USER);
        sessionStorage.removeItem(Config.STORAGE_KEYS.TOKEN);
        sessionStorage.removeItem(Config.STORAGE_KEYS.USER);
    }
    
    logout() {
        this.clearToken();
        sessionStorage.removeItem(Config.STORAGE_KEYS.CSRF);
        
        if (this.tokenRefreshInterval) {
            clearInterval(this.tokenRefreshInterval);
        }
        
        this.notifyListeners({ authenticated: false, user: null });
        window.location.href = '/login.html';
    }
    
    setupTokenRefresh() {
        // Refresh token every 15 minutes
        this.tokenRefreshInterval = setInterval(() => {
            const token = this.getToken();
            if (token) {
                this.validateToken(token).catch(() => {});
            }
        }, 15 * 60 * 1000);
    }
    
    startTokenRefresh() {
        if (this.tokenRefreshInterval) {
            clearInterval(this.tokenRefreshInterval);
        }
        this.setupTokenRefresh();
    }
    
    onAuthChange(listener) {
        this.listeners.push(listener);
    }
    
    notifyListeners(authState) {
        this.listeners.forEach(listener => {
            try {
                listener(authState);
            } catch (error) {
                console.error('Auth listener error:', error);
            }
        });
    }
    
    sanitizeInput(str) {
        return Utils.sanitizeHTML(str);
    }
}

class HistoryService {
    constructor() {
        this.storageKey = Config.STORAGE_KEYS.HISTORY;
        this.maxItems = Config.MAX_HISTORY_ITEMS;
        this.cache = new Map();
    }
    
    save(item) {
        try {
            let history = this.load();
            
            const historyItem = {
                ...item,
                id: Utils.generateId('hist_'),
                date: new Date().toISOString(),
                version: '1.0'
            };
            
            history.unshift(historyItem);
            
            if (history.length > this.maxItems) {
                history = history.slice(0, this.maxItems);
            }
            
            localStorage.setItem(this.storageKey, JSON.stringify(history));
            this.cache.clear(); // Invalidate cache
            
            return historyItem;
        } catch (error) {
            console.error('Failed to save history:', error);
            return null;
        }
    }
    
    load() {
        try {
            // Check cache first
            const cacheKey = 'all';
            if (this.cache.has(cacheKey)) {
                return this.cache.get(cacheKey);
            }
            
            const history = JSON.parse(localStorage.getItem(this.storageKey) || '[]');
            this.cache.set(cacheKey, history);
            return history;
        } catch (error) {
            console.error('Failed to load history:', error);
            return [];
        }
    }
    
    filter(criteria) {
        const history = this.load();
        const searchTerm = criteria.toLowerCase();
        
        return history.filter(item => 
            item.patientId?.toLowerCase().includes(searchTerm) ||
            item.diagnosis?.toLowerCase().includes(searchTerm) ||
            item.scanType?.toLowerCase().includes(searchTerm) ||
            item.id?.toLowerCase().includes(searchTerm)
        );
    }
    
    getById(id) {
        const cacheKey = `item_${id}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        
        const history = this.load();
        const item = history.find(item => item.id === id);
        
        if (item) {
            this.cache.set(cacheKey, item);
        }
        
        return item;
    }
    
    delete(id) {
        try {
            const history = this.load();
            const filtered = history.filter(item => item.id !== id);
            localStorage.setItem(this.storageKey, JSON.stringify(filtered));
            this.cache.clear();
            return filtered;
        } catch (error) {
            console.error('Failed to delete history item:', error);
            return null;
        }
    }
    
    clear() {
        try {
            localStorage.removeItem(this.storageKey);
            this.cache.clear();
            return true;
        } catch (error) {
            console.error('Failed to clear history:', error);
            return false;
        }
    }
    
    getStats() {
        const history = this.load();
        const total = history.length;
        
        if (total === 0) {
            return { total, averageConfidence: 0, byType: {}, byDate: {} };
        }
        
        const sum = history.reduce((acc, item) => acc + (item.confidence || 0), 0);
        const averageConfidence = Math.round(sum / total);
        
        const byType = history.reduce((acc, item) => {
            const type = item.scanType || 'unknown';
            acc[type] = (acc[type] || 0) + 1;
            return acc;
        }, {});
        
        const byDate = history.reduce((acc, item) => {
            const date = new Date(item.date).toLocaleDateString();
            acc[date] = (acc[date] || 0) + 1;
            return acc;
        }, {});
        
        return { total, averageConfidence, byType, byDate };
    }
    
    export() {
        const history = this.load();
        const dataStr = JSON.stringify(history, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `medai_history_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
    }
}

class RequestQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.maxRetries = 3;
        this.storageKey = 'medai_request_queue';
        this.loadFromStorage();
        this.initNetworkListeners();
    }
    
    initNetworkListeners() {
        window.addEventListener('online', () => {
            this.process();
        });
        
        // Save queue before page unload
        window.addEventListener('beforeunload', () => {
            this.saveToStorage();
        });
    }
    
    loadFromStorage() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                this.queue = JSON.parse(saved);
            }
        } catch (error) {
            console.error('Failed to load request queue:', error);
        }
    }
    
    saveToStorage() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.queue));
        } catch (error) {
            console.error('Failed to save request queue:', error);
        }
    }
    
    async add(request) {
        const queueItem = {
            ...request,
            id: Utils.generateId('req_'),
            timestamp: Date.now(),
            retryCount: 0
        };
        
        this.queue.push(queueItem);
        this.saveToStorage();
        
        if (navigator.onLine) {
            this.process();
        }
    }
    
    async process() {
        if (this.processing || this.queue.length === 0 || !navigator.onLine) return;
        
        this.processing = true;
        
        while (this.queue.length > 0) {
            const request = this.queue[0]; // Peek at first item
            
            try {
                await this.executeRequest(request);
                this.queue.shift(); // Remove on success
                this.saveToStorage();
            } catch (error) {
                console.error('Failed to process queued request:', error);
                
                request.retryCount++;
                
                if (request.retryCount >= this.maxRetries) {
                    // Remove failed request after max retries
                    this.queue.shift();
                    this.saveToStorage();
                }
                
                break; // Stop processing on error
            }
        }
        
        this.processing = false;
    }
    
    async executeRequest(request) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        
        try {
            const response = await fetch(request.url, {
                ...request.options,
                headers: {
                    ...request.options?.headers,
                    'X-Queue-ID': request.id,
                    'X-Retry-Count': request.retryCount
                },
                signal: controller.signal
            });
            
            clearTimeout(timeout);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            return response;
        } finally {
            clearTimeout(timeout);
        }
    }
    
    getQueueLength() {
        return this.queue.length;
    }
    
    clear() {
        this.queue = [];
        localStorage.removeItem(this.storageKey);
    }
}

class PerformanceMonitor {
    constructor() {
        this.metrics = new Map();
        this.thresholds = {
            slow: 100,      // >100ms is slow
            verySlow: 300,   // >300ms is very slow
            critical: 1000   // >1s is critical
        };
        this.maxSamples = 100;
    }
    
    measure(operationName, fn) {
        const start = performance.now();
        try {
            const result = fn();
            const duration = performance.now() - start;
            this.recordMetric(operationName, duration);
            this.logPerformance(operationName, duration);
            return result;
        } catch (error) {
            const duration = performance.now() - start;
            this.recordMetric(operationName, duration, true);
            throw error;
        }
    }
    
    async measureAsync(operationName, asyncFn) {
        const start = performance.now();
        try {
            const result = await asyncFn();
            const duration = performance.now() - start;
            this.recordMetric(operationName, duration);
            this.logPerformance(operationName, duration);
            return result;
        } catch (error) {
            const duration = performance.now() - start;
            this.recordMetric(operationName, duration, true);
            throw error;
        }
    }
    
    logPerformance(operationName, duration) {
        if (duration > this.thresholds.critical) {
            console.error(`🔥 Critical performance: ${operationName} took ${duration.toFixed(2)}ms`);
        } else if (duration > this.thresholds.verySlow) {
            console.warn(`⚠️ Very slow operation: ${operationName} took ${duration.toFixed(2)}ms`);
        } else if (duration > this.thresholds.slow) {
            console.info(`📊 Slow operation: ${operationName} took ${duration.toFixed(2)}ms`);
        }
    }
    
    recordMetric(name, duration, isError = false) {
        if (!this.metrics.has(name)) {
            this.metrics.set(name, []);
        }
        
        const metrics = this.metrics.get(name);
        metrics.push({ 
            duration, 
            timestamp: Date.now(), 
            isError,
            memory: performance.memory?.usedJSHeapSize
        });
        
        // Keep only last N measurements
        if (metrics.length > this.maxSamples) {
            metrics.shift();
        }
    }
    
    getStats(operationName) {
        const metrics = this.metrics.get(operationName) || [];
        if (metrics.length === 0) return null;
        
        const durations = metrics.map(m => m.duration);
        const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
        const min = Math.min(...durations);
        const max = Math.max(...durations);
        const p95 = this.percentile(durations, 95);
        const errorRate = metrics.filter(m => m.isError).length / metrics.length;
        
        return { 
            avg, 
            min, 
            max, 
            p95, 
            errorRate, 
            count: metrics.length,
            samples: metrics.slice(-10) // Last 10 samples
        };
    }
    
    percentile(values, p) {
        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.ceil(p / 100 * sorted.length) - 1;
        return sorted[index];
    }
    
    getAllStats() {
        const stats = {};
        for (const [name] of this.metrics) {
            stats[name] = this.getStats(name);
        }
        return stats;
    }
}

/* ==================== MAIN APPLICATION CLASS ==================== */

class MedAIApp {
    
    /**
     * Initialize the application with all required services
     */
    constructor() {
        // Services
        this.logger = new LoggerService();
        this.auth = new AuthService();
        this.history = new HistoryService();
        this.requestQueue = new RequestQueue();
        this.performance = new PerformanceMonitor();
        
        // State
        this.state = {
            isProcessing: false,
            lastRequestTime: 0,
            isOnline: navigator.onLine,
            isAuthenticated: false,
            currentUser: null,
            activeTab: 'scanner',
            scanType: 'xray',
            lastError: null,
            retryCount: 0
        };
        
        // DOM elements
        this.dom = {};
        
        // Resources
        this.cameraStream = null;
        this.fileInput = null;
        this.eventListeners = [];
        this.timeouts = [];
        this.intervals = [];
        this.canvas = null;
        this.animationFrame = null;
        
        // Bind methods
        this.debouncedFilterHistory = Utils.debounce(this.filterHistory.bind(this), 300);
        this.throttledResize = Utils.throttle(this.handleResize.bind(this), 200);
    }
    
    /* ==================== INITIALIZATION ==================== */
    
    async init() {
        return this.performance.measureAsync('init', async () => {
            this.logger.log(Config.LOG_LEVELS.INFO, 'Initializing MedAI App', {
                environment: Config.ENVIRONMENT,
                features: Config.FEATURES
            });
            
            // Check authentication first
            if (!await this.checkAuthentication()) {
                return;
            }
            
            this.cacheDOM();
            this.addAccessibilityAttributes();
            this.setupKeyboardShortcuts();
            this.setupDragAndDrop();
            this.bindEvents();
            this.bindNetworkEvents();
            await this.initCamera();
            this.createFileInput();
            this.injectDisclaimer();
            this.setupAuthListener();
            this.updateUserInfo();
            this.initTabNavigation();
            this.registerServiceWorker();
            this.startPeriodicHealthCheck();
            
            this.logger.log(Config.LOG_LEVELS.INFO, 'MedAI App initialized successfully');
        });
    }
    
    async checkAuthentication() {
        // Check if MedAI global object exists (from auth.js)
        if (window.MedAI && typeof window.MedAI.isAuthenticated === 'function' && window.MedAI.isAuthenticated()) {
            this.state.isAuthenticated = true;
            this.state.currentUser = window.MedAI.getUser?.() || null;
            return true;
        }
        
        // Fallback: check localStorage directly
        const token = localStorage.getItem(Config.STORAGE_KEYS.TOKEN);
        if (token) {
            const result = await this.auth.validateToken(token);
            if (result.valid) {
                this.state.isAuthenticated = true;
                this.state.currentUser = result.user;
                return true;
            }
        }
        
        // Not authenticated, redirect to login
        window.location.href = '/login.html';
        return false;
    }
    
    registerServiceWorker() {
        if ('serviceWorker' in navigator && Config.ENVIRONMENT === 'production') {
            navigator.serviceWorker.register('/sw.js').catch(err => {
                this.logger.log(Config.LOG_LEVELS.WARN, 'SW registration failed', { error: err.message });
            });
        }
    }
    
    startPeriodicHealthCheck() {
        if (!Config.FEATURES.ENABLE_HEALTH_CHECKS) return;
        
        const interval = setInterval(async () => {
            await this.performHealthCheck();
        }, 60000); // Every minute
        
        this.intervals.push(interval);
    }
    
    /* ==================== DOM MANAGEMENT ==================== */
    
    cacheDOM() {
        const $ = id => document.getElementById(id);
        
        this.dom = {
            // Navigation elements
            navItems: document.querySelectorAll('.nav-item'),
            logoutBtn: document.querySelector('.logout-trigger'),
            
            // Scanner elements
            video: $("camera-stream"),
            captureBtn: $("capture-trigger"),
            uploadLocal: $("upload-local"),
            torchBtn: $("toggle-torch"),
            closeResultsBtn: $("close-results"),
            medBotBtn: $("MedBot-btn"),
            
            // Sections
            scannerSection: $("scanner-section"),
            historySection: $("history-section"),
            analyticsSection: $("analytics-section"),
            
            // Results panel
            resultsPanel: $("results-panel"),
            resultTitle: $("result-title"),
            resultDescription: $("result-description"),
            findingsList: $("findings-list"),
            confidenceText: $("confidence-text"),
            confidencePath: $("confidence-path"),
            
            // Notification
            notification: $("notification"),
            
            // History elements
            historyList: $("history-list"),
            searchInput: document.querySelector('.search-input'),
            
            // Scan type buttons
            scanTypeBtns: document.querySelectorAll('.type-btn'),
            
            // Progress bar
            progressBar: document.querySelector('.upload-progress'),
            
            // Status indicators
            aiStatus: document.getElementById('ai-status'),
            aiStatusContainer: document.getElementById('ai-status-container')
        };
        
        // Verify critical elements
        if (!this.dom.video) {
            this.logger.log(Config.LOG_LEVELS.WARN, 'Video element not found');
        }
    }
    
    addAccessibilityAttributes() {
        const attrs = [
            { el: this.dom.captureBtn, attrs: { 'aria-label': 'Capture image', role: 'button', tabindex: '0' } },
            { el: this.dom.resultsPanel, attrs: { role: 'region', 'aria-live': 'polite', 'aria-label': 'Analysis results' } },
            { el: this.dom.closeResultsBtn, attrs: { 'aria-label': 'Close results panel' } },
            { el: this.dom.uploadLocal, attrs: { 'aria-label': 'Upload image' } },
            { el: this.dom.torchBtn, attrs: { 'aria-label': 'Toggle flashlight' } }
        ];
        
        attrs.forEach(({ el, attrs }) => {
            if (!el) return;
            Object.entries(attrs).forEach(([key, value]) => {
                el.setAttribute(key, value);
            });
        });
    }
    
    setupKeyboardShortcuts() {
        this.addEventListenerWithTracking(document, 'keydown', (e) => {
            // Don't trigger shortcuts when typing in input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            // Ctrl/Cmd + C: Capture
            if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !this.state.isProcessing) {
                e.preventDefault();
                this.safeCapture();
            }
            
            // Esc: Close results
            if (e.key === 'Escape' && !this.dom.resultsPanel?.classList.contains('hidden')) {
                e.preventDefault();
                this.dom.resultsPanel?.classList.add('hidden');
            }
            
            // Alt + 1,2,3: Tab navigation
            if (e.altKey && !isNaN(parseInt(e.key))) {
                e.preventDefault();
                const tabIndex = parseInt(e.key) - 1;
                const tabs = ['scanner', 'history', 'analytics'];
                if (tabs[tabIndex]) {
                    this.switchTab(tabs[tabIndex]);
                }
            }
        });
    }
    
    setupDragAndDrop() {
        const dropZone = document.querySelector('.scanner-viewport');
        if (!dropZone) return;
        
        const preventDefaults = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };
        
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            this.addEventListenerWithTracking(dropZone, eventName, preventDefaults);
        });
        
        ['dragenter', 'dragover'].forEach(eventName => {
            this.addEventListenerWithTracking(dropZone, eventName, () => {
                dropZone.classList.add('highlight');
            });
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            this.addEventListenerWithTracking(dropZone, eventName, () => {
                dropZone.classList.remove('highlight');
            });
        });
        
        this.addEventListenerWithTracking(dropZone, 'drop', (e) => {
            e.preventDefault();
            const dt = e.dataTransfer;
            const file = dt.files[0];
            
            if (file && file.type.startsWith('image/')) {
                this.processLocalFile(file);
            } else {
                this.notify('Please drop an image file', 'warning');
            }
        });
    }
    
    addEventListenerWithTracking(element, event, handler, options = {}) {
        if (!element) return;
        
        const wrappedHandler = (...args) => {
            try {
                handler.apply(this, args);
            } catch (error) {
                this.logger.log(Config.LOG_LEVELS.ERROR, 'Event handler error', {
                    event,
                    error: error.message
                });
            }
        };
        
        this.eventListeners.push({ element, event, handler: wrappedHandler, options });
        element.addEventListener(event, wrappedHandler, options);
    }
    
    removeEventListeners() {
        this.eventListeners.forEach(({ element, event, handler, options }) => {
            element?.removeEventListener(event, handler, options);
        });
        this.eventListeners = [];
    }
    
    handleResize() {
        // Adjust UI for screen size changes
        if (window.innerWidth <= 768 && this.dom.resultsPanel?.classList.contains('hidden') === false) {
            // Ensure results panel is visible on mobile
            this.dom.resultsPanel?.scrollIntoView({ behavior: 'smooth' });
        }
    }
    
    /* ==================== EVENT BINDING ==================== */
    
    bindEvents() {
        // Capture and upload events
        this.dom.captureBtn?.addEventListener("click", () => this.safeCapture());
        this.dom.uploadLocal?.addEventListener("click", () => this.fileInput?.click());
        
        // Torch toggle (if supported)
        if (Config.FEATURES.ENABLE_TORCH) {
            this.dom.torchBtn?.addEventListener("click", () => this.toggleTorch());
        }
        
        // Close results panel
        this.dom.closeResultsBtn?.addEventListener("click", () => {
            this.dom.resultsPanel?.classList.add("hidden");
        });
        
        // MedBot button
        this.dom.medBotBtn?.addEventListener("click", (e) => {
            e.preventDefault();
            window.open('MedBot.html', '_blank', 'noopener,noreferrer');
        });
        
        // Logout button
        this.dom.logoutBtn?.addEventListener("click", (e) => {
            e.preventDefault();
            this.logout();
        });
        
        // Scan type selection
        this.dom.scanTypeBtns?.forEach(btn => {
            btn.addEventListener("click", (e) => {
                this.dom.scanTypeBtns.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                this.state.scanType = btn.dataset.type || 'xray';
            });
        });
        
        // History search with debouncing
        if (this.dom.searchInput) {
            this.dom.searchInput.addEventListener("input", (e) => {
                this.debouncedFilterHistory(e.target.value);
            });
        }
        
        // Window resize
        window.addEventListener('resize', this.throttledResize);
    }
    
    bindNetworkEvents() {
        this.addEventListenerWithTracking(window, "online", () => {
            this.state.isOnline = true;
            this.updateAIStatus("AI READY", "online");
            this.requestQueue.process();
            this.notify("Back online", "success");
        });
        
        this.addEventListenerWithTracking(window, "offline", () => {
            this.state.isOnline = false;
            this.updateAIStatus("OFFLINE", "offline");
            this.notify("You are offline. Network required for analysis.", "warning");
        });
    }
    
    setupAuthListener() {
        if (window.MedAI && typeof window.MedAI.onAuthChange === 'function') {
            window.MedAI.onAuthChange(({ authenticated, user }) => {
                this.state.isAuthenticated = authenticated;
                this.state.currentUser = user;
                
                if (!authenticated) {
                    window.location.href = '/login.html';
                } else {
                    this.updateUserInfo();
                }
            });
        }
    }
    
    /* ==================== AUTHENTICATION ==================== */
    
    logout() {
        if (window.MedAI && typeof window.MedAI.logout === 'function') {
            window.MedAI.logout();
        } else {
            this.auth.logout();
        }
    }
    
    updateUserInfo() {
        const user = this.state.currentUser || (window.MedAI && window.MedAI.getUser?.());
        
        if (!user) return;
        
        const displayNameEl = document.getElementById('display-name');
        if (displayNameEl) {
            displayNameEl.textContent = this.auth.sanitizeInput(user.name || 'Medical Practitioner');
        }
        
        const userRoleEl = document.querySelector('.user-role');
        if (userRoleEl) {
            userRoleEl.textContent = this.formatRole(user.role || 'user');
        }
        
        const avatarEl = document.getElementById('avatar-circle');
        if (avatarEl && user.name) {
            const initials = user.name
                .split(' ')
                .map(n => n[0])
                .join('')
                .toUpperCase()
                .substring(0, 2);
            avatarEl.textContent = this.auth.sanitizeInput(initials || 'MD');
        }
    }
    
    formatRole(role) {
        const roles = {
            'user': 'General Practitioner',
            'doctor': 'Radiologist',
            'admin': 'Administrator',
            'technician': 'Radiology Technician'
        };
        return roles[role] || role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    
    updateAIStatus(text, status) {
        if (this.dom.aiStatus) {
            this.dom.aiStatus.textContent = text;
        }
        
        if (this.dom.aiStatusContainer) {
            this.dom.aiStatusContainer.className = `ai-status-badge ${status}`;
        }
    }
    
    /* ==================== TAB NAVIGATION ==================== */
    
    initTabNavigation() {
        this.dom.navItems?.forEach(item => {
            this.addEventListenerWithTracking(item, "click", (e) => {
                e.preventDefault();
                
                if (item.classList.contains('logout-trigger')) return;
                
                const tab = item.dataset.tab;
                if (tab) {
                    this.switchTab(tab);
                }
            });
        });
    }
    
    switchTab(tab) {
        // Update navigation
        this.dom.navItems?.forEach(item => {
            if (!item.classList.contains('logout-trigger')) {
                item.classList.remove('active');
                if (item.dataset.tab === tab) {
                    item.classList.add('active');
                }
            }
        });
        
        // Hide all sections
        this.dom.scannerSection?.classList.add('hidden');
        this.dom.historySection?.classList.add('hidden');
        this.dom.analyticsSection?.classList.add('hidden');
        
        // Show selected section
        switch(tab) {
            case 'scanner':
                this.dom.scannerSection?.classList.remove('hidden');
                break;
            case 'history':
                this.dom.historySection?.classList.remove('hidden');
                this.loadHistory();
                break;
            case 'analytics':
                this.dom.analyticsSection?.classList.remove('hidden');
                this.loadAnalytics();
                break;
            default:
                this.dom.scannerSection?.classList.remove('hidden');
        }
        
        this.state.activeTab = tab;
    }
    
    /* ==================== SECURITY CORE ==================== */
    
    async fetchSecure(url, options = {}) {
        const token = this.auth.getToken();
        const csrfToken = this.auth.getCSRFToken();
        const requestId = Utils.generateId('req_');

        // Check offline mode
        if (!navigator.onLine && Config.FEATURES.ENABLE_OFFLINE_QUEUE) {
            await this.requestQueue.add({ url, options });
            this.notify("Request queued for when online", "info");
            return null;
        }

        return this.performance.measureAsync('fetchSecure', async () => {
            for (let attempt = 0; attempt <= Config.MAX_RETRIES; attempt++) {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), Config.REQUEST_TIMEOUT);
                this.timeouts.push(timeout);

                try {
                    const response = await fetch(url, {
                        ...options,
                        headers: {
                            ...options.headers,
                            'Authorization': token ? `Bearer ${token}` : '',
                            'X-CSRF-Token': csrfToken,
                            'X-Requested-With': 'XMLHttpRequest',
                            'X-Request-ID': requestId,
                            'X-Retry-Attempt': attempt
                        },
                        signal: controller.signal,
                        credentials: 'include',
                        mode: 'cors'
                    });

                    clearTimeout(timeout);
                    this.timeouts = this.timeouts.filter(t => t !== timeout);

                    // Handle unauthorized
                    if (response.status === 401) {
                        this.notify("Session expired. Please login again.", "error");
                        setTimeout(() => this.logout(), 2000);
                        throw new Error("Unauthorized");
                    }

                    // Handle rate limiting
                    if (response.status === 429) {
                        const retryAfter = response.headers.get('Retry-After') || 5;
                        await this.sleep(retryAfter * 1000);
                        continue;
                    }

                    // Handle retryable errors
                    if (!response.ok) {
                        if (Config.RETRYABLE_STATUS.includes(response.status) && attempt < Config.MAX_RETRIES) {
                            await this.sleep(1000 * Math.pow(2, attempt)); // Exponential backoff
                            continue;
                        }
                        throw new Error(`Server error ${response.status}: ${response.statusText}`);
                    }

                    return response;

                } catch (err) {
                    clearTimeout(timeout);
                    this.timeouts = this.timeouts.filter(t => t !== timeout);
                    
                    if (err.name === 'AbortError') {
                        throw new Error('Request timeout');
                    }
                    
                    if (attempt >= Config.MAX_RETRIES) {
                        throw err;
                    }
                    
                    await this.sleep(1000 * Math.pow(2, attempt)); // Exponential backoff
                }
            }
        });
    }
    
    sanitizeHTML(str) {
        return Utils.sanitizeHTML(str);
    }
    
    validateResponseSchema(data) {
        return (
            data &&
            typeof data === "object" &&
            data !== null &&
            typeof data.diagnosis === "string" &&
            Array.isArray(data.findings) &&
            typeof data.confidence === "number" &&
            data.confidence >= 0 &&
            data.confidence <= 100
        );
    }
    
    async validateFileSignature(file) {
        try {
            const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());

            // Check image signatures
            if (header[0] === 0xFF && header[1] === 0xD8) return true; // JPEG
            if (header[0] === 0x89 && header[1] === 0x50) return true; // PNG
            if (header[0] === 0x52 && header[1] === 0x49) return true; // WEBP
            if (header[0] === 0x47 && header[1] === 0x49) return true; // GIF
            if ((header[0] === 0x49 && header[1] === 0x49) ||
                (header[0] === 0x4D && header[1] === 0x4D)) return true; // TIFF

            // DICOM check
            const dicomHeader = new Uint8Array(await file.slice(128, 132).arrayBuffer());
            const dicomCheck = new TextDecoder().decode(dicomHeader);
            if (dicomCheck === "DICM") return true;

            // Additional DICOM prefix check
            const dicomPrefix = new Uint8Array(await file.slice(0, 4).arrayBuffer());
            if (dicomPrefix[0] === 0x00 && dicomPrefix[1] === 0x00 && 
                dicomPrefix[2] === 0x00 && dicomPrefix[3] === 0x00) {
                return true; // Possible DICOM file
            }

            return false;
        } catch (error) {
            this.logger.log(Config.LOG_LEVELS.ERROR, 'File signature validation failed', { 
                error: error.message,
                fileName: file.name,
                fileSize: file.size
            });
            return false;
        }
    }
    
    rateLimitCheck() {
        const now = Date.now();
        if (now - this.state.lastRequestTime < Config.COOLDOWN_MS) {
            const waitTime = Math.ceil((Config.COOLDOWN_MS - (now - this.state.lastRequestTime)) / 1000);
            this.notify(`Please wait ${waitTime} seconds before next request.`, "warning");
            return false;
        }
        this.state.lastRequestTime = now;
        return true;
    }
    
    /* ==================== IMAGE COMPRESSION ==================== */
    
    async compressImage(file) {
        if (!Config.FEATURES.ENABLE_COMPRESSION || file.size < Config.COMPRESSION.MIN_SIZE) {
            return file;
        }
        
        return new Promise((resolve, reject) => {
            const img = new Image();
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            const objectUrl = URL.createObjectURL(file);
            
            img.onload = () => {
                URL.revokeObjectURL(objectUrl);
                
                let { width, height } = this.calculateDimensions(
                    img.width, 
                    img.height,
                    Config.COMPRESSION.MAX_WIDTH,
                    Config.COMPRESSION.MAX_HEIGHT
                );
                
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob((blob) => {
                    if (blob) {
                        this.logger.log(Config.LOG_LEVELS.INFO, 'Image compressed', {
                            originalSize: Utils.formatBytes(file.size),
                            compressedSize: Utils.formatBytes(blob.size),
                            ratio: `${Math.round(blob.size / file.size * 100)}%`,
                            dimensions: `${width}x${height}`
                        });
                        resolve(blob);
                    } else {
                        reject(new Error('Failed to compress image'));
                    }
                }, Config.COMPRESSION.FORMAT, Config.COMPRESSION.QUALITY);
            };
            
            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error('Failed to load image for compression'));
            };
            
            img.src = objectUrl;
        });
    }
    
    calculateDimensions(width, height, maxWidth, maxHeight) {
        if (width <= maxWidth && height <= maxHeight) {
            return { width, height };
        }
        
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        
        return {
            width: Math.round(width * ratio),
            height: Math.round(height * ratio)
        };
    }
    
    /* ==================== TORCH CONTROL ==================== */
    
    async toggleTorch() {
        if (!this.cameraStream) {
            this.notify("Camera not initialized", "error");
            return;
        }

        const track = this.cameraStream.getVideoTracks()[0];
        
        if (!track) {
            this.notify("No video track available", "error");
            return;
        }

        const capabilities = track.getCapabilities?.();
        
        if (!capabilities?.torch) {
            this.notify("Torch not supported on this device", "warning");
            return;
        }

        try {
            const currentConstraints = track.getConstraints();
            const currentTorch = currentConstraints.advanced?.[0]?.torch || false;
            
            await track.applyConstraints({ 
                advanced: [{ torch: !currentTorch }] 
            });
            
            this.dom.torchBtn.textContent = !currentTorch ? '🔆' : '🔦';
            this.dom.torchBtn.setAttribute('aria-pressed', (!currentTorch).toString());
            
        } catch (err) {
            this.logger.log(Config.LOG_LEVELS.ERROR, 'Torch toggle failed', { error: err.message });
            this.notify("Could not toggle flash", "error");
        }
    }
    
    /* ==================== ANALYSIS ==================== */
    
    async safeCapture() {
        if (this.state.isProcessing || !this.state.isOnline) {
            if (!this.state.isOnline) {
                this.notify("Cannot capture while offline", "warning");
            }
            return;
        }
        
        if (!this.rateLimitCheck()) return;

        try {
            this.updateAIStatus("PROCESSING", "processing");
            const blob = await this.captureFrame();
            await this.sendForAnalysis(blob, `capture_${Date.now()}.jpg`);
            this.updateAIStatus("AI READY", "ready");
        } catch (error) {
            this.logger.log(Config.LOG_LEVELS.ERROR, 'Capture failed', { 
                error: error.message,
                stack: error.stack 
            });
            this.updateAIStatus("ERROR", "error");
            this.notify("Capture failed. Please try again.", "error");
        }
    }
    
    async sendForAnalysis(file, filename) {
        if (this.state.isProcessing) return;
        this.setLoading(true);
        this.state.lastError = null;

        try {
            const compressedFile = await this.compressImage(file);
            
            const fd = new FormData();
            fd.append("file", compressedFile, filename);
            
            if (this.state.scanType) {
                fd.append("type", this.state.scanType);
            }
            
            // Add metadata
            fd.append("timestamp", Date.now().toString());
            fd.append("source", "web_app");
            fd.append("version", "3.4.0");

            this.showProgress(30);
            
            const response = await this.performance.measureAsync('analysis', async () => {
                return await this.fetchSecure(
                    Config.FULL_API_URL,
                    { method: "POST", body: fd }
                );
            });

            if (!response) return; // Queued offline

            this.showProgress(70);

            let data;
            try {
                data = await response.json();
            } catch (jsonError) {
                throw new Error("Invalid JSON response from server");
            }

            if (!this.validateResponseSchema(data)) {
                throw new Error("Invalid response schema");
            }

            this.showProgress(100);
            setTimeout(() => this.showProgress(0), 500);

            this.displayResults(data);
            
            const patientId = this.generatePatientId();
            const historyItem = this.history.save({
                diagnosis: data.diagnosis,
                confidence: data.confidence,
                findings: data.findings,
                description: data.description,
                scanType: this.state.scanType || 'xray',
                patientId,
                imageInfo: {
                    originalSize: file.size,
                    compressedSize: compressedFile.size,
                    filename
                }
            });
            
            this.logger.log(Config.LOG_LEVELS.INFO, 'Analysis completed', { 
                diagnosis: data.diagnosis,
                confidence: data.confidence,
                patientId,
                scanType: this.state.scanType
            });

            this.notify('Analysis complete', 'success');

        } catch (err) {
            this.state.lastError = err.message;
            this.logger.log(Config.LOG_LEVELS.ERROR, 'Analysis error', { 
                error: err.message,
                stack: err.stack 
            });
            this.notify(err.message || "Analysis failed. Please try again.", "error");
            this.showProgress(0);
        } finally {
            this.setLoading(false);
        }
    }
    
    async processLocalFile(file) {
        if (file.size > Config.MAX_FILE_SIZE) {
            this.notify(`File too large. Maximum size is ${Utils.formatBytes(Config.MAX_FILE_SIZE)}.`, "error");
            return;
        }

        if (!(await this.validateFileSignature(file))) {
            this.notify("Unsupported or invalid file format. Please upload a valid medical image.", "error");
            return;
        }

        await this.sendForAnalysis(file, file.name);
        
        if (this.fileInput) {
            this.fileInput.value = "";
        }
    }
    
    showProgress(percent) {
        if (!this.dom.progressBar) {
            this.dom.progressBar = document.createElement('div');
            this.dom.progressBar.className = 'upload-progress';
            this.dom.progressBar.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                height: 3px;
                background: linear-gradient(90deg, #00c851, #007e33);
                transition: width 0.3s ease;
                z-index: 1000;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            `;
            document.body.appendChild(this.dom.progressBar);
        }
        
        this.dom.progressBar.style.width = `${percent}%`;
        this.dom.progressBar.style.display = percent > 0 ? 'block' : 'none';
    }
    
    /* ==================== HISTORY MANAGEMENT ==================== */
    
    generatePatientId() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let id = 'PT-';
        for (let i = 0; i < 6; i++) {
            id += chars[Math.floor(Math.random() * chars.length)];
        }
        return id;
    }
    
    async loadHistory() {
        if (!this.dom.historyList) return;
        
        try {
            const history = this.history.load();
            
            if (history.length === 0) {
                this.dom.historyList.innerHTML = '<div class="empty-state">No recent scans found. Start by capturing an image.</div>';
                return;
            }
            
            this.renderHistoryList(history);
        } catch (error) {
            this.logger.log(Config.LOG_LEVELS.ERROR, 'Failed to load history', { error: error.message });
            this.dom.historyList.innerHTML = '<div class="error-state">Failed to load history. Please refresh.</div>';
        }
    }
    
    renderHistoryList(items) {
        if (!this.dom.historyList) return;
        
        if (Config.FEATURES.ENABLE_VIRTUAL_SCROLL && items.length > 50) {
            this.renderVirtualHistory(items);
        } else {
            this.renderFullHistory(items);
        }
    }
    
    renderFullHistory(items) {
        this.dom.historyList.innerHTML = items.map(item => `
            <div class="history-card" data-id="${this.sanitizeHTML(item.id)}">
                <div class="history-header">
                    <span class="history-type">${this.sanitizeHTML(item.scanType?.toUpperCase() || 'UNKNOWN')}</span>
                    <span class="history-date">${new Date(item.date).toLocaleDateString()} ${new Date(item.date).toLocaleTimeString()}</span>
                </div>
                <div class="history-body">
                    <h4>${this.sanitizeHTML(item.diagnosis || 'No diagnosis')}</h4>
                    <p>Patient: ${this.sanitizeHTML(item.patientId || 'Unknown')}</p>
                    <div class="history-confidence">
                        <div class="confidence-bar" style="width: ${Math.min(100, Math.max(0, item.confidence || 0))}%"></div>
                        <span>${item.confidence || 0}% confidence</span>
                    </div>
                </div>
                <button class="history-view-btn" data-id="${this.sanitizeHTML(item.id)}">View Details</button>
            </div>
        `).join('');
        
        // Add click handlers to view buttons
        this.dom.historyList.querySelectorAll('.history-view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = e.target.dataset.id;
                this.viewHistoryItem(id);
            });
        });
        
        // Add click handlers to cards
        this.dom.historyList.querySelectorAll('.history-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.classList.contains('history-view-btn')) {
                    const id = card.dataset.id;
                    this.viewHistoryItem(id);
                }
            });
        });
    }
    
    renderVirtualHistory(items) {
        const container = this.dom.historyList;
        container.innerHTML = '';
        container.style.position = 'relative';
        container.style.height = '500px';
        container.style.overflowY = 'auto';
        
        const itemHeight = 140; // Height per item including margin
        const totalHeight = items.length * itemHeight;
        const buffer = 5;
        
        let rafId = null;
        
        const renderVisibleItems = () => {
            if (rafId) {
                cancelAnimationFrame(rafId);
            }
            
            rafId = requestAnimationFrame(() => {
                const scrollTop = container.scrollTop;
                const viewportHeight = container.clientHeight;
                
                const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - buffer);
                const endIndex = Math.min(
                    items.length, 
                    Math.ceil((scrollTop + viewportHeight) / itemHeight) + buffer
                );
                
                let html = '';
                for (let i = startIndex; i < endIndex; i++) {
                    const item = items[i];
                    html += `
                        <div class="history-card" data-id="${this.sanitizeHTML(item.id)}" 
                             style="position: absolute; top: ${i * itemHeight}px; width: 100%; left: 0;">
                            <div class="history-header">
                                <span class="history-type">${this.sanitizeHTML(item.scanType?.toUpperCase() || 'UNKNOWN')}</span>
                                <span class="history-date">${new Date(item.date).toLocaleDateString()}</span>
                            </div>
                            <div class="history-body">
                                <h4>${this.sanitizeHTML(item.diagnosis || 'No diagnosis')}</h4>
                                <p>Patient: ${this.sanitizeHTML(item.patientId || 'Unknown')}</p>
                                <div class="history-confidence">
                                    <div class="confidence-bar" style="width: ${Math.min(100, Math.max(0, item.confidence || 0))}%"></div>
                                    <span>${item.confidence || 0}% confidence</span>
                                </div>
                            </div>
                            <button class="history-view-btn" data-id="${this.sanitizeHTML(item.id)}">View Details</button>
                        </div>
                    `;
                }
                
                container.innerHTML = html;
                container.style.height = `${totalHeight}px`;
                
                // Re-attach event listeners
                container.querySelectorAll('.history-view-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const id = e.target.dataset.id;
                        this.viewHistoryItem(id);
                    });
                });
                
                rafId = null;
            });
        };
        
        container.addEventListener('scroll', renderVisibleItems);
        renderVisibleItems();
    }
    
    filterHistory(searchTerm) {
        if (!searchTerm || searchTerm.length < 2) {
            this.loadHistory();
            return;
        }
        
        const filtered = this.history.filter(searchTerm);
        this.renderHistoryList(filtered);
    }
    
    viewHistoryItem(id) {
        const item = this.history.getById(id);
        if (item) {
            this.displayResults(item);
            this.switchTab('scanner');
            
            // Highlight the card
            const card = document.querySelector(`.history-card[data-id="${id}"]`);
            if (card) {
                card.classList.add('highlight');
                setTimeout(() => card.classList.remove('highlight'), 2000);
            }
        }
    }
    
    /* ==================== ANALYTICS ==================== */
    
    async loadAnalytics() {
        if (!Config.FEATURES.ENABLE_ANALYTICS) return;
        
        const analyticsEl = document.querySelector('.analytics-placeholder');
        if (!analyticsEl) return;
        
        try {
            const stats = this.history.getStats();
            const successRate = this.calculateSuccessRate();
            
            analyticsEl.innerHTML = `
                <div class="analytics-grid">
                    <div class="analytics-card">
                        <h3>Total Scans</h3>
                        <p class="stat-large">${stats.total}</p>
                        <small>All time</small>
                    </div>
                    <div class="analytics-card">
                        <h3>Avg Confidence</h3>
                        <p class="stat-large">${stats.averageConfidence}%</p>
                        <small>Overall accuracy</small>
                    </div>
                    <div class="analytics-card">
                        <h3>Success Rate</h3>
                        <p class="stat-large">${successRate}%</p>
                        <small>Confidence ≥70%</small>
                    </div>
                    <div class="analytics-card">
                        <h3>Queue Size</h3>
                        <p class="stat-large">${this.requestQueue.getQueueLength()}</p>
                        <small>Pending requests</small>
                    </div>
                    <div class="analytics-card analytics-card-full">
                        <h3>Scans by Type</h3>
                        <div class="type-chart">
                            ${Object.entries(stats.byType).map(([type, count]) => `
                                <div class="type-stat">
                                    <span>${type}:</span>
                                    <span>${count}</span>
                                    <div class="type-bar" style="width: ${(count / stats.total * 100)}%"></div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="analytics-card analytics-card-full">
                        <h3>Recent Activity</h3>
                        <div class="activity-list">
                            ${Object.entries(stats.byDate).slice(0, 7).map(([date, count]) => `
                                <div class="activity-item">
                                    <span>${date}</span>
                                    <span>${count} scan${count !== 1 ? 's' : ''}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
        } catch (error) {
            this.logger.log(Config.LOG_LEVELS.ERROR, 'Failed to load analytics', { error: error.message });
            analyticsEl.innerHTML = '<div class="error-state">Failed to load analytics</div>';
        }
    }
    
    calculateSuccessRate() {
        const history = this.history.load();
        if (history.length === 0) return 0;
        
        const highConfidence = history.filter(item => (item.confidence || 0) >= 70).length;
        return Math.round(highConfidence / history.length * 100);
    }
    
    /* ==================== RESULTS DISPLAY ==================== */
    
    displayResults(data) {
        this.dom.resultsPanel?.classList.remove("hidden");

        if (this.dom.resultTitle) {
            this.dom.resultTitle.textContent = this.sanitizeHTML(data.diagnosis || "Analysis Complete");
        }
        
        if (this.dom.resultDescription) {
            this.dom.resultDescription.textContent =
                this.sanitizeHTML(data.description || "AI-assisted interpretation provided. Clinical correlation recommended.");
        }

        this.updateConfidence(data.confidence);

        if (this.dom.findingsList) {
            this.dom.findingsList.innerHTML = "";
            
            if (data.findings && data.findings.length > 0) {
                data.findings.forEach(item => {
                    const li = document.createElement("li");
                    li.className = "finding-item";
                    li.innerHTML = `<span class="finding-bullet">•</span> ${this.sanitizeHTML(String(item))}`;
                    this.dom.findingsList.appendChild(li);
                });
            } else {
                const li = document.createElement("li");
                li.className = "finding-item empty";
                li.textContent = "No specific findings detected";
                this.dom.findingsList.appendChild(li);
            }
        }

        // Scroll to results on mobile
        if (window.innerWidth <= 768) {
            this.dom.resultsPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
    
    updateConfidence(score) {
        const value = Math.max(0, Math.min(100, Number(score) || 0));
        
        if (this.dom.confidenceText) {
            this.dom.confidenceText.textContent = `${value}%`;
        }

        if (this.dom.confidencePath) {
            this.dom.confidencePath.style.strokeDasharray = `${value},100`;
            
            // Update color based on confidence
            if (value >= 80) {
                this.dom.confidencePath.style.stroke = '#00c851';
            } else if (value >= 60) {
                this.dom.confidencePath.style.stroke = '#ffbb33';
            } else {
                this.dom.confidencePath.style.stroke = '#ff4444';
            }
        }
    }
    
    /* ==================== CAMERA ==================== */
    
    async initCamera() {
        try {
            if (!navigator.mediaDevices?.getUserMedia) {
                this.notify("Camera not supported on this device", "error");
                return;
            }

            // Check camera permissions
            const permissions = await navigator.permissions?.query({ name: 'camera' });
            
            if (permissions && permissions.state === 'denied') {
                this.notify("Camera access denied. Please enable camera permissions.", "error");
                return;
            }

            const constraints = {
                video: {
                    facingMode: "environment",
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                    frameRate: { ideal: 30 }
                },
                audio: false
            };

            this.cameraStream = await navigator.mediaDevices.getUserMedia(constraints);

            if (this.dom.video) {
                this.dom.video.srcObject = this.cameraStream;
                this.dom.video.setAttribute("playsinline", true);
                this.dom.video.setAttribute("autoplay", true);
                
                try {
                    await this.dom.video.play();
                } catch (playError) {
                    this.logger.log(Config.LOG_LEVELS.WARN, 'Auto-play failed', { error: playError.message });
                    // Try playing on user interaction
                    const playOnInteraction = () => {
                        this.dom.video?.play().catch(() => {});
                        document.removeEventListener('click', playOnInteraction);
                    };
                    document.addEventListener('click', playOnInteraction);
                }
                
                this.updateAIStatus("AI READY", "ready");
            }

        } catch (error) {
            this.logger.log(Config.LOG_LEVELS.ERROR, 'Camera initialization failed', { 
                error: error.message,
                name: error.name
            });
            
            let errorMessage = "Camera unavailable.";
            if (error.name === 'NotAllowedError') {
                errorMessage = "Camera access denied. Please grant permission.";
            } else if (error.name === 'NotFoundError') {
                errorMessage = "No camera found on this device.";
            } else if (error.name === 'NotReadableError') {
                errorMessage = "Camera is already in use by another application.";
            } else if (error.name === 'OverconstrainedError') {
                errorMessage = "Camera doesn't support required constraints.";
            }
            
            this.notify(errorMessage, "error");
            this.updateAIStatus("CAMERA ERROR", "error");
        }
    }
    
    captureFrame() {
        return new Promise((resolve, reject) => {
            if (!this.dom.video?.videoWidth) {
                reject(new Error("Video not ready"));
                return;
            }

            // Clean up previous canvas
            if (this.canvas) {
                this.canvas.width = 0;
                this.canvas.height = 0;
            }

            const canvas = document.createElement("canvas");
            this.canvas = canvas;
            canvas.width = this.dom.video.videoWidth;
            canvas.height = this.dom.video.videoHeight;

            const ctx = canvas.getContext("2d", { 
                alpha: false,
                willReadFrequently: false
            });
            
            if (!ctx) {
                reject(new Error("Could not get canvas context"));
                return;
            }

            // Use better image quality
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            
            ctx.drawImage(this.dom.video, 0, 0, canvas.width, canvas.height);

            // Use requestAnimationFrame for better performance
            requestAnimationFrame(() => {
                canvas.toBlob(blob => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error("Failed to capture image"));
                    }
                }, "image/jpeg", 0.95);
            });
        });
    }
    
    /* ==================== UI HELPERS ==================== */
    
    setLoading(state) {
        this.state.isProcessing = state;
        if (this.dom.captureBtn) {
            this.dom.captureBtn.disabled = state;
            this.dom.captureBtn.classList.toggle('processing', state);
            this.dom.captureBtn.setAttribute('aria-busy', state.toString());
        }
    }
    
    notify(msg, type) {
        if (!this.dom.notification) return;
        
        // Clear any existing timeout
        if (this.notificationTimeout) {
            clearTimeout(this.notificationTimeout);
        }
        
        this.dom.notification.textContent = msg;
        this.dom.notification.className = `notification-toast visible ${type}`;
        this.dom.notification.setAttribute('role', 'alert');

        this.notificationTimeout = setTimeout(() => {
            this.dom.notification?.classList.remove("visible");
            this.notificationTimeout = null;
        }, 4000);
    }
    
    injectDisclaimer() {
        if (document.querySelector('.medical-disclaimer')) return;
        
        const disclaimer = document.createElement("div");
        disclaimer.className = "medical-disclaimer";
        disclaimer.setAttribute('role', 'note');
        disclaimer.style.cssText = `
            position: fixed;
            bottom: 10px;
            left: 0;
            right: 0;
            text-align: center;
            font-size: 11px;
            color: #6c757d;
            background: rgba(255,255,255,0.95);
            padding: 8px;
            z-index: 40;
            backdrop-filter: blur(5px);
            border-top: 1px solid #dee2e6;
            box-shadow: 0 -2px 10px rgba(0,0,0,0.05);
        `;
        disclaimer.textContent =
            "AI-assisted analysis only. Not a medical diagnosis. Always consult with qualified healthcare providers.";
        document.body.appendChild(disclaimer);
    }
    
    sleep(ms) { 
        return new Promise(r => {
            const timeout = setTimeout(r, ms);
            this.timeouts.push(timeout);
        });
    }
    
    createFileInput() {
        this.fileInput = document.createElement("input");
        this.fileInput.type = "file";
        this.fileInput.accept = "image/*,.dcm,.dicom,.dcm32";
        this.fileInput.multiple = false;
        this.fileInput.style.display = "none";
        this.fileInput.setAttribute('aria-hidden', 'true');
        document.body.appendChild(this.fileInput);

        this.fileInput.addEventListener("change", (e) => {
            const file = e.target.files?.[0];
            if (file) {
                this.processLocalFile(file);
            }
        });
    }
    
    async performHealthCheck() {
        const checks = {
            camera: !!this.cameraStream && this.cameraStream.active,
            api: await this.checkAPIHealth(),
            storage: this.checkStorage(),
            auth: this.state.isAuthenticated,
            online: this.state.isOnline,
            queue: this.requestQueue.getQueueLength() === 0
        };
        
        const isHealthy = Object.values(checks).every(Boolean);
        
        if (!isHealthy) {
            this.logger.log(Config.LOG_LEVELS.WARN, 'Health check failed', checks);
            
            // Auto-recovery attempts
            if (!checks.camera && this.state.activeTab === 'scanner') {
                this.initCamera().catch(() => {});
            }
            
            if (!checks.api) {
                this.notify('Connection issues detected', 'warning');
            }
        }
        
        return { isHealthy, checks, timestamp: new Date().toISOString() };
    }
    
    async checkAPIHealth() {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch(Config.FULL_HEALTH_URL, { 
                signal: controller.signal,
                method: 'HEAD'
            });
            
            clearTimeout(timeout);
            return response.ok;
        } catch {
            return false;
        }
    }
    
    checkStorage() {
        try {
            const testKey = 'health_check_' + Date.now();
            localStorage.setItem(testKey, 'test');
            localStorage.removeItem(testKey);
            return true;
        } catch {
            return false;
        }
    }
    
    // Clean up resources
    destroy() {
        this.logger.log(Config.LOG_LEVELS.INFO, 'Destroying MedAI App');
        
        // Stop camera
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => {
                track.stop();
                track.enabled = false;
            });
            this.cameraStream = null;
        }
        
        // Remove event listeners
        this.removeEventListeners();
        
        // Clear timeouts
        this.timeouts.forEach(clearTimeout);
        this.timeouts = [];
        
        // Clear intervals
        this.intervals.forEach(clearInterval);
        this.intervals = [];
        
        // Cancel animation frame
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
        
        // Clear canvas
        if (this.canvas) {
            const ctx = this.canvas.getContext('2d');
            ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.canvas.width = 0;
            this.canvas.height = 0;
            this.canvas = null;
        }
        
        // Remove file input
        if (this.fileInput?.parentNode) {
            this.fileInput.parentNode.removeChild(this.fileInput);
        }
        
        // Remove progress bar
        if (this.dom.progressBar?.parentNode) {
            this.dom.progressBar.parentNode.removeChild(this.dom.progressBar);
        }
        
        // Destroy services
        this.logger.destroy();
        this.requestQueue.saveToStorage();
        
        // Clear DOM references
        Object.keys(this.dom).forEach(key => {
            this.dom[key] = null;
        });
        
        // Clear notification timeout
        if (this.notificationTimeout) {
            clearTimeout(this.notificationTimeout);
        }
    }
}

/* ==================== GLOBAL EXPORTS ==================== */

// Global function for history view
window.viewHistoryItem = function(id) {
    if (window.medAIApp) {
        window.medAIApp.viewHistoryItem(id);
    }
};

// Global health check
window.checkMedAIHealth = async function() {
    if (window.medAIApp) {
        return await window.medAIApp.performHealthCheck();
    }
    return { isHealthy: false, error: 'App not initialized' };
};

// Global export history
window.exportMedAIHistory = function() {
    if (window.medAIApp) {
        window.medAIApp.history.export();
    }
};

// Global clear history (with confirmation)
window.clearMedAIHistory = function() {
    if (window.medAIApp && confirm('Are you sure you want to clear all history? This cannot be undone.')) {
        window.medAIApp.history.clear();
        window.medAIApp.loadHistory();
        window.medAIApp.notify('History cleared', 'info');
    }
};

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
    // Prevent double initialization
    if (window.medAIApp) return;
    
    window.medAIApp = new MedAIApp();
    window.medAIApp.init().catch(error => {
        console.error('Failed to initialize MedAI App:', error);
        
        // Show user-friendly error
        const errorDiv = document.createElement('div');
        errorDiv.className = 'fatal-error';
        errorDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            z-index: 9999;
            text-align: center;
            max-width: 400px;
        `;
        errorDiv.innerHTML = `
            <h3 style="color: #dc3545; margin-bottom: 10px;">Failed to Initialize</h3>
            <p style="margin-bottom: 20px;">Please refresh the page or contact support.</p>
            <button onclick="location.reload()" style="
                background: #007bff;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 5px;
                cursor: pointer;
            ">Refresh Page</button>
        `;
        document.body.appendChild(errorDiv);
    });
});

// Clean up on page unload
window.addEventListener("beforeunload", () => {
    if (window.medAIApp) {
        window.medAIApp.destroy();
        window.medAIApp = null;
    }
});

// Handle page visibility changes
document.addEventListener("visibilitychange", () => {
    if (document.hidden && window.medAIApp) {
        // Save state when page becomes hidden
        window.medAIApp.requestQueue.saveToStorage();
    }
});

})();
