// =====================================================
// ZERO FALSE FRONTEND APP.JS — FULL PRODUCTION FIX
// =====================================================

// =====================================================
// API URL DETECTION (ROBUST)
// =====================================================

const API_URL =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
        ? "http://localhost:3000/api"
        : "https://zerofalse-production.up.railway.app/api";

console.log("Using API:", API_URL);

// =====================================================
// DOM ELEMENTS
// =====================================================

const codeInput = document.getElementById("codeInput");
const languageSelect = document.getElementById("languageSelect");
const lineNumbers = document.getElementById("lineNumbers");
const scanResult = document.getElementById("scanResult");
const scanBtn = document.getElementById("scanBtn");

// =====================================================
// INITIALIZE
// =====================================================

document.addEventListener("DOMContentLoaded", () => {

    console.log("Frontend initialized");

    updateLineNumbers();

    loadStats();

    if (codeInput) {

        codeInput.addEventListener("input", updateLineNumbers);

        codeInput.addEventListener("scroll", () => {

            lineNumbers.scrollTop = codeInput.scrollTop;

        });

    }

    setInterval(loadStats, 15000);

});

// =====================================================
// LINE NUMBERS
// =====================================================

function updateLineNumbers() {

    if (!codeInput || !lineNumbers) return;

    const count = codeInput.value.split("\n").length;

    lineNumbers.innerHTML =
        Array.from({ length: count }, (_, i) => i + 1).join("<br>");

}

// =====================================================
// SCAN FUNCTION
// =====================================================

async function performScan() {

    const code = codeInput.value.trim();

    if (!code) {

        showError("Enter code first");

        return;

    }

    const language = languageSelect.value || "javascript";

    setLoading(true);

    try {

        const controller = new AbortController();

        const timeout = setTimeout(
            () => controller.abort(),
            15000
        );

        const response = await fetch(`${API_URL}/scan`, {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({

                code,
                filename: `input.${getExtension(language)}`,
                language,
                repo: "frontend-demo",
                prNumber: null

            }),

            signal: controller.signal

        });

        clearTimeout(timeout);

        if (!response.ok)
            throw new Error(`Server error ${response.status}`);

        const result = await response.json();

        console.log("Scan response:", result);

        const scan = result.scan || result;

        displayResults(scan);

        loadStats();

    }
    catch (error) {

        console.error(error);

        showError(
            "Backend offline or request failed"
        );

    }
    finally {

        setLoading(false);

    }

}

// =====================================================
// DISPLAY RESULTS
// =====================================================

function displayResults(scan) {

    if (!scanResult) return;

    if (!scan || scan.status === "failed") {

        showError(scan?.error || "Scan failed");

        return;

    }

    if (!scan.findings || scan.findings.length === 0) {

        scanResult.innerHTML = `
            <div class="success-box">
                <h3>✅ No vulnerabilities found</h3>
            </div>
        `;

        return;

    }

    let html = `<h3>⚠️ ${scan.findings.length} vulnerabilities found</h3>`;

    scan.findings.forEach(f => {

        html += `
            <div class="vulnerability-card ${f.severity}">
                <strong>${f.type}</strong>
                <p>${f.description}</p>
                <code>${escapeHtml(f.fix || "")}</code>
                <small>
                    Line ${f.line} • Confidence ${f.confidence}%
                </small>
            </div>
        `;

    });

    scanResult.innerHTML = html;

}

// =====================================================
// STATS
// =====================================================

async function loadStats() {

    try {

        const response =
            await fetch(`${API_URL}/scan`);

        if (!response.ok) return;

        const data = await response.json();

        if (!data.stats) return;

        updateStat(
            "heroTotalScans",
            data.stats.totalScans
        );

        updateStat(
            "heroVulnsFound",
            data.stats.totalFindings
        );

    }
    catch {}

}

function updateStat(id, value) {

    const el = document.getElementById(id);

    if (el)
        el.textContent = value || 0;

}

// =====================================================
// UI STATES
// =====================================================

function setLoading(state) {

    if (!scanBtn) return;

    if (state) {

        scanBtn.disabled = true;

        scanBtn.innerText = "Scanning...";

        scanResult.innerHTML =
            "<p>Analyzing code...</p>";

    }
    else {

        scanBtn.disabled = false;

        scanBtn.innerText =
            "Scan for Vulnerabilities";

    }

}

function showError(msg) {

    scanResult.innerHTML =
        `<div class="error-box">⚠️ ${msg}</div>`;

}

// =====================================================
// HELPERS
// =====================================================

function getExtension(lang) {

    return {
        javascript: "js",
        python: "py",
        java: "java",
        typescript: "ts"
    }[lang] || "js";

}

function escapeHtml(text) {

    const div =
        document.createElement("div");

    div.textContent = text;

    return div.innerHTML;

}

// =====================================================
// GLOBAL EXPORT
// =====================================================

window.performScan = performScan;
window.loadExample = loadExample;