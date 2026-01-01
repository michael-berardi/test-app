import './style.css'
import * as THREE from 'three';

// --- Configuration ---
const CONFIG = {
  worldSize: 2000,
  waterLevel: 5,
  colors: {
    sun: 0xffaa00,
    water: 0x004961,
  }
};

// --- Helper: FBM Noise for Terrain ---
// Fractional Brownian Motion
function fbm(x: number, z: number) {
  let value = 0;
  let amplitude = 1;
  let frequency = 0.002;
  
  // 4 Octaves
  value += Math.sin(x * frequency) * Math.cos(z * frequency) * 120 * amplitude;
  
  amplitude *= 0.5; frequency *= 2.0;
  value += Math.sin(x * frequency + 1.2) * Math.cos(z * frequency + 1.2) * 120 * amplitude;
  
  amplitude *= 0.5; frequency *= 2.0;
  value += Math.abs(Math.sin(x * frequency) * Math.cos(z * frequency)) * 120 * amplitude; // Ridges
  
  amplitude *= 0.5; frequency *= 2.0;
  value += (Math.sin(x * frequency * 2) + Math.cos(z * frequency * 2)) * 120 * amplitude;

  return value;
}

function getTerrainHeight(x: number, z: number) {
    let h = fbm(x, z);
    
    // Flatten center for lake (optional, keeps gameplay area interesting)
    const dist = Math.sqrt(x*x + z*z);
    if (dist < 400) {
        h = THREE.MathUtils.lerp(h, -20, 1.0 - (dist/400));
    }
    
    return h;
}

// --- Scene Setup ---
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 5000);
// Camera will follow bird

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

// --- Lighting ---
const sunLight = new THREE.DirectionalLight(CONFIG.colors.sun, 2.0);
sunLight.position.set(-500, 300, -500);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 10;
sunLight.shadow.camera.far = 2000;
sunLight.shadow.bias = -0.0001;
const d = 1000;
sunLight.shadow.camera.left = -d; sunLight.shadow.camera.right = d;
sunLight.shadow.camera.top = d; sunLight.shadow.camera.bottom = -d;
scene.add(sunLight);

const ambientLight = new THREE.AmbientLight(0x404040, 1.0);
scene.add(ambientLight);

// --- 2. Photorealistic Sky Shader ---
const skyGeo = new THREE.SphereGeometry(2000, 32, 32);
const skyMat = new THREE.ShaderMaterial({
    uniforms: {
        time: { value: 0 },
        sunPosition: { value: sunLight.position.clone().normalize() }
    },
    vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform float time;
        uniform vec3 sunPosition;
        varying vec3 vWorldPosition;

        // Simple noise function
        float hash(float n) { return fract(sin(n) * 43758.5453123); }
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

        // FBM for clouds
        float fbm(vec3 p) {
            float f = 0.0;
            f += 0.5000 * noise(p); p = p * 2.02;
            f += 0.2500 * noise(p); p = p * 2.03;
            f += 0.1250 * noise(p); p = p * 2.01;
            return f;
        }

        void main() {
            vec3 dir = normalize(vWorldPosition);
            
            // Atmosphere Gradient
            vec3 topColor = vec3(0.1, 0.3, 0.7);
            vec3 bottomColor = vec3(0.7, 0.8, 0.9);
            float h = smoothstep(-0.2, 0.6, dir.y);
            vec3 skyColor = mix(bottomColor, topColor, h);
            
            // Sun Glare
            float sunDot = dot(dir, sunPosition);
            float sunGlare = pow(max(0.0, sunDot), 100.0);
            skyColor += vec3(1.0, 0.8, 0.5) * sunGlare;
            
            // Clouds
            // Drift clouds with time
            vec3 cloudPos = vWorldPosition * 0.002;
            cloudPos.x += time * 0.02;
            float cloudDensity = fbm(cloudPos);
            
            // Mask clouds to horizon mostly
            float cloudMask = smoothstep(0.1, 0.8, dir.y); // Fade at top and very bottom
            // Actually clouds usually at top? Let's just have them everywhere but fade at horizon
            
            cloudDensity = smoothstep(0.4, 0.8, cloudDensity); // Sharpen
            
            vec3 cloudColor = vec3(1.0);
            skyColor = mix(skyColor, cloudColor, cloudDensity * 0.8 * smoothstep(0.0, 0.2, dir.y));

            gl_FragColor = vec4(skyColor, 1.0);
        }
    `,
    side: THREE.BackSide
});
const sky = new THREE.Mesh(skyGeo, skyMat);
scene.add(sky);


// --- 1. Terrain & Trees ---
const terrainGeo = new THREE.PlaneGeometry(CONFIG.worldSize, CONFIG.worldSize, 200, 200);
const pos = terrainGeo.attributes.position;
const cols = [];
const colorObj = new THREE.Color();

for(let i=0; i<pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getY(i); // Plane is XY before rotation
    const h = getTerrainHeight(x, z);
    pos.setZ(i, h);
    
    // Coloring
    if (h < CONFIG.waterLevel + 2) {
        colorObj.setHex(0x888844); // Sand
    } else if (h > 150) {
        colorObj.setHex(0xffffff); // Snow
    } else if (h > 80) {
        colorObj.setHex(0x555555); // Rock
    } else {
        colorObj.setHex(0x2d4c1e); // Grass
    }
    cols.push(colorObj.r, colorObj.g, colorObj.b);
}
terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
terrainGeo.computeVertexNormals();

const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.8,
    metalness: 0.1,
    flatShading: false
});
const terrain = new THREE.Mesh(terrainGeo, terrainMat);
terrain.rotation.x = -Math.PI / 2;
terrain.receiveShadow = true;
terrain.castShadow = true;
scene.add(terrain);

// Water
const waterGeo = new THREE.PlaneGeometry(CONFIG.worldSize, CONFIG.worldSize);
const waterMat = new THREE.MeshStandardMaterial({
    color: CONFIG.colors.water,
    roughness: 0.1,
    metalness: 0.8,
});
const water = new THREE.Mesh(waterGeo, waterMat);
water.rotation.x = -Math.PI / 2;
water.position.y = CONFIG.waterLevel;
scene.add(water);

// Trees
const treeCount = 1000;
const treeGeo = new THREE.ConeGeometry(5, 20, 6);
const treeMat = new THREE.MeshStandardMaterial({ color: 0x1a281a });
const forest = new THREE.InstancedMesh(treeGeo, treeMat, treeCount);
forest.castShadow = true;
scene.add(forest);

const dummy = new THREE.Object3D();
let tIdx = 0;
for(let i=0; i<treeCount; i++) {
    const x = (Math.random() - 0.5) * CONFIG.worldSize * 0.9;
    const z = (Math.random() - 0.5) * CONFIG.worldSize * 0.9;
    const h = getTerrainHeight(x, z);
    
    // Placement Logic
    if (h > CONFIG.waterLevel + 5 && h < 140) { // Not in water, not on snow
        dummy.position.set(x, h + 10, z);
        const s = 0.8 + Math.random() * 0.5;
        dummy.scale.set(s, s, s);
        dummy.rotation.y = Math.random() * Math.PI * 2;
        dummy.updateMatrix();
        forest.setMatrixAt(tIdx++, dummy.matrix);
    }
}
// Hide rest
for(let i=tIdx; i<treeCount; i++) forest.setMatrixAt(i, new THREE.Matrix4().makeScale(0,0,0));
forest.instanceMatrix.needsUpdate = true;


// --- 3. Bird Physics & Controls ---
class Bird {
    mesh: THREE.Group;
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    speed: number = 2.0;
    roll: number = 0;
    pitch: number = 0;
    yaw: number = 0;

    constructor() {
        this.mesh = new THREE.Group();
        
        // Body
        const body = new THREE.Mesh(new THREE.ConeGeometry(0.8, 3, 8), new THREE.MeshStandardMaterial({ color: 0x333333 }));
        body.rotation.x = Math.PI / 2;
        this.mesh.add(body);
        
        // Wings
        const wings = new THREE.Mesh(new THREE.BoxGeometry(8, 0.2, 1.5), new THREE.MeshStandardMaterial({ color: 0x111111 }));
        wings.position.set(0, 0, -0.5);
        this.mesh.add(wings);
        
        // Tail
        const tail = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 1.5), new THREE.MeshStandardMaterial({ color: 0x222222 }));
        tail.position.set(0, 0, 1.5);
        this.mesh.add(tail);

        scene.add(this.mesh);
        
        this.position = new THREE.Vector3(0, 200, 400);
        this.velocity = new THREE.Vector3(0, 0, -1);
    }

    update(targetX: number, targetY: number) {
        // Physics / Controls
        
        // Target Direction based on mouse
        // Mouse X controls Yaw (Turning)
        // Mouse Y controls Pitch (Dive/Climb)
        
        const turnSpeed = 0.04;
        
        // Update Orientation
        this.yaw -= targetX * turnSpeed;
        this.pitch = THREE.MathUtils.lerp(this.pitch, targetY * 0.8, 0.1);
        
        // Bank (Roll) based on turn
        const targetRoll = -targetX * 1.0; // Bank into turn
        this.roll = THREE.MathUtils.lerp(this.roll, targetRoll, 0.05);
        
        // Velocity Vector
        const forward = new THREE.Vector3(0, 0, -1);
        forward.applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
        forward.normalize();
        
        // Move
        this.velocity.copy(forward).multiplyScalar(this.speed);
        this.position.add(this.velocity);
        
        // Apply Transform
        this.mesh.position.copy(this.position);
        this.mesh.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
        
        // Speed up when diving
        if (this.pitch < -0.2) this.speed += 0.01;
        else this.speed += (2.0 - this.speed) * 0.01; // Return to cruise
        
        // Collision Check
        const groundH = getTerrainHeight(this.position.x, this.position.z);
        if (this.position.y < Math.max(groundH, CONFIG.waterLevel) + 2) {
            console.log("CRASH!");
            // Reset or Bounce
            this.position.y = Math.max(groundH, CONFIG.waterLevel) + 10;
            this.pitch = 0.5; // Bounce up
        }
    }
}

const bird = new Bird();

// Input
const mouse = { x: 0, y: 0 };
window.addEventListener('mousemove', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1; // Invert Y
});


// --- Animation ---
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    
    // Update Shader
    skyMat.uniforms.time.value = clock.getElapsedTime();
    
    // Update Bird
    bird.update(mouse.x, mouse.y);
    
    // Camera Follow
    const offset = new THREE.Vector3(0, 5, 20);
    offset.applyEuler(new THREE.Euler(0, bird.yaw, 0));
    // Add some lag for smooth feel
    const targetPos = bird.position.clone().add(offset);
    camera.position.lerp(targetPos, 0.1);
    camera.lookAt(bird.position);

    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});