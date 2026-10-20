/**
 * AURAFLOW OS - Smart Air Purifier Web Dashboard
 * Modern, Responsive, IoT telemetry & MQTT Control Engine
 */

// ================= CONFIGURATION & STORAGE =================
const DEFAULT_BROKER = "o1c1f1d1.ala.asia-southeast1.emqxsl.com";
const DEFAULT_PORT = 8084;
const DEFAULT_USER = "purifier_admin";
const DEFAULT_PASS = "Pass1234!";

let brokerConfig = {
    host: localStorage.getItem("webMqttHost") || DEFAULT_BROKER,
    port: parseInt(localStorage.getItem("webMqttPort") || DEFAULT_PORT),
    user: localStorage.getItem("webMqttUser") || DEFAULT_USER,
    pass: localStorage.getItem("webMqttPass") || DEFAULT_PASS
};

const topicData = "air_purifier/data";
const topicCmd = "air_purifier/cmd";
const clientId = "auraflow_web_" + Math.random().toString(16).substr(2, 8);

let client = null;
let chart = null;
let telemetryHistory = JSON.parse(localStorage.getItem("telemetryHistory") || "[]");
let alertLogs = JSON.parse(localStorage.getItem("alertLogs") || "[]");
let configSynced = false;
let demoModeActive = false;
let demoInterval = null;
let currentAppTheme = localStorage.getItem("appTheme") || "dark";

// ================= THEME ENGINE =================
function initTheme() {
    const isLight = currentAppTheme === "light";
    if (isLight) {
        document.body.classList.add("light-theme");
        document.body.classList.remove("dark-theme");
    } else {
        document.body.classList.add("dark-theme");
        document.body.classList.remove("light-theme");
    }
    updateThemeIcons(isLight);
}

function toggleTheme() {
    const isLight = document.body.classList.toggle("light-theme");
    document.body.classList.toggle("dark-theme", !isLight);
    currentAppTheme = isLight ? "light" : "dark";
    localStorage.setItem("appTheme", currentAppTheme);
    updateThemeIcons(isLight);
    updateChartTheme();
    showToast(isLight ? "สลับเป็นโหมดสว่าง (Light Mode)" : "สลับเป็นโหมดมืด (Dark Mode)", "info");
}

function updateThemeIcons(isLight) {
    const sunSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`;
    const moonSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;
    
    const iconSlot = document.getElementById("theme-icon");
    const textSlot = document.getElementById("theme-text");
    const mobileIcon = document.getElementById("mobile-theme-icon");
    
    if (iconSlot) iconSlot.innerHTML = isLight ? sunSvg : moonSvg;
    if (textSlot) textSlot.innerText = isLight ? "Light Mode" : "Dark Mode";
    if (mobileIcon) mobileIcon.innerHTML = isLight ? sunSvg : moonSvg;
}

// ================= TOAST & MODAL ENGINE =================
function showToast(message, type = "info", duration = 3500) {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    let icon = "ℹ️";
    if (type === "success") icon = "✅";
    else if (type === "warning") icon = "⚠️";
    else if (type === "error") icon = "❌";

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("fade-out");
        setTimeout(() => toast.remove(), 350);
    }, duration);
}

let modalConfirmCallback = null;

function showModal(title, desc, onConfirm, icon = "⚠️") {
    const modal = document.getElementById("custom-modal");
    document.getElementById("modal-title").innerText = title;
    document.getElementById("modal-desc").innerText = desc;
    document.getElementById("modal-icon").innerText = icon;
    modalConfirmCallback = onConfirm;
    modal.classList.add("active");
}

function closeModal() {
    const modal = document.getElementById("custom-modal");
    modal.classList.remove("active");
    modalConfirmCallback = null;
}

document.getElementById("modal-btn-cancel")?.addEventListener("click", closeModal);
document.getElementById("modal-btn-confirm")?.addEventListener("click", () => {
    if (modalConfirmCallback) modalConfirmCallback();
    closeModal();
});

// ================= MQTT CLIENT ENGINE =================
function connectMQTT() {
    try {
        if (client && client.isConnected()) {
            client.disconnect();
        }
    } catch (e) { console.warn(e); }

    const dot = document.getElementById("mqtt-dot");
    const statusText = document.getElementById("mqtt-status-text");
    const brokerInfo = document.getElementById("broker-info");
    
    if (dot) dot.className = "dot red";
    if (statusText) statusText.innerText = "กำลังเชื่อมต่อ...";
    if (brokerInfo) brokerInfo.innerText = brokerConfig.host;

    try {
        client = new Paho.MQTT.Client(brokerConfig.host, brokerConfig.port, clientId);
        client.onConnectionLost = onConnectionLost;
        client.onMessageArrived = onMessageArrived;

        const options = {
            useSSL: true,
            userName: brokerConfig.user,
            password: brokerConfig.pass,
            timeout: 7,
            onSuccess: () => {
                if (dot) dot.className = "dot green";
                if (statusText) statusText.innerText = "ออนไลน์ (Online)";
                client.subscribe(topicData);
                showToast("เชื่อมต่อ MQTT Broker สำเร็จ", "success");
                initChart();
                renderAlerts();
            },
            onFailure: (err) => {
                if (dot) dot.className = "dot red";
                if (statusText) statusText.innerText = "ตัดการเชื่อมต่อ";
                console.warn("MQTT Connect failed:", err);
                
                // If demo mode is not already running and this is initial connection failure, prompt user
                if (!demoModeActive && telemetryHistory.length === 0) {
                    showToast("ไม่สามารถต่อ MQTT ได้ - ลองเปิด 'โหมดจำลอง (Demo)' เพื่อทดสอบ", "warning", 5000);
                }
            }
        };

        client.connect(options);
    } catch (err) {
        console.error("MQTT Init Error:", err);
    }
}

function onConnectionLost(responseObject) {
    const dot = document.getElementById("mqtt-dot");
    const statusText = document.getElementById("mqtt-status-text");
    if (dot) dot.className = "dot red";
    if (statusText) statusText.innerText = "หลุดการเชื่อมต่อ";
    
    if (responseObject.errorCode !== 0) {
        console.log("onConnectionLost:" + responseObject.errorMessage);
        showToast("MQTT หลุดการเชื่อมต่อ กำลังลองใหม่ใน 5 วินาที...", "warning");
    }
    
    setTimeout(() => {
        if (!demoModeActive) connectMQTT();
    }, 5000);
}

// ================= AIR QUALITY EVALUATION =================
function evaluateAirQuality(pm25) {
    if (pm25 === null || pm25 === undefined || isNaN(pm25)) {
        return {
            category: "รอข้อมูล",
            color: "#64748b",
            advice: "รอรับข้อมูลจากเซ็นเซอร์ PMS7003...",
            badge: "standby"
        };
    }

    if (pm25 <= 15) {
        return {
            category: "ดีเยี่ยม (Excellent)",
            color: "#10b981",
            advice: "อากาศบริสุทธิ์สดชื่น เหมาะกับการทำกิจกรรมและพักผ่อน",
            badge: "excellent"
        };
    } else if (pm25 <= 25) {
        return {
            category: "ดี (Good)",
            color: "#06b6d4",
            advice: "คุณภาพอากาศอยู่ในเกณฑ์ดี สามารถระบายอากาศตามธรรมชาติได้",
            badge: "good"
        };
    } else if (pm25 <= 37) {
        return {
            category: "ปานกลาง (Moderate)",
            color: "#f59e0b",
            advice: "ฝุ่นระดับปานกลาง ผู้ที่มีภูมิแพ้ควรเปิดเครื่องฟอกอากาศ",
            badge: "moderate"
        };
    } else if (pm25 <= 75) {
        return {
            category: "เริ่มมีผลกระทบ (Unhealthy)",
            color: "#f97316",
            advice: "ฝุ่นเกินมาตรฐาน! ควรเปิดพัดลมฟอกอากาศระดับสูงและปิดหน้าต่าง",
            badge: "unhealthy"
        };
    } else {
        return {
            category: "อันตรายต่อสุขภาพ (Hazardous)",
            color: "#ef4444",
            advice: "อันตรายขั้นวิกฤต! เปิดระดับ TURBO และสวมหน้ากากป้องกัน",
            badge: "hazardous"
        };
    }
}

// ================= TELEMETRY RECEIVER & DISPATCHER =================
function onMessageArrived(msg) {
    try {
        const data = JSON.parse(msg.payloadString);
        applyTelemetryData(data);
    } catch (e) {
        console.error("Payload parse error:", e);
    }
}

function applyTelemetryData(data) {
    // 1. Clock
    if (data.time) {
        const timeEl = document.getElementById("esp-time");
        if (timeEl) timeEl.innerText = data.time;
    }

    // 2. PM2.5 Gauge & Evaluation
    const pmVal = data.pm25 !== null && data.pm25 !== undefined ? Math.round(data.pm25) : "--";
    const pmValEl = document.getElementById("pm25-val");
    if (pmValEl) pmValEl.innerText = pmVal;

    const evalResult = evaluateAirQuality(data.pm25);
    const circleFill = document.getElementById("pm25-circle-fill");
    const statusTextEl = document.getElementById("pm25-status");
    const statusPill = document.getElementById("pm25-badge-pill");
    const statusDescEl = document.getElementById("pm25-desc");
    const pulsar = document.getElementById("status-pulsar");

    const effectiveColor = data.st_color || evalResult.color;
    const effectiveText = data.st_text ? `คุณภาพ: ${data.st_text}` : evalResult.category;

    if (circleFill) {
        circleFill.style.stroke = effectiveColor;
        // Circumference is 2 * PI * 82 = 515.22
        const totalLen = 515.22;
        if (typeof data.pm25 === "number") {
            const ratio = Math.min(Math.max(data.pm25 / 150, 0), 1);
            const offset = totalLen - (ratio * totalLen);
            circleFill.style.strokeDashoffset = offset;
        } else {
            circleFill.style.strokeDashoffset = totalLen * 0.85;
        }
    }

    if (statusTextEl) statusTextEl.innerText = effectiveText;
    if (statusPill) {
        statusPill.style.color = effectiveColor;
        statusPill.style.borderColor = effectiveColor;
        statusPill.style.backgroundColor = `${effectiveColor}1a`; // 10% opacity
    }
    if (pulsar) pulsar.style.backgroundColor = effectiveColor;
    if (statusDescEl) statusDescEl.innerText = evalResult.advice;

    // 3. Environment Metrics (Temp, Hum, Gas)
    if (data.temp !== undefined && data.temp !== null) {
        const tempEl = document.getElementById("temp-val");
        const tempBadge = document.getElementById("temp-badge");
        const tempBar = document.getElementById("temp-bar");
        if (tempEl) tempEl.innerText = `${data.temp}°C`;
        if (tempBadge) {
            tempBadge.innerText = data.temp > 30 ? "ร้อน" : (data.temp < 23 ? "เย็น" : "สบาย");
        }
        if (tempBar) {
            const tPct = Math.min(Math.max(((data.temp - 15) / 25) * 100, 10), 100);
            tempBar.style.width = `${tPct}%`;
        }
    }

    if (data.hum !== undefined && data.hum !== null) {
        const humEl = document.getElementById("hum-val");
        const humBadge = document.getElementById("hum-badge");
        const humBar = document.getElementById("hum-bar");
        if (humEl) humEl.innerText = `${data.hum}%`;
        if (humBadge) {
            humBadge.innerText = data.hum > 65 ? "ชื้นสูง" : (data.hum < 40 ? "แห้ง" : "เหมาะสม");
        }
        if (humBar) humBar.style.width = `${Math.min(data.hum, 100)}%`;
    }

    if (data.mq135 !== undefined && data.mq135 !== null) {
        const mqEl = document.getElementById("mq135-val");
        const mqBadge = document.getElementById("mq135-badge");
        const mqBar = document.getElementById("mq135-bar");
        
        let gasText = "ไร้กลิ่น/สะอาด";
        let gasBadge = "อากาศบริสุทธิ์";
        if (data.mq135 > 600) {
            gasText = "พบกลิ่น/ควันหนาแน่น";
            gasBadge = "มลพิษสูง";
        } else if (data.mq135 > 350) {
            gasText = "มีกลิ่นควันบางเบา";
            gasBadge = "ปานกลาง";
        }

        if (mqEl) mqEl.innerText = gasText;
        if (mqBadge) mqBadge.innerText = gasBadge;
        if (mqBar) {
            const mPct = Math.min(Math.max((data.mq135 / 800) * 100, 8), 100);
            mqBar.style.width = `${mPct}%`;
        }
    }

    // 4. Fan Speed & Spinning Animation
    const fanSpeedEl = document.getElementById("fan-speed");
    const fanBladeSvg = document.getElementById("fan-blades-svg");
    const fanRelayCaption = document.getElementById("fan-relay-caption");
    const fanPillStatus = document.getElementById("fan-pill-status");
    const fanMode = data.f_mode || "OFF";

    if (fanSpeedEl) fanSpeedEl.innerText = fanMode;

    if (fanBladeSvg) {
        fanBladeSvg.className = "fan-blades";
        if (fanMode === "HIGH") {
            fanBladeSvg.classList.add("spin-fast");
            if (fanRelayCaption) fanRelayCaption.innerText = "กำลังฟอกระดับ TURBO";
            if (fanPillStatus) {
                fanPillStatus.innerText = "Turbo On";
                fanPillStatus.style.color = "var(--accent-red)";
            }
        } else if (fanMode === "MED") {
            fanBladeSvg.classList.add("spin-med");
            if (fanRelayCaption) fanRelayCaption.innerText = "ความเร็วระดับกลาง";
            if (fanPillStatus) {
                fanPillStatus.innerText = "Running";
                fanPillStatus.style.color = "var(--accent-cyan)";
            }
        } else if (fanMode === "LOW") {
            fanBladeSvg.classList.add("spin-slow");
            if (fanRelayCaption) fanRelayCaption.innerText = "ความเร็วระดับเบา";
            if (fanPillStatus) {
                fanPillStatus.innerText = "Low Speed";
                fanPillStatus.style.color = "var(--accent-green)";
            }
        } else {
            fanBladeSvg.classList.add("spin-off");
            if (fanRelayCaption) fanRelayCaption.innerText = "รีเลย์ตัดไฟ (OFF)";
            if (fanPillStatus) {
                fanPillStatus.innerText = "Standby";
                fanPillStatus.style.color = "var(--text-muted)";
            }
        }
    }

    // 5. Operating Mode Active Buttons
    if (data.c_mode) {
        document.querySelectorAll(".btn-mode-card").forEach(btn => btn.classList.remove("active"));
        const activeBtn = document.getElementById("btn-" + data.c_mode);
        if (activeBtn) activeBtn.classList.add("active");
    }

    // 6. Filter Health
    if (data.filter_pct !== undefined && data.filter_pct !== null) {
        const filterValEl = document.getElementById("filter-val");
        const filterBar = document.getElementById("filter-bar");
        const filterTag = document.getElementById("filter-health-tag");
        const filterDays = document.getElementById("filter-days-estimate");

        const pct = Math.max(0, Math.min(100, data.filter_pct));
        if (filterValEl) filterValEl.innerText = `${pct}%`;
        if (filterBar) filterBar.style.width = `${pct}%`;

        if (pct > 50) {
            if (filterTag) { filterTag.innerText = "สภาพดีเยี่ยม"; filterTag.style.color = "var(--accent-green)"; }
            if (filterBar) filterBar.style.background = "linear-gradient(90deg, #10b981, #06b6d4)";
        } else if (pct > 20) {
            if (filterTag) { filterTag.innerText = "ควรทำความสะอาด"; filterTag.style.color = "var(--accent-yellow)"; }
            if (filterBar) filterBar.style.background = "linear-gradient(90deg, #f59e0b, #fbbf24)";
        } else {
            if (filterTag) { filterTag.innerText = "ควรเปลี่ยนแผ่นกรองใหม่!"; filterTag.style.color = "var(--accent-red)"; }
            if (filterBar) filterBar.style.background = "linear-gradient(90deg, #ef4444, #f43f5e)";
        }

        if (filterDays) {
            const approxDays = Math.round(pct * 1.8);
            filterDays.innerText = `เหลืออายุการใช้งานโดยประมาณ ${approxDays} วัน`;
        }
    }

    // 7. Timer & Quiet Status
    if (data.o_timer !== undefined) {
        const timerValEl = document.getElementById("timer-val");
        if (timerValEl) timerValEl.innerText = data.o_timer === "OFF" ? "OFF" : `${data.o_timer} Set`;
    }

    if (data.q_timer !== undefined) {
        const qtimerValEl = document.getElementById("qtimer-val");
        const qtimerPill = document.getElementById("qtimer-status-pill");
        if (qtimerValEl) qtimerValEl.innerText = data.q_timer;
        if (qtimerPill) {
            const isQuiet = data.q_timer && data.q_timer !== "OFF";
            qtimerPill.innerText = isQuiet ? "กำลังทำงาน" : "สแตนด์บาย";
            qtimerPill.style.color = isQuiet ? "var(--accent-purple)" : "var(--text-muted)";
        }
    }

    // 8. Auto-Sync Settings Thresholds from ESP32
    if (data.cfg && (!configSynced || document.activeElement?.tagName !== "INPUT")) {
        const pMed = document.getElementById("cfg-pm-med");
        const pHigh = document.getElementById("cfg-pm-high");
        const mMed = document.getElementById("cfg-mq-med");
        const mHigh = document.getElementById("cfg-mq-high");
        const nStart = document.getElementById("cfg-night-start");
        const nEnd = document.getElementById("cfg-night-end");

        if (pMed) pMed.value = data.cfg.p_m;
        if (pHigh) pHigh.value = data.cfg.p_h;
        if (mMed) mMed.value = data.cfg.m_m;
        if (mHigh) mHigh.value = data.cfg.m_h;
        if (nStart) nStart.value = data.cfg.n_s;
        if (nEnd) nEnd.value = data.cfg.n_e;

        configSynced = true;
        const cfgStatus = document.getElementById("config-status");
        if (cfgStatus) {
            cfgStatus.innerText = "ซิงค์ค่าล่าสุดจาก ESP32 สำเร็จแล้ว";
            cfgStatus.style.color = "var(--accent-green)";
            const syncDot = document.querySelector(".sync-dot");
            if (syncDot) syncDot.classList.add("synced");
        }
    }

    // 9. Hazard Incident Detection
    if (typeof data.pm25 === "number" && data.pm25 > 50) {
        addAlert(`ตรวจพบค่าฝุ่น PM2.5 เกินมาตรฐานความปลอดภัย (${data.pm25} µg/m³)`, "danger");
    }
    if (typeof data.mq135 === "number" && data.mq135 > 600) {
        addAlert(`ตรวจพบความเข้มข้นของก๊าซ/ควันผิดปกติ (ระดับ: ${data.mq135})`, "warning");
    }

    // 10. Telemetry Chart History
    if (data.pm25 !== null && data.pm25 !== undefined) {
        const timeLabel = data.time || new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const record = {
            timestamp: timeLabel,
            pm25: data.pm25,
            mq135: data.mq135 || 0,
            temp: data.temp || 0,
            hum: data.hum || 0
        };

        telemetryHistory.push(record);
        if (telemetryHistory.length > 30) telemetryHistory.shift();
        localStorage.setItem("telemetryHistory", JSON.stringify(telemetryHistory));
        updateChart(record);
    }
}

// ================= CHART ENGINE =================
function initChart() {
    if (chart) return;
    const canvas = document.getElementById("realtimeChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const isLight = document.body.classList.contains("light-theme");
    const gridColor = isLight ? "rgba(0, 0, 0, 0.06)" : "rgba(255, 255, 255, 0.06)";
    const textColor = isLight ? "#64748b" : "#94a3b8";

    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: telemetryHistory.map(d => d.timestamp),
            datasets: [
                {
                    label: 'PM2.5 (µg/m³)',
                    data: telemetryHistory.map(d => d.pm25),
                    borderColor: '#06b6d4',
                    backgroundColor: 'rgba(6, 182, 212, 0.1)',
                    borderWidth: 2.5,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#06b6d4',
                    tension: 0.35,
                    fill: true
                },
                {
                    label: 'MQ135 ก๊าซพิษ (Raw)',
                    data: telemetryHistory.map(d => d.mq135),
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.05)',
                    borderWidth: 2,
                    pointRadius: 2,
                    pointHoverRadius: 5,
                    pointBackgroundColor: '#f59e0b',
                    tension: 0.35,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: textColor,
                        font: { family: "'Plus Jakarta Sans', 'Prompt', sans-serif", size: 12, weight: '600' },
                        usePointStyle: true,
                        boxWidth: 8
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#f8fafc',
                    bodyColor: '#cbd5e1',
                    borderColor: '#334155',
                    borderWidth: 1,
                    padding: 10,
                    cornerRadius: 8,
                    bodyFont: { family: "'Plus Jakarta Sans', 'Prompt', sans-serif" }
                }
            },
            scales: {
                x: {
                    grid: { color: gridColor },
                    ticks: { color: textColor, maxRotation: 0, font: { size: 11 } }
                },
                y: {
                    grid: { color: gridColor },
                    ticks: { color: textColor, font: { size: 11 } },
                    beginAtZero: true
                }
            }
        }
    });
}

function updateChart(rec) {
    if (!chart) {
        initChart();
        return;
    }
    chart.data.labels.push(rec.timestamp);
    chart.data.datasets[0].data.push(rec.pm25);
    chart.data.datasets[1].data.push(rec.mq135);

    if (chart.data.labels.length > 30) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
        chart.data.datasets[1].data.shift();
    }
    chart.update('none');
}

function updateChartTheme() {
    if (!chart) return;
    const isLight = document.body.classList.contains("light-theme");
    const gridColor = isLight ? "rgba(0, 0, 0, 0.06)" : "rgba(255, 255, 255, 0.06)";
    const textColor = isLight ? "#64748b" : "#94a3b8";

    chart.options.scales.x.grid.color = gridColor;
    chart.options.scales.x.ticks.color = textColor;
    chart.options.scales.y.grid.color = gridColor;
    chart.options.scales.y.ticks.color = textColor;
    chart.options.plugins.legend.labels.color = textColor;
    chart.update();
}

function clearChartHistory() {
    telemetryHistory = [];
    localStorage.removeItem("telemetryHistory");
    if (chart) {
        chart.data.labels = [];
        chart.data.datasets[0].data = [];
        chart.data.datasets[1].data = [];
        chart.update();
    }
    showToast("ล้างประวัติข้อมูลกราฟเรียบร้อย", "info");
}

// ================= HARDWARE CONTROLS =================
function sendControl(mode) {
    // If in demo mode, simulate change locally
    if (demoModeActive) {
        simulateControl(mode);
        showToast(`[Demo] เปลี่ยนโหมดเป็น ${mode}`, "info");
        return;
    }

    if (client && client.isConnected()) {
        const payload = JSON.stringify({ mode: mode });
        const message = new Paho.MQTT.Message(payload);
        message.destinationName = topicCmd;
        client.send(message);
        showToast(`ส่งคำสั่งโหมด: ${mode}`, "info");

        // Optimistically update UI button
        document.querySelectorAll(".btn-mode-card").forEach(btn => btn.classList.remove("active"));
        const btn = document.getElementById("btn-" + mode);
        if (btn) btn.classList.add("active");
    } else {
        showToast("ไม่ได้เชื่อมต่อกับบอร์ด ESP32 ไม่สามารถส่งคำสั่งได้", "error");
    }
}

function setTimer(hours) {
    if (demoModeActive) {
        const timerVal = document.getElementById("timer-val");
        if (timerVal) timerVal.innerText = hours > 0 ? `${hours}h Set` : "OFF";
        showToast(hours > 0 ? `[Demo] ตั้งเวลาปิดใน ${hours} ชั่วโมง` : "[Demo] ยกเลิกการตั้งเวลา", "info");
        return;
    }

    if (client && client.isConnected()) {
        const payload = JSON.stringify({ timer: hours });
        const message = new Paho.MQTT.Message(payload);
        message.destinationName = topicCmd;
        client.send(message);

        const timerVal = document.getElementById("timer-val");
        if (timerVal) timerVal.innerText = hours > 0 ? `${hours}h Set` : "OFF";
        showToast(hours > 0 ? `ตั้งเวลาปิดเครื่องอัตโนมัติ ${hours} ชั่วโมง` : "ยกเลิกการตั้งเวลาปิด", "success");
    } else {
        showToast("ยังไม่ได้เชื่อมต่อกับบอร์ด ESP32", "error");
    }
}

function confirmResetFilter() {
    showModal(
        "ยืนยันการรีเซ็ตอายุไส้กรอง?",
        "เมื่อเปลี่ยนแผ่นกรองอากาศใหม่ ให้กดรีเซ็ตเพื่อเริ่มนับรอบการใช้งาน 100% ใหม่อีกครั้ง",
        () => {
            if (demoModeActive) {
                applyTelemetryData({ filter_pct: 100 });
                showToast("[Demo] รีเซ็ตอายุไส้กรองเป็น 100% เรียบร้อย", "success");
                return;
            }
            sendControl("RESET_FILTER");
            showToast("ส่งคำสั่งรีเซ็ตอายุไส้กรองแล้ว", "success");
        },
        "🔄"
    );
}

// ================= HARDWARE & BROKER SETTINGS FORMS =================
function applySensitivityPreset(type) {
    const pmMed = document.getElementById("cfg-pm-med");
    const pmHigh = document.getElementById("cfg-pm-high");
    const mqMed = document.getElementById("cfg-mq-med");
    const mqHigh = document.getElementById("cfg-mq-high");

    if (type === "sensitive") {
        if (pmMed) pmMed.value = 25;
        if (pmHigh) pmHigh.value = 35;
        if (mqMed) mqMed.value = 300;
        if (mqHigh) mqHigh.value = 450;
        showToast("เลือกโหมด: ไวพิเศษ (สำหรับคนเป็นภูมิแพ้ / ฝุ่นเล็กน้อยก็เร่งฟอก)", "info");
    } else {
        if (pmMed) pmMed.value = 35;
        if (pmHigh) pmHigh.value = 50;
        if (mqMed) mqMed.value = 400;
        if (mqHigh) mqHigh.value = 600;
        showToast("เลือกโหมด: ความไวมาตรฐาน (แนะนำสำหรับบ้านทั่วไป)", "info");
    }
}

function saveHardwareSettings(e) {
    e.preventDefault();
    const pmMed = parseInt(document.getElementById("cfg-pm-med").value);
    const pmHigh = parseInt(document.getElementById("cfg-pm-high").value);
    const mqMed = parseInt(document.getElementById("cfg-mq-med").value);
    const mqHigh = parseInt(document.getElementById("cfg-mq-high").value);
    const nightStart = parseInt(document.getElementById("cfg-night-start").value);
    const nightEnd = parseInt(document.getElementById("cfg-night-end").value);

    if (pmMed >= pmHigh) {
        showToast("ค่าฝุ่นระดับกลาง (MED) ต้องน้อยกว่าระดับสูง (HIGH)", "warning");
        return;
    }

    const payload = {
        sys_config: {
            pm_med: pmMed,
            pm_high: pmHigh,
            mq_med: mqMed,
            mq_high: mqHigh,
            night_start: nightStart,
            night_end: nightEnd
        }
    };

    if (demoModeActive) {
        showToast("[Demo] บันทึกและจำลองเกณฑ์ใหม่สำเร็จ", "success");
        return;
    }

    if (client && client.isConnected()) {
        const msg = new Paho.MQTT.Message(JSON.stringify(payload));
        msg.destinationName = topicCmd;
        client.send(msg);

        const statusEl = document.getElementById("config-status");
        if (statusEl) {
            statusEl.innerText = "บันทึกและส่งข้อมูลไปยัง ESP32 เรียบร้อย";
            statusEl.style.color = "var(--accent-cyan)";
        }
        showToast("ส่งค่า Config ไปยัง ESP32 สำเร็จ", "success");
    } else {
        showToast("ไม่ได้เชื่อมต่อ MQTT ไม่สามารถส่งไปยังบอร์ดได้", "error");
    }
}

function saveCloudSettings(e) {
    e.preventDefault();
    const ssid = document.getElementById("cfg-wifi-ssid").value;
    const pass = document.getElementById("cfg-wifi-pass").value;
    const mHost = document.getElementById("cfg-mqtt-host").value;
    const mPort = parseInt(document.getElementById("cfg-mqtt-port").value);
    const mUser = document.getElementById("cfg-mqtt-user").value;

    showModal(
        "ยืนยันการตั้งค่า Wi-Fi และคลาวด์?",
        `บอร์ด ESP32 จะทำการบันทึกข้อมูลและรีสตาร์ทตัวเครื่องเพื่อต่อเครือข่าย "${ssid}" ใหม่ทันที`,
        () => {
            const payload = {
                wifi_reconfig: {
                    ssid: ssid,
                    pass: pass,
                    m_host: mHost,
                    m_port: mPort,
                    m_user: mUser
                }
            };

            if (client && client.isConnected()) {
                const msg = new Paho.MQTT.Message(JSON.stringify(payload));
                msg.destinationName = topicCmd;
                client.send(msg);
                showToast("ส่งคำสั่ง Provision เรียบร้อย บอร์ดกำลังรีสตาร์ท...", "warning", 6000);
            } else {
                showToast("ไม่ได้เชื่อมต่อ MQTT ไม่สามารถส่งคำสั่งได้", "error");
            }
        },
        "📡"
    );
}

function saveWebMqttSettings(e) {
    e.preventDefault();
    const host = document.getElementById("web-mqtt-host").value.trim();
    const port = parseInt(document.getElementById("web-mqtt-port").value);
    const user = document.getElementById("web-mqtt-user").value.trim();
    const pass = document.getElementById("web-mqtt-pass").value;

    if (!host || !port) {
        showToast("กรุณากรอก Host และ Port ให้ครบถ้วน", "warning");
        return;
    }

    brokerConfig.host = host;
    brokerConfig.port = port;
    brokerConfig.user = user;
    brokerConfig.pass = pass;

    localStorage.setItem("webMqttHost", host);
    localStorage.setItem("webMqttPort", port);
    localStorage.setItem("webMqttUser", user);
    localStorage.setItem("webMqttPass", pass);

    showToast("บันทึกการตั้งค่าแล้ว กำลังเริ่มเชื่อมต่อใหม่...", "success");
    connectMQTT();
}

function resetWebMqttDefaults() {
    showModal(
        "คืนค่าเริ่มต้น Web MQTT?",
        "ต้องการรีเซ็ตค่าการเชื่อมต่อของเว็บกลับเป็นค่ามาตรฐานหรือไม่?",
        () => {
            localStorage.removeItem("webMqttHost");
            localStorage.removeItem("webMqttPort");
            localStorage.removeItem("webMqttUser");
            localStorage.removeItem("webMqttPass");

            brokerConfig = {
                host: DEFAULT_BROKER,
                port: DEFAULT_PORT,
                user: DEFAULT_USER,
                pass: DEFAULT_PASS
            };

            populateWebSettingsInputs();
            showToast("คืนค่าเริ่มต้นสำเร็จ กำลังเชื่อมต่อใหม่...", "info");
            connectMQTT();
        },
        "🔄"
    );
}

function populateWebSettingsInputs() {
    const h = document.getElementById("web-mqtt-host");
    const p = document.getElementById("web-mqtt-port");
    const u = document.getElementById("web-mqtt-user");
    const pass = document.getElementById("web-mqtt-pass");

    if (h) h.value = brokerConfig.host;
    if (p) p.value = brokerConfig.port;
    if (u) u.value = brokerConfig.user;
    if (pass) pass.value = brokerConfig.pass;
}

// ================= ALERTS & LOGS =================
function addAlert(msg, type = "danger") {
    const time = new Date().toLocaleTimeString('th-TH');
    if (alertLogs.length > 0 && alertLogs[0].msg === msg) return;

    alertLogs.unshift({ time, msg, type });
    if (alertLogs.length > 30) alertLogs.pop();
    localStorage.setItem("alertLogs", JSON.stringify(alertLogs));
    renderAlerts();
}

function renderAlerts() {
    const list = document.getElementById("alert-list");
    const badge = document.getElementById("alert-badge");
    const mobileBadge = document.getElementById("mobile-alert-badge");

    if (badge) badge.innerText = alertLogs.length;
    if (mobileBadge) mobileBadge.innerText = alertLogs.length;

    if (!list) return;

    if (alertLogs.length === 0) {
        list.innerHTML = `
            <div class="alert-empty-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <h4>ระบบทำงานปกติ</h4>
                <p>ไม่พบประวัติเหตุการณ์มลพิษหรืออันตราย</p>
            </div>
        `;
        return;
    }

    list.innerHTML = "";
    alertLogs.forEach(a => {
        const li = document.createElement("li");
        li.className = `alert-item ${a.type === 'warning' ? 'warning' : ''}`;
        li.innerHTML = `
            <div class="alert-item-info">
                <strong>${a.msg}</strong>
                <time>เวลาบันทึก: ${a.time}</time>
            </div>
            <span class="alert-type-badge">${a.type === 'danger' ? '🚨 อันตราย' : '⚠️ เตือน'}</span>
        `;
        list.appendChild(li);
    });
}

function clearAlerts() {
    showModal(
        "ล้างประวัติการแจ้งเตือน?",
        "คุณต้องการลบประวัติบันทึกความปลอดภัยทั้งหมดใช่หรือไม่?",
        () => {
            alertLogs = [];
            localStorage.removeItem("alertLogs");
            renderAlerts();
            showToast("ล้างประวัติการแจ้งเตือนเรียบร้อย", "info");
        },
        "🗑️"
    );
}

// ================= NAVIGATION =================
function switchTab(tab) {
    // Desktop Nav
    document.querySelectorAll(".nav-menu .nav-item").forEach(li => li.classList.remove("active"));
    const activeNav = document.getElementById("nav-" + tab);
    if (activeNav) activeNav.classList.add("active");

    // Mobile Bottom Nav
    document.querySelectorAll(".bottom-nav-item").forEach(btn => btn.classList.remove("active"));
    const activeMob = document.getElementById("mobile-nav-" + tab);
    if (activeMob) activeMob.classList.add("active");

    // Views
    document.querySelectorAll(".tab-view").forEach(v => v.classList.remove("active"));
    const targetView = document.getElementById("view-" + tab);
    if (targetView) targetView.classList.add("active");

    // Breadcrumb & Page Titles
    const breadcrumb = document.getElementById("header-breadcrumb");
    const pageTitle = document.getElementById("page-title");
    const pageSubtitle = document.getElementById("page-subtitle");

    if (tab === 'dashboard') {
        if (breadcrumb) breadcrumb.innerText = "Dashboard";
        if (pageTitle) pageTitle.innerText = "ระบบควบคุมคุณภาพอากาศ";
        if (pageSubtitle) pageSubtitle.innerText = "แสดงข้อมูลโทรมาตรและสั่งงานเครื่องฟอกอากาศแบบเรียลไทม์";
        if (chart) chart.resize();
    } else if (tab === 'alerts') {
        if (breadcrumb) breadcrumb.innerText = "Incident Logs";
        if (pageTitle) pageTitle.innerText = "ประวัติเหตุการณ์ & แจ้งเตือน";
        if (pageSubtitle) pageSubtitle.innerText = "ติดตามมลพิษย้อนหลังเพื่อความปลอดภัยในที่อยู่อาศัย";
    } else {
        if (breadcrumb) breadcrumb.innerText = "Settings";
        if (pageTitle) pageTitle.innerText = "ตั้งค่าระบบ & การเชื่อมต่อ";
        if (pageSubtitle) pageSubtitle.innerText = "ปรับแต่งเกณฑ์เซ็นเซอร์, Wi-Fi บอร์ด ESP32 และ MQTT Broker";
    }
}

// ================= EXPORT CSV =================
function exportToCSV() {
    if (!telemetryHistory.length) {
        showToast("ยังไม่มีข้อมูลประวัติคุณภาพอากาศที่จะส่งออก", "warning");
        return;
    }

    let csv = "\uFEFFTimestamp,PM25 (ug/m3),MQ135 Gas,Temperature (C),Humidity (%)\r\n";
    telemetryHistory.forEach(r => {
        csv += `"${r.timestamp}",${r.pm25},${r.mq135},${r.temp},${r.hum}\r\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `AuraFlow_Telemetry_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("ดาวน์โหลดไฟล์ CSV เรียบร้อยแล้ว", "success");
}

// ================= DEMO / SIMULATION ENGINE =================
let simulatedData = {
    pm25: 18,
    temp: 26,
    hum: 56,
    mq135: 140,
    f_mode: "AUTO",
    c_mode: "AUTO",
    filter_pct: 95,
    o_timer: "OFF",
    q_timer: "OFF",
    cfg: { p_m: 35, p_h: 50, m_m: 400, m_h: 600, n_s: 22, n_e: 6 }
};

function toggleDemoMode() {
    demoModeActive = !demoModeActive;
    const indicator = document.getElementById("demo-indicator");
    const demoBtnText = document.getElementById("demo-btn-text");
    const demoBtn = document.getElementById("btn-toggle-demo");
    const dot = document.getElementById("mqtt-dot");
    const statusText = document.getElementById("mqtt-status-text");

    if (demoModeActive) {
        if (indicator) indicator.style.display = "flex";
        if (demoBtnText) demoBtnText.innerText = "ปิดโหมดจำลอง";
        if (demoBtn) demoBtn.classList.add("active");
        if (dot) dot.className = "dot cyan";
        if (statusText) statusText.innerText = "โหมดจำลอง (Demo)";

        startDemoSimulation();
        showToast("เปิดโหมดจำลองข้อมูล (Demo Mode) สำเร็จ", "info");
    } else {
        if (indicator) indicator.style.display = "none";
        if (demoBtnText) demoBtnText.innerText = "โหมดจำลอง (Demo)";
        if (demoBtn) demoBtn.classList.remove("active");
        stopDemoSimulation();
        connectMQTT();
        showToast("ปิดโหมดจำลอง เชื่อมต่อฮาร์ดแวร์จริง", "info");
    }
}

function startDemoSimulation() {
    stopDemoSimulation();
    initChart();
    
    // Initial display
    applyTelemetryData({
        ...simulatedData,
        time: new Date().toLocaleTimeString('th-TH')
    });

    demoInterval = setInterval(() => {
        // Natural fluctuations
        const pmDelta = (Math.random() - 0.48) * 3;
        simulatedData.pm25 = Math.max(8, Math.min(130, Math.round(simulatedData.pm25 + pmDelta)));
        
        simulatedData.temp = Math.round((25.5 + Math.sin(Date.now() / 60000) * 1.5) * 10) / 10;
        simulatedData.hum = Math.round(55 + Math.cos(Date.now() / 45000) * 4);
        simulatedData.mq135 = Math.round(130 + Math.random() * 20);

        // Adjust fan speed based on mode
        if (simulatedData.c_mode === "AUTO") {
            if (simulatedData.pm25 >= simulatedData.cfg.p_h) {
                simulatedData.f_mode = "HIGH";
            } else if (simulatedData.pm25 >= simulatedData.cfg.p_m) {
                simulatedData.f_mode = "MED";
            } else {
                simulatedData.f_mode = "LOW";
            }
        } else {
            simulatedData.f_mode = simulatedData.c_mode;
        }

        applyTelemetryData({
            ...simulatedData,
            time: new Date().toLocaleTimeString('th-TH')
        });
    }, 2000);
}

function stopDemoSimulation() {
    if (demoInterval) {
        clearInterval(demoInterval);
        demoInterval = null;
    }
}

function simulateControl(mode) {
    simulatedData.c_mode = mode;
    if (mode === "OFF") {
        simulatedData.f_mode = "OFF";
    } else if (mode === "HIGH") {
        simulatedData.f_mode = "HIGH";
        simulatedData.pm25 = Math.max(8, simulatedData.pm25 - 6);
    } else if (mode === "MED") {
        simulatedData.f_mode = "MED";
        simulatedData.pm25 = Math.max(12, simulatedData.pm25 - 3);
    } else if (mode === "LOW") {
        simulatedData.f_mode = "LOW";
    } else if (mode === "NIGHT") {
        simulatedData.f_mode = "LOW";
        simulatedData.q_timer = "22:00 - 06:00";
    } else if (mode === "AUTO") {
        simulatedData.f_mode = "MED";
    }

    applyTelemetryData({
        ...simulatedData,
        time: new Date().toLocaleTimeString('th-TH')
    });
}

// ================= SERVICE WORKER REGISTRATION =================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => {
            console.log('SW registration note:', err);
        });
    });
}

// ================= BOOTSTRAP INITIALIZATION =================
window.addEventListener("DOMContentLoaded", () => {
    initTheme();
    populateWebSettingsInputs();
    initChart();
    renderAlerts();
    connectMQTT();

    // Default clock tick while waiting for hardware
    setInterval(() => {
        const timeEl = document.getElementById("esp-time");
        if (timeEl && (timeEl.innerText === "--:--:--" || demoModeActive)) {
            timeEl.innerText = new Date().toLocaleTimeString('th-TH');
        }
    }, 1000);
});
