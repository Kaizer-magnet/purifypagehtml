// =====================================
// MQTT Cloud Connection Settings
// =====================================
const broker = "o1c1f1d1.ala.asia-southeast1.emqxsl.com";
const port = 8084;
const clientId = "vercel_app_" + Math.random().toString(16).substr(2, 8);
const topicData = "air_purifier/data";
const topicCmd = "air_purifier/cmd";

let chart = null;
let telemetryHistory = JSON.parse(localStorage.getItem("telemetryHistory") || "[]");

const client = new Paho.MQTT.Client(broker, port, clientId);
client.onConnectionLost = onConnectionLost;
client.onMessageArrived = onMessageArrived;

client.connect({
    useSSL: true,
    userName: "purifier_admin",
    password: "Pass1234!",
    onSuccess: () => {
        document.getElementById("mqtt-dot").className = "dot green";
        document.getElementById("mqtt-status-text").innerText = "Online";
        client.subscribe(topicData);
    },
    onFailure: () => {
        document.getElementById("mqtt-dot").className = "dot red";
        document.getElementById("mqtt-status-text").innerText = "Failed";
    }
});

function onConnectionLost(req) {
    document.getElementById("mqtt-dot").className = "dot red";
    document.getElementById("mqtt-status-text").innerText = "Disconnected";
    setTimeout(() => location.reload(), 5000);
}

// =====================================
// Telemetry Handler & UI Render
// =====================================
function onMessageArrived(msg) {
    try {
        const data = JSON.parse(msg.payloadString);
        
        // Update ESP32 Clock
        document.getElementById("esp-time").innerText = data.time || "--:--:--";
        
        // Render PM2.5 Gauge
        const pmVal = data.pm25 !== null ? data.pm25 : "--";
        document.getElementById("pm25-val").innerText = pmVal;
        
        const ring = document.getElementById("pm25-ring");
        const stTxt = document.getElementById("pm25-status");
        if (data.st_color) ring.style.borderColor = data.st_color;
        if (data.st_text) {
            stTxt.innerText = "Quality: " + data.st_text;
            stTxt.style.color = data.st_color;
        }

        // Render Sensors
        document.getElementById("temp-val").innerText = data.temp !== null ? data.temp + "°C" : "--°C";
        document.getElementById("hum-val").innerText = data.hum !== null ? data.hum + "%" : "--%";
        document.getElementById("mq135-val").innerText = data.mq135 !== null ? data.mq135 : "--";

        // Render Status Bars
        document.getElementById("fan-speed").innerText = data.f_mode || "--";
        document.getElementById("filter-val").innerText = (data.filter_pct || 0) + "%";
        document.getElementById("timer-val").innerText = data.o_timer || "OFF";
        document.getElementById("qtimer-val").innerText = data.q_timer || "OFF";

        // Update Active Button UI
        document.querySelectorAll(".btn-mode").forEach(btn => btn.classList.remove("active"));
        if (data.c_mode) {
            const btn = document.getElementById("btn-" + data.c_mode);
            if (btn) btn.classList.add("active");
        }

        // Save to History for Chart & CSV Export
        if (data.pm25 !== null) {
            const record = {
                timestamp: new Date().toLocaleTimeString(),
                pm25: data.pm25,
                temp: data.temp,
                hum: data.hum,
                mq135: data.mq135
            };
            telemetryHistory.push(record);
            if (telemetryHistory.length > 50) telemetryHistory.shift(); // Max 50 points
            localStorage.setItem("telemetryHistory", JSON.stringify(telemetryHistory));
            updateChart(record);
        }

    } catch (e) { console.error("Data Error:", e); }
}

// =====================================
// Commands & Actions
// =====================================
function sendControl(mode) {
    if (client.isConnected()) {
        const msg = new Paho.MQTT.Message(JSON.stringify({ mode: mode }));
        msg.destinationName = topicCmd;
        client.send(msg);
    }
}

function resetFilter() {
    if (confirm("Reset Filter Lifespan back to 100%?")) sendControl("RESET_FILTER");
}

function saveSettings(e) {
    e.preventDefault();
    const payload = {
        sys_config: {
            pm_med: document.getElementById("cfg-pm-med").value,
            pm_high: document.getElementById("cfg-pm-high").value,
            mq_med: document.getElementById("cfg-mq-med").value,
            mq_high: document.getElementById("cfg-mq-high").value,
            night_start: document.getElementById("cfg-night-start").value,
            night_end: document.getElementById("cfg-night-end").value
        },
        timer: document.getElementById("cfg-timer").value || 0,
        qtimer: document.getElementById("cfg-qtimer").value || 0
    };
    
    const msg = new Paho.MQTT.Message(JSON.stringify(payload));
    msg.destinationName = topicCmd;
    client.send(msg);
    closeModal();
    alert("Settings Pushed to ESP32!");
}

// =====================================
// Navigation & Chart Engine
// =====================================
function switchTab(tab) {
    document.querySelectorAll(".nav-menu li").forEach(li => li.classList.remove("active"));
    document.querySelectorAll(".tab-view").forEach(v => v.classList.remove("active"));
    
    if (tab === 'dashboard') {
        document.querySelectorAll(".nav-menu li")[0].classList.add("active");
        document.getElementById("view-dashboard").classList.add("active");
    } else {
        document.querySelectorAll(".nav-menu li")[1].classList.add("active");
        document.getElementById("view-analytics").classList.add("active");
        initChart();
    }
}

function initChart() {
    if (chart) return;
    const ctx = document.getElementById("realtimeChart").getContext("2d");
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: telemetryHistory.map(d => d.timestamp),
            datasets: [
                { label: 'PM2.5 (µg/m³)', data: telemetryHistory.map(d => d.pm25), borderColor: '#00f0ff', tension: 0.3 },
                { label: 'MQ135 Raw', data: telemetryHistory.map(d => d.mq135), borderColor: '#f59e0b', tension: 0.3 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function updateChart(rec) {
    if (!chart) return;
    chart.data.labels.push(rec.timestamp);
    chart.data.datasets[0].data.push(rec.pm25);
    chart.data.datasets[1].data.push(rec.mq135);
    if (chart.data.labels.length > 50) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
        chart.data.datasets[1].data.shift();
    }
    chart.update();
}

function exportToCSV() {
    if (!telemetryHistory.length) return alert("No telemetry history available!");
    let csv = "Timestamp,PM25,Temperature,Humidity,MQ135\n";
    telemetryHistory.forEach(r => {
        csv += `${r.timestamp},${r.pm25},${r.temp},${r.hum},${r.mq135}\n`;
    });
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `AirPurifier_Telemetry_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
}

function openModal() { document.getElementById("settings-modal").classList.add("open"); }
function closeModal() { document.getElementById("settings-modal").classList.remove("open"); }
function clearChartHistory() { telemetryHistory = []; localStorage.removeItem("telemetryHistory"); if (chart) { chart.data.labels = []; chart.data.datasets[0].data = []; chart.update(); } }