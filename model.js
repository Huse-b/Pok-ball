/*
 * A self-contained, texture-free Poké Ball asset.
 * Coordinates: metres, +Y up, +Z front; closed shell radius 1.18.
 * The caller owns rendering, lights, interaction and animation timing.
 */
export function createPokeball(THREE) {
  const RADIUS = 1.18;
  const SEAM_Y = 0.068;
  const HINGE_Y = 0.058;
  const HINGE_Z = -1.052;
  const materials = [];
  const geometries = new Set();
  const glowChannels = [];
  let disposed = false;
  let energy = 0.35;

  const group = new THREE.Group();
  group.name = 'Pokeball';
  group.userData = { asset: 'Poké Ball', radius: RADIUS, units: 'metres' };

  function material(name, properties, physical = false) {
    const result = physical
      ? new THREE.MeshPhysicalMaterial(properties)
      : new THREE.MeshStandardMaterial(properties);
    result.name = name;
    materials.push(result);
    return result;
  }

  const red = material('Shell · lacquered vermilion', {
    color: '#e83944', metalness: 0.24, roughness: 0.19,
    clearcoat: 1, clearcoatRoughness: 0.12,
    reflectivity: 0.58,
  }, true);
  const ivory = material('Shell · porcelain ivory', {
    color: '#eef1ef', metalness: 0.12, roughness: 0.24,
    clearcoat: 0.85, clearcoatRoughness: 0.17,
  }, true);
  const charcoal = material('Seam · charcoal elastomer', {
    color: '#161b22', metalness: 0.25, roughness: 0.36,
  });
  const liner = material('Interior · graphite satin', {
    color: '#1d2630', metalness: 0.5, roughness: 0.39,
  });
  const recessed = material('Interior · recessed carbon', {
    color: '#10161d', metalness: 0.35, roughness: 0.48,
  });
  const metal = material('Mechanism · brushed titanium', {
    color: '#65727d', metalness: 0.85, roughness: 0.28,
  });
  const edgeMetal = material('Rim · pale alloy', {
    color: '#b6c7cb', metalness: 0.87, roughness: 0.22,
  });
  const redInner = material('Lid · dark red anodised backing', {
    color: '#381e28', metalness: 0.5, roughness: 0.4,
  });
  const cyan = material('Energy · cyan light guides', {
    color: '#72edff', emissive: '#72edff',
    emissiveIntensity: 1, metalness: 0.16, roughness: 0.22,
  });
  const buttonMaterial = material('Button · luminous pearl', {
    color: '#eef1ef', emissive: '#72edff',
    emissiveIntensity: 0.1, metalness: 0.13, roughness: 0.2,
    clearcoat: 0.9, clearcoatRoughness: 0.14,
  }, true);
  const cyanSubtle = material('Interior · cyan status accents', {
    color: '#72edff', emissive: '#72edff',
    emissiveIntensity: 0.5, metalness: 0.3, roughness: 0.3,
  });
  glowChannels.push(
    { material: cyan, minimum: 0.35, maximum: 2.6 },
    { material: cyanSubtle, minimum: 0.16, maximum: 1.25 },
    { material: buttonMaterial, minimum: 0.025, maximum: 0.3 },
  );

  function mesh(name, geometry, surface, parent = group) {
    geometries.add(geometry);
    const result = new THREE.Mesh(geometry, surface);
    result.name = name;
    result.castShadow = true;
    result.receiveShadow = true;
    parent.add(result);
    return result;
  }

  function inward(geometry) {
    // Actual inward winding also works in GLB, with no BackSide dependency.
    const index = geometry.index;
    for (let i = 0; i < index.count; i += 3) {
      const second = index.getX(i + 1);
      index.setX(i + 1, index.getX(i + 2));
      index.setX(i + 2, second);
    }
    const normal = geometry.attributes.normal;
    for (let i = 0; i < normal.count; i++) {
      normal.setXYZ(i, -normal.getX(i), -normal.getY(i), -normal.getZ(i));
    }
    index.needsUpdate = true;
    normal.needsUpdate = true;
    return geometry;
  }

  function horizontalRing(name, radius, tube, y, surface, parent = group, tubular = 96) {
    const result = mesh(name, new THREE.TorusGeometry(radius, tube, 8, tubular), surface, parent);
    result.rotation.x = Math.PI / 2;
    result.position.y = y;
    return result;
  }

  function annulus(name, inner, outer, y, surface, parent = group, downward = false) {
    const result = mesh(name, new THREE.RingGeometry(inner, outer, 96, 1), surface, parent);
    result.rotation.x = downward ? Math.PI / 2 : -Math.PI / 2;
    result.position.y = y;
    return result;
  }

  function cylinder(name, radius, height, position, surface, parent = group, segments = 64) {
    const result = mesh(name, new THREE.CylinderGeometry(radius, radius, height, segments, 1), surface, parent);
    result.position.set(...position);
    return result;
  }

  function box(name, dimensions, position, surface, parent = group) {
    const result = mesh(name, new THREE.BoxGeometry(...dimensions), surface, parent);
    result.position.set(...position);
    return result;
  }

  function frontDisc(name, radius, depth, z, surface, parent = group, y = 0, segments = 64) {
    const result = cylinder(name, radius, depth, [0, y, z], surface, parent, segments);
    result.rotation.x = Math.PI / 2;
    return result;
  }

  function frontRing(name, radius, tube, z, surface, parent = group, y = 0) {
    const result = mesh(name, new THREE.TorusGeometry(radius, tube, 10, 64), surface, parent);
    result.position.set(0, y, z);
    return result;
  }

  function interactive(object) {
    object.userData.action = 'toggle';
    object.userData.label = 'Open / close Poké Ball';
    return object;
  }

  const lower = new THREE.Group();
  lower.name = 'Lower_Assembly';
  group.add(lower);

  const lidPivot = new THREE.Group();
  lidPivot.name = 'Lid_Hinge';
  lidPivot.position.set(0, HINGE_Y, HINGE_Z);
  lidPivot.userData.openAngle = -1.8;
  group.add(lidPivot);
  const lid = new THREE.Group();
  lid.name = 'Lid_Assembly';
  // Geometry remains in sphere coordinates, pivot sits on the rear hinge axis.
  lid.position.set(0, -HINGE_Y, -HINGE_Z);
  lidPivot.add(lid);

  const topTheta = Math.acos(SEAM_Y / RADIUS);
  const lowerTheta = Math.acos(-SEAM_Y / RADIUS);
  mesh('Upper_Red_Shell', new THREE.SphereGeometry(RADIUS, 96, 40, 0, Math.PI * 2, 0, topTheta), red, lid);
  mesh('Lower_Ivory_Shell', new THREE.SphereGeometry(RADIUS, 96, 40, 0, Math.PI * 2, lowerTheta, Math.PI - lowerTheta), ivory, lower);

  const innerRadius = 1.095;
  mesh('Upper_Concave_Liner', inward(new THREE.SphereGeometry(
    innerRadius, 96, 28, 0, Math.PI * 2, 0, Math.acos(SEAM_Y / innerRadius),
  )), redInner, lid);
  const innerStart = Math.acos(0.043 / innerRadius);
  mesh('Lower_Concave_Liner', inward(new THREE.SphereGeometry(
    innerRadius, 96, 28, 0, Math.PI * 2, innerStart, Math.PI - innerStart,
  )), liner, lower);

  const bandRadius = 1.177;
  const bandStart = Math.acos(0.063 / bandRadius);
  mesh('Equatorial_Dark_Band', new THREE.SphereGeometry(
    bandRadius, 96, 6, 0, Math.PI * 2, bandStart, Math.PI - 2 * bandStart,
  ), charcoal, lower);

  // These three lid parts all move with the red shell.
  annulus('Lid_Thickness_Underside', 1.0929, 1.1780, SEAM_Y, charcoal, lid, true);
  horizontalRing('Lid_Inner_Seal', 1.094, 0.015, 0.076, charcoal, lid);
  horizontalRing('Lid_Alloy_Lip', 1.158, 0.009, 0.069, edgeMetal, lid);
  annulus('Lower_Seat_Rim', 1.091, 1.175, 0.044, charcoal, lower);
  horizontalRing('Lower_Inner_Seat', 1.094, 0.014, 0.039, metal, lower);
  horizontalRing('Lower_Recessed_Status_Ring', 1.068, 0.007, 0.04, cyanSubtle, lower);

  // A subtly ribbed upper dome reads as a manufactured shell when open.
  for (let i = 0; i < 6; i++) {
    const azimuth = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const points = [];
    for (let step = 0; step <= 28; step++) {
      const polar = 0.29 + (step / 28) * 1.19;
      const radial = 1.081 * Math.sin(polar);
      points.push(new THREE.Vector3(
        radial * Math.cos(azimuth),
        1.081 * Math.cos(polar),
        radial * Math.sin(azimuth),
      ));
    }
    mesh(`Lid_Internal_Rib_${i + 1}`, new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points), 28, 0.008, 6, false,
    ), metal, lid);
  }
  horizontalRing('Lid_Dome_Circuit_Ring', 0.85, 0.008, 0.68, cyanSubtle, lid);
  cylinder('Lid_Apex_Housing', 0.28, 0.06, [0, 1.028, 0], charcoal, lid);
  cylinder('Lid_Apex_Plate', 0.225, 0.016, [0, 0.991, 0], metal, lid);
  horizontalRing('Lid_Apex_Status_Ring', 0.184, 0.009, 0.979, cyanSubtle, lid, 64);
  cylinder('Lid_Apex_Center', 0.142, 0.018, [0, 0.977, 0], recessed, lid, 48);

  // Bottom capture cradle: nested light guides and six mechanical sectors.
  cylinder('Capture_Cradle_Base', 0.805, 0.115, [0, -0.708, 0], recessed, lower);
  cylinder('Capture_Cradle_Alloy_Step', 0.768, 0.038, [0, -0.64, 0], metal, lower);
  cylinder('Capture_Cradle_Surface', 0.739, 0.026, [0, -0.61, 0], charcoal, lower);
  horizontalRing('Capture_Outer_Alloy_Edge', 0.771, 0.014, -0.616, edgeMetal, lower);
  horizontalRing('Capture_Energy_Outer', 0.69, 0.017, -0.589, cyan, lower);
  horizontalRing('Capture_Energy_Middle', 0.49, 0.012, -0.587, cyan, lower);
  horizontalRing('Capture_Energy_Inner', 0.285, 0.011, -0.583, cyanSubtle, lower);

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const sector = box(`Cradle_Radial_Panel_${i + 1}`, [0.085, 0.018, 0.13], [
      Math.sin(a) * 0.587, -0.585, Math.cos(a) * 0.587,
    ], metal, lower);
    sector.rotation.y = a;
    const slot = box(`Cradle_Status_Slot_${i + 1}`, [0.034, 0.006, 0.063], [
      Math.sin(a) * 0.587, -0.572, Math.cos(a) * 0.587,
    ], cyanSubtle, lower);
    slot.rotation.y = a;

    const seat = box(`Bowl_Rim_Latch_${i + 1}`, [0.105, 0.055, 0.083], [
      Math.sin(a) * 1.035, 0.021, Math.cos(a) * 1.035,
    ], metal, lower);
    seat.rotation.y = a;
    const screw = cylinder(`Bowl_Latch_Fastener_${i + 1}`, 0.018, 0.009, [
      Math.sin(a) * 1.035, 0.052, Math.cos(a) * 1.035,
    ], recessed, lower, 12);
    screw.castShadow = false;

    const brace = box(`Bowl_Cradle_Support_${i + 1}`, [0.061, 0.18, 0.11], [
      Math.sin(a) * 0.789, -0.692, Math.cos(a) * 0.789,
    ], liner, lower);
    brace.rotation.y = a;
  }
  cylinder('Capture_Core_Base', 0.218, 0.062, [0, -0.571, 0], recessed, lower, 64);
  horizontalRing('Capture_Core_Halo', 0.192, 0.013, -0.532, cyan, lower, 64);
  const innerButton = interactive(cylinder('Inner_Capture_Button', 0.157, 0.034, [0, -0.531, 0], buttonMaterial, lower, 64));
  innerButton.userData.label = 'Close Poké Ball';
  interactive(cylinder('Capture_Core_Center', 0.052, 0.003, [0, -0.512, 0], cyanSubtle, lower, 32));

  // Front push-button: the dark base provides the classic equator silhouette.
  interactive(frontDisc('Front_Button_Dark_Socket', 0.263, 0.122, 1.173, charcoal, lower));
  interactive(frontRing('Front_Button_Alloy_Bezel', 0.217, 0.015, 1.245, edgeMetal, lower));
  interactive(frontDisc('Front_Button_Ivory_Bezel', 0.202, 0.032, 1.246, ivory, lower));
  const buttonGlow = interactive(frontRing('Front_Button_Cyan_Halo', 0.163, 0.009, 1.267, cyan, lower));
  interactive(frontDisc('Front_Button_Face', 0.147, 0.032, 1.266, buttonMaterial, lower));
  interactive(frontRing('Front_Button_Inset_Edge', 0.126, 0.003, 1.283, ivory, lower));

  // An inner latch is visible directly behind the exterior button when open.
  interactive(frontDisc('Inner_Front_Latch_Housing', 0.132, 0.055, 1.026, recessed, lower, -0.023, 48));
  interactive(frontRing('Inner_Front_Latch_Halo', 0.087, 0.008, 0.994, cyanSubtle, lower, -0.023));
  const latchButton = interactive(frontDisc('Inner_Front_Latch_Button', 0.07, 0.015, 0.99, metal, lower, -0.023, 48));
  latchButton.userData.label = 'Close Poké Ball';

  // Rear hinge: fixed end barrels, moving central barrel, restrained brackets.
  for (const side of [-1, 1]) {
    box(`Hinge_Fixed_Bracket_${side < 0 ? 'L' : 'R'}`, [0.105, 0.18, 0.075], [side * 0.276, -0.028, -1.076], charcoal, lower);
    const barrel = cylinder(`Hinge_Fixed_Barrel_${side < 0 ? 'L' : 'R'}`, 0.092, 0.12,
      [side * 0.245, HINGE_Y, HINGE_Z], metal, lower, 32);
    barrel.rotation.z = Math.PI / 2;
    const bolt = cylinder(`Hinge_Axle_Cap_${side < 0 ? 'L' : 'R'}`, 0.051, 0.012,
      [side * 0.312, HINGE_Y, HINGE_Z], charcoal, lower, 24);
    bolt.rotation.z = Math.PI / 2;
  }
  const middleBarrel = cylinder('Hinge_Moving_Central_Barrel', 0.079, 0.35,
    [0, HINGE_Y, HINGE_Z], charcoal, lid, 48);
  middleBarrel.rotation.z = Math.PI / 2;
  box('Hinge_Lid_Strap', [0.21, 0.087, 0.12], [0, 0.115, -1.041], metal, lid);

  function clamp01(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 0;
  }

  function setOpen(amount) {
    const value = clamp01(amount);
    lidPivot.rotation.x = -1.8 * value;
    group.userData.openAmount = value;
  }

  function setEnergy(amount) {
    energy = clamp01(amount);
    // Smoothstep gives a continuous, gentle response without owning a render loop.
    const eased = energy * energy * (3 - 2 * energy);
    for (const channel of glowChannels) {
      channel.material.emissiveIntensity = channel.minimum
        + (channel.maximum - channel.minimum) * eased;
    }
    group.userData.energyAmount = energy;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const geometry of geometries) geometry.dispose();
    for (const surface of materials) surface.dispose();
  }

  setOpen(0);
  setEnergy(energy);
  group.updateMatrixWorld(true);
  let triangles = 0;
  group.traverse((object) => {
    if (!object.isMesh) return;
    const geometry = object.geometry;
    triangles += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
  });
  group.userData.triangles = triangles;
  return { group, lidPivot, buttonGlow, setOpen, setEnergy, dispose };
}
