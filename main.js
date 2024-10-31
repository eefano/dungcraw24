import WebGL from "three/addons/capabilities/WebGL.js";
//import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as THREE from "three";
import { TXT } from "./txt.js";
import { rHALF, directions } from "./tables.js";
import { eflags, editorkeydown, editorwheel, toCellId, selcells, selobjs } from "./editor.js";
import { walls, buildwalls, wflags } from "./walls.js";

if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    // Replace the old value with the new one
  })
}

var xres, yres, canvas, txt;
var keystate = [];
var keytrigs = new Set();

var jsons = {};
var textures = {};

let world;
let state;
let editing = true;

const ViewDistance = 6;

function step() {
  window.requestAnimationFrame(step);
}

function init() {
  if (typeof sessionStorage.state !== "undefined") {
    state = JSON.parse(sessionStorage.state);
  } else {
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
function checkPersist(res) {
  if (res & eflags.state) persist("state", state);
  if (res & eflags.world) persist("world", world);

  if (res != 0) redraw();
}

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
        mesh.userData.wallid = wallindex;
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
          userData.wallid = obj.w;
          userData.cellid = cellid;
          userData.dirid = dirid;
          userData.slotid = slotid;
          userData.objid = cellid + " " + dirid + " " + slotid;

          const overtext = walls["__" + obj.w];
          if (overtext !== undefined && xp < 2 && yp < 2 && zp < 2 && xp > -2 && yp > -2 && zp > -2) {
            //console.log('overtext');
            const bb = walls[obj.w].mesh.geometry.boundingBox.max;

            const mesh = getmesh("__" + obj.w, dir, xp, yp, zp, mx, my, mz, 0.5 - bb.z * 1.1, slot[0], slot[1]);
            mesh.layers.disable(1);
            //mesh.lookAt(camera.position);
            mesh.quaternion.copy(camera.quaternion);
          }

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
  renderer.autoClear = true;
  renderer.setViewport(0, 0, yres, yres);
  renderer.render(scene, camera);
  //renderer.clearDepth();
  renderer.autoClear = false;
  renderer.setViewport(0, 0, xres, yres);
  renderer.render(orthoscene, orthocamera);
}

function redraw() {
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

  if (editing) checkPersist(editorkeydown(e));
  //console.log(res,eflags);
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
    const wall = walls[data.wallid];

    if (wall.type & wflags.wall) {
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
    } else if (wall.type & wflags.object) {
      // anchored objects
      if (dragging !== undefined) return;
      selcells.clear();
      selobjs.clear();
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
  if (editing) checkPersist(editorwheel(e));
}

async function preload(as, suffix, callback) {
  let elements = document.querySelectorAll('link[as="' + as + '"][href$="' + suffix + '"]');
  for (let i = 0; i < elements.length; i++) {
    let href = elements[i].attributes["href"].nodeValue;
    let x = href.lastIndexOf("/") + 1;
    let v = href.substring(x, href.length - suffix.length);
    console.log(x,v, href);
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

  buildwalls(textures, txt);

  const test = txt.toMesh("Testing123", 0, 0, 0xffff00);

  test.scale.x = 2;
  test.scale.y = 2;
  /*
  test.rotation.x = -rHALF;
  test.position.y -= 0.49;
  */
  test.position.x = yres;
  test.position.y = yres - 8;
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

export { world, state };
