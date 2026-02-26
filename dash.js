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
            slow: 100,      // >100ms is slow
            verySlow: 300,   // >300ms is very slow
            critical: 1000   // >1s is critical
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
                drop
