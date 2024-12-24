import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Environment helpers
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

// Post-processing
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
// Optionally you can add FilmPass, SMAAPass, etc. as you like.

let scene, camera, renderer, controls;
let composer; // for post-processing

// Morph target references
let avatarMesh = null;
let mouthOpenIndex = null;
let mouthSmileIndex = null;
let eyebrowRaiseIndex = null;
let isSpeaking = false;
let blinkIndex = null;      
let cheekRaiseIndex = null; 
let lipCornerDepressIndex = null;

// Toggle between sphere environment or room environment:
const USE_SPHERE_ENV = true; // if false => use RoomEnvironment

/**
 * 1) Initialize 3D Scene
 */
function initThreeScene() {
  const canvas = document.getElementById('three-canvas');
  scene = new THREE.Scene();

  // --- Renderer ---
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.8;
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // --- Camera ---
  camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1.4, 2);

  // --- Controls (Orbit) ---
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 1.4, 0); // keep the target on the avatar’s head/upper body
  controls.update();
  controls.enablePan = false;

  // Only allow a small horizontal rotation range (e.g., ±0.15 radians ~ ±8.6 degrees)
  controls.minAzimuthAngle = -0.15;
  controls.maxAzimuthAngle =  0.15;

  // (Optionally) if you want to limit vertical tilt as well:
  controls.minPolarAngle = Math.PI / 2 - 0.3; // ~top angle
  controls.maxPolarAngle = Math.PI / 2 + 0.3; // ~bottom angle

  // Also limit how close/far the camera can orbit:
  controls.minDistance = 1.0;
  controls.maxDistance = 2.5;

  // Keep damping enabled to get smooth transitions
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // --- Environment Setup ---
  setupEnvironment(renderer);

  // --- Lights ---
  setupLights();

  // --- Load Avatar ---
  loadAvatar();

  // --- Post-processing setup (optional but recommended for advanced render) ---
  setupPostProcessing();

  // --- Start the render loop ---
  animate();
}

/**
 * 2) Environment Setup:
 *    Choose between a 360 Sphere environment or a RoomEnvironment
 */
function setupEnvironment(renderer) {
  const rgbeLoader = new RGBELoader();

  rgbeLoader.load(
    'cayley_interior_4k.hdr',
    (hdrTexture) => {
      hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
      hdrTexture.encoding = THREE.sRGBEncoding;

      // Set the HDR texture as the scene's background and environment
      scene.background = hdrTexture;
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      pmremGenerator.compileEquirectangularShader();

      const envMap = pmremGenerator.fromEquirectangular(hdrTexture).texture;
      scene.environment = envMap;

      // Tone mapping and renderer setup for better exposure and realism
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1; // Adjust for improved brightness and contrast

      // Dispose PMREMGenerator (keep hdrTexture as background)
      pmremGenerator.dispose();

      // Add spherical world realism (ensure a fully immersive HDR)
      const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(500, 100, 100), // Higher segments for smoother sphere
          new THREE.MeshBasicMaterial({
              map: hdrTexture,
          })
      );

      // Position the HDR sphere for alignment
      sphere.position.set(0, -50, -50); // Adjust Y-axis to position HDRI "floor"
      sphere.scale.set(0.5, 0.5, 0.5); // Slight stretch for better perspective alignment
      sphere.rotation.y = Math.PI/2;

      scene.add(sphere);
    },
    undefined,
    (error) => {
      console.error('An error occurred loading the HDR file:', error);
    }
  );
}




function setupLights() {
  // Ambient Light
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.25); // Lower intensity
  scene.add(ambientLight);

  // Directional Light
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.5); // Moderate intensity
  dirLight.position.set(0, 0, 0);
  dirLight.castShadow = true;
  dirLight.shadow.camera.far = 20;
  dirLight.shadow.mapSize.set(2048, 2048);
  scene.add(dirLight);


}

/**
 * 4) Load Avatar (GLB) with advanced PBR materials & arms adjustment
 */
function loadAvatar() {
  const loader = new GLTFLoader();
  loader.load('girl-model.glb', (gltf) => {
    const model = gltf.scene;

    // Adjust scale/position to ensure feet on ground, etc.
    model.scale.set(1.0, 1.0, 1.0);
    model.position.set(0, -0.1, 0.7);

    // Ensure model can cast/receive shadows
    model.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;

        // Upgrade to a more PBR-like material if desired:
        node.material = new THREE.MeshPhysicalMaterial({
          map: node.material.map || null,
          normalMap: node.material.normalMap || null,
          roughnessMap: node.material.roughnessMap || null,
          metalnessMap: node.material.metalnessMap || null,
          emissiveMap: node.material.emissiveMap || null,
          envMap: scene.environment,
          roughness: 1, // Increased roughness
          metalness: 0, // Slightly increased metalness
          transmission: 0, // For glass-like materials, set to e.g., 0.3 or more
        });
      }

      // Example: Move arms down if bones are named "LeftArm" and "RightArm"
      if (node.isBone && (node.name === 'LeftArm' || node.name === 'RightArm')) {
        // Slight rotation to push arms down. 
        node.rotation.x = THREE.MathUtils.degToRad(70);
      }

    });

    scene.add(model);

    // Find a mesh with morph targets (face mesh) to link with mouthOpen, mouthSmile, eyebrowRaise, etc.
    model.traverse((child) => {
      if (child.isMesh && child.morphTargetInfluences) {
        avatarMesh = child;

        // Gather morphTarget indices
        const dict = avatarMesh.morphTargetDictionary;
        for (let key in dict) {
          if (key.toLowerCase().includes('mouthopen')) {
            mouthOpenIndex = dict[key];
          }
          if (key.toLowerCase().includes('mouthsmile')) {
            mouthSmileIndex = dict[key];
          }
          if (key.toLowerCase().includes('browraise')) {
            eyebrowRaiseIndex = dict[key];
          }
          if (key.toLowerCase().includes('blink')) {
            blinkIndex = dict[key];
          }
          if (key.toLowerCase().includes('cheekraise')) {
            cheekRaiseIndex = dict[key];
          }
          if (key.toLowerCase().includes('lipcornerdepress')) {
            lipCornerDepressIndex = dict[key];
          }
        }
      }
    });
  });
}


/**
 * 5) Post-processing Setup
 *    For an “advanced” look, we’ll add bloom. You can also add DOF, film grain, etc.
 */
function setupPostProcessing() {
  composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // // Simple bloom pass
  // const bloomPass = new UnrealBloomPass(
  //   new THREE.Vector2(window.innerWidth, window.innerHeight),
  //   0.6, // strength
  //   0.4, // radius
  //   0.85 // threshold
  // );
  // composer.addPass(bloomPass);

  // Add more passes if desired
}

/**
 * 6) Main Animation Loop
 */
function animate() {
  requestAnimationFrame(animate);

  // Required if you use damping in OrbitControls
  controls.update();

  // Animate morph targets (speaking and idle expressions)
  if (avatarMesh) updateFacialAnimations();

  // If using post-processing:
  composer.render();

  // If *not* using post-processing, just do:
  // renderer.render(scene, camera);
}


let nextBlinkTime = 0;
let blinkDuration = 0.08; // seconds for a full blink (down + up)
let blinking = false;
let blinkStartTime = 0;

function updateFacialAnimations() {
  const time = performance.now() * 0.001; // seconds
  if (!avatarMesh) return;

  // ----------------------------------------
  // 1. Blinking / Idle Expressions
  // ----------------------------------------
  if (!isSpeaking) {
    // Random blink logic: wait until time > nextBlinkTime
    if (time > nextBlinkTime && blinkIndex !== null) {
      blinking = true;
      blinkStartTime = time;
      // Schedule next blink ~3-7 seconds from now, random
      nextBlinkTime = time + 3 + Math.random() * 4;
    }

    if (blinking) {
      // Duration fraction from 0 to 1
      const elapsed = time - blinkStartTime;
      const fraction = elapsed / blinkDuration;

      if (fraction < 0.5) {
        // Closing eyes first half
        avatarMesh.morphTargetInfluences[blinkIndex] = fraction * 2; // 0 -> 1 over first half
      } else if (fraction < 1.0) {
        // Opening eyes second half
        avatarMesh.morphTargetInfluences[blinkIndex] = (1.0 - fraction) * 2; // 1 -> 0 over second half
      } else {
        // End of blink
        avatarMesh.morphTargetInfluences[blinkIndex] = 0;
        blinking = false;
      }
    }

    // Subtle idle movements: e.g., slight cheek raises or eyebrow wiggles
    if (cheekRaiseIndex !== null) {
      // gentle cyclical motion, amplitude ~0.05
      avatarMesh.morphTargetInfluences[cheekRaiseIndex] = 0.05 * (Math.sin(time) + 1) / 2;
    }
    if (eyebrowRaiseIndex !== null) {
      // Very subtle movement
      avatarMesh.morphTargetInfluences[eyebrowRaiseIndex] = 0.05 * Math.sin(time * 0.5);
    }

    // Optionally lower lip corners or do other idle expressions
    if (lipCornerDepressIndex !== null) {
      avatarMesh.morphTargetInfluences[lipCornerDepressIndex] = 0.02 * (Math.sin(time * 0.7) + 1);
    }
  }

  // ----------------------------------------
  // 2. Speaking Expressions
  // ----------------------------------------
  if (isSpeaking && mouthOpenIndex !== null) {
    // Use a time-based sine wave for mouth opening
    const mouthOpenValue = Math.abs(Math.sin(time * 5)) * 0.6; 
    avatarMesh.morphTargetInfluences[mouthOpenIndex] = mouthOpenValue;

    // If mouthSmileIndex exists, vary it for a livelier expression
    if (mouthSmileIndex !== null) {
      const mouthSmileValue = 0.3 * (Math.sin(time * 2 + 1) + 1) / 2; 
      avatarMesh.morphTargetInfluences[mouthSmileIndex] = mouthSmileValue;
    }

    // Raise eyebrows a bit while speaking
    if (eyebrowRaiseIndex !== null) {
      const eyebrowValue = 0.2 * (Math.sin(time * 1.5) + 1) / 2;
      avatarMesh.morphTargetInfluences[eyebrowRaiseIndex] = eyebrowValue;
    }

    // Additional advanced expressions (e.g., cheek raise while speaking)
    if (cheekRaiseIndex !== null) {
      avatarMesh.morphTargetInfluences[cheekRaiseIndex] = 0.15 * (Math.sin(time * 3) + 1) / 2;
    }

    // Lower lip corners more dynamically
    if (lipCornerDepressIndex !== null) {
      avatarMesh.morphTargetInfluences[lipCornerDepressIndex] = 0.1 * (Math.sin(time * 4) + 1) / 2;
    }
  }

  // ----------------------------------------
  // 3. Non-Speaking Cleanup
  // ----------------------------------------
  else if (!isSpeaking) {
    // If speaking just ended, ensure mouth is reset
    if (mouthOpenIndex !== null) {
      avatarMesh.morphTargetInfluences[mouthOpenIndex] = 0;
    }
    if (mouthSmileIndex !== null) {
      avatarMesh.morphTargetInfluences[mouthSmileIndex] = 0;
    }
    // Eyebrow / cheek / other idle morphs are handled above
  }
}

/**
 * 7) Speak & Lip-Sync
 */
function speak(text) {
  if (!('speechSynthesis' in window)) {
    console.warn('Web Speech API not supported in this browser.');
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();

  // Attempt to find a female-sounding voice
  const femaleVoice = 
    voices.find((voice) =>
      /female|zira|susan|salli|joanna|lucy|en-gb|en-us/i.test(voice.name)
    ) || 
    voices[0]; // fallback
  if (femaleVoice) {
    utterance.voice = femaleVoice;
  }

  utterance.rate = 1;    // speed
  utterance.pitch = 1.05; // pitch

  utterance.onstart = () => {
    isSpeaking = true;
  };

  utterance.onend = () => {
    isSpeaking = false;
    // Reset morphs to neutral
    if (avatarMesh) {
      if (mouthOpenIndex !== null) avatarMesh.morphTargetInfluences[mouthOpenIndex] = 0;
      if (mouthSmileIndex !== null) avatarMesh.morphTargetInfluences[mouthSmileIndex] = 0;
      if (eyebrowRaiseIndex !== null) avatarMesh.morphTargetInfluences[eyebrowRaiseIndex] = 0;
    }
  };

  speechSynthesis.speak(utterance);
}

/**
 * 8) Basic Chat Setup
 */
function setupChat() {
  const chatMessages = document.getElementById('chat-messages');
  const chatInput = document.getElementById('chat-input');
  const chatSend = document.getElementById('chat-send');

  const addMessageToChat = (sender, text) => {
    const div = document.createElement('div');
    div.className = sender.toLowerCase() === 'assistant' ? 'assistant-msg' : 'user-msg';
    div.textContent = `${sender}: ${text}`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  };

  chatSend.addEventListener('click', () => {
    const userText = chatInput.value.trim();
    if (!userText) return;

    // User message
    addMessageToChat('User', userText);

    // For demo, echo it back as “assistant”
    addMessageToChat('Assistant', userText);

    // Speak that text with lip-sync
    speak(userText);

    // Clear input
    chatInput.value = '';
  });
}

/**
 * 9) Handle Resizing
 */
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight); // If using post-proc
}

/**
 * 10) Init everything once DOM is ready
 */
window.addEventListener('DOMContentLoaded', () => {
  initThreeScene();
  setupChat();

  window.addEventListener('resize', onWindowResize);

  // Some browsers load voices async
  speechSynthesis.onvoiceschanged = () => {
    speechSynthesis.getVoices();
  };
});
