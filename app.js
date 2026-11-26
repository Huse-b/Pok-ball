import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createPokeball } from './model.js';

const $ = selector => document.querySelector(selector);
let toastTimer;
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 2600);
}
function failure(error) {
  console.error(error);
  const loader = $('#loader');
  loader.classList.add('error');
  loader.classList.remove('hidden');
  loader.innerHTML = '<strong>暂时无法显示 3D 模型</strong><span>请用支持 WebGL 的新版浏览器打开。<br>独立的 GLB 模型也可以导入 Blender。</span><button id="retry">重新加载</button>';
  $('#retry').onclick = () => location.reload();
}

function init() {
  const viewport = $('#viewport');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f1f0ec');
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
  camera.position.set(0, 2.5, 6.6);
  camera.lookAt(0, 0.12, 0);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  viewport.appendChild(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    failure(new Error('图形上下文已暂停，请重新加载页面。'));
  });
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.62;
  room.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight('#fffaf1', '#a6ad9a', 1.65));
  const key = new THREE.DirectionalLight('#fff7ed', 2.8);
  key.position.set(-3.5, 6, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { near: 0.5, far: 17, left: -4, right: 4, top: 5, bottom: -4 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.018;
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight('#ddf2ff', 1.9);
  rim.position.set(4, 3, -4);
  scene.add(rim);
  const fill = new THREE.DirectionalLight('#fff4e8', 0.6);
  fill.position.set(3, 1, 5);
  scene.add(fill);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.ShadowMaterial({ color: '#5c6354', opacity: 0.19 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.245;
  floor.receiveShadow = true;
  scene.add(floor);
  const rig = new THREE.Group();
  scene.add(rig);
  const asset = createPokeball(THREE);
  rig.add(asset.group);
  asset.group.rotation.set(0.08, -0.34, 0);
  const turntable = new THREE.Mesh(new THREE.RingGeometry(1.55, 1.556, 128), new THREE.MeshBasicMaterial({ color: '#dce0d3', side: THREE.DoubleSide, transparent: true, opacity: 0.7 }));
  turntable.rotation.x = -Math.PI / 2;
  turntable.position.y = -1.252;
  scene.add(turntable);
  let baseX = 0;
  let mobile = false;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let userX = 0.08, userY = -0.34, zoom = 1, autoRotate = false;
  let open = 0, targetOpen = 0, energy = 0, sequence = null;
  let sound = false, audio;
  let animationTime = 0, lastTime = performance.now() / 1000, hiddenTime = null;
  const raycaster = new THREE.Raycaster();
  const pointerVector = new THREE.Vector2();
  const pointers = new Map();
  let drag = null, pinch = null;
  const flash = $('#flash');
  function resize() {
    const width = viewport.clientWidth, height = viewport.clientHeight;
    if (!width || !height) return;
    mobile = window.innerWidth <= 700;
    baseX = mobile ? 0 : Math.min(1, width * 0.00075);
    camera.position.set(0, mobile ? 3 : 2.5, mobile ? 7.5 : 6.6);
    camera.lookAt(0, mobile ? 0.55 : 0.12, 0);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    turntable.position.x = baseX;
  }
  new ResizeObserver(resize).observe(viewport);
  resize();

  const count = 180;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const velocities = Array.from({ length: count }, () => new THREE.Vector3());
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const spriteCanvas = document.createElement('canvas');
  spriteCanvas.width = spriteCanvas.height = 32;
  const ctx = spriteCanvas.getContext('2d');
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, '#ffffffff'); gradient.addColorStop(0.35, '#ffffffee'); gradient.addColorStop(1, '#ffffff00');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 32, 32);
  const spark = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 0.095, map: new THREE.CanvasTexture(spriteCanvas), vertexColors: true, transparent: true, depthWrite: false, opacity: 0 }));
  spark.visible = false;
  spark.frustumCulled = false;
  scene.add(spark);
  let sparkTime = 0;
  const palette = ['#e8494b', '#e7ae40', '#38aeb9', '#6caa88'].map(color => new THREE.Color(color));
  const pulse = new THREE.Mesh(new THREE.TorusGeometry(1, 0.009, 8, 96), new THREE.MeshBasicMaterial({ color: '#5fc8cc', transparent: true, opacity: 0, depthWrite: false }));
  pulse.rotation.x = Math.PI / 2;
  pulse.visible = false;
  scene.add(pulse);
  function emit(inward = false) {
    sparkTime = 0.001;
    spark.visible = true;
    spark.position.set(baseX, 0.15, 0);
    pulse.position.copy(spark.position);
    pulse.visible = !inward;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const y = Math.random() * 2 - 1;
      const r = Math.sqrt(1 - y * y);
      const vector = velocities[i].set(Math.cos(a) * r, y, Math.sin(a) * r);
      const distance = inward ? 0.7 + Math.random() * 0.9 : 0.12;
      const ix = i * 3;
      positions[ix] = vector.x * distance;
      positions[ix + 1] = vector.y * distance + (inward ? 0 : 0.25);
      positions[ix + 2] = vector.z * distance;
      vector.multiplyScalar((inward ? -1 : 1) * (0.8 + Math.random() * 1.5));
      if (!inward) vector.y += 0.7;
      const color = palette[Math.floor(Math.random() * palette.length)];
      colors[ix] = color.r; colors[ix + 1] = color.g; colors[ix + 2] = color.b;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
  }
  function announce(message) { $('#activity-label').textContent = message; }
  function setOpen(value, message = true) {
    targetOpen = value;
    $('#open').classList.toggle('active', value === 1);
    $('#close').classList.toggle('active', value === 0);
    $('#open').setAttribute('aria-pressed', value === 1);
    $('#close').setAttribute('aria-pressed', value === 0);
    $('#state-label').textContent = value ? '已展开 · 能量舱待命' : '已闭合 · 等待下一次冒险';
    $('#state-dot').style.background = value ? '#55bed0' : '#82aa82';
    if (message) announce(value ? '球盖已展开，内部能量舱已激活。' : '精灵球已闭合，准备出发。');
  }
  function tone(frequency, duration = 0.15, delay = 0) {
    if (!sound) return;
    try {
      audio ??= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') void audio.resume();
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      const at = audio.currentTime + delay;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.045, at + 0.016);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(at); oscillator.stop(at + duration + 0.02);
    } catch (error) { console.debug('Audio unavailable', error); }
  }
  function cancelSequence() {
    sequence = null;
    $('#capture').disabled = $('#release').disabled = false;
    $('#capture').classList.remove('active'); $('#release').classList.remove('active');
    spark.visible = pulse.visible = false;
    flash.style.opacity = '0';
  }
  function manualOpen(value) {
    cancelSequence();
    setOpen(value);
    tone(value ? 587 : 440);
  }
  $('#open').onclick = () => manualOpen(1);
  $('#close').onclick = () => manualOpen(0);
  function beginSequence(kind) {
    if (sequence) return;
    sequence = { kind, start: performance.now() / 1000, phase: 0 };
    $('#capture').disabled = $('#release').disabled = true;
    $(`#${kind}`).classList.add('active');
    autoRotate = false;
    $('#auto-rotate').setAttribute('aria-pressed', 'false');
    setOpen(kind === 'release' ? 1 : 0, false);
    announce(kind === 'capture' ? '投掷精灵球，开始捕获演示……' : '展开球盖，正在汇聚能量……');
    tone(kind === 'capture' ? 294 : 392, 0.3);
  }
  $('#capture').onclick = () => beginSequence('capture');
  $('#release').onclick = () => beginSequence('release');
  function setZoom(value) {
    zoom = THREE.MathUtils.clamp(value, 0.75, 1.45);
    $('#zoom-label').textContent = `${Math.round(zoom * 100)}%`;
  }
  $('#zoom-in').onclick = () => setZoom(zoom + 0.1);
  $('#zoom-out').onclick = () => setZoom(zoom - 0.1);
  $('#auto-rotate').onclick = event => {
    autoRotate = !autoRotate;
    event.currentTarget.setAttribute('aria-pressed', autoRotate);
    toast(autoRotate ? '自动旋转已开启' : '自动旋转已暂停');
  };
  $('#reset').onclick = () => {
    cancelSequence();
    userX = 0.08; userY = -0.34; autoRotate = false;
    $('#auto-rotate').setAttribute('aria-pressed', 'false');
    setZoom(1);
    announce(targetOpen ? '视角已重置，球盖保持展开。' : '视角已重置，准备就绪。');
    toast('已恢复初始视角');
  };
  $('#sound').onclick = event => {
    sound = !sound;
    event.currentTarget.setAttribute('aria-pressed', sound);
    event.currentTarget.setAttribute('aria-label', sound ? '关闭音效' : '开启音效');
    $('#sound-icon').innerHTML = sound
      ? '<path d="m11 5-6 4H2v6h3l6 4zM16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14"/>'
      : '<path d="m11 5-6 4H2v6h3l6 4zM16 9l5 6M21 9l-5 6"/>';
    tone(587);
  };
  function hitButton(event) {
    const bounds = viewport.getBoundingClientRect();
    pointerVector.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    raycaster.setFromCamera(pointerVector, camera);
    const hit = raycaster.intersectObject(asset.group, true)[0];
    return hit?.object.userData.action === 'toggle';
  }
  viewport.addEventListener('pointerdown', event => {
    if (event.button > 0) return;
    viewport.focus({ preventScroll: true });
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    viewport.setPointerCapture(event.pointerId);
    if (pointers.size === 1) drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, start: performance.now() };
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom };
      if (drag) drag.moved = true;
    }
  });
  viewport.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      if (pinch.distance > 0) setZoom(pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y) / pinch.distance);
      return;
    }
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > 5) drag.moved = true;
    if (drag.moved) {
      userY += dx * 0.008;
      userX = THREE.MathUtils.clamp(userX + dy * 0.006, -0.8, 1.05);
      drag.x = event.clientX; drag.y = event.clientY;
      autoRotate = false;
      $('#auto-rotate').setAttribute('aria-pressed', 'false');
    }
  });
  viewport.addEventListener('pointerup', event => {
    if (drag && drag.id === event.pointerId && !drag.moved && performance.now() - drag.start < 800 && hitButton(event)) manualOpen(targetOpen ? 0 : 1);
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    drag = null;
  });
  viewport.addEventListener('pointercancel', event => { pointers.delete(event.pointerId); drag = pinch = null; });
  viewport.addEventListener('wheel', event => { event.preventDefault(); setZoom(zoom + (event.deltaY < 0 ? 0.08 : -0.08)); }, { passive: false });
  const helpClose = () => { $('#help-panel').classList.remove('show'); $('#help').setAttribute('aria-expanded', 'false'); };
  $('#help').onclick = event => event.currentTarget.setAttribute('aria-expanded', $('#help-panel').classList.toggle('show'));
  window.addEventListener('pointerdown', event => { if (!event.target.closest('#help, #help-panel')) helpClose(); });
  window.addEventListener('keydown', event => {
    if (event.metaKey || event.ctrlKey || event.altKey || /INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) return;
    if (event.repeat) return;
    if (event.code === 'Space' && document.activeElement?.tagName !== 'BUTTON') { event.preventDefault(); manualOpen(targetOpen ? 0 : 1); }
    if (event.key.toLowerCase() === 'c') beginSequence('capture');
    if (event.key.toLowerCase() === 'r') beginSequence('release');
    if (event.key === 'Escape') helpClose();
    if (event.key === '+' || event.key === '=') setZoom(zoom + 0.1);
    if (event.key === '-' || event.key === '_') setZoom(zoom - 0.1);
  });
  document.addEventListener('visibilitychange', () => {
    const now = performance.now() / 1000;
    if (document.hidden) hiddenTime = now;
    else {
      if (sequence && hiddenTime) sequence.start += now - hiddenTime;
      lastTime = now;
      hiddenTime = null;
    }
  });
  const projectedButton = new THREE.Vector3();
  function frame(timestamp) {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    const now = timestamp / 1000;
    const dt = Math.min(Math.max(0, now - lastTime), 0.06);
    lastTime = now;
    animationTime += dt;
    let lift = 0, throwZ = 0, roll = 0, yaw = 0, boost = 0;
    let flashOpacity = 0;
    if (sequence) {
      const t = now - sequence.start;
      if (sequence.kind === 'capture') {
        if (t < 0.75) {
          const progress = Math.min(1, t / 0.75);
          lift = reducedMotion ? 0 : Math.sin(progress * Math.PI) * 0.8;
          throwZ = -Math.sin(progress * Math.PI) * 1.15;
          roll = reducedMotion ? 0 : -Math.PI * 2 * progress;
        } else if (t < 1.35) {
          if (sequence.phase < 1) { sequence.phase = 1; setOpen(1, false); emit(true); tone(740, 0.22); announce('能量接收中……'); }
          boost = 1;
        } else if (t < 1.9) {
          if (sequence.phase < 2) { sequence.phase = 2; setOpen(0, false); tone(440, 0.15); }
          flashOpacity = Math.max(0, 1 - Math.abs(t - 1.48) / 0.13) * 0.22;
        } else if (t < 4.1) {
          const p = (t - 1.9) % 0.7;
          roll = reducedMotion ? 0 : Math.sin(p / 0.36 * Math.PI * 2) * (p < 0.36 ? 0.13 : 0);
          lift = Math.abs(roll) * 0.16;
          boost = p < 0.36 ? 0.9 : 0.25;
          if (sequence.phase < 3) { sequence.phase = 3; announce('捕获中：1… 2… 3…'); }
        } else {
          if (sequence.phase < 4) {
            sequence.phase = 4; emit();
            tone(523, 0.15); tone(659, 0.15, 0.16); tone(784, 0.5, 0.32);
            announce('捕获成功！新的旅程即将开始。'); toast('收服成功！下一站，冒险。');
          }
          boost = 1;
          if (t > 5.05) cancelSequence();
        }
      } else {
        boost = 1;
        if (t > 0.85 && sequence.phase === 0) {
          sequence.phase = 1; emit();
          tone(587, 0.25); tone(784, 0.5, 0.15);
          announce('能量已释放，新的冒险正在发光。');
        }
        if (t > 3.2) { cancelSequence(); announce('能量释放完成，球盖保持展开。'); }
      }
    }
    flash.style.opacity = String(flashOpacity);
    if (autoRotate && !sequence && !drag) userY += dt * 0.3;
    const sway = reducedMotion ? 0 : Math.sin(animationTime * 0.7) * 0.008;
    asset.group.rotation.x = THREE.MathUtils.damp(asset.group.rotation.x, userX + targetOpen * 0.16 + sway, 5, dt);
    asset.group.rotation.y = THREE.MathUtils.damp(asset.group.rotation.y, userY + yaw, 6, dt);
    // A complete throw rotates through 2π; returning to zero keeps later controls stable.
    asset.group.rotation.z = roll;
    rig.position.set(baseX, lift + (reducedMotion ? 0 : Math.sin(animationTime * 1.2) * 0.015), throwZ);
    open = THREE.MathUtils.damp(open, targetOpen, reducedMotion ? 11 : 5.5, dt);
    asset.setOpen(open);
    energy = THREE.MathUtils.damp(energy, Math.max(open * 0.75, boost), 5, dt);
    asset.setEnergy(energy);
    const fittedZoom = zoom * (1 - open * (mobile ? 0.17 : 0.08));
    camera.zoom = THREE.MathUtils.damp(camera.zoom, fittedZoom, 5, dt);
    camera.lookAt(0, mobile ? 0.55 : 0.12 + open * 0.35, 0);
    camera.updateProjectionMatrix();
    if (spark.visible) {
      sparkTime += dt;
      const age = sparkTime;
      spark.material.opacity = Math.min(1, age * 8) * Math.max(0, 1 - (age - 0.3) / 1.5) * 0.9;
      pulse.material.opacity = Math.max(0, 0.65 - age * 0.4);
      pulse.scale.setScalar(0.2 + age * 1.6);
      for (let i = 0; i < count; i++) {
        const v = velocities[i], ix = i * 3;
        positions[ix] += v.x * dt; positions[ix + 1] += v.y * dt; positions[ix + 2] += v.z * dt;
        v.multiplyScalar(Math.pow(0.987, dt * 60));
      }
      geometry.attributes.position.needsUpdate = true;
      if (age > 1.9) spark.visible = pulse.visible = false;
    }
    renderer.render(scene, camera);
  }
  renderer.render(scene, camera);
  $('#loader').classList.add('hidden');
  requestAnimationFrame(frame);
  // Exposes useful scene state for reproducible interaction checks without network access.
  window.pokeLab = Object.freeze({
    getState: () => ({ targetOpen, open, hingeAngle: asset.lidPivot.rotation.x, zoom, userX, userY, autoRotate, sequence: sequence?.kind ?? null, triangles: asset.group.userData.triangles, particles: spark.visible }),
    buttonPosition: () => {
      asset.group.getObjectByName('Front_Button_Face').getWorldPosition(projectedButton);
      projectedButton.project(camera);
      const bounds = viewport.getBoundingClientRect();
      return { x: bounds.left + (projectedButton.x + 1) * bounds.width / 2, y: bounds.top + (1 - projectedButton.y) * bounds.height / 2 };
    }
  });
}

$('#export').onclick = () => {
  try {
    if (!window.__POKEBALL_GLB_BASE64__) throw new Error('Missing embedded model');
    const binary = atob(window.__POKEBALL_GLB_BASE64__);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'model/gltf-binary' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'Pokeball.glb';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast('3D 模型已开始下载，包含开合动画。');
  } catch (error) { console.error(error); toast('请使用随成品提供的 Pokeball.glb 文件。'); }
};
try { init(); } catch (error) { failure(error); }
