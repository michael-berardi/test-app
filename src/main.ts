import './style.css'
import * as THREE from 'three';

// --- Configuration ---
const CONFIG = {
  seed: 12345,
  tree: {
    maxDepth: 7, // Limit recursion to prevent crash
    branchRadius: 0.8,
    branchLength: 6,
    branchShrink: 0.7,
    branchSplitAngle: 0.4, // radians
    leafDensity: 6,
  },
  colors: {
    skyTop: 0x2b32b2,
    skyBottom: 0x1488cc,
    fog: 0xcfd9df,
    ground: 0x3d352b,
    bark: 0x4a3c31,
    leaf: 0x2d4c1e
  }
};

// --- Scene Setup ---
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(CONFIG.colors.fog, 0.015);
scene.background = new THREE.Color(CONFIG.colors.fog);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 15);
camera.lookAt(0, 5, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfff0dd, 1.2);
sunLight.position.set(50, 80, 30);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 200;
sunLight.shadow.camera.left = -50;
sunLight.shadow.camera.right = 50;
sunLight.shadow.camera.top = 50;
sunLight.shadow.camera.bottom = -50;
scene.add(sunLight);

// --- Environment (Patagonia Vibe) ---

// Ground
const groundGeo = new THREE.PlaneGeometry(200, 200, 64, 64);
// Add some noise to ground vertices for terrain
const positionAttribute = groundGeo.attributes.position;
for ( let i = 0; i < positionAttribute.count; i ++ ) {
    const x = positionAttribute.getX( i );
    const y = positionAttribute.getY( i );
    // Simple noise approximation
    const z = Math.sin(x * 0.1) * Math.cos(y * 0.1) * 2 + Math.random() * 0.5; 
    positionAttribute.setZ( i, z );
}
groundGeo.computeVertexNormals();

const groundMat = new THREE.MeshStandardMaterial({ 
    color: CONFIG.colors.ground,
    roughness: 0.9,
    flatShading: true
});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Mountains (Background)
const mountainGeo = new THREE.ConeGeometry(40, 60, 4, 1, true);
const mountainMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8, flatShading: true });

for(let i=0; i<5; i++) {
    const mtn = new THREE.Mesh(mountainGeo, mountainMat);
    const angle = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * 40;
    mtn.position.set(Math.cos(angle)*dist, 0, Math.sin(angle)*dist);
    mtn.scale.set(1 + Math.random(), 1 + Math.random(), 1 + Math.random());
    mtn.rotation.y = Math.random() * Math.PI;
    scene.add(mtn);
}


// --- Tree Generation (Procedural) ---

const barkMaterial = new THREE.MeshStandardMaterial({ 
    color: CONFIG.colors.bark, 
    roughness: 0.9,
    bumpScale: 0.1
});

const leafMaterial = new THREE.MeshStandardMaterial({
    color: CONFIG.colors.leaf,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9
});

const treeGroup = new THREE.Group();
scene.add(treeGroup);

function createBranch(startPoint: THREE.Vector3, direction: THREE.Vector3, length: number, radius: number, depth: number) {
    if (depth === 0) {
        // Create leaves
        createLeaves(startPoint);
        return;
    }

    const endPoint = new THREE.Vector3().copy(startPoint).add(direction.clone().multiplyScalar(length));

    // Create branch geometry
    // Using simple cylinders for performance
    const branchGeo = new THREE.CylinderGeometry(radius * CONFIG.tree.branchShrink, radius, length, 8);
    branchGeo.translate(0, length / 2, 0); // Pivot at bottom
    
    // Rotate cylinder to align with direction
    // Quaternion magic to align Y axis to direction
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    
    const branchMesh = new THREE.Mesh(branchGeo, barkMaterial);
    branchMesh.position.copy(startPoint);
    branchMesh.setRotationFromQuaternion(quaternion);
    branchMesh.castShadow = true;
    branchMesh.receiveShadow = true;
    treeGroup.add(branchMesh);

    // Recursion for children
    const numChildren = 2; // Split into 2 branches
    for (let i = 0; i < numChildren; i++) {
        // Perturb direction
        const angleX = (Math.random() - 0.5) * CONFIG.tree.branchSplitAngle * 2;
        const angleZ = (Math.random() - 0.5) * CONFIG.tree.branchSplitAngle * 2;
        
        const newDir = direction.clone().applyEuler(new THREE.Euler(angleX, 0, angleZ)).normalize();
        
        // Wind effect / Gravity bias (Patagonia winds)
        newDir.x += 0.1; // Wind blowing right
        newDir.normalize();

        createBranch(
            endPoint, 
            newDir, 
            length * CONFIG.tree.branchShrink, 
            radius * CONFIG.tree.branchShrink, 
            depth - 1
        );
    }
}

function createLeaves(position: THREE.Vector3) {
    const leafGeo = new THREE.PlaneGeometry(0.3, 0.5);
    
    for(let i=0; i<CONFIG.tree.leafDensity; i++) {
        const leaf = new THREE.Mesh(leafGeo, leafMaterial);
        leaf.position.copy(position);
        
        // Random offset
        leaf.position.x += (Math.random() - 0.5) * 1.5;
        leaf.position.y += (Math.random() - 0.5) * 1.5;
        leaf.position.z += (Math.random() - 0.5) * 1.5;

        leaf.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        leaf.castShadow = true;
        treeGroup.add(leaf);
    }
}

// Start Tree
createBranch(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), CONFIG.tree.branchLength, CONFIG.tree.branchRadius, CONFIG.tree.maxDepth);


// --- Animation Loop ---
let time = 0;
function animate() {
    requestAnimationFrame(animate);

    time += 0.005;

    // Gentle camera orbit
    const camDist = 18;
    camera.position.x = Math.sin(time * 0.2) * camDist;
    camera.position.z = Math.cos(time * 0.2) * camDist;
    camera.lookAt(0, 5, 0);

    // Simple wind effect on tree (very basic, rotating whole group slightly)
    treeGroup.rotation.z = Math.sin(time) * 0.02;

    renderer.render(scene, camera);
}

animate();

// Handle Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});