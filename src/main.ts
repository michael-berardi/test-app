import './style.css'
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Types ---
type Season = 'spring' | 'summer' | 'autumn' | 'winter';

// --- Configuration ---
const CONFIG = {
  tree: {
    maxDepth: 6, 
    branchRadius: 0.6,
    branchLength: 5.5,
    branchShrink: 0.72,
    branchSplitAngle: 0.5,
    leafDensity: 5,
  },
  seasons: {
    spring: {
      skyTop: 0x5b72d2, skyBottom: 0x84a8cc, fog: 0xddeeff,
      ground: 0x4a5d3f, leaf: 0x88c458, leafOpacity: 0.9,
      sunIntensity: 1.1, sunColor: 0xfff5e6, snow: 0.0
    },
    summer: {
      skyTop: 0x2b32b2, skyBottom: 0x1488cc, fog: 0xcfefff,
      ground: 0x3d352b, leaf: 0x2d4c1e, leafOpacity: 1.0,
      sunIntensity: 1.4, sunColor: 0xffffeb, snow: 0.0
    },
    autumn: {
      skyTop: 0x3b3b5e, skyBottom: 0xcc8855, fog: 0xffeebb,
      ground: 0x4a3c2a, leaf: 0xd95e00, leafOpacity: 0.95,
      sunIntensity: 1.0, sunColor: 0xffaa77, snow: 0.1
    },
    winter: {
      skyTop: 0x1a1a2e, skyBottom: 0x5a6a7a, fog: 0x8a9a9a,
      ground: 0xffffff, leaf: 0xffffff, leafOpacity: 0.0, // No leaves effectively
      sunIntensity: 0.8, sunColor: 0xcceeff, snow: 1.0
    }
  }
};

let currentSeason: Season = 'spring';

// --- Scene Setup ---
const scene = new THREE.Scene();
const initialSeason = CONFIG.seasons[currentSeason];
scene.fog = new THREE.FogExp2(initialSeason.fog, 0.012);
scene.background = new THREE.Color(initialSeason.fog);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 8, 25);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Optimize for retina
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

// --- Controls ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 5;
controls.maxDistance = 50;
controls.maxPolarAngle = Math.PI / 2 - 0.05; // Prevent going under ground
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(initialSeason.sunColor, initialSeason.sunIntensity);
sunLight.position.set(50, 60, 40);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.bias = -0.0005;
scene.add(sunLight);

// --- Materials ---
const barkMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x3d2e23, 
    roughness: 0.9,
    bumpScale: 0.2
});

const leafMaterial = new THREE.MeshStandardMaterial({
    color: initialSeason.leaf,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: initialSeason.leafOpacity,
    alphaTest: 0.5
});

const groundMat = new THREE.MeshStandardMaterial({ 
    color: initialSeason.ground,
    roughness: 0.8,
    metalness: 0.1,
    flatShading: true
});

const mountainMat = new THREE.MeshStandardMaterial({ 
    color: 0x222222, 
    roughness: 0.9, 
    flatShading: true 
});
const snowMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.3,
    metalness: 0.1,
    emissive: 0x222233,
    emissiveIntensity: 0.2
});

// --- Environment Generation (Patagonia) ---

// 1. Water Plane (Lake)
const waterGeo = new THREE.PlaneGeometry(500, 500);
const waterMat = new THREE.MeshStandardMaterial({
    color: 0x004466,
    roughness: 0.1,
    metalness: 0.8,
});
const water = new THREE.Mesh(waterGeo, waterMat);
water.rotation.x = -Math.PI / 2;
water.position.y = -0.5;
scene.add(water);

// 2. Terrain (Ground Island)
const groundGeo = new THREE.CircleGeometry(40, 64);
const posAttr = groundGeo.attributes.position;
for(let i=0; i<posAttr.count; i++){
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const dist = Math.sqrt(x*x + y*y);
    // Taper edges into water
    let z = (Math.sin(x * 0.2) * Math.cos(y * 0.2)) * 1.5;
    z += Math.random() * 0.5;
    if(dist > 30) z -= (dist - 30) * 0.5;
    posAttr.setZ(i, Math.max(-2, z));
}
groundGeo.computeVertexNormals();
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// 3. Mountains (Fitz Roy Style jagged peaks)
const mountainsGroup = new THREE.Group();
scene.add(mountainsGroup);

function createMountain(x: number, z: number, height: number, width: number) {
    const geo = new THREE.ConeGeometry(width, height, 4, 12, true);
    // Jitter vertices for jagged look
    const pos = geo.attributes.position;
    for(let i=0; i<pos.count; i++){
        if(pos.getY(i) < height * 0.9) { // Keep tip relatively sharp
            pos.setX(i, pos.getX(i) + (Math.random()-0.5)*width*0.4);
            pos.setZ(i, pos.getZ(i) + (Math.random()-0.5)*width*0.4);
            pos.setY(i, pos.getY(i) + (Math.random()-0.5)*height*0.1);
        }
    }
    geo.computeVertexNormals();
    
    const mesh = new THREE.Mesh(geo, mountainMat);
    mesh.position.set(x, height/2 - 5, z);
    
    // Snow cap
    const snowGeo = geo.clone();
    snowGeo.scale(1.02, 0.3, 1.02);
    snowGeo.translate(0, height * 0.35, 0);
    const snowCap = new THREE.Mesh(snowGeo, snowMat);
    mesh.add(snowCap);

    mountainsGroup.add(mesh);
}

// Background peaks
createMountain(-30, -60, 80, 25);
createMountain(10, -80, 100, 30); // Main peak
createMountain(40, -60, 70, 20);
createMountain(-60, -40, 50, 25);
createMountain(50, 10, 40, 15);


// --- Tree Generation ---
const treeGroup = new THREE.Group();
scene.add(treeGroup);
const leaves: THREE.Mesh[] = [];

function buildTree() {
    // Clear existing
    while(treeGroup.children.length > 0){ 
        treeGroup.remove(treeGroup.children[0]); 
    }
    leaves.length = 0;

    const generateBranch = (start: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, d: number) => {
        if(d === 0) {
            // Leaves
            const leafCount = currentSeason === 'winter' ? 0 : CONFIG.tree.leafDensity;
            if (leafCount > 0) {
                const leafGeo = new THREE.PlaneGeometry(0.4, 0.4);
                for(let i=0; i<leafCount; i++){
                    const leaf = new THREE.Mesh(leafGeo, leafMaterial);
                    leaf.position.copy(start);
                    leaf.position.x += (Math.random()-0.5);
                    leaf.position.y += (Math.random()-0.5);
                    leaf.position.z += (Math.random()-0.5);
                    leaf.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
                    leaf.castShadow = true;
                    // Custom data for animation
                    leaf.userData = { 
                        freq: Math.random() + 0.5, 
                        phase: Math.random() * Math.PI * 2,
                        basePos: leaf.position.clone()
                    };
                    treeGroup.add(leaf);
                    leaves.push(leaf);
                }
            }
            return;
        }

        const end = new THREE.Vector3().copy(start).add(dir.clone().multiplyScalar(len));
        
        // Branch Mesh
        const branchGeo = new THREE.CylinderGeometry(rad*CONFIG.tree.branchShrink, rad, len, 6);
        branchGeo.translate(0, len/2, 0);
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), dir.clone().normalize());
        const branch = new THREE.Mesh(branchGeo, barkMaterial);
        branch.position.copy(start);
        branch.setRotationFromQuaternion(quat);
        branch.castShadow = true;
        branch.receiveShadow = true;
        treeGroup.add(branch);

        // Children
        const count = 2 + (Math.random() > 0.7 ? 1 : 0);
        for(let i=0; i<count; i++){
            const angleX = (Math.random()-0.5) * CONFIG.tree.branchSplitAngle * 2.5;
            const angleZ = (Math.random()-0.5) * CONFIG.tree.branchSplitAngle * 2.5;
            const newDir = dir.clone().applyEuler(new THREE.Euler(angleX, 0, angleZ)).normalize();
            
            // "Windswept" bias (Patagonia wind usually Strong West->East)
            newDir.x += 0.15; 
            newDir.normalize();

            generateBranch(end, newDir, len*CONFIG.tree.branchShrink, rad*CONFIG.tree.branchShrink, d-1);
        }
    };

    generateBranch(new THREE.Vector3(0,0,0), new THREE.Vector3(0,1,0), CONFIG.tree.branchLength, CONFIG.tree.branchRadius, CONFIG.tree.maxDepth);
}

buildTree();


// --- Season Logic ---
function setSeason(s: Season) {
    currentSeason = s;
    const data = CONFIG.seasons[s];

    // Animate Colors
    const dur = 1000; // ms
    
    // Background / Fog
    new TWEEN.Tween(scene.background).to({ r: new THREE.Color(data.fog).r, g: new THREE.Color(data.fog).g, b: new THREE.Color(data.fog).b }, dur).start();
    new TWEEN.Tween(scene.fog).to({ color: new THREE.Color(data.fog), density: s === 'winter' ? 0.02 : 0.012 }, dur).start();
    
    // Ground
    new TWEEN.Tween(groundMat.color).to({ r: new THREE.Color(data.ground).r, g: new THREE.Color(data.ground).g, b: new THREE.Color(data.ground).b }, dur).start();
    
    // Leaves
    if (s === 'winter') {
        // Drop leaves or hide them
        leafMaterial.opacity = 0;
        // Rebuild tree to remove leaves physically? No, just hide for smooth transition then rebuild if needed.
        // Or simpler: rebuild tree instantly for winter vs others?
        // Let's just fade opacity.
        new TWEEN.Tween(leafMaterial).to({ opacity: 0 }, dur).onComplete(() => buildTree()).start();
    } else {
        // If coming from winter, we might need to rebuild to add leaves back if they were removed
        if (leafMaterial.opacity < 0.1) buildTree(); 
        
        const c = new THREE.Color(data.leaf);
        new TWEEN.Tween(leafMaterial.color).to({ r: c.r, g: c.g, b: c.b }, dur).start();
        new TWEEN.Tween(leafMaterial).to({ opacity: data.leafOpacity }, dur).start();
    }

    // Light
    const sc = new THREE.Color(data.sunColor);
    new TWEEN.Tween(sunLight.color).to({ r: sc.r, g: sc.g, b: sc.b }, dur).start();
    new TWEEN.Tween(sunLight).to({ intensity: data.sunIntensity }, dur).start();
}

// UI Handling
const btns = document.querySelectorAll('.season-btn');
btns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        btns.forEach(b => b.classList.remove('active'));
        (e.target as HTMLElement).classList.add('active');
        const s = (e.target as HTMLElement).dataset.season as Season;
        setSeason(s);
    });
});


// --- Animation Loop ---
// Minimal Tween Polyfill for simplicity
const TWEEN_GROUPS: any[] = [];
class Tween {
    obj: any;
    target: any;
    duration: number;
    startTime: number;
    easing: (t: number) => number = t => t * (2 - t); // EaseOutQuad
    onCompleteCb: (() => void) | null = null;
    
    constructor(obj: any) { this.obj = obj; this.target = {}; this.duration = 1000; this.startTime = performance.now(); TWEEN_GROUPS.push(this); }
    to(target: any, duration: number) { this.target = target; this.duration = duration; return this; }
    onComplete(cb: () => void) { this.onCompleteCb = cb; return this; }
    start() { this.startTime = performance.now(); return this; }
    update(time: number) {
        const elapsed = time - this.startTime;
        let progress = Math.min(elapsed / this.duration, 1);
        progress = this.easing(progress);
        
        for (const key in this.target) {
            if (typeof this.obj[key] === 'object' && this.obj[key].isColor) {
                 // Handle Color objects specially if needed, but here we passed r,g,b directly or handled it outside. 
                 // Actually my usage above: scene.background is Color. TWEEN target is {r,g,b}.
                 // Wait, scene.background IS a Color object. So I can't just set properties if I didn't set them on the object.
            }
            // Simple Lerp
            // NOTE: This is a very rough custom tween for zero-dependency.
            // A better way for colors:
            // We need start values.
        }
        // ... Implementing a full tween engine is tedious. 
        // Let's use a simpler approach: 
        // Just interpolate in the main loop based on a "target state".
    }
}
// REWRITE: Using a simple Leroy approach in animate loop for smooth transitions
// instead of a complex Tween class.

let targetSeasonData = CONFIG.seasons[currentSeason];
let transitionAlpha = 0; 
let transitionSpeed = 0.02;

function animateSeason() {
    // Lerp Light
    sunLight.intensity += (targetSeasonData.sunIntensity - sunLight.intensity) * 0.05;
    const tSun = new THREE.Color(targetSeasonData.sunColor);
    sunLight.color.lerp(tSun, 0.05);

    // Lerp Fog/BG
    const tFog = new THREE.Color(targetSeasonData.fog);
    scene.fog?.color.lerp(tFog, 0.05);
    // @ts-ignore
    scene.background?.lerp(tFog, 0.05);

    // Lerp Ground
    const tGround = new THREE.Color(targetSeasonData.ground);
    groundMat.color.lerp(tGround, 0.05);

    // Lerp Leaves
    const tLeaf = new THREE.Color(targetSeasonData.leaf);
    leafMaterial.color.lerp(tLeaf, 0.05);
    leafMaterial.opacity += (targetSeasonData.leafOpacity - leafMaterial.opacity) * 0.05;
}

// Override setSeason to just update target
// @ts-ignore
setSeason = (s: Season) => {
    currentSeason = s;
    targetSeasonData = CONFIG.seasons[s];
    if (s === 'winter') {
         // Trigger rebuild to remove leaves eventually? 
         // For now just fade.
    } else {
        if (treeGroup.children.length < 50) buildTree(); // Rebuild if barren
    }
}

// Main Loop
let time = 0;
function animate() {
    requestAnimationFrame(animate);
    
    time += 0.01;
    controls.update(); // for damping and autoRotate
    
    // Animate Tree (Wind)
    const windStrength = 0.05 + Math.sin(time * 0.5) * 0.02;
    leaves.forEach(leaf => {
        const { freq, phase, basePos } = leaf.userData;
        leaf.position.x = basePos.x + Math.sin(time * freq + phase) * windStrength;
        leaf.position.z = basePos.z + Math.cos(time * freq * 0.7 + phase) * windStrength * 0.5;
        leaf.rotation.z += Math.cos(time * 2 + phase) * 0.01;
    });

    animateSeason();
    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
