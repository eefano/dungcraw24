import WebGL from "three/addons/capabilities/WebGL.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as THREE from "three";
import { TXT } from "./txt.js";

var xres, yres, canvas, txt;
var keystate = [];
var keytrigs = new Set();

var jsons = {};
var models = {};
var textures = {};
var birdeye = false;

const ViewDistance = 6;

function step() {
  window.requestAnimationFrame(step);
}

function init() {
  world = jsons["world"];
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

function checkertexture(width, height, c) {
  const size = width * height * 4;
  const data = new Uint8Array(size);

  const r = c >> 16;
  const g = (c >> 8) & 255;
  const b = c & 255;

  let x = 0,
    y = 0;

  for (let i = 0; i < size; i += 4) {
    const k = (((x >> 0) & 1) ^ ((y >> 0) & 1)) * 0.5 + 0.5;

    data[i] = r * k;
    data[i + 1] = g * k;
    data[i + 2] = b * k;
    data[i + 3] = 255;

    x++;
    if (x == width) {
      x = 0;
      y++;
    }
  }

  // used the buffer to create a DataTexture
  const texture = new THREE.DataTexture(data, width, height);
  texture.needsUpdate = true;
  return texture;
}

const rHALF = Math.PI / 2.0;

// TEH MASTERTABLE !!!

const directions = [
  {
    // N
    mov: [0, 0, +1],
    movsxdx: [-1, 0, 0],
    movupdw: [0, -1, 0],
    mirr: [1, 1, -1],
    mask: 0b000001,
    oppo: 0b111101,
    front: 0,
    back: 1,
    sx: 2,
    dx: 3,
    up: 5,
    dw: 4,
    rotx: 0,
    roty: 0,
  },
  {
    // S
    mov: [0, 0, -1],
    movsxdx: [1, 0, 0],
    movupdw: [0, -1, 0],
    mirr: [1, 1, -1],
    mask: 0b000010,
    oppo: 0b111110,
    front: 1,
    back: 0,
    sx: 3,
    dx: 2,
    up: 5,
    dw: 4,
    rotx: 0,
    roty: Math.PI,
  },
  {
    // W
    mov: [+1, 0, 0],
    movsxdx: [0, 0, 1],
    movupdw: [0, -1, 0],
    mirr: [-1, 1, 1],
    mask: 0b000100,
    oppo: 0b110111,
    front: 2,
    back: 3,
    sx: 1,
    dx: 0,
    up: 5,
    dw: 4,
    rotx: 0,
    roty: +rHALF,
  },
  {
    // E
    mov: [-1, 0, 0],
    movsxdx: [0, 0, -1],
    movupdw: [0, -1, 0],
    mirr: [-1, 1, 1],
    mask: 0b001000,
    oppo: 0b111011,
    front: 3,
    back: 2,
    sx: 0,
    dx: 1,
    up: 5,
    dw: 4,
    rotx: 0,
    roty: -rHALF,
  },
  {
    // DW
    mov: [0, +1, 0],
    movsxdx: [-1, 0, 0],
    movupdw: [0, 0, 1],
    mirr: [1, -1, 1],
    mask: 0b010000,
    oppo: 0b011111,
    front: 4,
    back: 5,
    sx: 0,
    dx: 1,
    up: 0,
    dw: 4,
    rotx: -rHALF,
    roty: 0,
  },
  {
    // UP
    mov: [0, -1, 0],
    movsxdx: [-1, 0, 0],
    movupdw: [0, 0, -1],
    mirr: [1, -1, 1],
    mask: 0b100000,
    oppo: 0b101111,
    front: 5,
    back: 4,
    sx: 1,
    dx: 0,
    up: 5,
    dw: 0,
    rotx: +rHALF,
    roty: 0,
  },
];

let walls;
let world;

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

let cameradir = 0,
  camerarx = 0,
  camerary = 0,
  cameracell = "0 0 0";

let selcells = new Map();
let selobjs = new Map();

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
  if (birdeye) {
    camera.rotation.x = -rHALF;
    //camera.rotation.y = 0;
    camera.position.x = 0;
    camera.position.y = 4;
    camera.position.z = 0;
    scene.fog.far = 1000;
  } else {
    const dirx = directions[camerarx];
    const diry = directions[camerary];

    camera.rotation.x = dirx.rotx;
    //camera.rotation.y = directions[camerary].roty;
    camera.position.x = cameraoffset * diry.mov[0];
    camera.position.y = cameraoffset * dirx.mov[1];
    camera.position.z = cameraoffset * diry.mov[2];
    scene.fog.far = ViewDistance - 1;
  }
  camera.rotation.y = directions[camerary].roty;
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
  cameradir = camerarx == 0 ? camerary : camerarx;

  const startmask = directions[cameradir].oppo; /* 0b111111 per audio scan */

  frame++;
  scan(cameracell, startmask);

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

function toCellId(x, y, z) {
  return x + " " + y + " " + z;
}
function toPosition(cellid) {
  return cellid.split(" ").map((v) => Number(v));
}

function demolish(newid, newcell, cellid, cell, d) {
  newcell.n[d.back] = cellid;
  newcell.w[d.back] = 0;
  cell.n[d.front] = newid;
  cell.w[d.front] = 0;
}

function neighborId(cellid, d) {
  const mov = d.mov;
  const p = toPosition(cellid);
  p[0] += mov[0];
  p[1] += mov[1];
  p[2] += mov[2];
  return toCellId(p[0], p[1], p[2]);
}

function demolishMany(cellid, cell, mask) {
  directions.forEach((d) => {
    if (d.mask & mask) {
      const newid = neighborId(cellid, d);
      const newcell = world[newid];
      if (newcell !== undefined) {
        demolish(newid, newcell, cellid, cell, d);
      }
    }
  });
}

function paint(cellid, dirid, wallid) {
  const cell = world[cellid];
  if (cell.n[dirid] == 0) {
    cell.w[dirid] = cell.w[dirid] == wallid ? dirid + 1 : wallid;
  }
}

//let nextObjId = 0;

function spawn(cellid, dirid, slotid, wallid) {
  const cell = world[cellid];
  if (cell.n[dirid] == 0) {
    let cello = cell.o;
    if (cello === undefined) {
      cello = [{}, {}, {}, {}, {}, {}];
      cell.o = cello;
    }
    const objects = cello[dirid];
    //const id = nextObjId++;
    objects[slotid] = {
      w: wallid,
    };
    //console.log(cell);
  }
}

function push(cellid, dirid, bulldoze = true) {
  const cell = world[cellid];
  if (cell.n[dirid] == 0) {
    const d = directions[dirid];
    const newid = neighborId(cellid, d);
    let newcell = world[newid];

    if (newcell === undefined) {
      newcell = {
        n: [0, 0, 0, 0, 0, 0],
        w: cell.w.map((v, i) => (v == 0 && cell.n[i] != 0 ? i + 1 : v)),
      };
      world[newid] = newcell;
    }

    demolish(newid, newcell, cellid, cell, d);
    if (bulldoze) demolishMany(newid, newcell, d.oppo);

    //console.log('dirid',dirid);
    //console.log(world);
  }
}

function movement(dirid) {
  const cell = world[cameracell];
  const next = cell.n[dirid];
  if (next != 0) {
    cameracell = next;
    redraw();
  }
}

function selOp(func) {
  if (selcells.size > 0) {
    selcells.forEach((selmask, cellid) => {
      directions.forEach((d, dirid) => {
        if (selmask & d.mask) func(cellid, dirid);
      });
    });
    //selcells.clear();
  } else {
    func(cameracell, cameradir, false);
  }
}

function selOpObj(func) {
  if (selobjs.size > 0) {
    selobjs.forEach((data, objid) => {
      func(data, objid);
    });
    selobjs.clear();
  }
}

function keydown(e) {
  if (keystate[e.keyCode]) return;
  keystate[e.keyCode] = true;
  keytrigs.add(e.keyCode);
  //console.log(e);

  switch (e.keyCode) {
    case 13: // ENTER
    case 32: // SPACE
      selOp((cellid, dirid) => push(cellid, dirid, !e.shiftKey));
      redraw();
      break;

    case 8: // BACKSPACE
      selcells.clear();
      selobjs.clear();
      redraw();
      break;

    case 37: // LEFTARROW
    case 65: // A
      if (e.shiftKey) movement(directions[cameradir].sx);
      else {
        camerary = directions[camerary].sx;
        redraw();
      }
      break;

    case 39: // RIGHTARROW
    case 68: // D
      if (e.shiftKey) movement(directions[cameradir].dx);
      else {
        camerary = directions[camerary].dx;
        redraw();
      }
      break;

    case 38: // UPARROW
    case 87: // W
      if (e.shiftKey) {
        movement(directions[camerary].up);
        redraw();
      } else movement(directions[camerary].front);
      break;

    case 83: // S
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        var dataStr =
          "data:text/json;charset=utf-8," +
          encodeURIComponent(JSON.stringify(world, (key, value) => (key === "scanvalue" ? undefined : value)));
        var dlAnchorElem = document.getElementById("downloadAnchorElem");
        dlAnchorElem.setAttribute("href", dataStr);
        dlAnchorElem.setAttribute("download", "world.json");
        dlAnchorElem.click();
        break;
      }
    case 40: // DOWNARROW
      if (e.shiftKey) {
        movement(directions[camerary].dw);
        redraw();
      } else movement(directions[camerary].back);
      break;

    case 33: // PAGE UP
    case 82: // R
      camerarx = directions[camerarx].up;
      redraw();
      break;

    case 34: // PAGE DOWN
    case 70: // F
      camerarx = directions[camerarx].dw;
      redraw();
      break;

    case 77: // M
      birdeye = !birdeye;
      redraw();
      break;

    case 88: // X
      selOp((cellid, dirid) => paint(cellid, dirid, "mirror"));
      redraw();
      break;

    case 97: // numpad 1
    case 98: // numpad 2
    case 99: // numpad 3
    case 100: // numpad 4
    case 101: // numpad 5
    case 102: // numpad 6
    case 103: // numpad 7
    case 104: // numpad 8
    case 105: // numpad 9
      selOp((cellid, dirid) => {
        spawn(cellid, dirid, e.keyCode - 96, "cube");
      });
      redraw();
      break;

    case 49: // 1
    case 50: // 2
    case 51: // 3
    case 52: // 4
    case 53: // 5
    case 54: // 6
    case 55: // 7
    case 56: // 8
    case 57: // 9
      selOp((cellid, dirid) => {
        spawn(cellid, dirid, e.keyCode - 48, "cube");
      });
      redraw();
      break;

    case 46: // Delete
      selOpObj((data, objid) => {
        world[data.cellid].o[data.dirid][data.slotid] = undefined;
      });
      redraw();
      break;
  }
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
  pointer.x = ((e.clientX - rrect.left) / (rrect.bottom - rrect.top) /*(rrect.right - rrect.left)*/) * 2 - 1;
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
      selobjs.set(data.objid, { ...data });
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
  if (e.deltaY > 0) {
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

  const loader = new GLTFLoader();

  /*
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
    const res = await fetch(href);
    const buf = await res.arrayBuffer();
    SFX.load(v, buf);
  });

  await preload("fetch", ".json", async (v, href) => {
    const res = await fetch(href);
    if (!res.ok) return;
    jsons[v] = await res.json();
  });

  txt = TXT(textures["gamefonto"], jsons["gamefont"], 64);

  //console.log(textures);

  const checker = checkertexture(128, 128, 0xffffff);

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
    const mesh = walls[wallid].mesh.clone();
    mesh.material = mats[0];
    walls["_" + wallid] = {
      type: -1,
      mesh: mesh,
    };
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
