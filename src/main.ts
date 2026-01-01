import './style.css'
import * as THREE from 'three';

// --- Constants & Configuration ---
const CONFIG = {
    worldSize: 2000,
    chunkRes: 256,
    waterLevel: 4,
    colors: {
        skyTop: new THREE.Color(0x0f2c5e), // Deep Andean Blue
        skyBottom: new THREE.Color(0x89b4d8), // Horizon
        sun: 0xffaa00,
        snow: new THREE.Color(0xffffff),
        rock: new THREE.Color(0x4a4a4a),
        forest: new THREE.Color(0x1e3618),
        sand: new THREE.Color(0x7a6c53),
        water: 0x003355
    }
};

// --- Helper: Math & Noise ---
// Simple deterministic pseudo-random noise
function hash(n: number) { return Math.sin(n) * 43758.5453123; }
function noise(x: number, z: number) {
    const p = new THREE.Vector2(Math.floor(x), Math.floor(z));
    const f = new THREE.Vector2(x - p.x, z - p.y);
    f.x = f.x * f.x * (3.0 - 2.0 * f.x);
    f.y = f.y * f.y * (3.0 - 2.0 * f.y);
    const n = p.x + p.y * 57.0;
    return THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(hash(n + 0.0), hash(n + 1.0), f.x),
        THREE.MathUtils.lerp(hash(n + 57.0), hash(n + 58.0), f.x),
        f.y
    );
}

// Fractal Brownian Motion for jagged peaks
function fbm(x: number, z: number) {
    let total = 0;
    let amplitude = 1;
    let frequency = 0.005;
    let maxValue = 0;
    
    // 5 Octaves for detailed mountain shapes
    for(let i=0; i<5; i++) {
        total += noise(x * frequency, z * frequency) * amplitude;
        maxValue += amplitude;
        amplitude *= 0.5;
        frequency *= 2.0;
    }
    
    // Normalize and scale
    // Power function to make valleys flatter and peaks sharper (Cerro Catedral style)
    let n = total / maxValue; 
    n = Math.pow(n, 2.5); 
    
    return n * 300; // Max height around 300
}

function getTerrainHeight(x: number, z: number) {
    // Center valley bias (Lake Nahuel Huapi)
    const dist = Math.sqrt(x*x + z*z);
    let h = fbm(x + 1000, z + 1000); // Offset to avoid 0,0 symmetry
    
    // Flatten the center slightly for the lake
    if (dist < 500) {
        h -= (1.0 - dist/500) * 50; 
    }
    
    return Math.max(-20, h);
}

// --- Scene Setup ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 4000);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// --- Lights ---
const sunLight = new THREE.DirectionalLight(CONFIG.colors.sun, 1.5);
sunLight.position.set(-500, 500, -500);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 10;
sunLight.shadow.camera.far = 2000;
const d = 1000;
sunLight.shadow.camera.left = -d; sunLight.shadow.camera.right = d;
sunLight.shadow.camera.top = d; sunLight.shadow.camera.bottom = -d;
sunLight.shadow.bias = -0.0001;
scene.add(sunLight);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

// --- 5. Atmosphere (Sky Shader) ---
const skyGeo = new THREE.SphereGeometry(2000, 32, 32);
const skyMat = new THREE.ShaderMaterial({
    uniforms: {
        topColor: { value: CONFIG.colors.skyTop },
        bottomColor: { value: CONFIG.colors.skyBottom },
        offset: { value: 33 },
        exponent: { value: 0.6 },
        time: { value: 0 }
    },
    vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
            vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
    `,
    fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        uniform float time;
        varying vec3 vWorldPosition;

        // Fast noise
        float hash(float n) { return fract(sin(n) * 43758.5453); }
        float noise(vec3 x) {
            vec3 p = floor(x);
            vec3 f = fract(x);
            f = f * f * (3.0 - 2.0 * f);
            float n = p.x + p.y * 57.0 + 113.0 * p.z;
            return mix(mix(mix(hash(n + 0.0), hash(n + 1.0), f.x),
                           mix(hash(n + 57.0), hash(n + 58.0), f.x), f.y),
                       mix(mix(hash(n + 113.0), hash(n + 114.0), f.x),
                           mix(hash(n + 170.0), hash(n + 171.0), f.x), f.y), f.z);
        }
        
        void main() {
            float h = normalize( vWorldPosition + offset ).y;
            vec3 sky = mix( bottomColor, topColor, max( pow( max( h, 0.0 ), exponent ), 0.0 ) );
            
            // Wispy Clouds
            vec3 p = vWorldPosition * 0.001;
            p.x += time * 0.01;
            float n = noise(p * 5.0) * 0.5 + noise(p * 10.0) * 0.25;
            float cloud = smoothstep(0.4, 0.8, n);
            
            gl_FragColor = vec4( mix(sky, vec3(1.0), cloud * 0.4), 1.0 );
        }
    `,
    side: THREE.BackSide
});
const sky = new THREE.Mesh(skyGeo, skyMat);
scene.add(sky);


// --- 1. Terrain Generation ---
const terrainGeo = new THREE.PlaneGeometry(CONFIG.worldSize, CONFIG.worldSize, CONFIG.chunkRes, CONFIG.chunkRes);
const pos = terrainGeo.attributes.position;
const colors = [];
const cObj = new THREE.Color();

for(let i=0; i<pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getY(i); // Plane is XY
    
    const h = getTerrainHeight(x, z);
    pos.setZ(i, h);
    
    // Vertex Coloring
    if (h > 60) {
        // Snow
        cObj.set(CONFIG.colors.snow);
    } else if (h > 30) {
        // Rock
        cObj.set(CONFIG.colors.rock);
    } else if (h > 5) {
        // Forest
        cObj.set(CONFIG.colors.forest);
        // Add noise to forest color
        cObj.offsetHSL(0, 0, (Math.random()-0.5)*0.1);
    } else {
        // Shore
        cObj.set(CONFIG.colors.sand);
    }
    
    colors.push(cObj.r, cObj.g, cObj.b);
}

terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
terrainGeo.computeVertexNormals();

const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.1,
    flatShading: false
});
const terrain = new THREE.Mesh(terrainGeo, terrainMat);
terrain.rotation.x = -Math.PI / 2;
terrain.receiveShadow = true;
terrain.castShadow = true;
scene.add(terrain);

// Water Plane
const waterGeo = new THREE.PlaneGeometry(CONFIG.worldSize, CONFIG.worldSize);
const waterMat = new THREE.MeshStandardMaterial({
    color: CONFIG.colors.water,
    roughness: 0.1,
    metalness: 0.8
});
const water = new THREE.Mesh(waterGeo, waterMat);
water.rotation.x = -Math.PI / 2;
water.position.y = CONFIG.waterLevel;
scene.add(water);

// --- 4. Vegetation (Instanced) ---
const treeCount = 2000;
// Simple Pine Tree Geometry
const trunkGeo = new THREE.CylinderGeometry(0.5, 1, 5);
trunkGeo.translate(0, 2.5, 0);
const leavesGeo = new THREE.ConeGeometry(3, 10, 8);
leavesGeo.translate(0, 10, 0);
// Merge logic (manual for performance? Or just use Cones for simplicity)
// Let's just use Cones, they look fine from distance
const simpleTreeGeo = new THREE.ConeGeometry(3, 15, 6);
simpleTreeGeo.translate(0, 7.5, 0); // Pivot at base

const treeMat = new THREE.MeshStandardMaterial({ color: 0x1e3618, roughness: 0.9 });
const forest = new THREE.InstancedMesh(simpleTreeGeo, treeMat, treeCount);
forest.castShadow = true;
scene.add(forest);

const dummy = new THREE.Object3D();
let tIdx = 0;
for(let i=0; i<treeCount; i++) {
    const x = (Math.random() - 0.5) * CONFIG.worldSize * 0.9;
    const z = (Math.random() - 0.5) * CONFIG.worldSize * 0.9;
    const h = getTerrainHeight(x, z);
    
    // Placement Logic: Between Water and Snow
    if (h > CONFIG.waterLevel + 1 && h < 60) {
        dummy.position.set(x, h, z);
        const s = 0.8 + Math.random() * 0.6;
        dummy.scale.set(s, s, s);
        dummy.rotation.y = Math.random() * Math.PI * 2;
        dummy.updateMatrix();
        forest.setMatrixAt(tIdx++, dummy.matrix);
    }
}
// Hide unused
for(let i=tIdx; i<treeCount; i++) forest.setMatrixAt(i, new THREE.Matrix4().makeScale(0,0,0));
forest.instanceMatrix.needsUpdate = true;


// --- 2. Condor Class (Player) ---
class Condor {
    mesh: THREE.Group;
    velocity: THREE.Vector3;
    speed: number;
    rotation: THREE.Euler;
    
    // Physics State
    roll: number = 0;
    pitch: number = 0;
    yaw: number = 0;

    constructor() {
        this.mesh = new THREE.Group();
        
        // Body (Dark Grey Capsule)
        const bodyGeo = new THREE.CapsuleGeometry(0.8, 3, 4, 8);
        bodyGeo.rotateX(Math.PI / 2);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        this.mesh.add(body);
        
        // Wings (Wide)
        const wingGeo = new THREE.BoxGeometry(10, 0.2, 1.5);
        const wingMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
        const wings = new THREE.Mesh(wingGeo, wingMat);
        this.mesh.add(wings);
        
        // Collar (White Ring)
        const collarGeo = new THREE.TorusGeometry(0.85, 0.15, 6, 12);
        collarGeo.rotateY(Math.PI / 2);
        const collarMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
        const collar = new THREE.Mesh(collarGeo, collarMat);
        collar.position.set(0, 0, -1.2);
        this.mesh.add(collar);
        
        // Head
        const headGeo = new THREE.SphereGeometry(0.7, 12, 12);
        const headMat = new THREE.MeshStandardMaterial({ color: 0xaa8888 }); // Pinkish
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.set(0, 0, -1.8);
        this.mesh.add(head);

        scene.add(this.mesh);
        
        // Init Pos
        this.mesh.position.set(0, 150, 400);
        this.velocity = new THREE.Vector3();
        this.rotation = new THREE.Euler(0, 0, 0, 'YXZ');
        this.speed = 1.5;
    }

    update(inputX: number, inputY: number, dt: number) {
        // --- Physics ---
        
        // Pitch Control (Mouse Y)
        const targetPitch = inputY * 1.0; 
        this.pitch = THREE.MathUtils.lerp(this.pitch, targetPitch, dt * 2);
        
        // Roll/Yaw Control (Mouse X)
        const targetRoll = -inputX * 1.5; // Bank into turn
        this.roll = THREE.MathUtils.lerp(this.roll, targetRoll, dt * 2);
        
        // Yaw rate depends on Roll (Banking turns)
        this.yaw += -this.roll * dt * 0.8; 
        
        // Speed Physics: Dive to gain speed, climb to lose it
        const gravityEffect = -this.pitch * 20.0 * dt;
        this.speed += gravityEffect;
        this.speed = THREE.MathUtils.clamp(this.speed, 0.5, 5.0); // Min/Max speed
        
        // Move Forward
        const forward = new THREE.Vector3(0, 0, -1);
        forward.applyEuler(new THREE.Euler(this.pitch, this.yaw, this.roll, 'YXZ'));
        
        // Update Position
        this.mesh.position.add(forward.multiplyScalar(this.speed));
        this.mesh.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
        
        // --- 3. Crash Logic ---
        const h = getTerrainHeight(this.mesh.position.x, this.mesh.position.z);
        const limit = Math.max(h, CONFIG.waterLevel);
        
        if (this.mesh.position.y < limit + 1) {
            this.crash();
        }
    }
    
    crash() {
        console.log("CRASHED!");
        // Simple Reset for now
        this.mesh.position.y += 50;
        this.pitch = 0.5; // Bounce up
        this.speed = 1.0;
        // Visual feedback?
        document.body.style.backgroundColor = "red";
        setTimeout(() => document.body.style.backgroundColor = "black", 100);
    }
}

const condor = new Condor();

// --- Inputs ---
const input = { x: 0, y: 0 };
window.addEventListener('mousemove', (e) => {
    // Normalize -1 to 1
    input.x = (e.clientX / window.innerWidth) * 2 - 1;
    input.y = (e.clientY / window.innerHeight) * 2 - 1;
});


// --- Animation Loop ---
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    
    const dt = clock.getDelta();
    const time = clock.getElapsedTime();
    
    // Update Condor
    condor.update(input.x, input.y, dt);
    
    // Update Shader
    skyMat.uniforms.time.value = time;
    
    // Chase Camera
    const camOffset = new THREE.Vector3(0, 8, 25);
    camOffset.applyEuler(new THREE.Euler(0, condor.yaw, 0)); // Only follow Yaw to avoid sickness
    // Add dynamic offset based on pitch (look down when diving)
    camOffset.y += condor.pitch * 5;
    
    const targetPos = condor.mesh.position.clone().add(camOffset);
    camera.position.lerp(targetPos, 0.1); // Smooth lag
    camera.lookAt(condor.mesh.position);

    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
