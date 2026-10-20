# 🍃 AuraFlow OS - Smart Air Purifier Control System

ระบบควบคุมและติดตามคุณภาพอากาศอัจฉริยะ (Smart Air Purifier) พัฒนาด้วยบอร์ดไมโครคอนโทรลเลอร์ ESP32 เชื่อมต่อระบบ Cloud Dashboard ผ่านโปรโตคอล MQTT พร้อม UI ดีไซน์ทันสมัย ใช้งานง่าย และรองรับทั้งบนคอมพิวเตอร์และมือถือแบบ PWA

---

## ✨ Features (คุณสมบัติเด่น)

### 🖥️ Web Dashboard (Frontend)
- **Air Quality Gauge:** หน้าปัด SVG Radial แสดงค่าความเข้มข้นฝุ่น PM2.5 (µg/m³) พร้อมการประเมินคุณภาพอากาศตามมาตรฐาน (ดีเยี่ยม, ดี, ปานกลาง, เริ่มมีผล, อันตราย)
- **Real-time Telemetry:** แสดงอุณหภูมิ (°C), ความชื้นสัมพัทธ์ (%), และก๊าซ/VOCs (MQ135) แบบเรียลไทม์ พร้อมแถบระดับความเหมาะสม
- **Dynamic Fan Speed Animation:** ภาพจำลองใบพัดหมุนตามระดับรีเลย์จริงของฮาร์ดแวร์ (OFF, LOW, MED, TURBO)
- **Filter Health & Estimations:** ระบบประเมินอายุไส้กรอง HEPA (%) และคำนวณวันใช้งานคงเหลือโดยประมาณ พร้อมปุ่มรีเซ็ต
- **Operation Mode Control:** ควบคุมโหมดทำงานได้ทันที (AUTO, NIGHT, LOW, MED, TURBO, POWER OFF)
- **Quick Preset Timer:** ปุ่มตั้งเวลาปิดเครื่องอัตโนมัติ (+1h, +2h, +4h, +8h, ปิด)
- **Hazard Incident Logs:** บันทึกประวัติมลพิษและอันตรายอัตโนมัติเมื่อฝุ่นหรือก๊าซพิษเกินเกณฑ์
- **Real-time Trends Chart:** กราฟติดตามแนวโน้มฝุ่นและก๊าซย้อนหลัง 30 จุดข้อมูลล่าสุด
- **Demo Mode (โหมดจำลอง):** สามารถเปิดโหมดจำลองข้อมูลเซ็นเซอร์เพื่อทดสอบและนำเสนอผลงานได้ทันที แม้ไม่มีบอร์ดต่ออยู่
- **Config Auto-Sync & Provisioning:** ดึงค่าการตั้งค่าจาก ESP32 อัตโนมัติ และสั่งเปลี่ยน Wi-Fi / Broker ได้ผ่านหน้าเว็บ
- **Web MQTT Settings:** ตั้งค่าและปรับเปลี่ยน WebSocket Broker URL และ Credentials ในเบราว์เซอร์ได้โดยตรง
- **Responsive & PWA:** มีแถบเมนูด้านล่าง (Bottom Navigation) เมื่อเปิดผ่านสมาร์ตโฟน พร้อมสลับ Dark/Light Theme อัตโนมัติ

### 🔌 Hardware (ESP32 MicroPython)
- **Captive Portal:** โหมด AP (`192.168.4.1`) สำหรับกำหนดค่า Wi-Fi และ Broker ครั้งแรก
- **Multi-step Auto Fan:** ปรับสปีดพัดลมตามระดับฝุ่น PM2.5 และก๊าซพิษอัตโนมัติ
- **Night / Quiet Schedule:** กำหนดช่วงเวลาปิดไฟหน้าจอและล็อกพัดลมเงียบ
- **Watchdog Timer (WDT):** ระบบป้องกันบอร์ดค้าง ทำงานเสถียรตลอด 24 ชั่วโมง
- **Persistent Storage:** บันทึกการตั้งค่าลงแฟลช `config.json`

---

## 🛠️ Technology Stack
* **Hardware:** ESP32 Microcontroller
* **Firmware:** MicroPython
* **Sensors:** PMS7003 (PM2.5 Sensor), MQ135 (Gas & Air Quality), DHT11 / DHT22 (Temp & Humidity)
* **Frontend:** HTML5, Modern CSS3 (Variables, Flexbox, CSS Grid), Vanilla JavaScript (ES6+), Chart.js
* **Cloud & Communication:** Paho MQTT (WebSocket Secure WSS), EMQX Cloud Broker

---

## 📡 MQTT Topics & Protocol

### Topic Data: `air_purifier/data` (ESP32 ➡️ Dashboard)
```json
{
  "pm25": 14,
  "temp": 26.5,
  "hum": 58,
  "mq135": 135,
  "f_mode": "LOW",
  "c_mode": "AUTO",
  "filter_pct": 98,
  "o_timer": "OFF",
  "q_timer": "OFF",
  "time": "18:30:00",
  "cfg": { "p_m": 35, "p_h": 50, "m_m": 400, "m_h": 600, "n_s": 22, "n_e": 6 }
}
```

### Topic Command: `air_purifier/cmd` (Dashboard ➡️ ESP32)
* **สั่งเปลี่ยนโหมด:**
  ```json
  {"mode": "AUTO"}
  ```
  *(ค่าโหมดที่รองรับ: `"AUTO"`, `"NIGHT"`, `"LOW"`, `"MED"`, `"HIGH"`, `"OFF"`, `"RESET_FILTER"`)*

* **ตั้งเวลาปิดเครื่อง (ชั่วโมง):**
  ```json
  {"timer": 2}
  ```

* **อัปเดตเกณฑ์เซ็นเซอร์:**
  ```json
  {
    "sys_config": {
      "pm_med": 35,
      "pm_high": 50,
      "mq_med": 400,
      "mq_high": 600,
      "night_start": 22,
      "night_end": 6
    }
  }
  ```

* **สั่งเปลี่ยน Wi-Fi / Broker ใหม่ (Provisioning):**
  ```json
  {
    "wifi_reconfig": {
      "ssid": "MyHome_WiFi",
      "pass": "password123",
      "m_host": "your_broker_url",
      "m_port": 8883,
      "m_user": "username"
    }
  }
  ```

---

## 🚀 การติดตั้งและใช้งาน Web Dashboard

1. **เปิดด้วย Live Server หรือเบราว์เซอร์:**
   - สามารถดับเบิลคลิกไฟล์ `index.html` หรือเปิดผ่าน VS Code Live Server ได้ทันที
   - หากต้องการทดสอบ UI ทันทีโดยยังไม่ได้ต่อบอร์ด ESP32 ให้กดปุ่ม **"โหมดจำลอง (Demo)"** ที่แถบเมนูด้านซ้าย

2. **ปรับแต่งการเชื่อมต่อ MQTT:**
   - ไปที่แท็บ **ตั้งค่า (Settings)** ➡️ **ตั้งค่าการเชื่อมต่อเบราว์เซอร์ (Web MQTT Client)**
   - กรอก WebSocket Host, Port (เช่น `8084`), Username และ Password แล้วกด **"บันทึกและเชื่อมต่อใหม่"**
