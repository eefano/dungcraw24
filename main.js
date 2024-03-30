import WebGL from "three/addons/capabilities/WebGL.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as THREE from "three";
import { TXT } from "./txt.js";
import { rHALF, directions } from "./tables.js";
import * as Procedural from "./procedural.js";
import { editorhandler, toCellId, selcells, selobjs } from "./editor.js";

var xres, yres, canvas, txt;
var keystate = [];
var keytrigs = new Set();

var jsons = {};
var models = {};
var textures = {};

let world;
let state;

const eflags = {
  world: 0b1,
  state: 0b10,
};

const ViewDistance = 6;

function step() {
  window.requestAnimationFrame(step);
}

function init() {

  if (typeof sessionStorage.state !== "undefined") {
    state = JSON.parse(sessionStorage.state);
  }
  else {
    state = {
      birdeye: false,
      cameradir: 0,
      camerarx: 0,
      camerary: 0,
      cameracell: "0 0 0",
    };
  }

  if (typeof sessionStorage.world !== "undefined") {
    world = JSON.parse(sessionStorage.world);
  } else world = jsons["world"];

  if (world === undefined) {
    world = {
      "0 0 0": {
        n: [0, 0, 0, 0, 0, 0],
        w: [1, 2, 3, 4, 5, 6],
      },
    };
  }
  //console.log(world);
  redraw();
}

function persist(key, value) {
  //console.log("persisting ", key);
  sessionStorage[key] = JSON.stringify(value);
}

let walls;

let scene, camera, renderer, raycaster;
let orthoscene, orthocamera;

const fov = 90;
const cameraoffset = 0.203;
/*
const fov = 109.15;
const cameraoffset = 0.25;
*/
const pointer = new THREE.Vector2();

let meshpool = {},
  meshindex = {},
  frame = 0;

function getmesh(wallindex, dir, xp, yp, zp, mx, my, mz, offset, osxdx = 0, oupdw = 0) {
  let pool = meshpool[wallindex];
  if (pool === undefined) {
    pool = [];
    meshpool[wallindex] = pool;
  }
  let index = meshindex[wallindex] || 0;
  let mesh;

  if (index == pool.length) {
    mesh = walls[wallindex].mesh.clone();
    pool.push(mesh);
    scene.add(mesh);
  } else {
    mesh = pool[index];
    mesh.visible = true;
  }
  mesh.rotation.x = mz * my * dir.rotx;
  mesh.rotation.y = mz * mx * dir.roty;
  mesh.position.x = -xp - (offset * dir.mov[0] + osxdx * dir.movsxdx[0] + oupdw * dir.movupdw[0]) * mx;
  mesh.position.y = -yp - (offset * dir.mov[1] + osxdx * dir.movsxdx[1] + oupdw * dir.movupdw[1]) * my;
  mesh.position.z = -zp - (offset * dir.mov[2] + osxdx * dir.movsxdx[2] + oupdw * dir.movupdw[2]) * mz;
  mesh.scale.x = mx;
  mesh.scale.y = my;
  mesh.scale.z = mz;

  meshindex[wallindex] = index + 1;
  return mesh;
}

const ViewDistanceSquared = ViewDistance * ViewDistance;
const space = {};
const spread = 0.38;
const objsize = 0.15;

const slots = [
  0,
  [-spread, -spread],
  [0, -spread],
  [spread, -spread],
  [-spread, 0],
  [0, 0],
  [spread, 0],
  [-spread, spread],
  [0, spread],
  [spread, spread],
];

const wflags = {
  mirror: 0b1,
  object: 0b01,
};

function scan(cellid, dirmask, xp = 0, yp = 0, zp = 0, mx = 1, my = 1, mz = 1) {
  const posid = toCellId(xp, yp, zp);
  if (space[posid] == frame) return;
  space[posid] = frame;

  if (xp * xp + yp * yp + zp * zp > ViewDistanceSquared) return;

  let cell = world[cellid];
  const selected = selcells.get(cellid);

  //console.log('cell',cellid, 'dirmask', dirmask.toString(2), 'level', level);

  let deferred = [];

  directions.forEach((dir, dirid) => {
    let wallindex = cell.w[dirid];
    if (dirmask & dir.mask) {
      // RENDER WALL
      if (wallindex != 0) {
        //console.log('dirid', dirid, 'wall', wallindex, 'level', level,'frame',frame,'sv',sv);
        const mesh = getmesh(wallindex, dir, xp, yp, zp, mx, my, mz, 0.5);
        mesh.layers.enable(1);
        mesh.userData.type = 0;
        mesh.userData.cellid = cellid;
        mesh.userData.dirmask = dir.mask;

        /*
        if (level > 0) {
          const test = getmesh("number" + level, dir, xp, yp, zp, mx, my, mz, 0.48);
          //test.position.y = -0.49;
          test.scale.x = 1 / 8;
          test.scale.y = 1 / 8;
        }
        */

        if (selected !== undefined && selected & dir.mask) {
          const mesh = getmesh("_" + wallindex, dir, xp, yp, zp, mx, my, mz, 0.49);
          mesh.layers.disable(1);
          mesh.scale.x *= 0.9;
          mesh.scale.y *= 0.9;
          mesh.scale.z *= 0.9;
        }
      }
    }
    // RENDER OBJECTS ANCHORED TO WALL
    const cello = cell.o;
    if (cello !== undefined) {
      const objs = cello[dirid];
      for (const slotid in objs) {
        const obj = objs[slotid];
        if (obj !== undefined) {
          const slot = slots[slotid];
          const mesh = getmesh(obj.w, dir, xp, yp, zp, mx, my, mz, 0.5, slot[0], slot[1]);
          mesh.layers.enable(1);
          const userData = mesh.userData;
          userData.type = 1;
          userData.cellid = cellid;
          userData.dirid = dirid;
          userData.slotid = slotid;
          userData.objid = cellid + " " + dirid + " " + slotid;

          if (selobjs.has(userData.objid)) {
            const mesh = getmesh("_" + obj.w, dir, xp, yp, zp, mx, my, mz, 0.5, slot[0], slot[1]);
            mesh.scale.x *= 1.1;
            mesh.scale.y *= 1.1;
            mesh.scale.z *= 1.1;
            mesh.layers.disable(1);
          }
        }
      }
    }

    if (dirmask & dir.mask) {
      if (walls[wallindex].type & wflags.mirror) {
        deferred.push(dirid);
      } else {
        let nextcell = cell.n[dirid];
        if (nextcell != 0) {
          const mov = dir.mov;
          scan(
            nextcell,
            dirmask & dir.oppo, // dir.oppo solo per audio scan
            xp + mov[0] * mx,
            yp + mov[1] * my,
            zp + mov[2] * mz,
            mx,
            my,
            mz
          );
        }
      }
    }
  });

  // Second Pass : Special Portals (mirrors)
  deferred.forEach((dirid) => {
    const dir = directions[dirid];
    const back = directions[dir.back];
    const mov = dir.mov;
    scan(
      cellid,
      (dirmask & back.oppo) | back.mask,
      xp + mov[0] * mx,
      yp + mov[1] * my,
      zp + mov[2] * mz,
      mx * dir.mirr[0],
      my * dir.mirr[1],
      mz * dir.mirr[2]
    );
  });
}

function rerender() {
  if (state.birdeye) {
    camera.rotation.x = -rHALF;
    //camera.rotation.y = 0;
    camera.position.x = 0;
    camera.position.y = 4;
    camera.position.z = 0;
    scene.fog.far = 1000;
  } else {
    const dirx = directions[state.camerarx];
    const diry = directions[state.camerary];

    camera.rotation.x = dirx.rotx;
    //camera.rotation.y = directions[camerary].roty;
    camera.position.x = cameraoffset * diry.mov[0];
    camera.position.y = cameraoffset * dirx.mov[1];
    camera.position.z = cameraoffset * diry.mov[2];
    scene.fog.far = ViewDistance - 1;
  }
  camera.rotation.y = directions[state.camerary].roty;
  camera.rotation.order = "YXZ";

  renderer.autoClear = true;
  renderer.setViewport(0, 0, yres, yres);
  renderer.render(scene, camera);
  //renderer.clearDepth();
  renderer.autoClear = false;
  renderer.setViewport(0, 0, xres, yres);
  renderer.render(orthoscene, orthocamera);
}

function redraw() {
  state.cameradir = state.camerarx == 0 ? state.camerary : state.camerarx;

  const startmask = directions[state.cameradir].oppo; /* 0b111111 per audio scan */

  frame++;
  scan(state.cameracell, startmask);

  //console.log(meshpool);
  //console.log(meshindex);

  for (const index in meshindex) {
    const pool = meshpool[index];
    for (let i = meshindex[index]; i < pool.length; i++) {
      pool[i].visible = false;
      pool[i].layers.disable(1);
    }
    meshindex[index] = 0;
  }
  rerender();
}

function keydown(e) {
  if (keystate[e.keyCode]) return;
  keystate[e.keyCode] = true;
  keytrigs.add(e.keyCode);
  //console.log(e);

  const res = editorhandler(e);
  //console.log(res,eflags);
  if (res & eflags.state) persist('state',state);
  if (res & eflags.world) persist('world',world);
  redraw();
}
function keyup(e) {
  keystate[e.keyCode] = false;
  //console.log(e);
  /*
  if (e.shiftKey && camera.rotation.x != 0) {
    camera.rotation.x = 0;
    redraw();
  }
  */
}

let dragging;

let rrect;

function onresize(e) {
  rrect = renderer.domElement.getBoundingClientRect();
}

function selectCell(e) {
  pointer.x = ((e.clientX - rrect.left) / (rrect.bottom - rrect.top)) /*(rrect.right - rrect.left)*/ * 2 - 1;
  pointer.y = -((e.clientY - rrect.top) / (rrect.bottom - rrect.top)) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(scene.children, false);

  if (intersects.length > 0) {
    const o = intersects[0].object;
    const data = o.userData;
    //console.log("data", data);

    if (data.type == 0) {
      // WALL
      selobjs.clear();

      const cellid = data.cellid;
      const dirmask = data.dirmask;
      let sel = selcells.get(cellid) || 0;

      if (dragging !== undefined) {
        //console.log('dragging',dragging,'dirmask',dirmask,'sel',sel & dirmask);
        if (dragging[0] != dirmask || dragging[1] == (sel & dirmask)) return;
      } else {
        if (!e.ctrlKey) {
          selcells.clear();
          sel = 0;
        }
      }

      sel = sel ^ dirmask;
      selcells.set(cellid, sel);
      //console.log(selcells);
      redraw();
      return [dirmask, sel & dirmask];
    } else if (data.type == 1) {
      // anchored objects
      if (dragging !== undefined) return;
      selcells.clear();
      selobjs.set(data.objid, Object.assign({}, data));
      redraw();
    }
  }
  return;
}

function onmousemove(e) {
  if (dragging !== undefined) {
    selectCell(e);
  }
}

function onmousedown(e) {
  if (e.button == 0) {
    dragging = selectCell(e);
  }
}
function onmouseup(e) {
  if (e.button == 0) {
    dragging = undefined;
  }
}

function onwheel(e) {
  /*
  if (e.deltaY > 0) {
  }*/
}

async function preload(as, suffix, callback) {
  let elements = document.querySelectorAll('link[as="' + as + '"][href$="' + suffix + '"]');
  for (let i = 0; i < elements.length; i++) {
    let href = elements[i].attributes["href"].nodeValue;
    let v = href.substring(5, href.length - suffix.length);
    await callback(v, elements[i].href);
  }
}

async function load() {
  canvas = document.getElementById("gamecanvas");
  xres = canvas.width;
  yres = canvas.height;

  if (!WebGL.isWebGLAvailable()) {
    let ctx = canvas.getContext("2d");
    ctx.font = "16px GameFont";
    ctx.fillStyle = "white";
    ctx.fillText(" This browser does not support WebGL :(", 0, yres / 2);
    return;
  }

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0, 0, ViewDistance);

  orthoscene = new THREE.Scene();
  orthocamera = new THREE.OrthographicCamera(0, xres, yres, 0, 0.1, 100);
  orthocamera.position.z = 0.1;

  const light = new THREE.AmbientLight();
  scene.add(light);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.x = 0;
  directionalLight.position.y = 1;
  directionalLight.position.z = 1;
  scene.add(directionalLight);

  camera = new THREE.PerspectiveCamera(fov, 1, 0.1, ViewDistance);
  renderer = new THREE.WebGLRenderer({ canvas: canvas });

  raycaster = new THREE.Raycaster();
  raycaster.layers.set(1);

  /*
  const loader = new GLTFLoader();
  for (let n of ["wall", "floor", "arch", "door"]) {
    const model = await loader.loadAsync("data/" + n + ".glb");
    models[n] = model.scene;
    //console.log(model.scene);
  }
  */

  await preload("image", ".png", async (v, href) => {
    const t = await new THREE.TextureLoader().loadAsync(href);
    t.minFilter = THREE.NearestFilter;
    t.magFilter = THREE.NearestFilter;
    textures[v] = t;
  });

  await preload("fetch", ".mp3", async (v, href) => {
    //const res = await fetch(href);
    //const buf = await res.arrayBuffer();
    //SFX.load(v, buf);
  });

  await preload("fetch", ".json", async (v, href) => {
    const res = await fetch(href);
    if (!res.ok) return;
    jsons[v] = await res.json();
  });

  txt = TXT(textures["gamefonto"], jsons["gamefont"], 64);

  //console.log(textures);

  const checker = Procedural.checkertexture(128, 128, 0xffffff);

  let mats = {
    0: new THREE.MeshBasicMaterial({
      wireframe: true,
      color: 0xffffff,
      fog: false,
    }),
    1: new THREE.MeshBasicMaterial({ map: textures.n, color: 0xffff00 }),
    2: new THREE.MeshBasicMaterial({ map: textures.s, color: 0xafaf00 }),
    3: new THREE.MeshBasicMaterial({ map: textures.w, color: 0x00ffff }),
    4: new THREE.MeshBasicMaterial({ map: textures.e, color: 0x00afaf }),
    5: new THREE.MeshBasicMaterial({ map: textures.dw, color: 0xff00ff }),
    6: new THREE.MeshBasicMaterial({ map: textures.up, color: 0xaf00af }),
    black: new THREE.MeshBasicMaterial({ color: 0x000000 }),
    checker: new THREE.MeshBasicMaterial({
      map: checker,
      color: 0xffffff,
      transparent: true,
      opacity: 0.2,
      forceSinglePass: true,
    }),
    pool: new THREE.MeshBasicMaterial({
      color: 0x8080ff,
      transparent: true,
      opacity: 0.8,
      forceSinglePass: true,
    }),
  };

  const plane = new THREE.PlaneGeometry();
  const pooly = new THREE.PlaneGeometry().translate(0, 0, -0.1);
  const floor = new THREE.BoxGeometry().scale(1, 1, 0.1).translate(0, 0, -0.05);

  walls = {
    0: { type: 0, mesh: new THREE.Mesh(plane, mats[0]) },
    1: { type: 0, mesh: new THREE.Mesh(plane, mats[1]) },
    2: { type: 0, mesh: new THREE.Mesh(plane, mats[2]) },
    3: { type: 0, mesh: new THREE.Mesh(plane, mats[3]) },
    4: { type: 0, mesh: new THREE.Mesh(plane, mats[4]) },
    5: { type: 0, mesh: new THREE.Mesh(plane, mats[5]) },
    alt5: {
      type: 0,
      mesh: new THREE.Mesh(floor, [mats.black, mats.black, mats.black, mats.black, mats[5], mats.black]),
    },
    6: { type: 0, mesh: new THREE.Mesh(plane, mats[6]) },
    number0: { type: 0, mesh: txt.toMesh("0", 0, 0, 0xa8a8a8) },
    number1: { type: 0, mesh: txt.toMesh("1", 0, 0, 0xb0b0b0) },
    number2: { type: 0, mesh: txt.toMesh("2", 0, 0, 0xb8b8b8) },
    number3: { type: 0, mesh: txt.toMesh("3", 0, 0, 0xc0c0c0) },
    number4: { type: 0, mesh: txt.toMesh("4", 0, 0, 0xc8c8c8) },
    number5: { type: 0, mesh: txt.toMesh("5", 0, 0, 0xd0d0d0) },
    number6: { type: 0, mesh: txt.toMesh("6", 0, 0, 0xd8d8d8) },
    number7: { type: 0, mesh: txt.toMesh("7", 0, 0, 0xf0f0f0) },
    number8: { type: 0, mesh: txt.toMesh("8", 0, 0, 0xf8f8f8) },
    number9: { type: 0, mesh: txt.toMesh("9", 0, 0, 0xffffff) },
    mirror: {
      type: wflags.mirror,
      mesh: new THREE.Mesh(plane, mats.checker),
    },
    pool: {
      type: wflags.mirror,
      mesh: new THREE.Mesh(pooly, mats.pool),
    },
    //txt.toMesh("?", 0, 0, 0xffffff),
    cube: {
      type: wflags.object,
      mesh: new THREE.Mesh(new THREE.BoxGeometry().translate(0, 0, 0.5).scale(objsize, objsize, objsize), [
        mats[3],
        mats[4],
        mats[2],
        mats[1],
        mats[5],
        mats[6],
      ]),
    },
  };

  for (const wallid in walls) {
    const wall = walls[wallid];
    const mesh = wall.mesh.clone();
    mesh.material = mats[0];
    walls["_" + wallid] = {
      type: -1,
      mesh: mesh,
    };
    if (wall.type & wflags.object) {
      mesh.geometry.computeBoundingBox();
      wall.overtext = txt.toMesh(wallid, 0, 0, 0xffffff, true).translateZ(mesh.geometry.boundingBox.max.z);
    }
  }

  const test = txt.toMesh("Testing123", 0, 4, 0xffff00);

  test.scale.x = 2;
  test.scale.y = 2;
  /*
  test.rotation.x = -rHALF;
  test.position.y -= 0.49;
  */
  //test.position.x = xres / 2;
  //test.position.y = yres / 2;
  orthoscene.add(test);
  orthoscene.add(walls["cube"].mesh.clone());

  window.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);
  canvas.addEventListener("mousedown", onmousedown);
  canvas.addEventListener("mouseup", onmouseup);
  canvas.addEventListener("mousemove", onmousemove);
  canvas.addEventListener("wheel", onwheel);
  window.addEventListener("resize", onresize);
  onresize();

  init();
  //window.requestAnimationFrame(step);
}

window.addEventListener("load", load);

export { world, state, eflags };
