// =====================================================
// ZERO FALSE FRONTEND APP.JS (PRODUCTION READY)
// =====================================================

// Detect environment automatically
const API_URL =
    window.location.hostname === "localhost"
        ? "http://localhost:3000/api"
        : "https://zerofalse-production.up.railway.app/api";

// =====================================================
// DOM ELEMENTS
// =====================================================

const codeInput = document.getElementById("codeInput");
const languageSelect = document.getElementById("languageSelect");
const lineNumbers = document.getElementById("lineNumbers");
const scanResult = document.getElementById("scanResult");
const scanBtn = document.getElementById("scanBtn");

// =====================================================
// INITIALIZE APP
// =====================================================

document.addEventListener("DOMContentLoaded", () => {

    console.log("ZeroFalse frontend initialized");
    console.log("API URL:", API_URL);

    updateLineNumbers();
    loadStats();

    if (codeInput) {
        codeInput.addEventListener("input", updateLineNumbers);
        codeInput.addEventListener("scroll", syncScroll);
    }

    // Auto refresh stats every 15 seconds
    setInterval(loadStats, 15000);

});

// =====================================================
// LINE NUMBERS
// =====================================================

function updateLineNumbers() {

    if (!codeInput || !lineNumbers) return;

    const lines = codeInput.value.split("\n").length;

    lineNumbers.innerHTML =
        Array.from({ length: lines }, (_, i) => i + 1).join("<br>");

}

function syncScroll() {

    if (!codeInput || !lineNumbers) return;

    lineNumbers.scrollTop = codeInput.scrollTop;

}

// =====================================================
// LOAD EXAMPLE CODE
// =====================================================

function loadExample() {

    const examples = {

        javascript: `const { exec } = require("child_process");

function runCommand(userInput) {
    exec(userInput, (err, stdout) => {
        console.log(stdout);
    });
}`,

        python: `import os

def run(cmd):
    os.system(cmd)`,

        java: `Runtime.getRuntime().exec(userInput);`

    };

    const lang = languageSelect.value;

    codeInput.value = examples[lang] || examples.javascript;

    updateLineNumbers();

}

// =====================================================
// PERFORM SCAN
// =====================================================

async function performScan() {

    const code = codeInput.value.trim();

    if (!code) {

        showError("Please enter code first");
        return;

    }

    const language = languageSelect.value || "javascript";

    setLoading(true);

    try {

        console.log("Sending scan request to:", API_URL);

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

            })

        });

        if (!response.ok) {

            throw new Error(`HTTP ${response.status}`);

        }

        const data = await response.json();

        console.log("Scan result:", data);

        const scan = data.scan || data;

        displayResults(scan);

        loadStats();

    }
    catch (error) {

        console.error("Scan failed:", error);

        showError(
            "Scan failed. Backend may be offline or unreachable."
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
                <p>Your code is secure</p>
            </div>
        `;

        return;

    }

    let html = `
        <h3>⚠️ Found ${scan.findings.length} vulnerabilities</h3>
    `;

    scan.findings.forEach(finding => {

        html += `
            <div class="vulnerability-card ${finding.severity}">
                
                <strong>${finding.type}</strong>
                
                <p>${finding.description}</p>
                
                <code>${escapeHtml(finding.fix || "No fix provided")}</code>
                
                <small>
                    Line ${finding.line} • Confidence ${finding.confidence}%
                </small>
                
            </div>
        `;

    });

    scanResult.innerHTML = html;

}

// =====================================================
// LOAD STATS
// =====================================================

async function loadStats() {

    try {

        const res = await fetch(`${API_URL}/scan`);

        if (!res.ok) return;

        const data = await res.json();

        if (!data.stats) return;

        updateStat("heroTotalScans", data.stats.totalScans);
        updateStat("heroVulnsFound", data.stats.totalFindings);

    }
    catch {

        // silent fail

    }

}

function updateStat(id, value) {

    const el = document.getElementById(id);

    if (el) {

        el.textContent = value || 0;

    }

}

// =====================================================
// LOADING STATE
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
        scanBtn.innerText = "Scan for Vulnerabilities";

    }

}

// =====================================================
// ERROR DISPLAY
// =====================================================

function showError(message) {

    scanResult.innerHTML = `
        <div class="error-box">
            ⚠️ ${message}
        </div>
    `;

}

// =====================================================
// HELPERS
// =====================================================

function getExtension(lang) {

    const map = {

        javascript: "js",
        python: "py",
        java: "java",
        typescript: "ts"

    };

    return map[lang] || "js";

}

function escapeHtml(text) {

    const div = document.createElement("div");

    div.textContent = text;

    return div.innerHTML;

}

// =====================================================
// GLOBAL EXPORT
// =====================================================

window.performScan = performScan;
window.loadExample = loadExample;