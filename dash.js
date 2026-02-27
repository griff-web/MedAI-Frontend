/**
 * MEDAI ENTERPRISE ENGINE v3.6.0 (HARDENED EDITION)
 * Enterprise-grade hardened medical imaging interface
 * Fully backward compatible with v3.5.1
 */

(() => {
"use strict";

/* ==================== CONFIG ==================== */

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
        QUEUE: 'medai_request_queue'
    },
    UI: {
        NOTIFICATION_DURATION: 4000,
        MAX_HISTORY_ITEMS: 50
    }
};

/* ==================== SAFE FETCH WRAPPER ==================== */

async function safeFetch(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.API.TIMEOUT);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });

        return response;
    } finally {
        clearTimeout(timeout);
    }
}

/* ==================== RETRY WITH STATUS CHECK ==================== */

async function retryWithPolicy(fn, retries = CONFIG.API.RETRIES) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fn();

            if (!res.ok && CONFIG.API.RETRYABLE_STATUS.includes(res.status)) {
                throw new Error(`Retryable status ${res.status}`);
            }

            return res;

        } catch (err) {
            if (i === retries - 1) throw err;
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
        }
    }
}

/* ==================== LOGGER ==================== */

class Logger {
    info(msg, data){ console.log("[INFO]", msg, data || ""); }
    warn(msg, data){ console.warn("[WARN]", msg, data || ""); }
    error(msg, data){ console.error("[ERROR]", msg, data || ""); }
}

/* ==================== IMAGE PROCESSOR (HARDENED) ==================== */

class ImageProcessor {

    async captureFrame(videoElement) {

        if (!videoElement?.videoWidth || !videoElement?.videoHeight) {
            throw new Error("Camera not ready");
        }

        const canvas = document.createElement("canvas");
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(videoElement, 0, 0);

        return new Promise(resolve =>
            canvas.toBlob(resolve, "image/jpeg", 0.9)
        );
    }

    async compress(file) {
        if (!file || file.size < 1024 * 1024) return file;

        return new Promise((resolve, reject) => {

            const img = new Image();
            const canvas = document.createElement("canvas");
            const url = URL.createObjectURL(file);

            img.onload = () => {
                URL.revokeObjectURL(url);

                canvas.width = img.width;
                canvas.height = img.height;

                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0);

                canvas.toBlob(blob => {
                    if (!blob) reject(new Error("Compression failed"));
                    else resolve(blob);
                }, file.type || "image/jpeg", 0.85);
            };

            img.onerror = () => reject(new Error("Invalid image"));
            img.src = url;
        });
    }
}

/* ==================== MAIN APP ==================== */

class MedAIApp {

    constructor(){
        this.logger = new Logger();
        this.imageProcessor = new ImageProcessor();
        this.state = {
            isProcessing:false,
            isOnline:navigator.onLine,
            stream:null
        };
        this._notifyTimeout = null;
    }

    async init(){
        await this.initCamera();
        this.bindNetworkEvents();
    }

    /* ==================== CAMERA SAFE INIT ==================== */

    async initCamera(){

        if (!navigator.mediaDevices?.getUserMedia) {
            this.notify("Camera not supported","error");
            return;
        }

        try {
            this.state.stream = await navigator.mediaDevices.getUserMedia({
                video:true,
                audio:false
            });

            const video = document.getElementById("camera-stream");
            if (video){
                video.srcObject = this.state.stream;
                await video.play().catch(()=>{});
            }

        } catch(e){
            this.logger.error("Camera error",e);
            this.notify("Camera unavailable","error");
        }
    }

    /* ==================== PROCESS IMAGE ==================== */

    async processImage(blob, filename){

        const compressed = await this.imageProcessor.compress(blob);

        const formData = new FormData();
        formData.append("file", compressed, filename);

        const response = await retryWithPolicy(() =>
            safeFetch(`${CONFIG.API.BASE}/diagnostics/process`,{
                method:"POST",
                body:formData
            })
        );

        if (!response.ok){
            throw new Error(`Server error ${response.status}`);
        }

        return response.json();
    }

    /* ==================== HISTORY SAFE RENDER ==================== */

    renderHistory(items){
        const container = document.getElementById("history-list");
        if (!container) return;

        container.innerHTML = items.map(item=>`
            <div class="history-card" data-id="${item.id}">
                <strong>${this.sanitize(item.diagnosis)}</strong>
                <button class="view-btn">View</button>
            </div>
        `).join("");

        container.querySelectorAll(".view-btn").forEach(btn=>{
            btn.addEventListener("click",(e)=>{
                const id = e.target.closest(".history-card").dataset.id;
                this.viewHistoryItem(id);
            });
        });
    }

    sanitize(str){
        const div=document.createElement("div");
        div.textContent=str;
        return div.innerHTML;
    }

    /* ==================== SAFE RESULTS ==================== */

    displayResults(data){

        const findingsEl=document.getElementById("findings-list");

        if (findingsEl && Array.isArray(data.findings)){
            findingsEl.innerHTML=data.findings
                .map(f=>`<li>${this.sanitize(f)}</li>`)
                .join("");
        }
    }

    /* ==================== STATUS + LOADING SAFE ==================== */

    setLoading(state){
        this.state.isProcessing=state;
        const status=document.getElementById("ai-status");

        if (!status) return;

        if (!this.state.isOnline){
            status.textContent="OFFLINE";
        } else {
            status.textContent=state?"PROCESSING...":"AI READY";
        }
    }

    /* ==================== NOTIFICATIONS SAFE ==================== */

    notify(msg,type="info"){
        const el=document.getElementById("notification");
        if (!el) return;

        el.textContent=msg;
        el.className=`notification show ${type}`;

        if (this._notifyTimeout) clearTimeout(this._notifyTimeout);

        this._notifyTimeout=setTimeout(()=>{
            el.classList.remove("show");
        },CONFIG.UI.NOTIFICATION_DURATION);
    }

    /* ==================== NETWORK EVENTS ==================== */

    bindNetworkEvents(){
        window.addEventListener("online",()=>{
            this.state.isOnline=true;
            this.notify("Back online","success");
        });

        window.addEventListener("offline",()=>{
            this.state.isOnline=false;
            this.notify("Working offline","warning");
        });
    }

    destroy(){
        if (this.state.stream){
            this.state.stream.getTracks().forEach(t=>t.stop());
        }
        clearTimeout(this._notifyTimeout);
    }
}

/* ==================== BOOTSTRAP ==================== */

window.medAIApp=new MedAIApp();

document.addEventListener("DOMContentLoaded",()=>{
    window.medAIApp.init();
});

window.addEventListener("beforeunload",()=>{
    window.medAIApp.destroy();
});

})();
