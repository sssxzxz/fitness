// 写实材质：肌肉纤维纹理（沿肌肉长轴的条纹 + 凹凸）、湿润光泽、肌腱/筋膜白色光泽、骨骼细微孔隙
import * as THREE from 'three';

// GLSL 噪声（3D value noise + fbm）
const NOISE = /* glsl */`
float hash13(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx+31.32); return fract((p.x+p.y)*p.z); }
float vnoise(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*f*(f*(f*6.0-15.0)+10.0);
  return mix(mix(mix(hash13(i),hash13(i+vec3(1,0,0)),f.x), mix(hash13(i+vec3(0,1,0)),hash13(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash13(i+vec3(0,0,1)),hash13(i+vec3(1,0,1)),f.x), mix(hash13(i+vec3(0,1,1)),hash13(i+vec3(1,1,1)),f.x),f.y), f.z); }
float fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; } return s; }
// 按像素尺度逐个淡出高频层（抗锯齿）：lod = 一个像素跨越的基础周期数
float fbmL(vec3 p, float lod){ float a=0.5, s=0.0, f=1.0;
  for(int i=0;i<4;i++){ float w = 1.0 - smoothstep(0.18, 0.45, lod*f); s += a * mix(0.5, vnoise(p), w); p*=2.03; f*=2.03; a*=0.5; }
  return s; }
`;

// 每个像素对应的视角大小（所有材质共享），由 app.js 在尺寸变化时更新
export const PIX = { value: 0.0012 };

// 主成分分析求网格长轴（纤维方向近似）
function principalAxis(geo) {
  const pos = geo.attributes.position, n = pos.count, step = Math.max(1, Math.floor(n / 1500));
  const c = new THREE.Vector3(), v = new THREE.Vector3(); let k = 0;
  for (let i = 0; i < n; i += step) { c.add(v.fromBufferAttribute(pos, i)); k++; }
  c.divideScalar(k);
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (let i = 0; i < n; i += step) { v.fromBufferAttribute(pos, i).sub(c); xx += v.x * v.x; xy += v.x * v.y; xz += v.x * v.z; yy += v.y * v.y; yz += v.y * v.z; zz += v.z * v.z; }
  let a = new THREE.Vector3(1, 1, 1).normalize();
  for (let it = 0; it < 24; it++) { a = new THREE.Vector3(xx * a.x + xy * a.y + xz * a.z, xy * a.x + yy * a.y + yz * a.z, xz * a.x + yz * a.y + zz * a.z).normalize(); }
  return a;
}

const KIND = {
  muscle: { color: 0x6a1611, roughness: 0.45, clearcoat: 0.32, clearcoatRoughness: 0.3, sheen: 0.35, sheenColor: 0xd85a4c, sheenRoughness: 0.45, along: 8, across: 380, bump: 0.0035, tint: 0.11 },
  tendon: { color: 0xe4ddd0, roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.2, sheen: 0.3, sheenColor: 0xffffff, sheenRoughness: 0.4, along: 20, across: 500, bump: 0.003, tint: 0.05 },
  fascia: { color: 0xe8e2d6, roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.25, sheen: 0.2, sheenColor: 0xffffff, sheenRoughness: 0.5, along: 18, across: 260, bump: 0.003, tint: 0.06 },
  bone: { color: 0xe6dcc6, roughness: 0.62, clearcoat: 0.08, clearcoatRoughness: 0.6, sheen: 0, along: 140, across: 140, bump: 0.0, tint: 0.03 },
  cartilage: { color: 0xb9d3df, roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.2, sheen: 0.2, sheenColor: 0xffffff, sheenRoughness: 0.4, along: 120, across: 120, bump: 0.002, tint: 0.05 },
  tooth: { color: 0xf3efe4, roughness: 0.18, clearcoat: 0.8, clearcoatRoughness: 0.1, sheen: 0, along: 200, across: 200, bump: 0.001, tint: 0.03 },
  artery: { color: 0xb01e1e, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.25, sheen: 0.3, sheenColor: 0xff8080, sheenRoughness: 0.4, along: 40, across: 200, bump: 0.002, tint: 0.08 },
  vein: { color: 0x2f4f9e, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.25, sheen: 0.3, sheenColor: 0x8fa8ff, sheenRoughness: 0.4, along: 40, across: 200, bump: 0.002, tint: 0.08 },
  nerve: { color: 0xf0cf5a, roughness: 0.4, clearcoat: 0.3, clearcoatRoughness: 0.3, sheen: 0.3, sheenColor: 0xffffff, sheenRoughness: 0.5, along: 40, across: 400, bump: 0.002, tint: 0.1 },
  organ: { color: 0xc56b62, roughness: 0.38, clearcoat: 0.45, clearcoatRoughness: 0.25, sheen: 0.4, sheenColor: 0xffb0a0, sheenRoughness: 0.5, along: 60, across: 60, bump: 0.003, tint: 0.12 },
  ligament: { color: 0xd9d4c6, roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.25, sheen: 0.2, sheenColor: 0xffffff, sheenRoughness: 0.4, along: 30, across: 600, bump: 0.003, tint: 0.06 },
  lymph: { color: 0x8bbf5a, roughness: 0.4, clearcoat: 0.3, clearcoatRoughness: 0.3, sheen: 0.2, sheenColor: 0xffffff, sheenRoughness: 0.5, along: 60, across: 60, bump: 0.002, tint: 0.08 },
};
export function kindOf(sys, base) {
  const n = base.toLowerCase();
  if (sys === 'muscular') {
    if (/fascia|aponeuros|linea alba|retinacul|septum|sheath|ring|tract|arch|ligament/.test(n)) return 'fascia';
    if (/tendon|bursa|tarsus|trochlea/.test(n)) return 'tendon';
    return 'muscle';
  }
  if (sys === 'skeletal') { if (/cartilage|disc/.test(n)) return 'cartilage'; if (/incisor|canine|molar|premolar|tooth/.test(n)) return 'tooth'; return 'bone'; }
  if (sys === 'cardiovascular') return /vein|vena|venous|sinus/.test(n) ? 'vein' : (/heart|atrium|ventricle|valve/.test(n) ? 'organ' : 'artery');
  if (sys === 'nervous') return /brain|cerebr|cerebel|eye|retina|lens|cornea|ear|cochlea|medulla|pons|thalam|hypothal|gyrus|lobe/.test(n) ? 'organ' : 'nerve';
  if (sys === 'joints') return /cartilage|disc|menisc|labrum/.test(n) ? 'cartilage' : 'ligament';
  if (sys === 'lymphoid') return 'lymph';
  return 'organ';
}

export function makeMaterial(mesh, sys, base, variation = 0) {
  const kind = kindOf(sys, base), K = KIND[kind];
  const col = new THREE.Color(K.color).multiplyScalar(1 + variation);   // 每块肌肉亮度轻微不同（乘法，避免线性空间下变得过暗）
  const mat = new THREE.MeshPhysicalMaterial({
    color: col, roughness: K.roughness, metalness: 0, clearcoat: K.clearcoat, clearcoatRoughness: K.clearcoatRoughness,
    sheen: K.sheen || 0, sheenColor: new THREE.Color(K.sheenColor || 0xffffff), sheenRoughness: K.sheenRoughness || 0.5,
    side: THREE.DoubleSide,
  });
  const axis = principalAxis(mesh.geometry);
  const helper = Math.abs(axis.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(axis, helper).normalize(), v = new THREE.Vector3().crossVectors(axis, u).normalize();
  const sc = mesh.getWorldScale(new THREE.Vector3()).x || 1;
  const uni = { uAxis: { value: axis }, uU: { value: u }, uV: { value: v }, uScale: { value: sc }, uFreq: { value: new THREE.Vector2(K.along, K.across) }, uBump: { value: K.bump }, uTint: { value: K.tint }, uDetail: { value: 1 }, uPix: PIX };
  mat.userData.uniforms = uni;
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vObjPos; uniform vec3 uAxis, uU, uV; uniform float uScale, uBump, uTint, uDetail, uPix; uniform vec2 uFreq;
${NOISE}
float gDetail = 1.0;
vec3 toQ(vec3 op){ vec3 p = op * uScale; return vec3(dot(p,uAxis)*uFreq.x, dot(p,uU)*uFreq.y, dot(p,uV)*uFreq.y); }
float gLod = 0.0;
float fibPattern(vec3 q, float lod){
  float n = fbmL(q * vec3(1.0, 0.18, 0.6), lod * 0.18);            // 低频扰动，让纤维略微弯曲、粗细不一
  float w = 1.0 - smoothstep(0.07, 0.16, lod);                     // 条纹本身太细时淡出（避免摩尔纹）
  float lines = 0.5 + 0.5 * sin(6.2831853 * (q.y + q.z * 0.6 + 2.2 * n));
  lines = smoothstep(0.1, 0.9, lines);
  return mix(n, mix(n, lines, 0.38), w); }
float fiberAt(vec3 op){ return fibPattern(toQ(op), gLod); }
float fiberH(){ vec3 q = toQ(vObjPos);
  float lod = vViewPosition.z * uPix * uFreq.y;   // 一个像素跨越多少条纹（按距离连续计算）：越远越淡出细节，避免闪烁
  gLod = lod;
  gDetail = 1.0 - smoothstep(0.15, 0.6, lod);
  float big = fbm(vObjPos * uScale * 24.0);       // 远看时保留柔和的大尺度斑驳
  float f = 0.5;
  if (gDetail > 0.0) f = fibPattern(q, lod);
  return mix(0.62 + (big - 0.5) * 0.3, f, gDetail); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float fh = fiberH();
diffuseColor.rgb *= mix(1.0 - uTint, 1.0 + uTint*0.25, smoothstep(0.15, 0.85, fh));`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
if (uDetail > 0.5 && gDetail > 0.0) {
  vec3 vSigmaX = dFdx(-vViewPosition), vSigmaY = dFdy(-vViewPosition);
  vec3 R1 = cross(vSigmaY, normal), R2 = cross(normal, vSigmaX);
  float fDet = dot(vSigmaX, R1);
  vec3 dpx = dFdx(vObjPos), dpy = dFdy(vObjPos);     // 在相邻像素对应的表面位置重新采样，得到平滑的梯度
  float h0 = gDetail > 0.0 ? fiberAt(vObjPos) : 0.0;
  float dHx = gDetail > 0.0 ? (fiberAt(vObjPos + dpx) - h0) * uBump * 60.0 * gDetail : 0.0;
  float dHy = gDetail > 0.0 ? (fiberAt(vObjPos + dpy) - h0) * uBump * 60.0 * gDetail : 0.0;
  vec3 vGrad = sign(fDet) * (dHx * R1 + dHy * R2);
  normal = normalize(abs(fDet) * normal - vGrad);
}`);
  };
  mat.customProgramCacheKey = () => 'anat-' + kind;
  return mat;
}

// 淡化（幽灵）材质：与 Innerbody 一样的白灰半透明
export const GHOST = new THREE.MeshStandardMaterial({ color: 0xdfe4ea, roughness: 0.5, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });

// 光照：环境反射 + 主光 + 补光 + 轮廓光
export async function setupLighting(renderer, scene, camera, RoomEnvironment) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  scene.add(new THREE.HemisphereLight(0xfff4ee, 0x2a2224, 0.35));
  const hemi = scene.children.find(o => o.isHemisphereLight);
  const key = new THREE.DirectionalLight(0xfff1e6, 2.8); key.position.set(0.6, 1.1, 1.2); camera.add(key);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.55); fill.position.set(-1.2, 0.2, 0.6); camera.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 1.1); rim.position.set(0, 0.6, -1.5); camera.add(rim);
  LIGHTS = { renderer, scene, hemi, key, fill, rim };
}
let LIGHTS = null;
// 按风格调整光照：示意风格光线更均匀、颜色不做色调映射
export function setLightStyle(style) {
  if (!LIGHTS) return; const L = LIGHTS;
  if (style === 'real') {
    L.renderer.toneMapping = THREE.ACESFilmicToneMapping; L.scene.environmentIntensity = 0.45;
    L.hemi.intensity = 0.35; L.key.intensity = 2.8; L.fill.intensity = 0.55; L.rim.intensity = 1.1;
  } else {
    L.renderer.toneMapping = THREE.NeutralToneMapping; L.scene.environmentIntensity = 0.35;
    L.hemi.intensity = 1.1; L.key.intensity = 1.5; L.fill.intensity = 0.6; L.rim.intensity = 0.5;
  }
}

// ───────── 示意风格（Innerbody 式）：干净的哑光色块，每块肌肉颜色略有区别 ─────────
const ILLUS = {
  muscle: 0xc0392f, tendon: 0xeeeae2, fascia: 0xeeeae2, bone: 0xefe7d4, cartilage: 0xc7dde8, tooth: 0xfaf7ef,
  artery: 0xd0302a, vein: 0x3c63c4, nerve: 0xf2cc45, organ: 0xd07a6e, ligament: 0xe4e0d4, lymph: 0x8fc45c,
};
export function makeIllusMaterial(sys, base, h) {   // h: 0–1 的稳定随机数（按名称）
  const kind = kindOf(sys, base);
  const col = new THREE.Color(ILLUS[kind]);
  if (kind === 'muscle') col.offsetHSL((h - 0.5) * 0.008, 0, (((h * 7.31) % 1) - 0.5) * 0.07);
  else col.offsetHSL(0, 0, (h - 0.5) * 0.04);
  return new THREE.MeshStandardMaterial({ color: col, roughness: kind === 'bone' ? 0.8 : 0.62, metalness: 0, side: THREE.DoubleSide,
    envMapIntensity: 0.6 });
}

// ───────── 轮廓线：按“结构编号”渲染一张图，相邻像素编号不同的地方画线 ─────────
export class OutlinePass {
  constructor(renderer) {
    this.renderer = renderer;
    this.target = new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
    this.target.texture.colorSpace = THREE.NoColorSpace;
    this.idMats = new Map();
    this.quadScene = new THREE.Scene(); this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tId: { value: this.target.texture }, uTexel: { value: new THREE.Vector2() }, uColor: { value: new THREE.Color(0x3a0d0a) }, uWidth: { value: 1 }, uOpacity: { value: 0.75 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform sampler2D tId; uniform vec2 uTexel; uniform vec3 uColor; uniform float uWidth, uOpacity; varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tId, vUv).rgb; float e = 0.0;
          for (int i = 0; i < 8; i++) {
            vec2 d = vec2(i == 0 ? 1.0 : i == 1 ? -1.0 : i == 4 ? 1.0 : i == 5 ? -1.0 : i == 6 ? 1.0 : i == 7 ? -1.0 : 0.0,
                          i == 2 ? 1.0 : i == 3 ? -1.0 : i == 4 ? 1.0 : i == 5 ? -1.0 : i == 6 ? -1.0 : i == 7 ? 1.0 : 0.0);
            vec3 n = texture2D(tId, vUv + d * uTexel * uWidth).rgb;
            float diff = step(0.002, distance(n, c));
            e += diff * (i < 4 ? 1.0 : 0.5);
          }
          e = clamp(e / 3.0, 0.0, 1.0);
          if (e <= 0.0) discard;
          gl_FragColor = vec4(uColor, e * uOpacity);
        }`,
      transparent: true, depthTest: false, depthWrite: false,
    });
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat));
  }
  setSize(w, h) { this.target.setSize(w, h); this.mat.uniforms.uTexel.value.set(1 / w, 1 / h); }
  idMat(m, i) {
    let mat = this.idMats.get(m);
    if (!mat) { const id = i + 1; mat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(((id >> 16) & 255) / 255, ((id >> 8) & 255) / 255, (id & 255) / 255, THREE.SRGBColorSpace), side: THREE.DoubleSide }); mat.toneMapped = false; this.idMats.set(m, mat); }
    return mat;
  }
  render(scene, camera, meshes, isSolid) {
    const r = this.renderer, saved = [], hidden = [];
    meshes.forEach((m, i) => {
      if (!m.visible) return;
      if (!isSolid(m)) { m.visible = false; hidden.push(m); return; }
      saved.push([m, m.material]); m.material = this.idMat(m, i);
    });
    const bg = scene.background, tm = r.toneMapping; scene.background = null; r.toneMapping = THREE.NoToneMapping;
    const others = []; scene.traverse(o => { if (o.isMesh && o.visible && !this.idMats.has(o) && !o.isSkinnedMesh && !saved.find(s => s[0] === o)) { o.visible = false; others.push(o); } });
    r.setRenderTarget(this.target); r.setClearColor(0x000000, 1); r.clear(); r.render(scene, camera); r.setRenderTarget(null);
    others.forEach(o => o.visible = true);
    scene.background = bg; r.toneMapping = tm;
    saved.forEach(([m, mat]) => m.material = mat); hidden.forEach(m => m.visible = true);
    const ac = r.autoClear; r.autoClear = false; r.render(this.quadScene, this.quadCam); r.autoClear = ac;
  }
}
