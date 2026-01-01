import './style.css'
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// --- Configuration ---
const CONFIG = {
    worldSize: 5000,
    chunkRes: 512,
    waterLevel: 15, // Slightly higher to cover seams
    colors: {
        skyTop: new THREE.Color(0x0f3c6e), 
        skyBottom: new THREE.Color(0x99c4e8),
        sun: 0xffddaa,
        water: 0x002244,
        snow: new THREE.Color(0xffffff),
        rock: new THREE.Color(0x555555),
        forest: new THREE.Color(0x2d4c1e),
        sand: new THREE.Color(0xc2b280)
    }
};

// --- Helper: FBM Noise ---
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

function fbm(x: number, z: number) {
    let total = 0;
    let amplitude = 1;
    let frequency = 0.003;
    let maxValue = 0;
    for(let i=0; i<6; i++) { // 6 Octaves for high detail
        total += noise(x * frequency, z * frequency) * amplitude;
        maxValue += amplitude;
        amplitude *= 0.5;
        frequency *= 2.0;
    }
    return Math.pow(total / maxValue, 2.0) * 600; // Peaks up to 600m
}

function getTerrainHeight(x: number, z: number) {
    // Valley bias for lake
    const d = Math.sqrt(x*x + z*z);
    let h = fbm(x + 5000, z + 5000); 
    
    // Create central basin
    if (d < 800) {
        h -= (1.0 - d/800) * 150; 
    }
    return Math.max(-50, h);
}

// --- Scene Setup ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 8000);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance", stencil: false, depth: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// --- Lighting ---
const ambientLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(CONFIG.colors.sun, 1.8);
sunLight.position.set(-1000, 800, -1000);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 10;
sunLight.shadow.camera.far = 4000;
const d = 2000;
sunLight.shadow.camera.left = -d; sunLight.shadow.camera.right = d;
sunLight.shadow.camera.top = d; sunLight.shadow.camera.bottom = -d;
sunLight.shadow.bias = -0.0002;
scene.add(sunLight);


// --- 1. Realistic Terrain Shader ---
const terrainGeo = new THREE.PlaneGeometry(CONFIG.worldSize, CONFIG.worldSize, CONFIG.chunkRes, CONFIG.chunkRes);
// Pre-calculate heights
const pos = terrainGeo.attributes.position;
for(let i=0; i<pos.count; i++) {
    pos.setZ(i, getTerrainHeight(pos.getX(i), pos.getY(i)));
}
terrainGeo.computeVertexNormals();

// Note: Standard Shader doesn't support shadows easily without #include chunks.
// Reverting to MeshStandardMaterial with Vertex Colors for shadows, 
const terrainMatStandard = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.1,
    flatShading: false
});

// Compute colors on CPU for StandardMaterial
const cols = [];
const cObj = new THREE.Color();
for(let i=0; i<pos.count; i++) {
    const h = pos.getZ(i);
    // Cheap slope calc: assume flat for now or use noise
    const noiseVal = Math.random();
    
    if (h < CONFIG.waterLevel + 2) {
        cObj.set(CONFIG.colors.sand);
    } else if (h > 180) {
        cObj.set(CONFIG.colors.snow);
    } else if (h > 60) {
        // Rock/Grass mix
        if (noiseVal > 0.4) cObj.set(CONFIG.colors.rock);
        else cObj.set(CONFIG.colors.forest);
    } else {
        cObj.set(CONFIG.colors.forest);
    }
    // Variation
    cObj.offsetHSL(0, 0, (Math.random()-0.5)*0.05);
    cols.push(cObj.r, cObj.g, cObj.b);
}
terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));

const terrain = new THREE.Mesh(terrainGeo, terrainMatStandard);
terrain.rotation.x = -Math.PI / 2;
terrain.receiveShadow = true;
terrain.castShadow = true;
scene.add(terrain);


// --- 2. Water with Normal Map ---
const normCanvas = document.createElement('canvas');
normCanvas.width = 512; normCanvas.height = 512;
const ctx = normCanvas.getContext('2d');
if (ctx) {
    ctx.fillStyle = '#8080ff'; ctx.fillRect(0,0,512,512);
    for(let i=0; i<5000; i++) {
        ctx.fillStyle = `rgba(${120+Math.random()*20}, ${120+Math.random()*20}, 255, 0.2)`;
        const s = Math.random()*5 + 1;
        ctx.fillRect(Math.random()*512, Math.random()*512, s, s);
    }
}
const waterNorm = new THREE.CanvasTexture(normCanvas);
waterNorm.wrapS = THREE.RepeatWrapping; waterNorm.wrapT = THREE.RepeatWrapping;
waterNorm.repeat.set(8, 8);

const water = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.worldSize, CONFIG.worldSize),
    new THREE.MeshStandardMaterial({
        color: CONFIG.colors.water,
        roughness: 0.02,
        metalness: 0.8,
        normalMap: waterNorm,
        normalScale: new THREE.Vector2(0.3, 0.3)
    })
);
water.rotation.x = -Math.PI / 2;
water.position.y = CONFIG.waterLevel;
scene.add(water);


// --- 3. Better Trees ---
// Construct a "Pine" from primitives
const pineGroup = new THREE.Group();
const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1, 2, 6), new THREE.MeshStandardMaterial({color:0x3d2e23}));
trunk.position.y = 3;
pineGroup.add(trunk);
const c1 = new THREE.Mesh(new THREE.ConeGeometry(6, 12, 7), new THREE.MeshStandardMaterial({color:0x1e3618}));
c1.position.y = 9;
pineGroup.add(c1);
const c2 = new THREE.Mesh(new THREE.ConeGeometry(4.5, 10, 7), new THREE.MeshStandardMaterial({color:0x2d4c1e}));
c2.position.y = 15;
pineGroup.add(c2);

// Convert to Geometry for Instancing (hacky but works)
// Actually InstancedMesh needs a single Geometry. 
// We merge them.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Re-create geoms
const g1 = new THREE.CylinderGeometry(1, 2, 6); g1.translate(0, 3, 0);
const g2 = new THREE.ConeGeometry(6, 12, 7); g2.translate(0, 9, 0);
const g3 = new THREE.ConeGeometry(4.5, 10, 7); g3.translate(0, 15, 0);
const finalTreeGeo = mergeGeometries([g1, g2, g3]);

const forestMat = new THREE.MeshStandardMaterial({ 
    color: 0x2d4c1e, 
    roughness: 0.8,
    flatShading: true
});
const treeCount = 3000;
const forest = new THREE.InstancedMesh(finalTreeGeo, forestMat, treeCount);
forest.castShadow = true;
scene.add(forest);

const dummy = new THREE.Object3D();
let tIdx = 0;
for(let i=0; i<treeCount; i++) {
    const x = (Math.random() - 0.5) * CONFIG.worldSize * 0.85;
    const z = (Math.random() - 0.5) * CONFIG.worldSize * 0.85;
    const h = getTerrainHeight(x, z);
    
    // Logic
    if (h > CONFIG.waterLevel + 2 && h < 140) {
        dummy.position.set(x, h, z);
        const s = 0.8 + Math.random() * 0.7;
        dummy.scale.set(s, s, s);
        dummy.rotation.y = Math.random() * Math.PI * 2;
        dummy.updateMatrix();
        forest.setMatrixAt(tIdx++, dummy.matrix);
    }
}
for(let i=tIdx; i<treeCount; i++) forest.setMatrixAt(i, new THREE.Matrix4().makeScale(0,0,0));
forest.instanceMatrix.needsUpdate = true;


// --- 4. Sky Shader (Atmosphere) ---
const skyGeo = new THREE.SphereGeometry(6000, 32, 32); // HUGE
const skyShader = new THREE.ShaderMaterial({
    uniforms: {
        topColor: { value: CONFIG.colors.skyTop },
        bottomColor: { value: CONFIG.colors.skyBottom },
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
        uniform float exponent;
        uniform float time;
        varying vec3 vWorldPosition;
        
        float hash(float n) { return fract(sin(n)*43758.5453); }
        float noise(vec3 x) {
            vec3 p = floor(x); vec3 f = fract(x);
            f = f*f*(3.0-2.0*f);
            float n = p.x + p.y*57.0 + 113.0*p.z;
            return mix(mix(mix(hash(n+0.0), hash(n+1.0),f.x), mix(hash(n+57.0), hash(n+58.0),f.x),f.y),
                       mix(mix(hash(n+113.0), hash(n+114.0),f.x), mix(hash(n+170.0), hash(n+171.0),f.x),f.y),f.z);
        }
        
        void main() {
            float h = normalize( vWorldPosition ).y;
            vec3 sky = mix( bottomColor, topColor, max( pow( max( h, 0.0 ), exponent ), 0.0 ) );
            
            // Clouds
            vec3 p = vWorldPosition * 0.0005;
            p.x += time * 0.01;
            float c = noise(p*4.0)*0.5 + noise(p*8.0)*0.25;
            float cloud = smoothstep(0.45, 0.8, c);
            
            gl_FragColor = vec4( mix(sky, vec3(1.0), cloud*0.6), 1.0 );
        }
    `,
    side: THREE.BackSide
});
const sky = new THREE.Mesh(skyGeo, skyShader);
scene.add(sky);


// --- 5. Condor Player ---
class Condor {
    mesh: THREE.Group;
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    speed: number = 2.0;
    pitch: number = 0;
    yaw: number = 0;
    roll: number = 0;
    
    constructor() {
        this.mesh = new THREE.Group();
        // Body
        const b = new THREE.Mesh(new THREE.CapsuleGeometry(1, 4, 4, 8), new THREE.MeshStandardMaterial({color:0x222222}));
        b.rotation.x = Math.PI/2;
        this.mesh.add(b);
        // Wings
        const w = new THREE.Mesh(new THREE.BoxGeometry(14, 0.2, 2.5), new THREE.MeshStandardMaterial({color:0x111111}));
        this.mesh.add(w);
        // Head
        const h = new THREE.Mesh(new THREE.SphereGeometry(0.8), new THREE.MeshStandardMaterial({color:0xcc8888}));
        h.position.set(0,0,-2.2);
        this.mesh.add(h);
        
        scene.add(this.mesh);
        
        // Spawn high and center
        this.position = new THREE.Vector3(0, 400, 0); 
        this.velocity = new THREE.Vector3(0,0,-1);
    }
    
    update(mx: number, my: number) {
        // Controls
        this.pitch = THREE.MathUtils.lerp(this.pitch, my, 0.05);
        this.roll = THREE.MathUtils.lerp(this.roll, -mx * 1.5, 0.05);
        this.yaw += -this.roll * 0.015;
        
        // Physics
        this.speed = THREE.MathUtils.clamp(this.speed - this.pitch*0.05, 0.8, 3.5);
        
        // Move
        const forward = new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(this.pitch, this.yaw, this.roll, 'YXZ'));
        this.position.add(forward.multiplyScalar(this.speed));
        
        this.mesh.position.copy(this.position);
        this.mesh.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
        
        // World Bounds (Loop? Bounce?)
        const halfSize = CONFIG.worldSize / 2;
        if (Math.abs(this.position.x) > halfSize || Math.abs(this.position.z) > halfSize) {
            // Turn back force
            this.yaw += 0.05;
        }
        
        // Crash
        const groundH = getTerrainHeight(this.position.x, this.position.z);
        if (this.position.y < Math.max(groundH, CONFIG.waterLevel) + 2) {
            this.crash();
        }
    }
    
    crash() {
        this.position.y = 400;
        this.pitch = 0;
        this.speed = 2.0;
        // console.log("Respawn");
    }
}

const condor = new Condor();

// Post Proc
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.2, 0.5, 0.9));
composer.addPass(new OutputPass());

// Input
const mouse = { x:0, y:0 };
window.addEventListener('mousemove', e => {
    mouse.x = (e.clientX/window.innerWidth)*2 - 1;
    mouse.y = (e.clientY/window.innerHeight)*2 - 1;
});

// Loop
const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    const time = clock.getElapsedTime();
    
    condor.update(mouse.x, mouse.y);
    
    // Shader update
    skyShader.uniforms.time.value = time;
    waterNorm.offset.x += 0.0005;
    waterNorm.offset.y += 0.0002;
    
    // Camera
    const offset = new THREE.Vector3(0, 6, 20).applyEuler(new THREE.Euler(0, condor.yaw, 0));
    offset.y += condor.pitch * 5;
    camera.position.lerp(condor.position.clone().add(offset), 0.1);
    camera.lookAt(condor.position);
    
    composer.render();
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});