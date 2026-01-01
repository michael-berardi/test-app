import './style.css'
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Types ---
type Season = 'spring' | 'summer' | 'autumn' | 'winter';

// --- Configuration ---
const CONFIG = {
  tree: {
    maxDepth: 5, 
    branchRadius: 0.7,
    branchLength: 6.0,
    branchShrink: 0.7,
    branchSplitAngle: 0.6,
    leafDensity: 6,
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
      ground: 0xffffff, leaf: 0xffffff, leafOpacity: 0.0,
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
camera.position.set(0, 8, 30);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
controls.maxDistance = 60;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(initialSeason.sunColor, initialSeason.sunIntensity);
sunLight.position.set(50, 60, 40);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.bias = -0.0005;
scene.add(sunLight);

// --- Materials ---
const barkMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x4a3c31, 
    roughness: 0.8,
    bumpScale: 0.5,
    flatShading: false
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
    roughness: 0.9,
    metalness: 0.1,
    flatShading: true
});

// --- Environment Generation (Patagonia) ---

// 1. Water Plane (Lake)
const waterGeo = new THREE.PlaneGeometry(800, 800);
const waterMat = new THREE.MeshStandardMaterial({
    color: 0x004466,
    roughness: 0.05, // More reflective
    metalness: 0.9,
});
const water = new THREE.Mesh(waterGeo, waterMat);
water.rotation.x = -Math.PI / 2;
water.position.y = -2;
scene.add(water);

// 2. Terrain (Ground Island)
const groundGeo = new THREE.CircleGeometry(50, 128);
const posAttr = groundGeo.attributes.position;
for(let i=0; i<posAttr.count; i++){
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const dist = Math.sqrt(x*x + y*y);
    
    // Perlin-ish noise approximation
    let z = Math.sin(x * 0.15) * Math.cos(y * 0.15) * 1.5;
    z += Math.sin(x * 0.5 + y * 0.3) * 0.5;
    z += (Math.random() - 0.5) * 0.2;
    
    // Taper edges into water
    if(dist > 35) {
        z -= (dist - 35) * 0.8;
    }
    
    posAttr.setZ(i, Math.max(-3, z)); // Clamp bottom
}
groundGeo.computeVertexNormals();
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.5;
ground.receiveShadow = true;
scene.add(ground);

// 3. Mountains (Realistic Plane Displacement)
const mtnWidth = 400;
const mtnDepth = 200;
const mtnGeo = new THREE.PlaneGeometry(mtnWidth, mtnDepth, 128, 64);
const mtnPos = mtnGeo.attributes.position;

for(let i=0; i<mtnPos.count; i++){
    const x = mtnPos.getX(i);
    const y = mtnPos.getY(i); // This is actually Z in world space before rotation
    
    // Jagged Noise Function
    let h = 0;
    // Layer 1: Big shapes
    h += Math.sin(x * 0.02) * Math.cos(y * 0.03) * 30;
    // Layer 2: Medium details
    h += Math.sin(x * 0.05 + 2) * Math.cos(y * 0.06 + 1) * 15;
    // Layer 3: Sharp peaks (Simulate erosion with abs)
    h += Math.abs(Math.sin(x * 0.1 + y * 0.05) * 10);
    // Layer 4: Noise
    h += (Math.random() - 0.5) * 3;
    
    // Lift up to form backdrop
    h += 20;

    // Mask to keep center clear? No, this is background.
    // Just make sure it's high enough.
    
    // Snow threshold logic later in shader? 
    // We can't easily multi-material a single plane without shaders or vertex colors.
    // For now, let's just make it all rock/snow mix via vertex colors?
    // Or just simple material.
    
    mtnPos.setZ(i, Math.max(0, h)); // Height is Z here
}
mtnGeo.computeVertexNormals();

// Create a canvas texture for snow/rock mix to add realism without custom shader code
const canvas = document.createElement('canvas');
canvas.width = 512;
canvas.height = 512;
const ctx = canvas.getContext('2d');
if (ctx) {
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, 512, 512);
    // Add snow gradient
    const grad = ctx.createLinearGradient(0, 512, 0, 0);
    grad.addColorStop(0.4, 'rgba(255,255,255,0)');
    grad.addColorStop(0.8, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1.0, 'rgba(255,255,255,1)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);
}
const mtnTexture = new THREE.CanvasTexture(canvas);
const realisticMtnMat = new THREE.MeshStandardMaterial({
    map: mtnTexture,
    displacementMap: mtnTexture, // Use brightness for extra detail
    displacementScale: 10,
    roughness: 0.8,
    color: 0xffffff
});

const mountains = new THREE.Mesh(mtnGeo, realisticMtnMat);
mountains.rotation.x = -Math.PI / 2;
mountains.position.set(0, -5, -80); // Push back
scene.add(mountains);


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
                 const leafGeo = new THREE.PlaneGeometry(0.4, 0.4);
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
        
        // Mid point with "wiggle"
        const midPos = new THREE.Vector3().lerpVectors(startPos, endPos, 0.5);
        midPos.x += (Math.random() - 0.5) * length * 0.2;
        midPos.z += (Math.random() - 0.5) * length * 0.2;
        points.push(midPos);
        
        points.push(endPos.clone());
        
        const curve = new THREE.CatmullRomCurve3(points);
        
        // Tube Geometry
        const segments = 8;
        const tubeGeo = new THREE.TubeGeometry(curve, segments, radius, 6, false);
        
        // Taper the tube manually
        const pos = tubeGeo.attributes.position;
        
        // Simpler taper check
        for(let i=0; i < pos.count; i++) {
             // We can't easily tell which ring we are in without more logic.
             // But we can taper based on distance from start?
             // No, let's just use the radius decrease for children.
             // For "Continuous" look, we just ensure child starts where parent ends.
        }
        
        const branch = new THREE.Mesh(tubeGeo, barkMaterial);
        branch.castShadow = true;
        branch.receiveShadow = true;
        treeGroup.add(branch);

        // Recursive Children
        const count = 2 + (Math.random() > 0.7 ? 1 : 0);
        for(let i=0; i<count; i++){
            const angleX = (Math.random()-0.5) * CONFIG.tree.branchSplitAngle * 2.0;
            const angleZ = (Math.random()-0.5) * CONFIG.tree.branchSplitAngle * 2.0;
            
            // Calculate tangent at end of curve for smooth transition
            const tangent = curve.getTangentAt(1);
            
            const newDir = tangent.clone().applyEuler(new THREE.Euler(angleX, 0, angleZ)).normalize();
            
            // Wind bias
            newDir.x += 0.1;
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

    createOrganicBranch(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 1, 0), CONFIG.tree.branchLength, CONFIG.tree.branchRadius, CONFIG.tree.maxDepth);
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
         scene.fog.density += ((currentSeason === 'winter' ? 0.02 : 0.012) - scene.fog.density) * 0.05;
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
    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});