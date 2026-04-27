// ── script.js ──────────────────────────────────────────
const API = "http://127.0.0.1:8000";

// ── THEME TOGGLE ───────────────────────────────────────
const themeToggle = document.getElementById("themeToggle");
const html = document.documentElement;

themeToggle.addEventListener("click", () => {
    const isDark = html.getAttribute("data-theme") === "dark";
    html.setAttribute("data-theme", isDark ? "light" : "dark");
    themeToggle.innerHTML = isDark
        ? '<i class="fa-solid fa-moon"></i>'
        : '<i class="fa-solid fa-sun"></i>';
    if (skyChartInstance) renderChart(lastForecastData);
    if (hourlyChartInstance) renderHourlyChart(lastForecastData);
});

// ── TAB SWITCHER ───────────────────────────────────────
document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById(`tab${btn.dataset.tab.charAt(0).toUpperCase() + btn.dataset.tab.slice(1)}`).classList.add("active");
    });
});

// ── LOAD CITIES ────────────────────────────────────────
async function loadCities() {
    try {
        const res = await fetch(`${API}/cities`);
        const data = await res.json();
        const sel = document.getElementById("citySelect");
        data.cities.forEach(city => {
            const opt = document.createElement("option");
            opt.value = city;
            opt.textContent = city;
            sel.appendChild(opt);
        });
    } catch (e) {
        console.error("Backend belum nyala:", e);
    }
}

// ── WEATHER CODE HELPER ────────────────────────────────
function getConditionFromData(cloudcover, precipitation) {
    if (precipitation > 5) return "thunderstorm";
    if (precipitation > 0) return "rain";
    if (cloudcover > 70) return "cloudy";
    return "clear";
}

function getWeatherIcon(cloudcover, precipitation) {
    if (precipitation > 5) return { icon: "⛈️", label: "Badai Petir" };
    if (precipitation > 0) return { icon: "🌧️", label: "Hujan" };
    if (cloudcover > 70) return { icon: "☁️", label: "Mendung" };
    if (cloudcover > 30) return { icon: "⛅", label: "Berawan" };
    return { icon: "☀️", label: "Cerah" };
}

// ── CACHE ──────────────────────────────────────────────
let lastForecastData = [];
let skyChartInstance = null;
let hourlyChartInstance = null;

// ── MAIN SEARCH ────────────────────────────────────────
document.getElementById("searchBtn").addEventListener("click", async () => {
    const city = document.getElementById("citySelect").value;
    if (!city) return alert("Pilih kota dulu!");

    showLoading(true);
    document.getElementById("dashboard").classList.add("hidden");

    try {
        const [forecastRes, bestRes] = await Promise.all([
            fetch(`${API}/forecast/${encodeURIComponent(city)}`),
            fetch(`${API}/best-hours/${encodeURIComponent(city)}`)
        ]);

        const forecastData = await forecastRes.json();
        const bestData = await bestRes.json();
        lastForecastData = forecastData.data;

        renderDashboard(forecastData.data, bestData.best_hours, city);

        document.getElementById("dashboard").classList.remove("hidden");
        document.getElementById("dashboard").scrollIntoView({ behavior: "smooth" });
    } catch (e) {
        alert("Gagal mengambil data. Pastikan backend nyala!");
        console.error(e);
    } finally {
        showLoading(false);
    }
});

// ── RENDER ALL ─────────────────────────────────────────
function renderDashboard(data, bestHours, city) {
    console.log("Moon phases:", data.filter((_, i) => i % 24 === 0).map(d => ({ time: d.time, moon: d.moon_phase })));
    // City header
    document.getElementById("cityTitle").innerHTML =
        `<i class="fa-solid fa-location-dot"></i> ${city}`;
    document.getElementById("lastUpdate").textContent =
        "Diperbarui: " + new Date().toLocaleTimeString("id-ID");

    renderWeatherCards(data);
    renderHourlyChart(data);
    renderWeekForecast(data);
    renderAstroCards(data);
    renderChart(data);
    renderBestHours(bestHours);
    renderAstronomy();
    updateConditionBadge(data);
    renderMoonSelector(data);
}

// ── CONDITION BADGE + BACKGROUND ──────────────────────
function updateConditionBadge(data) {
    const now = new Date();
    const current = data.find(d => new Date(d.time) >= now) || data[0];
    const hour = now.getHours();

    // Label & icon dari model klasifikasi, bukan rumus lagi
    document.getElementById("conditionIcon").textContent = current.weather_icon;
    document.getElementById("conditionText").textContent = current.weather_label;
    document.getElementById("conditionBadge").classList.remove("hidden");

    // Map label ke condition buat background Three.js
    const condMap = { "Cerah": "clear", "Berawan": "cloudy", "Hujan": "rain", "Badai": "thunderstorm" };
    if (window.updateBackground) window.updateBackground(hour, condMap[current.weather_label] || "clear");
}

// ── WEATHER CARDS ──────────────────────────────────────
function renderWeatherCards(data) {
    const now = new Date();
    const current = data.find(d => new Date(d.time) >= now) || data[0];

    // Suhu dari model, bukan estimasi rumus lagi
    document.getElementById("tempVal").textContent = current.temperature + "°C";
    document.getElementById("tempFeel").textContent = `Terasa seperti ${(current.temperature - 2).toFixed(1)}°C`;
    document.getElementById("humidVal").textContent = current.humidity + "%";
    document.getElementById("windVal").textContent = current.windspeed.toFixed(1) + " km/h";
    document.getElementById("rainVal").textContent = current.precipitation.toFixed(1) + " mm";
}

// ── HOURLY CHART ───────────────────────────────────────
function renderHourlyChart(data) {
    const now = new Date();
    const today = data.filter(d => {
        const t = new Date(d.time);
        return t.toDateString() === now.toDateString();
    });

    const labels = today.map(d =>
        new Date(d.time).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
    );
    const clouds = today.map(d => d.cloudcover);
    const rains = today.map(d => d.precipitation);

    if (hourlyChartInstance) hourlyChartInstance.destroy();

    const isDark = html.getAttribute("data-theme") === "dark";
    const gridColor = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
    const textColor = isDark ? "#8b949e" : "#6b7280";

    const ctx = document.getElementById("hourlyChart").getContext("2d");
    hourlyChartInstance = new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [
                {
                    label: "Cloud Cover (%)",
                    data: clouds,
                    backgroundColor: "rgba(148,163,184,0.5)",
                    borderColor: "rgba(148,163,184,0.8)",
                    borderWidth: 1,
                    borderRadius: 4,
                    yAxisID: "yCloud",
                },
                {
                    label: "Hujan (mm)",
                    data: rains,
                    backgroundColor: "rgba(96,165,250,0.7)",
                    borderColor: "rgba(96,165,250,1)",
                    borderWidth: 1,
                    borderRadius: 4,
                    type: "line",
                    yAxisID: "yRain",
                    tension: 0.4,
                    pointRadius: 3,
                }
            ]
        },
        options: {
            responsive: true,
            interaction: { mode: "index", intersect: false },
            plugins: { legend: { labels: { color: textColor, font: { size: 11 } } } },
            scales: {
                x: {
                    ticks: { color: textColor, font: { size: 10 }, maxRotation: 45 },
                    grid: { color: gridColor }
                },
                yCloud: {
                    position: "left",
                    min: 0, max: 100,
                    ticks: { color: textColor, font: { size: 10 } },
                    grid: { color: gridColor },
                    title: { display: true, text: "Cloud %", color: textColor, font: { size: 10 } }
                },
                yRain: {
                    position: "right",
                    min: 0,
                    ticks: { color: "#60a5fa", font: { size: 10 } },
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: "Rain mm", color: "#60a5fa", font: { size: 10 } }
                }
            }
        }
    });
}

// ── 7 DAY FORECAST ─────────────────────────────────────
function renderWeekForecast(data) {
    const days = {};
    data.forEach(d => {
        const date = new Date(d.time).toDateString();
        if (!days[date]) days[date] = { icons: [], labels: [], temps: [], rains: [] };
        days[date].icons.push(d.weather_icon);
        days[date].labels.push(d.weather_label);
        days[date].temps.push(d.temperature);
        days[date].rains.push(d.precipitation);
    });

    const el = document.getElementById("weekForecast");
    el.innerHTML = "";

    Object.entries(days).slice(0, 7).forEach(([dateStr, vals]) => {
        const date = new Date(dateStr);
        const dayName = date.toLocaleDateString("id-ID", { weekday: "short" });

        // Ambil label yang paling sering muncul hari itu
        const modeIcon = vals.icons.sort((a, b) =>
            vals.icons.filter(v => v === a).length - vals.icons.filter(v => v === b).length
        ).pop();

        const avgTemp = (vals.temps.reduce((a, b) => a + b, 0) / vals.temps.length).toFixed(1);
        const totalRain = vals.rains.reduce((a, b) => a + b, 0).toFixed(1);

        el.innerHTML += `
      <div class="week-day">
        <div class="wd-name">${dayName}</div>
        <div class="wd-icon">${modeIcon}</div>
        <div class="wd-temp">${avgTemp}°C</div>
        <div class="wd-rain">${totalRain}mm</div>
      </div>`;
    });
}

// ── ASTRO CARDS ────────────────────────────────────────
function renderAstroCards(data) {
    const moon = data[0].moon_phase;
    const now = new Date();
    const current = data.find(d => new Date(d.time) >= now) || data[0];

    document.getElementById("moonPhaseVal").textContent = moon + "%";
    document.getElementById("moonPhaseName").textContent = getMoonPhaseName(moon);
    document.getElementById("cloudVal").textContent = current.cloudcover + "%";

    const tonight = data.filter(d => {
        const t = new Date(d.time);
        return t >= now && (t.getHours() >= 18 || t.getHours() <= 5);
    }).sort((a, b) => b.sky_score - a.sky_score);

    if (tonight.length > 0) {
        const best = tonight[0];
        document.getElementById("bestHourVal").textContent =
            new Date(best.time).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
        document.getElementById("bestHourScore").textContent =
            `Sky Score ${best.sky_score.toFixed(1)}`;
    } else {
        document.getElementById("bestHourVal").textContent = "N/A";
        document.getElementById("bestHourScore").textContent = "Tidak ada data malam ini";
    }
}

// ── SKY SCORE CHART ────────────────────────────────────
function renderChart(data) {
    const filtered = data.filter((_, i) => i % 3 === 0);
    const labels = filtered.map(d => {
        const t = new Date(d.time);
        return t.toLocaleDateString("id-ID", { weekday: "short", day: "numeric" })
            + " " + t.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    });
    const scores = filtered.map(d => d.sky_score);

    if (skyChartInstance) skyChartInstance.destroy();

    const isDark = html.getAttribute("data-theme") === "dark";
    const gridColor = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
    const textColor = isDark ? "#8b949e" : "#6b7280";

    const ctx = document.getElementById("skyChart").getContext("2d");
    skyChartInstance = new Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [{
                label: "Sky Score",
                data: scores,
                borderColor: "#7c3aed",
                backgroundColor: "rgba(124,58,237,0.12)",
                borderWidth: 2.5,
                pointRadius: 2,
                pointHoverRadius: 5,
                fill: true,
                tension: 0.4,
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => ` Sky Score: ${ctx.parsed.y.toFixed(1)}`
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: textColor, maxRotation: 45, font: { size: 10 } },
                    grid: { color: gridColor }
                },
                y: {
                    min: 0, max: 100,
                    ticks: { color: textColor },
                    grid: { color: gridColor }
                }
            }
        }
    });
}

// ── BEST HOURS ─────────────────────────────────────────
function renderBestHours(bestHours) {
    const el = document.getElementById("bestHoursList");
    el.innerHTML = "";

    if (!bestHours || bestHours.length === 0) {
        el.innerHTML = `<p style="color:var(--text-sub);padding:1rem 0">Tidak ada jam observasi bagus minggu ini 😔</p>`;
        return;
    }

    bestHours.forEach((h, i) => {
        const t = new Date(h.time);
        const label = t.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short" })
            + ", " + t.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

        el.innerHTML += `
      <div class="best-hour-item">
        <div class="best-hour-time">
          <span style="color:var(--accent2);margin-right:6px">#${i + 1}</span>${label}
        </div>
        <div class="score-bar-wrap">
          <div class="score-bar" style="width:${h.sky_score}%"></div>
        </div>
        <div class="best-hour-score">${h.sky_score.toFixed(1)}</div>
      </div>`;
    });
}

// ── MOON VISUAL ────────────────────────────────────────
let moonDataCache = [];

function renderMoonSelector(data) {
    // Ambil 1 data per hari
    const daily = data.filter((_, i) => i % 24 === 0).slice(0, 7);
    moonDataCache = daily;

    const el = document.getElementById("moonDaySelector");
    el.innerHTML = "";

    daily.forEach((d, i) => {
        const date = new Date(d.time);
        const label = date.toLocaleDateString("id-ID", { weekday: "short", day: "numeric" });
        const btn = document.createElement("button");
        btn.className = "moon-day-btn" + (i === 0 ? " active" : "");
        btn.textContent = label;
        btn.addEventListener("click", () => {
            document.querySelectorAll(".moon-day-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            renderMoon(d.moon_phase);
        });
        el.appendChild(btn);
    });

    // Render hari pertama
    renderMoon(daily[0].moon_phase);
}

function renderMoon(phase) {
    document.getElementById("moonIllum").textContent = phase.toFixed(1) + "%";
    document.getElementById("moonFaseName").textContent = getMoonPhaseName(phase);
    document.getElementById("moonEffect").textContent =
        phase > 70 ? "⚠️ Mengganggu observasi" :
            phase > 40 ? "⚡ Sedikit mengganggu" : "✅ Kondisi baik";

    const canvas = document.getElementById("moonCanvas");
    const ctx = canvas.getContext("2d");
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const r = 50;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1a2e";
    ctx.fill();

    const illum = phase / 100;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = "#f5f0e8";
    ctx.beginPath();

    const d = r * (1 - 2 * illum);

    ctx.moveTo(cx + d, cy - r);
    ctx.quadraticCurveTo(cx - d, cy, cx + d, cy + r);
    ctx.lineTo(cx + r, cy + r);
    ctx.lineTo(cx + r, cy - r);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    const grd = ctx.createRadialGradient(cx, cy, r * 0.7, cx, cy, r * 1.4);
    grd.addColorStop(0, "rgba(245,240,232,0)");
    grd.addColorStop(1, `rgba(245,240,232,${illum * 0.15})`);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.4, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.stroke();
}


// ── ASTRONOMY EVENTS ───────────────────────────────────
function renderAstronomy() {
    const events = [
        {
            name: "Hujan Meteor Lyrids",
            date: "21–22 April 2026",
            desc: "Puncak hujan meteor dengan rata-rata 18 meteor per jam. Cahaya bulan sabit tipis akan memberikan kondisi pengamatan yang ideal.",
            icon: "fa-meteor"
        },
        {
            name: "Hujan Meteor Eta Aquariids",
            date: "5–6 Mei 2026",
            desc: "Berasal dari debu Komet Halley. Di Indonesia, ini salah satu yang terbaik dengan laju hingga 50 meteor per jam.",
            icon: "fa-meteor"
        },
        {
            name: "Gerhana Bulan Total",
            date: "26 Juni 2026",
            desc: "Terlihat di seluruh Indonesia. Fase totalitas akan membuat Bulan berwarna merah darah (Blood Moon).",
            icon: "fa-moon"
        },
        {
            name: "Oposisi Saturnus",
            date: "21 Juli 2026",
            desc: "Planet bercincin ini berada di posisi terdekat dengan Bumi. Waktu terbaik untuk melihat cincinnya melalui teleskop.",
            icon: "fa-ring"
        },
        {
            name: "Gerhana Matahari Total",
            date: "12 Agustus 2026",
            desc: "Melintasi Arktik, Greenland, Islandia, dan Spanyol. Di Indonesia tidak terlihat, namun merupakan peristiwa besar global.",
            icon: "fa-sun"
        },
        {
            name: "Hujan Meteor Perseids",
            date: "12–13 Agustus 2026",
            desc: "Raja hujan meteor musim panas. Hingga 100 meteor per jam. Sangat jelas terlihat di langit Indonesia yang cerah.",
            icon: "fa-meteor"
        },
        {
            name: "Gerhana Bulan Penumbra",
            date: "28 Agustus 2026",
            desc: "Bulan akan melewati bayangan luar Bumi, menciptakan redup halus yang bisa diamati dari wilayah Indonesia.",
            icon: "fa-moon"
        },
        {
            name: "Oposisi Neptunus",
            date: "16 September 2026",
            desc: "Planet biru raksasa ini akan berada pada titik terdekatnya. Memerlukan teleskop kuat untuk melihatnya sebagai titik biru kecil.",
            icon: "fa-earth-asia"
        },
        {
            name: "Hujan Meteor Orionids",
            date: "21–22 Oktober 2026",
            desc: "Meteor yang dikenal sangat cepat dan terang, berasal dari sisa-sisa Komet Halley.",
            icon: "fa-meteor"
        },
        {
            name: "Hujan Meteor Geminids",
            date: "13–14 Desember 2026",
            desc: "Penutup tahun yang luar biasa. Hingga 120 meteor per jam dengan berbagai warna (kuning, putih, biru).",
            icon: "fa-meteor"
        }
    ];

    const el = document.getElementById("astronomyList");
    if (!el) return; // Guard clause jika elemen tidak ditemukan

    el.innerHTML = "";
    events.forEach(e => {
        el.innerHTML += `
      <div class="astro-item">
        <div class="astro-name"><i class="fa-solid ${e.icon}" style="color:var(--accent2);margin-right:6px"></i>${e.name}</div>
        <div class="astro-date"><i class="fa-regular fa-calendar" style="margin-right:4px"></i>${e.date}</div>
        <div class="astro-desc">${e.desc}</div>
      </div>`;
    });
}

// ── HELPERS ────────────────────────────────────────────
function getMoonPhaseName(illum) {
    if (illum >= 99) return "🌕 Full Moon";
    if (illum >= 75) return "🌖 Waning Gibbous";
    if (illum >= 50) return "🌗 Quartal";
    if (illum >= 25) return "🌘 Crescent";
    if (illum >= 10) return "🌒 Waning Crescent";
    return "🌑 Bulan Baru";
}

function showLoading(show) {
    document.getElementById("loading").classList.toggle("hidden", !show);
}

// ── INIT ───────────────────────────────────────────────
loadCities();


// astroweather /
// ├── backend /
// │   └── notebook.ipynb
// ├── index.html
// ├── style.css
// ├── background.js
// └── script.js