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

const ViewDistance = 5;

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

// [ front, back, left, right, up, down]

// TEH MASTERTABLE !!!

const directions = [
  {
    // N
    mov: [0, 0, +1],
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
    // UP
    mov: [0, +1, 0],
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
    // DW
    mov: [0, -1, 0],
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

const fov = 109.15;

const pointer = new THREE.Vector2();

let meshpool = {},
  meshindex = {},
  frame = 0;

let cameradir = 0,
  camerarx = 0,
  camerary = 0,
  cameracell = "0 0 0";

let selcells = new Map();

function getmesh(wallindex, cellid, dir, xp, yp, zp, mx,my,mz, offset) {
  let pool = meshpool[wallindex];
  if (pool === undefined) {
    pool = [];
    meshpool[wallindex] = pool;
  }
  let index = meshindex[wallindex] || 0;
  let mesh;

  if (index == pool.length) {
    mesh = walls[wallindex].clone();
    mesh.userData = { cellid, dirmask: dir.mask };
    pool.push(mesh);
    scene.add(mesh);
  } else {
    mesh = pool[index];
    mesh.userData.cellid = cellid;
    mesh.userData.dirmask = dir.mask;
    mesh.visible = true;
  }
  mesh.rotation.x = mz * my * dir.rotx;
  mesh.rotation.y = mz * mx * dir.roty;
  mesh.position.x = -xp - offset * dir.mov[0] * mx;
  mesh.position.y = -yp - offset * dir.mov[1] * my;
  mesh.position.z = -zp - offset * dir.mov[2] * mz;
  mesh.scale.x = mx;
  mesh.scale.y = my;
  mesh.scale.z = mz;

  meshindex[wallindex] = index + 1;
  return mesh;
}

const ViewDistanceSquared = ViewDistance * ViewDistance;

function scan(scanvalue, cellid, dirmask, xp = 0, yp = 0, zp = 0, mx = 1, my = 1, mz = 1) {
  
  if (xp * xp + yp * yp + zp * zp > ViewDistanceSquared) return;

  let cell = world[cellid];
  if (cell.scanvalue == scanvalue) return;
  cell.scanvalue = scanvalue;
  const selected = selcells.get(cellid);

  //console.log('cell',cellid, 'dirmask', dirmask.toString(2), 'xp',xp,'yp',yp,'zp',zp);

  directions.forEach((dir, dirid) => {
    if (dirmask & dir.mask) {
      let wallindex = cell.w[dirid];
      if (wallindex != 0) {
        //console.log('cellid',cellid,'dirid',dirid,'wall',wallindex, 'walls',walls[wallindex]);
        getmesh(wallindex, cellid, dir, xp, yp, zp,mx,my,mz,0.5).layers.enable(1);

        /*
        if (dirid == 4 && birdeye) {
          const test = getmesh("number" + energy, cellid, dir, xp, yp, zp, mx, my, mz,0.48);
          test.position.y = -0.49;
          test.scale.x = 1 / 16;
          test.scale.y = 1 / 16;
        }
        */

        if (selected !== undefined && selected & dir.mask) {
          getmesh(0, cellid, dir, xp, yp, zp,mx,my,mz, 0.49).layers.disable(1);
        }
      }
      
      let nextcell, nextscan, nextmask, nextmx=mx, nextmy=my, nextmz=mz;

      if (wallindex == 'mirror')
      {
        nextcell = cellid;  
        nextscan = frame++;
        const back = directions[dir.back];
        nextmask = (dirmask & back.oppo) | back.mask ;
        nextmx *= dir.mirr[0];
        nextmy *= dir.mirr[1];
        nextmz *= dir.mirr[2];
      }
      else
      {
        nextcell = cell.n[dirid];
        nextscan = scanvalue;
        nextmask = dirmask & dir.oppo; // dir.oppo solo per audio scan
      }
          
      if (nextcell != 0) {
        const mov = dir.mov;
        scan(
          nextscan,
          nextcell,
          nextmask, 
          xp + mov[0] * mx,
          yp + mov[1] * my,
          zp + mov[2] * mz,
          nextmx, nextmy, nextmz
        );
      }
    }
  });
}

function rerender() {
  if (birdeye) {
    camera.rotation.x = -rHALF;
    //camera.rotation.y = 0;
    camera.position.y = 4;
    scene.fog.far = 1000;
  } else {
    camera.rotation.x = directions[camerarx].rotx;
    //camera.rotation.y = directions[camerary].roty;
    camera.position.y = 0;
    camera.position.x = 0;
    camera.position.z = 0;
    scene.fog.far = ViewDistance;
  }
  camera.rotation.y = directions[camerary].roty;

  camera.rotation.order = "YXZ";
  renderer.render(scene, camera);
}

function redraw() {
  
  cameradir = camerarx == 0 ? camerary : camerarx;

  const startmask = directions[cameradir].oppo; /* 0b111111 per audio scan */

  scan(frame++, cameracell, startmask);


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

function paint(cellid, dirid, wallid) {
  const cell = world[cellid];
  if (cell.n[dirid] == 0) {
    cell.w[dirid] = wallid;
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
        frame: cell.frame,
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
        movement(directions[camerary].up);
        redraw();
      } else movement(directions[camerary].front);
      break;

    case 83: // S
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        var dataStr =
          "data:text/json;charset=utf-8," +
          encodeURIComponent(
            JSON.stringify(world, (key, value) =>
              key === "frame" ? undefined : value
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
    case 68: // D
      camerarx = directions[camerarx].dw;
      redraw();
      break;

    case 77: // M
      birdeye = !birdeye;
      redraw();
      break;
    
    case 88: // X
      paint(cameracell, cameradir, 'mirror');
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
    //console.log("data", data);
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

  const light = new THREE.AmbientLight();
  scene.add(light);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.x = 0;
  directionalLight.position.y = 1;
  directionalLight.position.z = 1;
  scene.add(directionalLight);

  camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 1000);
  renderer = new THREE.WebGLRenderer({ canvas: canvas });
  renderer.setViewport((xres - yres) / 2, 0, yres, yres);
  raycaster = new THREE.Raycaster();
  raycaster.layers.set(1);

  const loader = new GLTFLoader();

  for (let n of ["wall", "floor", "arch", "door"]) {
    const model = await loader.loadAsync("data/" + n + ".glb");
    models[n] = model.scene;
    //console.log(model.scene);
  }

  await preload("image", ".png", async (v, href) => {
    const t = await new THREE.TextureLoader().loadAsync(href);
    t.minFilter = THREE.NearestFilter;
    t.magFilter = THREE.NearestFilter;
    textures[v] = t;
  });

  console.log(textures);

  // checkertexture(128, 128, 0xffff00);

  let materials = [
    new THREE.MeshBasicMaterial({
      wireframe: true,
      color: 0xffffff,
      fog: false,
    }),
    new THREE.MeshBasicMaterial({ map: textures.n, color: 0xffff00 }),
    new THREE.MeshBasicMaterial({ map: textures.s, color: 0xafaf00 }),
    new THREE.MeshBasicMaterial({ map: textures.w, color: 0x00ffff }),
    new THREE.MeshBasicMaterial({ map: textures.e, color: 0x00afaf }),
    new THREE.MeshBasicMaterial({ map: textures.dw, color: 0xff00ff }),
    new THREE.MeshBasicMaterial({ map: textures.up, color: 0xaf00af }),
    new THREE.MeshBasicMaterial({ map: textures.up, color: 0xc0c0c0 }),
  ];

  let geometries = [
    new THREE.PlaneGeometry(1, 1, 5, 5),//.translate(0, 0, -0.49),
    new THREE.PlaneGeometry(1, 1, 1, 1),//.translate(0, 0, -0.5),
  ];


  await preload("fetch", ".mp3", async (v, href) => {
    const res = await fetch(href);
    const buf = await res.arrayBuffer();
    SFX.load(v, buf);
  });

  await preload("fetch", ".json", async (v, href) => {
    console.log(v);
    const res = await fetch(href);
    if (!res.ok) return;
    jsons[v] = await res.json();
  });

  txt = TXT(textures["gamefont"], jsons["gamefont"], 64);

  /*
  const test = txt.toMesh("Testing123", 0, 0, 0xffff00);
  test.scale.x = 1/64;
  test.scale.y = 1/64;
  test.rotation.x = -rHALF;
  test.position.y -= 0.49;
  //test.position.z = -1;
  scene.add(test);
  */

  walls = {
    0: new THREE.Mesh(geometries[0], materials[0]),
    1: new THREE.Mesh(geometries[1], materials[1]),
    2: new THREE.Mesh(geometries[1], materials[2]),
    3: new THREE.Mesh(geometries[1], materials[3]),
    4: new THREE.Mesh(geometries[1], materials[4]),
    5: new THREE.Mesh(geometries[1], materials[5]),
    6: new THREE.Mesh(geometries[1], materials[6]),
    7: new THREE.Mesh(geometries[1], materials[7]),
    number0: txt.toMesh("0", 0, 0, 0x666600),
    number1: txt.toMesh("1", 0, 0, 0x777700),
    number2: txt.toMesh("2", 0, 0, 0x888800),
    number3: txt.toMesh("3", 0, 0, 0x999900),
    number4: txt.toMesh("4", 0, 0, 0xaaaa00),
    number5: txt.toMesh("5", 0, 0, 0xbbbb00),
    number6: txt.toMesh("6", 0, 0, 0xcccc00),
    number7: txt.toMesh("7", 0, 0, 0xdddd00),
    number8: txt.toMesh("8", 0, 0, 0xeeee00),
    number9: txt.toMesh("9", 0, 0, 0xffff00),
    mirror: new THREE.Mesh(
      geometries[1],
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent:true, opacity: .2 })
    ),
  };

  window.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);
  canvas.addEventListener("mousedown", onmousedown);
  canvas.addEventListener("mouseup", onmouseup);
  canvas.addEventListener("mousemove", onmousemove);

  init();
  //window.requestAnimationFrame(step);
}

window.addEventListener("load", load);
