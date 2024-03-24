import WebGL from "three/addons/capabilities/WebGL.js";
import * as THREE from "three";

var xres, yres, canvas, gfx, txt;
var keystate = [];
var keytrigs = new Set();

var jsons = {};

const ViewDistance = 5;

function step() {
  window.requestAnimationFrame(step);
}

function init() {
  world = jsons["world.json"];
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

// [ front, back, left, right, up, down]

// TEH MASTERTABLE !!!

const directions = [
  {
    mov: [0, 0, +1],
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
    mov: [0, 0, -1],
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
    mov: [+1, 0, 0],
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
    mov: [-1, 0, 0],
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
    mov: [0, +1, 0],
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
    mov: [0, -1, 0],
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

const fov = 109.15;

const pointer = new THREE.Vector2();

let meshes = [],
  meshindex = 0,
  scanvalue = 0;

let cameradir = 0,
  camerarx = 0,
  camerary = 0,
  cameracell = "0 0 0";

let selcells = new Map();

function getmesh(wall, cellid, dir, xp, yp, zp) {
  let mesh;
  if (meshindex == meshes.length) {
    mesh = new THREE.Mesh(wall.geometry, wall.material);
    mesh.userData = { cellid, dirmask: dir.mask };
    meshes.push(mesh);
    scene.add(mesh);
  } else {
    mesh = meshes[meshindex];
    mesh.userData.cellid = cellid;
    mesh.userData.dirmask = dir.mask;
    mesh.geometry = wall.geometry;
    mesh.material = wall.material;
    mesh.visible = true;
  }
  mesh.rotation.x = dir.rotx;
  mesh.rotation.y = dir.roty;
  mesh.position.x = -xp;
  mesh.position.y = -yp;
  mesh.position.z = -zp;

  meshindex++;
  return mesh;
}

function scan(cellid, energy, dirmask, xp, yp, zp) {
  if (energy <= 0) return;
  energy--;
  let cell = world[cellid];
  if (cell.scanvalue == scanvalue) return;
  cell.scanvalue = scanvalue;
  const selected = selcells.get(cellid);

  //console.log('cell',cellid, 'energy', energy, 'dirmask', dirmask.toString(2), 'xp',xp,'yp',yp,'zp',zp);

  directions.forEach((dir, dirid) => {
    if (dirmask & dir.mask) {
      let wallindex = cell.w[dirid];
      if (wallindex != 0) {
        //console.log('cellid',cellid,'dirid',dirid,'wall',wallindex);
        let wall = walls[wallindex];

        getmesh(wall, cellid, dir, xp, yp, zp).layers.enable(1);

        if (selected !== undefined && selected & dir.mask) {
          getmesh(walls[0], cellid, dir, xp, yp, zp).layers.disable(1);
        }
      }

      const next = cell.n[dirid];
      if (next != 0) {
        const mov = dir.mov;
        scan(
          next,
          energy,
          dirmask & dir.oppo,
          xp + mov[0],
          yp + mov[1],
          zp + mov[2]
        );
      }
    }
  });
}

function rerender() {
  //camera.position.x = p[0];
  //camera.position.y = p[1];
  //camera.position.z = p[2];
  camera.rotation.x = directions[camerarx].rotx;
  camera.rotation.y = directions[camerary].roty;
  camera.rotation.order = "YXZ";

  renderer.render(scene, camera);
}

function redraw() {
  meshindex = 0;
  scanvalue++;

  cameradir = camerarx == 0 ? camerary : camerarx;

  scan(cameracell, ViewDistance * 2, directions[cameradir].oppo, 0, 0, 0);
  for (let i = meshindex; i < meshes.length; i++) {
    meshes[i].visible = false;
    meshes[i].layers.disable(1);
  }
  //console.log(meshindex,meshes.length);

  rerender();
}

function toCellId(p) {
  return p.join(" ");
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
  return toCellId(p);
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
        scanvalue: cell.scanvalue,
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

function keydown(e) {
  if (keystate[e.keyCode]) return;
  keystate[e.keyCode] = true;
  keytrigs.add(e.keyCode);
  //console.log(e);

  switch (e.keyCode) {
    case 13: // ENTER
    case 32: // SPACE
      if (selcells.size > 0) {
        selcells.forEach((selmask, cellid) => {
          directions.forEach((d, dirid) => {
            if (selmask & d.mask) push(cellid, dirid);
          });
        });
        selcells.clear();
      } else {
        // CREATE ALCOVE
        push(cameracell, cameradir, false);
      }
      redraw();
      break;

    case 8: // BACKSPACE
      selcells.clear();
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
        movement(directions[cameradir].up);
        redraw();
      } else movement(directions[cameradir].front);
      break;

    case 83: // S
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        var dataStr =
          "data:text/json;charset=utf-8," +
          encodeURIComponent(
            JSON.stringify(world, (key, value) =>
              key === "scanvalue" ? undefined : value
            )
          );
        var dlAnchorElem = document.getElementById("downloadAnchorElem");
        dlAnchorElem.setAttribute("href", dataStr);
        dlAnchorElem.setAttribute("download", "world.json");
        dlAnchorElem.click();
        break;
      }
    case 40: // DOWNARROW
      if (e.shiftKey) {
        movement(directions[cameradir].dw);
        redraw();
      } else movement(directions[cameradir].back);
      break;

    case 33: // PAGE UP
    case 82: // R
      camerarx = directions[camerarx].up;
      redraw();
      break;

    case 34: // PAGE DOWN
    case 68: // D
      camerarx = directions[camerarx].dw;
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

function selectCell(e) {
  var rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / (rect.right - rect.left)) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / (rect.bottom - rect.top)) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(scene.children, false);

  if (intersects.length > 0) {
    const o = intersects[0].object;
    const data = o.userData;
    //console.log('data',data);
    const cellid = data.cellid;
    const dirmask = data.dirmask;
    let sel = selcells.get(cellid) || 0;

    if (dragging !== undefined) {
      //console.log('dragging',dragging,'dirmask',dirmask,'sel',sel & dirmask);
      if (dragging[0] != dirmask || dragging[1] == (sel & dirmask)) return;
    }

    sel = sel ^ dirmask;
    selcells.set(cellid, sel);
    //console.log(selcells);
    redraw();
    return [dirmask, sel & dirmask];
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
  camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 1000);
  renderer = new THREE.WebGLRenderer({ canvas: canvas });
  raycaster = new THREE.Raycaster();
  raycaster.layers.set(1);

  let up = await new THREE.TextureLoader().loadAsync("data/up.png");
  // checkertexture(128, 128, 0xffff00);

  let materials = [
    new THREE.MeshBasicMaterial({
      wireframe: true,
      color: 0xffffff,
      fog: false,
    }),
    new THREE.MeshBasicMaterial({ map: up, color: 0xffff00 }),
    new THREE.MeshBasicMaterial({ map: up, color: 0xafaf00 }),
    new THREE.MeshBasicMaterial({ map: up, color: 0x00ffff }),
    new THREE.MeshBasicMaterial({ map: up, color: 0x00afaf }),
    new THREE.MeshBasicMaterial({ map: up, color: 0xff00ff }),
    new THREE.MeshBasicMaterial({ map: up, color: 0xaf00af }),
    new THREE.MeshBasicMaterial({ map: up, color: 0xc0c0c0 }),
  ];

  let geometries = [
    new THREE.PlaneGeometry(1, 1, 5, 5).translate(0, 0, -0.49),
    new THREE.PlaneGeometry(1, 1, 1, 1).translate(0, 0, -0.5),
  ];

  walls = [
    { material: materials[0], geometry: geometries[0] },
    { material: materials[1], geometry: geometries[1] },
    { material: materials[2], geometry: geometries[1] },
    { material: materials[3], geometry: geometries[1] },
    { material: materials[4], geometry: geometries[1] },
    { material: materials[5], geometry: geometries[1] },
    { material: materials[6], geometry: geometries[1] },
    { material: materials[7], geometry: geometries[1] },
  ];

  preload("image", ".png", (v, href) => {
    let i = new Image();
    i.onload = () => {
      //gfx.loadTexture(v, i);
    };
    i.src = href;
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

  window.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);
  canvas.addEventListener("mousedown", onmousedown);
  canvas.addEventListener("mouseup", onmouseup);
  canvas.addEventListener("mousemove", onmousemove);

  init();
  //window.requestAnimationFrame(step);
}

window.addEventListener("load", load);
