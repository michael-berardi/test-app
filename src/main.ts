import './style.css'
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// --- Configuration: Bariloche Vibe ---
const CONFIG = {
  colors: {
    skyTop: 0x2b4c7e, // Deep Andean Blue
    skyBottom: 0x89b0d6, // Clear horizon
    water: 0x003366, // Deep glacial lake (Nahuel Huapi)
    waterHighlight: 0x005588,
    mountainRock: 0x4a4a4a,
    mountainSnow: 0xffffff,
    forestDeep: 0x1a2e1a, // Dark pine/coihue
    forestLight: 0x2d4c1e,
    coihueBark: 0x5d4d3d, // Greyish-brown
    arrayanBark: 0xc45e37, // Cinnamon (iconic)
  },
  terrain: {
    scale: 1000,
    height: 300,
  }
};

// --- Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.colors.skyTop);
// Fog to simulate atmospheric perspective in the Andes (clear but deep)
scene.fog = new THREE.FogExp2(CONFIG.colors.skyBottom, 0.0015);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 5000);
camera.position.set(0, 30, 150); // High vantage point

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;
document.body.appendChild(renderer.domElement);

// --- Post Processing (Bloom for Glare) ---
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0.6;
bloomPass.strength = 0.3;
bloomPass.radius = 0.1;
composer.addPass(bloomPass);
const outputPass = new OutputPass();
composer.addPass(outputPass);

// --- Controls ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 20;
controls.maxDistance = 500;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.1; // Slow, majestic rotation

// --- Lighting (Andean Sun) ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xffffee, 1.5);
sunLight.position.set(200, 300, 100);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 4096;
sunLight.shadow.mapSize.height = 4096;
sunLight.shadow.bias = -0.0001;
sunLight.shadow.camera.near = 10;
sunLight.shadow.camera.far = 1000;
const d = 500;
sunLight.shadow.camera.left = -d;
sunLight.shadow.camera.right = d;
sunLight.shadow.camera.top = d;
sunLight.shadow.camera.bottom = -d;
scene.add(sunLight);

// --- Helpers: Noise ---
// Simple pseudo-random noise function for terrain sculpting without external libs
function noise(x: number, z: number) {
    let y = Math.sin(x * 0.005) * Math.cos(z * 0.005) * 50; // Base rolling hills
    y += Math.sin(x * 0.01 + z * 0.02) * 20; // Detail
    y += Math.abs(Math.sin(x * 0.03)) * 10; // Ridges
    return y;
}

function mountainNoise(x: number, z: number) {
    // Sharp, jagged Andes peaks
    let h = 0;
    const s = 0.002;
    h += Math.abs(Math.sin(x * s) * Math.cos(z * s)) * 400; // Big peaks
    h += Math.abs(Math.sin(x * s * 2.5 + 1.2) * Math.cos(z * s * 2.5 + 0.5)) * 150;
    h += (Math.random() - 0.5) * 20; // Rocky noise
    return h;
}

// --- Terrain Generation: The "Bariloche" Heightmap ---
// Goal: Lake in center/foreground, Mountains in back/sides.

const worldWidth = 2000;
const worldDepth = 2000;
const terrainGeo = new THREE.PlaneGeometry(worldWidth, worldDepth, 256, 256);
const posAttr = terrainGeo.attributes.position;
const colors = [];

for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y_orig = posAttr.getY(i); // This is Z in world space
    
    // Base mountain layer
    const h_mtn = mountainNoise(x, y_orig - 500); // Back mountains
    
    // Custom landscape logic:
    // Z < -300: Steep Mountains (Cerro Catedral)
    // Z > 100: Foreground Shore
    // Else: Lake Transition
    
    let finalH = 0;
    if (y_orig < -300) {
        // High Andes
        finalH = h_mtn; 
    } else if (y_orig > 100) {
        // Foreground Shore (where the camera is/Tree is)
        finalH = noise(x, y_orig) * 0.5 + 5; // Rolling shore
    } else {
        // Lake Transition
        // Smooth lerp from mountain base to lake bed
        const t = (y_orig - (-300)) / (100 - (-300)); // 0 to 1
        finalH = THREE.MathUtils.lerp(100, -20, t); // Slope down to water
        finalH += (Math.random()-0.5)*5; // Roughness
    }
    
    // Shoreline Island Logic: 
    // Create a small peninsula at (0, 100) for the tree
    const distToCam = Math.sqrt(x*x + (y_orig - 100)*(y_orig - 100));
    if (distToCam < 80) {
        finalH = Math.max(finalH, 5 + Math.sin(distToCam * 0.1)*2);
    }

    posAttr.setZ(i, finalH);
    
    // Vertex Colors (Snow vs Rock vs Grass)
    // We'll calculate slope later or just use height for now
    // > 200: Snow
    // > 50: Rock
    // < 50: Grass/Forest
    const c = new THREE.Color();
    if (finalH > 220) {
        c.setHex(CONFIG.colors.mountainSnow);
    } else if (finalH > 100) {
        c.setHex(CONFIG.colors.mountainRock);
        // Mix with snow
        if (Math.random() > 0.5) c.lerp(new THREE.Color(CONFIG.colors.mountainSnow), 0.5);
    } else if (finalH > 5) {
        // Forest/Grass
        c.setHex(CONFIG.colors.forestLight);
        // Add noise
        c.lerp(new THREE.Color(CONFIG.colors.forestDeep), Math.random() * 0.5);
    } else {
        // Underwater / Beach
        c.setHex(0x555533); // Sandy/Rocky
    }
    colors.push(c.r, c.g, c.b);
}

terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
terrainGeo.computeVertexNormals();

const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.1,
    flatShading: true // Low poly style for clear geometry, or false for smooth
});
const terrain = new THREE.Mesh(terrainGeo, terrainMat);
terrain.rotation.x = -Math.PI / 2;
terrain.receiveShadow = true;
terrain.castShadow = true;
scene.add(terrain);

// --- Water (Nahuel Huapi) ---
const waterGeo = new THREE.PlaneGeometry(worldWidth, worldDepth);
const waterMat = new THREE.MeshStandardMaterial({
    color: CONFIG.colors.water,
    roughness: 0.1,
    metalness: 0.8,
    transparent: true,
    opacity: 0.9,
});
const water = new THREE.Mesh(waterGeo, waterMat);
water.rotation.x = -Math.PI / 2;
water.position.y = 2; // Water level
scene.add(water);


// --- Vegetation: The "Arrayán" & "Coihue" ---

// 1. Hero Arrayán Tree (Foreground)
// Distinctive cinnamon color, smooth, twisted.
const arrayanGroup = new THREE.Group();
scene.add(arrayanGroup);
arrayanGroup.position.set(0, 5, 100); // On the peninsula

const barkMat = new THREE.MeshStandardMaterial({ 
    color: CONFIG.colors.arrayanBark, 
    roughness: 0.4, // Smooth
    metalness: 0.0
});
const leafMat = new THREE.MeshStandardMaterial({ 
    color: CONFIG.colors.forestDeep, 
    side: THREE.DoubleSide 
});

// Recursive function for twisted branches
function createTwistedBranch(start: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number) {
    if (depth === 0) {
        // Leaves (small, oval)
        const lg = new THREE.SphereGeometry(rad * 4, 4, 4);
        const m = new THREE.Mesh(lg, leafMat);
        m.position.copy(start);
        m.scale.y = 0.5; // Flattened
        m.castShadow = true;
        arrayanGroup.add(m);
        return;
    }

    const end = start.clone().add(dir.clone().multiplyScalar(len));
    
    // Curve for twist
    const curve = new THREE.CatmullRomCurve3([
        start,
        start.clone().lerp(end, 0.5).add(new THREE.Vector3((Math.random()-0.5)*rad*2, 0, (Math.random()-0.5)*rad*2)),
        end
    ]);
    
    const geo = new THREE.TubeGeometry(curve, 4, rad, 6, false);
    const mesh = new THREE.Mesh(geo, barkMat);
    mesh.castShadow = true;
    arrayanGroup.add(mesh);
    
    // Split
    const count = 2;
    for(let i=0; i<count; i++) {
        const nd = dir.clone().applyEuler(new THREE.Euler(
            (Math.random()-0.5)*1.0, 
            (Math.random()-0.5)*1.0, 
            (Math.random()-0.5)*1.0
        )).normalize();
        
        createTwistedBranch(end, nd, len*0.8, rad*0.7, depth-1);
    }
}

// Build Hero Arrayán
createTwistedBranch(new THREE.Vector3(0,0,0), new THREE.Vector3(0,1,0), 8, 1.5, 4);


// 2. Distant Forests (Coihues/Pines)
// Simple instanced mesh for performance
const treeCount = 500;
const dummy = new THREE.Object3D();
const pineGeo = new THREE.ConeGeometry(5, 20, 4);
const pineMat = new THREE.MeshStandardMaterial({ color: CONFIG.colors.forestDeep, roughness: 0.9 });
const forest = new THREE.InstancedMesh(pineGeo, pineMat, treeCount);
scene.add(forest);

let idx = 0;
for(let i=0; i<treeCount; i++) {
    // Random position
    const x = (Math.random() - 0.5) * 1500;
    const z = (Math.random() - 0.5) * 1500;
    
    // Basic height check (approximate, since we don't have the heightmap function exposed cleanly for random coords)
    // We'll just scatter them and adjust Y based on logic or a simplified check
    // Actually, we can assume:
    // Mountains are at z < -300
    // We want trees on the lower slopes.
    
    if (z > -500 && z < 0 && Math.abs(x) > 100) { // Slopes
        dummy.position.set(x, 0, z);
        
        // Approx height (re-calc noise roughly)
        // h_mtn = mountainNoise(x, z - 500); 
        // Just use a random height on slope assumption
        dummy.position.y = Math.random() * 50 + 20; 
        
        // Scale
        const s = Math.random() * 0.5 + 0.5;
        dummy.scale.set(s, s, s);
        
        dummy.updateMatrix();
        forest.setMatrixAt(idx++, dummy.matrix);
    }
}
forest.instanceMatrix.needsUpdate = true;


// --- Animation ---
let time = 0;
function animate() {
    requestAnimationFrame(animate);
    time += 0.002;
    
    controls.update();
    
    // Water gentle float
    water.position.y = 2 + Math.sin(time) * 0.2;
    
    composer.render();
}

animate();

// Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});