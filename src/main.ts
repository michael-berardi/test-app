import './style.css'
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// --- Types ---
type Season = 'spring' | 'summer' | 'autumn' | 'winter';

// --- Configuration ---
const CONFIG = {
  tree: {
    maxDepth: 5, 
    branchRadius: 0.8,
    branchLength: 7.0,
    branchShrink: 0.7,
    branchSplitAngle: 0.5,
    leafDensity: 7,
  },
  seasons: {
    spring: {
      skyTop: 0x5b72d2, skyBottom: 0x84a8cc, fog: 0xddeeff,
      ground: 0x4a5d3f, leaf: 0x88c458, leafOpacity: 0.9,
      sunIntensity: 1.5, sunColor: 0xfff5e6, snow: 0.0
    },
    summer: {
      skyTop: 0x2b32b2, skyBottom: 0x1488cc, fog: 0xcfefff,
      ground: 0x3d352b, leaf: 0x2d4c1e, leafOpacity: 1.0,
      sunIntensity: 1.8, sunColor: 0xffffeb, snow: 0.0
    },
    autumn: {
      skyTop: 0x3b3b5e, skyBottom: 0xcc8855, fog: 0xffeebb,
      ground: 0x4a3c2a, leaf: 0xd95e00, leafOpacity: 0.95,
      sunIntensity: 1.2, sunColor: 0xffaa77, snow: 0.1
    },
    winter: {
      skyTop: 0x1a1a2e, skyBottom: 0x5a6a7a, fog: 0x8a9a9a,
      ground: 0xffffff, leaf: 0xffffff, leafOpacity: 0.0,
      sunIntensity: 1.0, sunColor: 0xcceeff, snow: 1.0
    }
  }
};

let currentSeason: Season = 'spring';

// --- Scene Setup ---
const scene = new THREE.Scene();
const initialSeason = CONFIG.seasons[currentSeason];
scene.fog = new THREE.FogExp2(initialSeason.fog, 0.008); // Lighter fog for depth
scene.background = new THREE.Color(initialSeason.fog);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 40);

const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false }); // Antialias handled by post-proc or not needed with bloom
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
document.body.appendChild(renderer.domElement);

// --- Post Processing ---
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0.7; // Only bloom bright things
bloomPass.strength = 0.3; // Subtle bloom
bloomPass.radius = 0.5;
composer.addPass(bloomPass);

const outputPass = new OutputPass();
composer.addPass(outputPass);

// --- Controls ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 10;
controls.maxDistance = 80;
controls.maxPolarAngle = Math.PI / 2 - 0.02;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.3;

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(initialSeason.sunColor, initialSeason.sunIntensity);
sunLight.position.set(80, 100, 50);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 4096; // High res shadows
sunLight.shadow.mapSize.height = 4096;
sunLight.shadow.bias = -0.0001;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 300;
sunLight.shadow.camera.left = -100;
sunLight.shadow.camera.right = 100;
sunLight.shadow.camera.top = 100;
sunLight.shadow.camera.bottom = -100;
scene.add(sunLight);

// --- Materials ---

// Procedural Bark Texture
const barkCanvas = document.createElement('canvas');
barkCanvas.width = 1024;
barkCanvas.height = 1024;
const bCtx = barkCanvas.getContext('2d');
if (bCtx) {
    bCtx.fillStyle = '#3d2e23';
    bCtx.fillRect(0,0,1024,1024);
    // Noise
    for(let i=0; i<50000; i++) {
        bCtx.fillStyle = Math.random() > 0.5 ? '#4a3c31' : '#2b2018';
        bCtx.fillRect(Math.random()*1024, Math.random()*1024, 2, 20 + Math.random()*50);
    }
}
const barkMap = new THREE.CanvasTexture(barkCanvas);
barkMap.wrapS = THREE.RepeatWrapping;
barkMap.wrapT = THREE.RepeatWrapping;
barkMap.repeat.set(2, 4);

const barkMaterial = new THREE.MeshStandardMaterial({ 
    map: barkMap,
    roughness: 0.9,
    bumpMap: barkMap,
    bumpScale: 0.3,
});

const leafMaterial = new THREE.MeshStandardMaterial({
    color: initialSeason.leaf,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: initialSeason.leafOpacity,
    alphaTest: 0.5,
    roughness: 0.6
});

const groundMat = new THREE.MeshStandardMaterial({ 
    color: initialSeason.ground,
    roughness: 0.9,
    metalness: 0.1,
});

// --- Environment Generation (Patagonia) ---

// 1. Water (Lake)
const waterGeo = new THREE.PlaneGeometry(2000, 2000);
const waterMat = new THREE.MeshStandardMaterial({
    color: 0x113344,
    roughness: 0.02,
    metalness: 0.8,
});
const water = new THREE.Mesh(waterGeo, waterMat);
water.rotation.x = -Math.PI / 2;
water.position.y = -2;
scene.add(water);

// 2. Terrain (Foreground Island)
// Use a displaced circle for the tree to sit on
const groundGeo = new THREE.CircleGeometry(40, 128);
const posAttr = groundGeo.attributes.position;
for(let i=0; i<posAttr.count; i++){
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const dist = Math.sqrt(x*x + y*y);
    let z = Math.sin(x*0.1)*Math.cos(y*0.1) * 0.5;
    z += (Math.random()-0.5)*0.1;
    if (dist > 30) z -= (dist-30); // Steep drop off
    posAttr.setZ(i, Math.max(-10, z));
}
groundGeo.computeVertexNormals();
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.1; // Slightly above water
ground.receiveShadow = true;
scene.add(ground);

// 3. Background Mountains (Way back)
const mtnGroup = new THREE.Group();
scene.add(mtnGroup);

// Generate a high-res mountain strip in the back
const mtnW = 1000;
const mtnD = 400;
const mtnGeo = new THREE.PlaneGeometry(mtnW, mtnD, 256, 64);
const mtnPos = mtnGeo.attributes.position;
for(let i=0; i<mtnPos.count; i++) {
    const x = mtnPos.getX(i);
    const y = mtnPos.getY(i); // Z in world
    
    // Noise
    let h = 0;
    h += Math.sin(x * 0.01) * 50;
    h += Math.sin(x * 0.03 + y*0.02) * 20;
    h += Math.abs(Math.sin(x*0.1)) * 10;
    h += (Math.random()-0.5) * 5;
    
    // Taper edges
    const distFromCenter = Math.abs(x) / (mtnW/2);
    h *= (1.0 - Math.pow(distFromCenter, 4));
    
    mtnPos.setZ(i, Math.max(-50, h));
}
mtnGeo.computeVertexNormals();

// Texture for mountain
const mtnCanvas = document.createElement('canvas');
mtnCanvas.width = 512;
mtnCanvas.height = 512;
const mCtx = mtnCanvas.getContext('2d');
if (mCtx) {
    const g = mCtx.createLinearGradient(0, 512, 0, 0);
    g.addColorStop(0, '#222'); // Rock base
    g.addColorStop(0.5, '#444');
    g.addColorStop(0.6, '#ddd'); // Snow line
    g.addColorStop(1, '#fff'); // Peak
    mCtx.fillStyle = g;
    mCtx.fillRect(0,0,512,512);
}
const mtnTex = new THREE.CanvasTexture(mtnCanvas);
const mtnMat = new THREE.MeshStandardMaterial({
    map: mtnTex,
    displacementMap: mtnTex,
    displacementScale: 20,
    roughness: 0.9,
});

const mountainMesh = new THREE.Mesh(mtnGeo, mtnMat);
mountainMesh.rotation.x = -Math.PI / 2;
mountainMesh.position.set(0, 0, -300); // Far back
mountainMesh.scale.set(1, 1, 3); // Stretch height
mtnGroup.add(mountainMesh);


// --- Organic Tree Generation ---
const treeGroup = new THREE.Group();
scene.add(treeGroup);
const leaves: THREE.Mesh[] = [];

function buildTree() {
    // Clear
    while(treeGroup.children.length > 0){ 
        treeGroup.remove(treeGroup.children[0]); 
    }
    leaves.length = 0;

    const createOrganicBranch = (startPos: THREE.Vector3, direction: THREE.Vector3, length: number, radius: number, depth: number) => {
        if (depth === 0) {
             // Leaves
             const leafCount = currentSeason === 'winter' ? 0 : CONFIG.tree.leafDensity;
             if (leafCount > 0) {
                 const leafGeo = new THREE.PlaneGeometry(0.3, 0.3);
                 for(let i=0; i<leafCount; i++){
                     const leaf = new THREE.Mesh(leafGeo, leafMaterial);
                     leaf.position.copy(startPos);
                     leaf.position.x += (Math.random()-0.5) * 1.5;
                     leaf.position.y += (Math.random()-0.5) * 1.5;
                     leaf.position.z += (Math.random()-0.5) * 1.5;
                     leaf.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
                     leaf.castShadow = true;
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

        const endPos = new THREE.Vector3().copy(startPos).add(direction.clone().multiplyScalar(length));
        
        // Create Curve
        const points = [];
        points.push(startPos.clone());
        const midPos = new THREE.Vector3().lerpVectors(startPos, endPos, 0.5);
        // Add irregularity
        midPos.x += (Math.random() - 0.5) * length * 0.15;
        midPos.z += (Math.random() - 0.5) * length * 0.15;
        points.push(midPos);
        points.push(endPos.clone());
        
        const curve = new THREE.CatmullRomCurve3(points);
        const segments = 12;
        const tubeGeo = new THREE.TubeGeometry(curve, segments, radius, 8, false);
        
        // Tapering Logic: Simplified
        // Standard TubeGeometry doesn't support radius tapering easily.
        // We rely on the recursion step-down (radius * shrink) for the main tapering effect.
        // This creates a segmented "bamboo" look which is acceptable.

        const branch = new THREE.Mesh(tubeGeo, barkMaterial);
        branch.castShadow = true;
        branch.receiveShadow = true;
        treeGroup.add(branch);

        // Children
        const count = 2 + (Math.random() > 0.6 ? 1 : 0);
        for(let i=0; i<count; i++){
            const angleX = (Math.random()-0.5) * CONFIG.tree.branchSplitAngle * 2.0;
            const angleZ = (Math.random()-0.5) * CONFIG.tree.branchSplitAngle * 2.0;
            const tangent = curve.getTangentAt(1);
            const newDir = tangent.clone().applyEuler(new THREE.Euler(angleX, 0, angleZ)).normalize();
            newDir.y += 0.3; // Tendency to grow up
            newDir.normalize();

            createOrganicBranch(
                endPos, 
                newDir, 
                length * CONFIG.tree.branchShrink, 
                radius * CONFIG.tree.branchShrink, 
                depth - 1
            );
        }
    };

    createOrganicBranch(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), CONFIG.tree.branchLength, CONFIG.tree.branchRadius, CONFIG.tree.maxDepth);
}

buildTree();


// --- Season Logic ---
let targetSeasonData = CONFIG.seasons[currentSeason];

function setSeason(s: Season) {
    currentSeason = s;
    targetSeasonData = CONFIG.seasons[s];
    
    document.querySelectorAll('.season-btn').forEach(btn => {
        btn.classList.toggle('active', (btn as HTMLElement).dataset.season === s);
    });

    if (s === 'winter') {
         // effects
    } else {
        if (treeGroup.children.length < 50) buildTree(); 
    }
}

const btns = document.querySelectorAll('.season-btn');
btns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        const s = (e.target as HTMLElement).dataset.season as Season;
        setSeason(s);
    });
});

function animateSeason() {
    sunLight.intensity += (targetSeasonData.sunIntensity - sunLight.intensity) * 0.05;
    const tSun = new THREE.Color(targetSeasonData.sunColor);
    sunLight.color.lerp(tSun, 0.05);

    const tFog = new THREE.Color(targetSeasonData.fog);
    // @ts-ignore
    if (scene.fog) {
         // @ts-ignore
         scene.fog.color.lerp(tFog, 0.05);
         // @ts-ignore
         scene.fog.density += ((currentSeason === 'winter' ? 0.008 : 0.005) - scene.fog.density) * 0.05;
    }
    // @ts-ignore
    if (scene.background && scene.background.isColor) {
        // @ts-ignore
        scene.background.lerp(tFog, 0.05);
    }

    const tGround = new THREE.Color(targetSeasonData.ground);
    groundMat.color.lerp(tGround, 0.05);

    const tLeaf = new THREE.Color(targetSeasonData.leaf);
    leafMaterial.color.lerp(tLeaf, 0.05);
    leafMaterial.opacity += (targetSeasonData.leafOpacity - leafMaterial.opacity) * 0.05;
}

// Main Loop
let time = 0;
function animate() {
    requestAnimationFrame(animate);
    
    time += 0.01;
    controls.update(); 
    
    const windStrength = 0.05 + Math.sin(time * 0.5) * 0.02;
    leaves.forEach(leaf => {
        const { freq, phase, basePos } = leaf.userData;
        leaf.position.x = basePos.x + Math.sin(time * freq + phase) * windStrength;
        leaf.position.z = basePos.z + Math.cos(time * freq * 0.7 + phase) * windStrength * 0.5;
        leaf.rotation.z += Math.cos(time * 2 + phase) * 0.01;
    });

    animateSeason();
    
    // Post Processing Render
    composer.render();
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});
