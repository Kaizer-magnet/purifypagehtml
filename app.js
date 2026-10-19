const broker = "o1c1f1d1.ala.asia-southeast1.emqxsl.com";
const port = 8084;
const clientId = "vercel_app_" + Math.random().toString(16).substr(2, 8);
const topicData = "air_purifier/data";
const topicCmd = "air_purifier/cmd";

let chart = null;
let telemetryHistory = JSON.parse(localStorage.getItem("telemetryHistory") || "[]");
let alertLogs = JSON.parse(localStorage.getItem("alertLogs") || "[]");

// ================= THEME SWITCHER LOGIC =================
function initTheme() {
    const savedTheme = localStorage.getItem("appTheme") || "dark";
    if (savedTheme === "light") {
        document.body.classList.add("light-theme");
        document.getElementById("theme-icon").innerText = "☀️";
        document.getElementById("theme-text").innerText = "Light Mode";
    }
}
initTheme();

function toggleTheme() {
    document.body.classList.toggle("light-theme");
    const isLight = document.body.classList.contains("light-theme");
    localStorage.setItem("appTheme", isLight ? "light" : "dark");
    
    document.getElementById("theme-icon").innerText = isLight ? "☀️" : "🌙";
    document.getElementById("theme-text").innerText = isLight ? "Light Mode" : "Dark Mode";
}

// ================= MQTT ENGINE =================
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
        initChart();
        renderAlerts();
    },
    onFailure: () => {
        document.getElementById("mqtt-dot").className = "dot red";
        document.getElementById("mqtt-status-text").innerText = "Failed";
    }
});

function onConnectionLost() {
    document.getElementById("mqtt-dot").className = "dot red";
    document.getElementById("mqtt-status-text").innerText = "Disconnected";
    setTimeout(() => location.reload(), 5000);
}

// ================= TELEMETRY ENGINE =================
function onMessageArrived(msg) {
    try {
        const data = JSON.parse(msg.payloadString);
        
        document.getElementById("esp-time").innerText = data.time || "--:--:--";
        const pmVal = data.pm25 !== null ? data.pm25 : "--";
        document.getElementById("pm25-val").innerText = pmVal;
        
        const ring = document.getElementById("pm25-ring");
        const stTxt = document.getElementById("pm25-status");
        if (data.st_color) ring.style.borderColor = data.st_color;
        if (data.st_text) {
            stTxt.innerText = "Quality: " + data.st_text;
            stTxt.style.color = data.st_color;
        }

        document.getElementById("temp-val").innerText = data.temp !== null ? data.temp + "°C" : "--°C";
        document.getElementById("hum-val").innerText = data.hum !== null ? data.hum + "%" : "--%";
        document.getElementById("mq135-val").innerText = data.mq135 !== null ? data.mq135 : "--";

        document.getElementById("fan-speed").innerText = data.f_mode || "--";
        document.getElementById("filter-val").innerText = (data.filter_pct || 0) + "%";
        document.getElementById("timer-val").innerText = data.o_timer || "OFF";
        document.getElementById("qtimer-val").innerText = data.q_timer || "OFF";

        document.querySelectorAll(".btn-mode").forEach(btn => btn.classList.remove("active"));
        if (data.c_mode) {
            const btn = document.getElementById("btn-" + data.c_mode);
            if (btn) btn.classList.add("active");
        }

        if (data.pm25 > 50) addAlert("HAZARDOUS PM2.5 Level Detected! (" + data.pm25 + " µg/m³)", "danger");
        if (data.mq135 > 600) addAlert("High Gas/VOCs Concentration Detected! (Raw: " + data.mq135 + ")", "warning");

        if (data.pm25 !== null) {
            const record = { timestamp: new Date().toLocaleTimeString(), pm25: data.pm25, mq135: data.mq135, temp: data.temp, hum: data.hum };
            telemetryHistory.push(record);
            if (telemetryHistory.length > 30) telemetryHistory.shift();
            localStorage.setItem("telemetryHistory", JSON.stringify(telemetryHistory));
            updateChart(record);
        }

    } catch (e) { console.error(e); }
}

// ================= NAVIGATION & CHART =================
function switchTab(tab) {
    document.querySelectorAll(".nav-menu li").forEach(li => li.classList.remove("active"));
    document.querySelectorAll(".tab-view").forEach(v => v.classList.remove("active"));
    
    if (tab === 'dashboard') {
        document.querySelectorAll(".nav-menu li")[0].classList.add("active");
        document.getElementById("view-dashboard").classList.add("active");
        document.getElementById("page-title").innerText = "Air Quality Dashboard";
    } else if (tab === 'alerts') {
        document.querySelectorAll(".nav-menu li")[1].classList.add("active");
        document.getElementById("view-alerts").classList.add("active");
        document.getElementById("page-title").innerText = "Hazard Incident Logs";
    } else {
        document.querySelectorAll(".nav-menu li")[2].classList.add("active");
        document.getElementById("view-settings").classList.add("active");
        document.getElementById("page-title").innerText = "System & Connectivity Settings";
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
                { label: 'MQ135 Gas', data: telemetryHistory.map(d => d.mq135), borderColor: '#f59e0b', tension: 0.3 }
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
    if (chart.data.labels.length > 30) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
        chart.data.datasets[1].data.shift();
    }
    chart.update();
}

// ================= ALERTS, TIMER & SETTINGS =================
function addAlert(msg, type) {
    const time = new Date().toLocaleTimeString();
    if (alertLogs.length > 0 && alertLogs[0].msg === msg) return;
    alertLogs.unshift({ time, msg, type });
    if (alertLogs.length > 20) alertLogs.pop();
    localStorage.setItem("alertLogs", JSON.stringify(alertLogs));
    renderAlerts();
}

function renderAlerts() {
    const list = document.getElementById("alert-list");
    document.getElementById("alert-badge").innerText = alertLogs.length;
    list.innerHTML = alertLogs.length === 0 ? "<p style='color:var(--text-muted);'>No hazards logged yet.</p>" : "";
    
    alertLogs.forEach(a => {
        const li = document.createElement("li");
        li.className = "alert-item " + (a.type === 'warning' ? 'warning' : '');
        li.innerHTML = `<div><strong>${a.msg}</strong><br><small style="color:var(--text-muted);">${a.time}</small></div><span>⚠️</span>`;
        list.appendChild(li);
    });
}

function clearAlerts() { alertLogs = []; localStorage.removeItem("alertLogs"); renderAlerts(); }

function sendControl(mode) {
    if (client.isConnected()) {
        const msg = new Paho.MQTT.Message(JSON.stringify({ mode: mode }));
        msg.destinationName = topicCmd;
        client.send(msg);
    }
}

function setTimer(hours) {
    if (client.isConnected()) {
        const msg = new Paho.MQTT.Message(JSON.stringify({ timer: hours }));
        msg.destinationName = topicCmd;
        client.send(msg);
        document.getElementById("timer-val").innerText = hours > 0 ? hours + " Hours Set" : "OFF";
    }
}

function resetFilter() { if (confirm("Reset Filter Lifespan?")) sendControl("RESET_FILTER"); }

function saveHardwareSettings(e) {
    e.preventDefault();
    const payload = {
        sys_config: {
            pm_med: document.getElementById("cfg-pm-med").value,
            pm_high: document.getElementById("cfg-pm-high").value,
            mq_med: document.getElementById("cfg-mq-med").value,
            mq_high: document.getElementById("cfg-mq-high").value,
            night_start: document.getElementById("cfg-night-start").value,
            night_end: document.getElementById("cfg-night-end").value
        }
    };
    const msg = new Paho.MQTT.Message(JSON.stringify(payload));
    msg.destinationName = topicCmd;
    client.send(msg);
    alert("Hardware Thresholds Pushed!");
}

function saveCloudSettings(e) {
    e.preventDefault();
    if (confirm("Changing Wi-Fi/Cloud will reboot ESP32. Continue?")) {
        const payload = {
            wifi_reconfig: {
                ssid: document.getElementById("cfg-wifi-ssid").value,
                pass: document.getElementById("cfg-wifi-pass").value,
                m_host: document.getElementById("cfg-mqtt-host").value,
                m_port: document.getElementById("cfg-mqtt-port").value,
                m_user: document.getElementById("cfg-mqtt-user").value
            }
        };
        const msg = new Paho.MQTT.Message(JSON.stringify(payload));
        msg.destinationName = topicCmd;
        client.send(msg);
        alert("Provisioning Command Sent! ESP32 is rebooting...");
    }
}

function exportToCSV() {
    if (!telemetryHistory.length) return alert("No history!");
    let csv = "Timestamp,PM25,MQ135,Temp,Humidity\n";
    telemetryHistory.forEach(r => csv += `${r.timestamp},${r.pm25},${r.mq135},${r.temp},${r.hum}\n`);
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = window.URL.createObjectURL(blob);
    a.download = `Purifier_Telemetry.csv`;
    a.click();
}

function clearChartHistory() { telemetryHistory = []; localStorage.removeItem("telemetryHistory"); if (chart) { chart.data.labels = []; chart.data.datasets[0].data = []; chart.update(); } }
