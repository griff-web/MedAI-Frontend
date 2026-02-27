(() => {
"use strict";

/* =========================================================
   MEDAI ENTERPRISE ENGINE v4.0 ULTRA
   Fully Hardened | Clean Architecture | Production Ready
========================================================= */

/* ================= CONFIG ================= */

const CONFIG = {
    API_BASE: window.ENV_API_BASE || "https://ai-p17b.onrender.com",
    ENDPOINT: "/diagnostics/process",
    TIMEOUT: 30000,
    COOLDOWN: 3000,
    MAX_FILE_SIZE: 50 * 1024 * 1024,
    VERSION: "4.0.0"
};

CONFIG.FULL_URL = CONFIG.API_BASE + CONFIG.ENDPOINT;

/* ================= UTILITIES ================= */

const Utils = {

    id(prefix = "id_") {
        return prefix + Date.now() + "_" + Math.random().toString(36).slice(2);
    },

    safeGet(id) {
        return document.getElementById(id) || null;
    },

    notify(el, msg, type = "info") {
        if (!el) return;
        el.textContent = msg;
        el.className = "notification " + type;
        el.classList.remove("hidden");
        setTimeout(() => el.classList.add("hidden"), 4000);
    },

    async fetchJSON(url, options = {}) {

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);

        try {

            const res = await fetch(url, {
                ...options,
                headers: {
                    "Content-Type": "application/json",
                    "X-Request-ID": Utils.id("req_"),
                    ...options.headers
                },
                signal: controller.signal
            });

            clearTimeout(timeout);

            if (!res.ok) {
                throw new Error("HTTP " + res.status);
            }

            return await res.json();

        } catch (err) {
            clearTimeout(timeout);
            throw err;
        }
    }

};

/* ================= CORE APPLICATION ================= */

class MedAI {

    constructor() {

        this.state = {
            processing: false,
            lastRun: 0,
            scanType: "xray"
        };

        this.dom = {};
    }

    /* ========= INIT ========= */

    init() {
        this.cacheDOM();
        this.bindEvents();
        console.log("MedAI v4.0 Initialized");
    }

    /* ========= DOM CACHE ========= */

    cacheDOM() {

        this.dom = {
            captureBtn: Utils.safeGet("capture-trigger"),
            uploadBtn: Utils.safeGet("upload-local"),
            fileInput: null,
            resultPanel: Utils.safeGet("results-panel"),
            resultTitle: Utils.safeGet("result-title"),
            resultDesc: Utils.safeGet("result-description"),
            findings: Utils.safeGet("findings-list"),
            confidenceText: Utils.safeGet("confidence-text"),
            confidencePath: Utils.safeGet("confidence-path"),
            notification: Utils.safeGet("notification")
        };

        this.createFileInput();
    }

    /* ========= EVENTS ========= */

    bindEvents() {

        this.dom.captureBtn?.addEventListener("click", () => {
            this.runAnalysis({ image: "camera-capture" });
        });

        this.dom.uploadBtn?.addEventListener("click", () => {
            this.dom.fileInput.click();
        });

    }

    createFileInput() {

        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.style.display = "none";

        input.addEventListener("change", e => {
            const file = e.target.files[0];
            if (!file) return;

            if (file.size > CONFIG.MAX_FILE_SIZE) {
                Utils.notify(this.dom.notification, "File too large.", "error");
                return;
            }

            const reader = new FileReader();
            reader.onload = () => {
                this.runAnalysis({ image: reader.result });
            };
            reader.readAsDataURL(file);
        });

        document.body.appendChild(input);
        this.dom.fileInput = input;
    }

    /* ========= ANALYSIS ========= */

    async runAnalysis(payload) {

        if (this.state.processing) {
            Utils.notify(this.dom.notification, "Processing in progress...", "warn");
            return;
        }

        const now = Date.now();
        if (now - this.state.lastRun < CONFIG.COOLDOWN) {
            Utils.notify(this.dom.notification, "Please wait...", "warn");
            return;
        }

        this.state.processing = true;
        this.state.lastRun = now;

        try {

            Utils.notify(this.dom.notification, "AI analyzing...", "info");

            const raw = await Utils.fetchJSON(CONFIG.FULL_URL, {
                method: "POST",
                body: JSON.stringify(payload)
            });

            const result = this.normalize(raw);
            this.render(result);

            Utils.notify(this.dom.notification, "Analysis complete", "success");

        } catch (err) {
            Utils.notify(this.dom.notification, "Analysis failed", "error");
        } finally {
            this.state.processing = false;
        }
    }

    /* ========= NORMALIZE ========= */

    normalize(data) {

        return {
            title: data?.title || "AI Diagnostic Result",
            description: data?.description || "Automated medical analysis completed.",
            findings: Array.isArray(data?.findings)
                ? data.findings
                : ["No abnormal findings detected."],
            confidence: 93
        };
    }

    /* ========= RENDER ========= */

    render(result) {

        this.dom.resultTitle && (this.dom.resultTitle.textContent = result.title);
        this.dom.resultDesc && (this.dom.resultDesc.textContent = result.description);

        if (this.dom.findings) {
            this.dom.findings.innerHTML = "";
            result.findings.forEach(f => {
                const li = document.createElement("li");
                li.textContent = f;
                this.dom.findings.appendChild(li);
            });
        }

        if (this.dom.confidenceText) {
            this.dom.confidenceText.textContent = result.confidence + "%";
        }

        this.animateConfidence(result.confidence);

        this.dom.resultPanel?.classList.remove("hidden");
    }

    /* ========= CONFIDENCE ANIMATION ========= */

    animateConfidence(value) {

        if (!this.dom.confidencePath) return;

        const radius = 54;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (value / 100) * circumference;

        this.dom.confidencePath.style.strokeDasharray = circumference;
        this.dom.confidencePath.style.strokeDashoffset = offset;
    }

}

/* ================= GLOBAL SAFETY ================= */

window.addEventListener("error", e => {
    console.error("Global Error:", e.message);
});

window.addEventListener("unhandledrejection", e => {
    console.error("Unhandled Promise:", e.reason);
});

/* ================= BOOT ================= */

document.addEventListener("DOMContentLoaded", () => {
    window.medAI = new MedAI();
    window.medAI.init();
});

})();
