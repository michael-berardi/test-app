import './style.css'
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// --- Configuration ---
const CONFIG = {
  colors: {
    skyTop: 0x0f2040, // Deep twilight/space blue
    skyBottom: 0x88b0d6, // Atmospheric horizon
    sun: 0xffaa33, // Golden hour
    water: 0x001e36, // Deep dark lake
    snow: 0xffffff,
    rock: 0x3a3a3a,
    grass: 0x2d4c1e,
    forest: 0x1a281a,
  },
  worldSize: 4000,
  chunkSize: 512 // Resolution
};

// --- Helper: Deterministic Noise ---
// A simple pseudo-random noise function (fractal sin/cos)
function noise(x: number, z: number) {
    const s = 0.0015; // Global scale
    let y = 0;
    // Layer 1: Base Mountains
    y += Math.sin(x * s) * Math.cos(z * s) * 300;
    // Layer 2: Medium Detail
    y += Math.sin(x * s * 2.5 + 1.5) * Math.cos(z * s * 2.5 + 0.5) * 150;
    // Layer 3: Rocky Noise
    y += Math.sin(x * s * 10) * Math.cos(z * s * 10) * 20;
    // Layer 4: Micro Detail
    y += Math.sin(x * s * 30) * Math.cos(z * s * 35) * 5;
    
    return y;
}

// --- The "Truth" Height Function ---
// Defines the Bariloche geography: Lake in center (-200 < y < 200 approx), Mountains outside.
function getAltitude(x: number, z: number) {
    // Distance from "Lake Center" (approx 0,0)
    const d = Math.sqrt(x*x + z*z);
    
    // Base rolling terrain
    let h = noise(x, z);
    
    // Sculpting: Force a lake valley in the center
    // We want a bowl shape roughly.
    // If d < 800, we push height down.
    
    const lakeRadius = 600;
    const transition = 400;
    
    // Smooth transition from Lake (low) to Mountain (high)
    let valleyFactor = 0;
    if (d < lakeRadius) {
        valleyFactor = 1.0;
    } else if (d < lakeRadius + transition) {
        valleyFactor = 1.0 - ((d - lakeRadius) / transition); // 1 -> 0
    }
    
    // Flatten center for water
    if (valleyFactor > 0) {
        // We want the lake bed to be below 0
        // And the mountains to be natural
        // h_final = h_mountain * (1-valleyFactor) + h_lake * valleyFactor
        
        const h_lake = -50 - (Math.sin(x*0.01)*10); // Underwater variation
        
        h = THREE.MathUtils.lerp(h, h_lake, valleyFactor * valleyFactor); // Square for smooth ease
    }
    
    // Add jagged peaks only to high areas
    if (h > 100) {
        h += Math.abs(Math.sin(x * 0.05 + z * 0.05)) * 50; // Sharp ridges
    }
    
    return h;
}

// --- Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.colors.skyTop);
scene.fog = new THREE.FogExp2(CONFIG.colors.skyBottom, 0.0008);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 5000);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

// --- Post Processing ---
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0.5;
bloomPass.strength = 0.4;
bloomPass.radius = 0.5;
composer.addPass(bloomPass);
const outputPass = new OutputPass();
composer.addPass(outputPass);

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0x404040, 2.0); // Brighter ambient for visibility
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(CONFIG.colors.skyBottom, 0x000000, 0.6);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(CONFIG.colors.sun, 2.5);
sunLight.position.set(-500, 200, -500); // Low angle sun
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(4096, 4096);
sunLight.shadow.camera.near = 10;
sunLight.shadow.camera.far = 2000;
const d = 1000;
sunLight.shadow.camera.left = -d;
sunLight.shadow.camera.right = d;
sunLight.shadow.camera.top = d;
sunLight.shadow.camera.bottom = -d;
sunLight.shadow.bias = -0.0005;
scene.add(sunLight);

// Sun Sprite (Visual only)
const sunGeo = new THREE.SphereGeometry(40, 32, 32);
const sunMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
const sunMesh = new THREE.Mesh(sunGeo, sunMat);
sunMesh.position.copy(sunLight.position).multiplyScalar(2); // Far out
scene.add(sunMesh);


// --- High-Fidelity Terrain ---
const terrainGeo = new THREE.PlaneGeometry(CONFIG.worldSize, CONFIG.worldSize, 512, 512);
const posAttr = terrainGeo.attributes.position;
const colors: number[] = [];
const colorAttr = new THREE.Color();

for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getY(i); // Plane is created XY, we rotate later. This is effectively Z.
    
    const h = getAltitude(x, z);
    posAttr.setZ(i, h);
    
    // Vertex Coloring based on Height & Slope
    // Note: We can't easily compute slope here without neighbors, so we use Height + Noise mixing
    
    let c = CONFIG.colors.grass;
    
    if (h < 5) {
        c = 0x444422; // Shore/Sand
    } else if (h > 250) {
        c = CONFIG.colors.snow;
    } else if (h > 120) {
        c = CONFIG.colors.rock;
    } else {
        c = CONFIG.colors.grass;
    }
    
    // Noise mix for detail
    const noiseVal = Math.sin(x*0.05)*Math.cos(z*0.05);
    colorAttr.setHex(c);
    colorAttr.offsetHSL(0, 0, noiseVal * 0.05); // Subtle variation
    
    colors.push(colorAttr.r, colorAttr.g, colorAttr.b);
}
terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
terrainGeo.computeVertexNormals();

const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.8,
    metalness: 0.1,
    flatShading: false, // Smooth shading for realism
});
const terrain = new THREE.Mesh(terrainGeo, terrainMat);
terrain.rotation.x = -Math.PI / 2;
terrain.receiveShadow = true;
terrain.castShadow = true;
scene.add(terrain);

// --- Water (High Quality) ---
// Procedural Normal Map for ripples
const normCanvas = document.createElement('canvas');
normCanvas.width = 512;
normCanvas.height = 512;
const nCtx = normCanvas.getContext('2d');
if (nCtx) {
    nCtx.fillStyle = '#8080ff'; // Flat normal
    nCtx.fillRect(0,0,512,512);
    // Draw random noise
    for(let i=0; i<10000; i++) {
        const x = Math.random()*512;
        const y = Math.random()*512;
        const s = Math.random()*4;
        nCtx.fillStyle = `rgba(${128+(Math.random()-0.5)*50}, ${128+(Math.random()-0.5)*50}, 255, 0.5)`;
        nCtx.fillRect(x,y,s,s);
    }
}
const waterNorm = new THREE.CanvasTexture(normCanvas);
waterNorm.wrapS = THREE.RepeatWrapping;
waterNorm.wrapT = THREE.RepeatWrapping;
waterNorm.repeat.set(10, 10);

const waterGeo = new THREE.PlaneGeometry(CONFIG.worldSize, CONFIG.worldSize);
const waterMat = new THREE.MeshStandardMaterial({
    color: CONFIG.colors.water,
    roughness: 0.05,
    metalness: 0.9,
    normalMap: waterNorm,
    normalScale: new THREE.Vector2(0.5, 0.5),
});
const water = new THREE.Mesh(waterGeo, waterMat);
water.rotation.x = -Math.PI / 2;
water.position.y = 0; // Sea Level
scene.add(water);


// --- Instanced Vegetation (Fixed Floating) ---
const treeCount = 2000;
const pineGeo = new THREE.ConeGeometry(5, 25, 6);
const pineMat = new THREE.MeshStandardMaterial({ color: CONFIG.colors.forest, roughness: 0.8 });
const forest = new THREE.InstancedMesh(pineGeo, pineMat, treeCount);
forest.castShadow = true;
forest.receiveShadow = true;
scene.add(forest);

const dummy = new THREE.Object3D();
let tIdx = 0;

for(let i=0; i<treeCount; i++) {
    const x = (Math.random() - 0.5) * CONFIG.worldSize * 0.8;
    const z = (Math.random() - 0.5) * CONFIG.worldSize * 0.8;
    
    const h = getAltitude(x, z);
    
    // Logic: Only place trees on land, between height 5 and 200 (vegetation line)
    // And avoid super steep slopes (optional, hard to check without normal, but height check helps)
    
    if (h > 5 && h < 200) {
        dummy.position.set(x, h + 12.5, z); // +12.5 (half height) so base is at h
        
        // Scale variation
        const s = 0.8 + Math.random() * 0.6;
        dummy.scale.set(s, s, s);
        
        // Random rotation
        dummy.rotation.y = Math.random() * Math.PI * 2;
        
        dummy.updateMatrix();
        forest.setMatrixAt(tIdx++, dummy.matrix);
    }
}
// Hide unused instances
for(let i=tIdx; i<treeCount; i++) {
    forest.setMatrixAt(i, new THREE.Matrix4().set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0));
}
forest.instanceMatrix.needsUpdate = true;


// --- Condor Flight Simulator ---

// Condor Model (Procedural Group)
const condor = new THREE.Group();
const bodyGeo = new THREE.ConeGeometry(0.5, 2, 8);
bodyGeo.rotateX(Math.PI / 2);
const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0x222222 }));
condor.add(body);

const wingGeo = new THREE.BoxGeometry(6, 0.2, 1);
const wing = new THREE.Mesh(wingGeo, new THREE.MeshStandardMaterial({ color: 0x111111 }));
wing.position.z = -0.2;
condor.add(wing);

scene.add(condor);

// Flight State
const flight = {
    pos: new THREE.Vector3(0, 300, 600),
    vel: new THREE.Vector3(0, 0, -1),
    speed: 1.0,
    pitch: 0,
    yaw: 0,
    roll: 0,
};

// Controls
const input = { x: 0, y: 0 };
window.addEventListener('mousemove', (e) => {
    // Normalize -1 to 1
    input.x = (e.clientX / window.innerWidth) * 2 - 1;
    input.y = (e.clientY / window.innerHeight) * 2 - 1;
});

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    
    // Flight Physics
    // Target Speed
    const targetSpeed = 2.0 + (input.y > 0 ? input.y * 1.5 : 0); // Dive to speed up
    flight.speed += (targetSpeed - flight.speed) * 0.05;
    
    // Rotation inputs
    const targetPitch = input.y * 0.8;
    const targetRoll = -input.x * 1.0;
    const targetYaw = -input.x * 0.02; // Yaw turns slowly with roll
    
    flight.pitch += (targetPitch - flight.pitch) * 0.1;
    flight.roll += (targetRoll - flight.roll) * 0.05;
    flight.yaw += targetYaw;
    
    // Calculate new velocity vector based on rotation
    // Better flight model:
    // Velocity is always moving forward in the direction the bird points
    condor.rotation.set(flight.pitch, flight.yaw, flight.roll);
    
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(condor.rotation);
    forward.normalize();
    
    flight.pos.add(forward.multiplyScalar(flight.speed));
    
    // Terrain Collision Avoidance (Magic Updrafts)
    const groundH = getAltitude(flight.pos.x, flight.pos.z);
    if (flight.pos.y < groundH + 10) {
        flight.pos.y = groundH + 10;
        flight.pitch = Math.max(flight.pitch, 0.2); // Bounce up
    }

    condor.position.copy(flight.pos);
    
    // Camera Follow (Third Person)
    const camOffset = new THREE.Vector3(0, 8, 25).applyEuler(new THREE.Euler(0, flight.yaw, 0)); // Trailing behind yaw only to prevent motion sickness from roll
    // Add some pitch influence
    camOffset.y += flight.pitch * 5;
    
    const targetCamPos = flight.pos.clone().add(camOffset);
    camera.position.lerp(targetCamPos, 0.1);
    camera.lookAt(flight.pos);
    
    // Animate Water Normals
    waterNorm.offset.x += 0.001;
    waterNorm.offset.y += 0.0005;

    composer.render();
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});
