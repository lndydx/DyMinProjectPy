// ── background.js ─────────────────────────────────────
// Three.js dynamic background: stars, clouds, rain, thunder + parallax

const bgCanvas = document.getElementById("bgCanvas");
const renderer = new THREE.WebGLRenderer({ canvas: bgCanvas, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;

// ── STATE ──────────────────────────────────────────────
let currentCondition = "clear";
let currentHour = new Date().getHours();
let mouseX = 0, mouseY = 0;
let targetX = 0, targetY = 0;

// ── GRADIENT PRESETS ───────────────────────────────────
const GRADIENTS = {
    morning_clear: "linear-gradient(180deg, #ffd059 0%, #ffdc8f 30%, #82d2f2 100%)",
    morning_cloudy: "linear-gradient(180deg, #b0bec5 0%, #cfd8dc 100%)",
    morning_rain: "linear-gradient(180deg, #546e7a 0%, #78909c 100%)",
    day_clear: "linear-gradient(180deg, #1565c0 0%, #42a5f5 60%, #90caf9 100%)",
    day_cloudy: "linear-gradient(180deg, #607d8b 0%, #90a4ae 100%)",
    day_rain: "linear-gradient(180deg, #37474f 0%, #546e7a 100%)",
    day_thunderstorm: "linear-gradient(180deg, #1a1a2e 0%, #2d3561 100%)",
    golden_clear: "linear-gradient(180deg, #4a2040 0%, #b05a3a 30%, #c4874a 60%, #2a4a7f 100%)",
    golden_cloudy: "linear-gradient(180deg, #3a2a3a 0%, #7a5a4a 60%, #4a5a6a 100%)",
    golden_rain: "linear-gradient(180deg, #2a1a3a 0%, #4a3a5a 50%, #2a3a4a 100%)",
    night_clear: "linear-gradient(180deg, #000000 0%, #0a0e1a 40%, #0d1117 100%)",
    night_cloudy: "linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)",
    night_rain: "linear-gradient(180deg, #0d0d0d 0%, #1a1a2e 100%)",
    night_thunderstorm: "linear-gradient(180deg, #000000 0%, #0d0d0d 100%)",
};

function getTimeOfDay(hour) {
    if (hour >= 5 && hour < 10) return "morning";
    if (hour >= 10 && hour < 15) return "day";
    if (hour >= 15 && hour < 18) return "golden";
    return "night";
}

function getGradientKey(hour, condition) {
    const tod = getTimeOfDay(hour);
    const key = `${tod}_${condition}`;
    return GRADIENTS[key] || GRADIENTS[`${tod}_clear`] || GRADIENTS.night_clear;
}

function updateGradient(hour, condition) {
    document.getElementById("bgGradient").style.background = getGradientKey(hour, condition);
}

// ── STARS ──────────────────────────────────────────────
let starsMesh = null;

function createStars(count = 1200) {
    if (starsMesh) { scene.remove(starsMesh); starsMesh.geometry.dispose(); }

    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 100;
        pos[i * 3 + 1] = (Math.random() - 0.5) * 100;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 50 - 10;
        sizes[i] = Math.random() * 1.5 + 0.3;
    }

    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.08,
        transparent: true,
        opacity: 0,
        sizeAttenuation: true,
    });

    starsMesh = new THREE.Points(geo, mat);
    scene.add(starsMesh);
}

function setStarOpacity(hour, condition) {
    if (!starsMesh) return;
    const tod = getTimeOfDay(hour);
    let opacity = 0;
    if (tod === "night") opacity = condition === "clear" ? 0.95 : condition === "cloudy" ? 0.2 : 0;
    if (tod === "morning") opacity = condition === "clear" ? 0.15 : 0;
    starsMesh.material.opacity = opacity;
}

// ── CLOUDS ─────────────────────────────────────────────
const cloudGroup = new THREE.Group();
scene.add(cloudGroup);
const cloudMeshes = [];

function createCloud(x, y, z, scale = 1) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.15,
    });

    const positions = [
        [0, 0, 0, 0.8], [-0.6, -0.1, 0, 0.6], [0.6, -0.1, 0, 0.6],
        [0, 0.4, 0, 0.5], [-0.3, 0.3, 0, 0.4], [0.3, 0.3, 0, 0.4],
    ];

    positions.forEach(([cx, cy, cz, r]) => {
        const geo = new THREE.SphereGeometry(r * scale, 7, 7);
        const mesh = new THREE.Mesh(geo, mat.clone());
        mesh.position.set(cx * scale, cy * scale, cz * scale);
        group.add(mesh);
    });

    group.position.set(x, y, z);
    cloudGroup.add(group);
    cloudMeshes.push({ group, speed: Math.random() * 0.002 + 0.001 });
    return group;
}

function initClouds() {
    cloudGroup.clear();
    cloudMeshes.length = 0;
    for (let i = 0; i < 8; i++) {
        createCloud(
            (Math.random() - 0.5) * 30,
            Math.random() * 3 + 1,
            Math.random() * -5 - 2,
            Math.random() * 0.8 + 0.6
        );
    }
}

function updateClouds(condition) {
    const opacity =
        condition === "thunderstorm" ? 0.55 :
            condition === "rain" ? 0.45 :
                condition === "cloudy" ? 0.35 : 0.08;

    cloudMeshes.forEach(({ group }) => {
        group.children.forEach(m => { m.material.opacity = opacity; });
        const tod = getTimeOfDay(currentHour);
        const isDark = tod === "night" || condition === "thunderstorm";
        group.children.forEach(m => {
            m.material.color.set(isDark ? 0x334155 : 0xffffff);
        });
    });
}

// ── RAIN ───────────────────────────────────────────────
let rainMesh = null;

function createRain(count = 800) {
    if (rainMesh) { scene.remove(rainMesh); rainMesh.geometry.dispose(); }

    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count);

    for (let i = 0; i < count; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 30;
        pos[i * 3 + 1] = Math.random() * 20 - 5;
        pos[i * 3 + 2] = Math.random() * -10;
        vel[i] = Math.random() * 0.08 + 0.05;
    }

    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.userData.velocities = vel;

    const mat = new THREE.PointsMaterial({
        color: 0x90caf9,
        size: 0.04,
        transparent: true,
        opacity: 0,
    });

    rainMesh = new THREE.Points(geo, mat);
    scene.add(rainMesh);
}

function setRainOpacity(condition) {
    if (!rainMesh) return;
    rainMesh.material.opacity =
        condition === "thunderstorm" ? 0.7 :
            condition === "rain" ? 0.5 : 0;
}

function animateRain() {
    if (!rainMesh || rainMesh.material.opacity === 0) return;
    const pos = rainMesh.geometry.attributes.position.array;
    const vel = rainMesh.geometry.userData.velocities;

    for (let i = 0; i < vel.length; i++) {
        pos[i * 3 + 1] -= vel[i];
        if (pos[i * 3 + 1] < -10) {
            pos[i * 3 + 1] = 10;
            pos[i * 3] = (Math.random() - 0.5) * 30;
        }
    }
    rainMesh.geometry.attributes.position.needsUpdate = true;
}

// ── THUNDER ────────────────────────────────────────────
let thunderTimer = 0;
let thunderFlash = false;

function triggerThunder() {
    if (currentCondition !== "thunderstorm") return;
    const bg = document.getElementById("bgGradient");
    bg.style.background = "linear-gradient(180deg, #e0e0e0 0%, #bdbdbd 100%)";
    setTimeout(() => {
        bg.style.background = getGradientKey(currentHour, currentCondition);
        setTimeout(() => {
            bg.style.background = "linear-gradient(180deg, #e0e0e0 0%, #bdbdbd 100%)";
            setTimeout(() => {
                bg.style.background = getGradientKey(currentHour, currentCondition);
            }, 80);
        }, 60);
    }, 80);
}

// ── AMBIENT LIGHT ──────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 5, 5);
scene.add(ambientLight, dirLight);

// ── PARALLAX ───────────────────────────────────────────
document.addEventListener("mousemove", e => {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
});

// Touch parallax
document.addEventListener("touchmove", e => {
    const t = e.touches[0];
    mouseX = (t.clientX / window.innerWidth - 0.5) * 2;
    mouseY = (t.clientY / window.innerHeight - 0.5) * 2;
}, { passive: true });

// ── RESIZE ─────────────────────────────────────────────
window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── ANIMATION LOOP ─────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const elapsed = clock.getElapsedTime();

    // Smooth parallax
    targetX += (mouseX - targetX) * 0.04;
    targetY += (mouseY - targetY) * 0.04;

    // Stars parallax (subtle)
    if (starsMesh) {
        starsMesh.rotation.y = targetX * 0.03;
        starsMesh.rotation.x = targetY * 0.02;
    }

    // Stars twinkle
    if (starsMesh && starsMesh.material.opacity > 0.1) {
        starsMesh.material.opacity = starsMesh.material.opacity +
            Math.sin(elapsed * 2) * 0.008;
    }

    // Clouds drift + parallax
    cloudMeshes.forEach(({ group, speed }, i) => {
        group.position.x += speed;
        if (group.position.x > 20) group.position.x = -20;
        group.position.x += targetX * (0.05 + i * 0.01);
        group.position.y += targetY * 0.02;
    });

    // Rain
    animateRain();

    // Thunder flash random
    if (currentCondition === "thunderstorm") {
        thunderTimer += clock.getDelta();
        if (Math.random() < 0.003) triggerThunder();
    }

    renderer.render(scene, camera);
}

// ── PUBLIC API ─────────────────────────────────────────
// Dipanggil dari script.js setelah dapat data cuaca
window.updateBackground = function (hour, condition) {
    currentHour = hour;
    currentCondition = condition;
    updateGradient(hour, condition);
    setStarOpacity(hour, condition);
    updateClouds(condition);
    setRainOpacity(condition);
};

// ── INIT ───────────────────────────────────────────────
createStars();
createRain();
initClouds();
updateBackground(new Date().getHours(), "clear");
animate();