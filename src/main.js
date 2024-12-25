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
import { ShaderMaterial } from 'three';

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

// Optional: Additional morph targets for enhanced expressions
let jawLeftIndex = null;
let jawRightIndex = null;
let tongueOutIndex = null;

// Toggle between sphere environment or room environment:
const USE_SPHERE_ENV = true; // if false => use RoomEnvironment

// Helper function for smooth interpolation
const lerp = (a, b, t) => a + (b - a) * t;

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
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // --- Camera ---
  camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1.4, 2);

  // --- Controls (Orbit) ---
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 1.4, 0); // keep the target on the avatar’s head/upper body
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.enableRotate = false;

  // Only allow a small horizontal rotation range (e.g., ±0.15 radians ~ ±8.6 degrees)
  controls.minAzimuthAngle = -0.15;
  controls.maxAzimuthAngle =  0.15;

  // (Optionally) limit vertical tilt as well:
  controls.minPolarAngle = Math.PI / 2 - 0.3; // ~top angle
  controls.maxPolarAngle = Math.PI / 2 + 0.3; // ~bottom angle

  // Limit how close/far the camera can orbit:
  controls.minDistance = 1.0;
  controls.maxDistance = 2.5;

  // Keep damping enabled to get smooth transitions
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
  // Create a gradient background using Canvas
  const gradientCanvas = document.createElement('canvas');
  const gradientContext = gradientCanvas.getContext('2d');

  gradientCanvas.width = 512;
  gradientCanvas.height = 512;

  // Create a gradient
  const gradient = gradientContext.createLinearGradient(0, 0, 0, gradientCanvas.height);
  gradient.addColorStop(0, '#FDEB71'); // Top color (soft yellow)
  gradient.addColorStop(0.5, '#ABFFA4'); // Middle color (light green)
  gradient.addColorStop(1, '#8EC5FC'); // Bottom color (light blue)

  gradientContext.fillStyle = gradient;
  gradientContext.fillRect(0, 0, gradientCanvas.width, gradientCanvas.height);

  // Convert gradient canvas to a Three.js texture
  const gradientTexture = new THREE.CanvasTexture(gradientCanvas);
  gradientTexture.encoding = THREE.sRGBEncoding;

  // Set the gradient as the background
  scene.background = gradientTexture;

  // Use PMREMGenerator to generate the environment map
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  // Create the RoomEnvironment for lighting and reflections
  const roomEnvironment = new RoomEnvironment();
  const envMap = pmremGenerator.fromScene(roomEnvironment).texture;

  // Set the environment map for the scene
  scene.environment = envMap;

  // Tone mapping and renderer setup
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.7;

  // Dispose of PMREMGenerator
  pmremGenerator.dispose();
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
    model.scale.set(1.3, 1.3, 1.3);
    model.position.set(0, -0.6, 0.9);

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
          const lowerKey = key.toLowerCase();
          if (lowerKey.includes('mouthopen')) {
            mouthOpenIndex = dict[key];
          }
          if (lowerKey.includes('mouthsmile')) {
            mouthSmileIndex = dict[key];
          }
          if (lowerKey.includes('browraise')) {
            eyebrowRaiseIndex = dict[key];
          }
          if (lowerKey.includes('blink')) {
            blinkIndex = dict[key];
          }
          if (lowerKey.includes('cheekraise')) {
            cheekRaiseIndex = dict[key];
          }
          if (lowerKey.includes('lipcornerdepress')) {
            lipCornerDepressIndex = dict[key];
          }

          // Optional: Additional morph targets
          if (lowerKey.includes('jawleft')) {
            jawLeftIndex = dict[key];
          }
          if (lowerKey.includes('jawright')) {
            jawRightIndex = dict[key];
          }
          if (lowerKey.includes('tongueout')) {
            tongueOutIndex = dict[key];
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

  // // Optional: Add UnrealBloomPass for bloom effects
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
  if (avatarMesh) {
    updateFacialAnimations();
    updateHeadMovements(); // Optional: Update head movements
  }

  // If using post-processing:
  composer.render();

  // If *not* using post-processing, just do:
  // renderer.render(scene, camera);
}

let nextBlinkTime = 0;
let blinkDuration = 0.08; // seconds for a full blink (down + up)
let blinking = false;
let blinkStartTime = 0;

/**
 * 7) Enhanced Facial Animations with Smooth Transitions and Additional Expressions
 */
function updateFacialAnimations() {
  const time = performance.now() * 0.001; // Current time in seconds
  if (!avatarMesh) return;

  // Define the speed for different morph animations
  const blinkSpeed = 5; // Blinking speed
  const speakSpeed = 10; // Speaking morph speed
  const idleSpeed = 0.5; // Idle morph speed

  // ----------------------------------------
  // 1. Blinking / Idle Expressions
  // ----------------------------------------
  if (!isSpeaking) {
    // Handle Blinking
    handleBlinking(time, blinkSpeed);

    // Subtle Idle Movements
    if (cheekRaiseIndex !== null) {
      const cheekTarget = 0.03 * Math.sin(time * idleSpeed);
      avatarMesh.morphTargetInfluences[cheekRaiseIndex] = lerp(
        avatarMesh.morphTargetInfluences[cheekRaiseIndex],
        cheekTarget,
        0.1
      );
    }

    if (eyebrowRaiseIndex !== null) {
      const eyebrowTarget = 0.02 * Math.sin(time * idleSpeed * 1.5);
      avatarMesh.morphTargetInfluences[eyebrowRaiseIndex] = lerp(
        avatarMesh.morphTargetInfluences[eyebrowRaiseIndex],
        eyebrowTarget,
        0.1
      );
    }

    if (lipCornerDepressIndex !== null) {
      const lipTarget = 0.01 * Math.sin(time * idleSpeed * 2);
      avatarMesh.morphTargetInfluences[lipCornerDepressIndex] = lerp(
        avatarMesh.morphTargetInfluences[lipCornerDepressIndex],
        lipTarget,
        0.1
      );
    }
  }

  // ----------------------------------------
  // 2. Speaking Expressions
  // ----------------------------------------
  if (isSpeaking) {
    // Mouth Opening
    if (mouthOpenIndex !== null) {
      const mouthOpenTarget = Math.abs(Math.sin(time * speakSpeed)) * 0.6;
      avatarMesh.morphTargetInfluences[mouthOpenIndex] = lerp(
        avatarMesh.morphTargetInfluences[mouthOpenIndex],
        mouthOpenTarget,
        0.2
      );
    }

    // Mouth Smiling
    if (mouthSmileIndex !== null) {
      const mouthSmileTarget = 0.3 * Math.abs(Math.sin(time * speakSpeed * 0.5));
      avatarMesh.morphTargetInfluences[mouthSmileIndex] = lerp(
        avatarMesh.morphTargetInfluences[mouthSmileIndex],
        mouthSmileTarget,
        0.2
      );
    }

    // Eyebrow Raising
    if (eyebrowRaiseIndex !== null) {
      const eyebrowTarget = 0.15 * Math.abs(Math.sin(time * speakSpeed * 0.75));
      avatarMesh.morphTargetInfluences[eyebrowRaiseIndex] = lerp(
        avatarMesh.morphTargetInfluences[eyebrowRaiseIndex],
        eyebrowTarget,
        0.2
      );
    }

    // Cheek Raising
    if (cheekRaiseIndex !== null) {
      const cheekTarget = 0.1 * Math.abs(Math.sin(time * speakSpeed * 1.5));
      avatarMesh.morphTargetInfluences[cheekRaiseIndex] = lerp(
        avatarMesh.morphTargetInfluences[cheekRaiseIndex],
        cheekTarget,
        0.2
      );
    }

    // Lip Corner Depression
    if (lipCornerDepressIndex !== null) {
      const lipTarget = 0.05 * Math.abs(Math.sin(time * speakSpeed * 2));
      avatarMesh.morphTargetInfluences[lipCornerDepressIndex] = lerp(
        avatarMesh.morphTargetInfluences[lipCornerDepressIndex],
        lipTarget,
        0.2
      );
    }

    // Optional: Additional Morph Targets (e.g., jaw movements)
    if (jawLeftIndex !== null) {
      const jawLeftTarget = 0.05 * Math.abs(Math.sin(time * speakSpeed * 1.2));
      avatarMesh.morphTargetInfluences[jawLeftIndex] = lerp(
        avatarMesh.morphTargetInfluences[jawLeftIndex],
        jawLeftTarget,
        0.2
      );
    }

    if (jawRightIndex !== null) {
      const jawRightTarget = 0.05 * Math.abs(Math.sin(time * speakSpeed * 1.2));
      avatarMesh.morphTargetInfluences[jawRightIndex] = lerp(
        avatarMesh.morphTargetInfluences[jawRightIndex],
        jawRightTarget,
        0.2
      );
    }

    if (tongueOutIndex !== null) {
      const tongueOutTarget = 0.02 * Math.abs(Math.sin(time * speakSpeed * 1.5));
      avatarMesh.morphTargetInfluences[tongueOutIndex] = lerp(
        avatarMesh.morphTargetInfluences[tongueOutIndex],
        tongueOutTarget,
        0.2
      );
    }
  }

  // ----------------------------------------
  // 3. Non-Speaking Cleanup
  // ----------------------------------------
  if (!isSpeaking) {
    // Reset Speaking Morphs Smoothly
    resetSpeakingMorphs();
  }
}

/**
 * Handle Blinking with Smooth Transitions
 */
function handleBlinking(time, speed) {
  if (time > nextBlinkTime && blinkIndex !== null && !blinking) {
    blinking = true;
    blinkStartTime = time;
    // Schedule next blink ~3-7 seconds from now
    nextBlinkTime = time + 4 + Math.random() * 4;
  }

  if (blinking) {
    const elapsed = time - blinkStartTime;
    const fraction = elapsed / blinkDuration;

    if (fraction < 0.5) {
      // Closing eyes
      avatarMesh.morphTargetInfluences[blinkIndex] = lerp(
        avatarMesh.morphTargetInfluences[blinkIndex],
        1,
        0.2
      );
    } else if (fraction < 1.0) {
      // Opening eyes
      avatarMesh.morphTargetInfluences[blinkIndex] = lerp(
        avatarMesh.morphTargetInfluences[blinkIndex],
        0,
        0.2
      );
    } else {
      // End of blink
      avatarMesh.morphTargetInfluences[blinkIndex] = 0;
      blinking = false;
    }
  }
}

function handleDeviceOrientation(event) {
  if (!avatarMesh) return;

  // Adjust the path to the head based on your model's hierarchy
  const head = avatarMesh.parent; // Modify if necessary
  if (!head) return;

  const rotationFactor = 0.01; // Adjust to control sensitivity
  const maxRotation = Math.PI / 8; // Limit head rotation to ±22.5 degrees

  // Use the gamma value (left/right tilt) to rotate the head on the Y-axis
  const gamma = event.gamma || 0; // Gamma: left-to-right tilt in degrees
  head.rotation.y = THREE.MathUtils.clamp(gamma * rotationFactor, -maxRotation, maxRotation);

  // Optionally use the beta value (forward/backward tilt) for the X-axis
  const beta = event.beta || 0; // Beta: front-to-back tilt in degrees
  head.rotation.x = THREE.MathUtils.clamp(beta * rotationFactor, -maxRotation, maxRotation);
}

/**
 * Gradually Reset Speaking Morphs to Neutral
 */
function resetSpeakingMorphs() {
  const resetSpeed = 0.05; // Adjust for smoother transition

  if (avatarMesh) {
    if (mouthOpenIndex !== null) {
      avatarMesh.morphTargetInfluences[mouthOpenIndex] = lerp(
        avatarMesh.morphTargetInfluences[mouthOpenIndex],
        0,
        resetSpeed
      );
    }
    if (mouthSmileIndex !== null) {
      avatarMesh.morphTargetInfluences[mouthSmileIndex] = lerp(
        avatarMesh.morphTargetInfluences[mouthSmileIndex],
        0,
        resetSpeed
      );
    }
    if (eyebrowRaiseIndex !== null) {
      avatarMesh.morphTargetInfluences[eyebrowRaiseIndex] = lerp(
        avatarMesh.morphTargetInfluences[eyebrowRaiseIndex],
        0,
        resetSpeed
      );
    }
    if (cheekRaiseIndex !== null) {
      avatarMesh.morphTargetInfluences[cheekRaiseIndex] = lerp(
        avatarMesh.morphTargetInfluences[cheekRaiseIndex],
        0,
        resetSpeed
      );
    }
    if (lipCornerDepressIndex !== null) {
      avatarMesh.morphTargetInfluences[lipCornerDepressIndex] = lerp(
        avatarMesh.morphTargetInfluences[lipCornerDepressIndex],
        0,
        resetSpeed
      );
    }

    // Optional: Reset additional morph targets
    if (jawLeftIndex !== null) {
      avatarMesh.morphTargetInfluences[jawLeftIndex] = lerp(
        avatarMesh.morphTargetInfluences[jawLeftIndex],
        0,
        resetSpeed
      );
    }
    if (jawRightIndex !== null) {
      avatarMesh.morphTargetInfluences[jawRightIndex] = lerp(
        avatarMesh.morphTargetInfluences[jawRightIndex],
        0,
        resetSpeed
      );
    }
    if (tongueOutIndex !== null) {
      avatarMesh.morphTargetInfluences[tongueOutIndex] = lerp(
        avatarMesh.morphTargetInfluences[tongueOutIndex],
        0,
        resetSpeed
      );
    }
  }
}

/**
 * Optional: Add Head Movements for Enhanced Realism
 */
function updateHeadMovements() {
  if (!avatarMesh) return;

  // Adjust the path to the head based on your model's hierarchy
  const head = avatarMesh.parent; // Modify if necessary
  if (!head) return;

  const time = performance.now() * 0.001;

  if (isSpeaking) {
    // Slight nodding while speaking
    head.rotation.x = lerp(
      head.rotation.x,
      0.02 * Math.sin(time * 2), // Adjust amplitude and speed as needed
      0.1
    );
    head.rotation.y = lerp(
      head.rotation.y,
      0.02 * Math.sin(time * 1.5),
      0.1
    );
  } else {
    // Return to neutral position
    head.rotation.x = lerp(head.rotation.x, 0, 0.1);
    head.rotation.y = lerp(head.rotation.y, 0, 0.1);
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

  // Cancel any ongoing speech synthesis
  if (speechSynthesis.speaking) {
    speechSynthesis.cancel();
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
    // Gradually reset morphs to neutral
    resetSpeakingMorphs();
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

  // Add voice recognition button
  const voiceButton = document.createElement('button');
  voiceButton.className = 'icon-btn';
  voiceButton.innerHTML = '🎤'; // Microphone icon
  document.querySelector('.chat-icons').appendChild(voiceButton);

  // Add message to chat
  const addMessageToChat = (sender, text) => {
    const div = document.createElement('div');
    div.className = sender.toLowerCase() === 'assistant' ? 'assistant-msg' : 'user-msg';
    div.textContent = `${sender}: ${text}`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  };

  // Send message (text input)
  chatSend.addEventListener('click', async () => {
    const userText = chatInput.value.trim();
    if (!userText) return;

    // User message
    addMessageToChat('User', userText);

    // Clear input
    chatInput.value = '';

    try {
      // Send userText to the API and get response
      const assistantResponse = await sendMessageToAPI(userText);

      // Assistant's message
      addMessageToChat('Assistant', assistantResponse);

      // Speak the response with lip-sync
      speak(assistantResponse);
    } catch (error) {
      console.error('Error communicating with API:', error);
      addMessageToChat('Assistant', 'Sorry, I encountered an error processing your request.');
      speak('Sorry, I encountered an error processing your request.');
    }
  });

  // Voice recognition setup
  const startVoiceRecognition = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      alert('Speech Recognition is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    // Start recognition
    recognition.start();

    // Voice result
    recognition.onresult = async (event) => {
      const transcript = event.results[0][0].transcript.trim();
      addMessageToChat('User', transcript);

      try {
        // Send transcript to the API and get response
        const assistantResponse = await sendMessageToAPI(transcript);

        // Assistant's message
        addMessageToChat('Assistant', assistantResponse);

        // Speak the response with lip-sync
        speak(assistantResponse);
      } catch (error) {
        console.error('Error communicating with API:', error);
        addMessageToChat('Assistant', 'Sorry, I encountered an error processing your request.');
        speak('Sorry, I encountered an error processing your request.');
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech Recognition Error:', event.error);
      alert('Error with voice recognition: ' + event.error);
    };

    recognition.onend = () => {
      console.log('Speech recognition ended.');
    };
  };

  // Voice button click
  voiceButton.addEventListener('click', () => {
    startVoiceRecognition();
  });
}

/**
 * Sends a POST request to the API with the user's message.
 * @param {string} message - The user's message to send.
 * @returns {Promise<string>} - The assistant's response.
 */
async function sendMessageToAPI(message) {
  const apiUrl = 'https://18.208.218.35:443/bank/transactions/query/'; // Update this to your actual endpoint

  // Define the payload structure based on API requirements
  const payload = {
    query: message, // Adjust the key based on API specs
  };

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Add any required headers here (e.g., Authorization)
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  console.log(data)

  // Extract the relevant response text based on API's response structure
  // Adjust the path as per your API's response
  return data || 'I did not understand that. Could you please rephrase?';
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

if (window.DeviceOrientationEvent) {
  window.addEventListener('deviceorientation', handleDeviceOrientation);
} else {
  console.warn('DeviceOrientationEvent is not supported by this browser.');
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
