import WebGL from "three/addons/capabilities/WebGL.js";
import * as THREE from "three";

var xres, yres, canvas, gfx, txt;
var keystate = [];
var keytrigs = new Set();


var jsons = {};


function step() {
  window.requestAnimationFrame(step);
}

function init() {}


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

let directions = [
  { mov: [0, 0, +1], mask: 0b000001, oppo: 0b111101, oppi:1, sx:2, dx:3, up:0, dw:0,  rotx: 0, roty: 0 },
  { mov: [0, 0, -1], mask: 0b000010, oppo: 0b111110, oppi:0, sx:3, dx:2, up:0, dw:0, rotx: 0, roty: Math.PI },
  { mov: [+1, 0, 0], mask: 0b000100, oppo: 0b110111, oppi:3, sx:1, dx:0, rotx: 0, roty: +rHALF },
  { mov: [-1, 0, 0], mask: 0b001000, oppo: 0b111011, oppi:2, sx:0, dx:1, rotx: 0, roty: -rHALF },
  { mov: [0, +1, 0], mask: 0b010000, oppo: 0b011111, oppi:5, sx:4, dx:4, rotx: -rHALF, roty: 0 },
  { mov: [0, -1, 0], mask: 0b100000, oppo: 0b101111, oppi:4, sx:5, dx:5, rotx: +rHALF, roty: 0 },
];

let walls;

let world = [
  {},
  {
    p: [0, 0, 0],
    n: [0,0,0,0,0,0],
    w: [1, 2, 3, 4, 5, 6],
    s: 0,
  },
];

let scene, camera, renderer, raycaster;

const fov = 109.15;

const pointer = new THREE.Vector2();

let meshes = [], meshindex = 0, scanvalue = 0;

let cameradir = 0, cameracell = 1;

let selcells = new Set();
let seldir=0;

function getmesh(wall, cell, cellid, dir, dirid)
{
  let mesh;
  if(meshindex==meshes.length)
  {
    mesh = new THREE.Mesh(wall.geometry, wall.material);
    mesh.userData = { cellid, dirid };
    meshes.push(mesh);
    scene.add(mesh);    
  }
  else
  {
    mesh = meshes[meshindex];
    mesh.userData.cellid = cellid;
    mesh.userData.dirid = dirid;
    mesh.geometry = wall.geometry;
    mesh.material = wall.material;
    mesh.visible = true;
  }
  mesh.rotation.x = dir.rotx;
  mesh.rotation.y = dir.roty;
  mesh.position.x = -cell.p[0];
  mesh.position.y = -cell.p[1];
  mesh.position.z = -cell.p[2];

  meshindex++;
  return mesh;
}


function scan(cellid, energy, dirmask) {
  if (energy <= 0) return;
  energy--;
  let cell = world[cellid];
  if (cell.s == scanvalue) return;
  cell.s = scanvalue;
  const selected = selcells.has(cellid);

  //console.log('cell',cellid, 'energy', energy, 'dirmask', dirmask.toString(2));

  directions.forEach((dir, dirid) => {
    if (dirmask & dir.mask) {

      let wallindex = cell.w[dirid];
      if (wallindex>0) {
        //console.log('cellid',cellid,'dirid',dirid,'wall',wallindex);
        let wall = walls[wallindex];

        getmesh(wall, cell, cellid, dir, dirid);

        if(selected && dirid==seldir)
        {
          getmesh(walls[0], cell, cellid, dir, dirid);
        }    
      }

      let next = cell.n[dirid];
      if (next>0) {
        scan(next, energy, dirmask & dir.oppo);
      }
    }
  });
}


function rerender()
{
  let cell = world[cameracell];
  camera.position.x = cell.p[0];
  camera.position.y = cell.p[1];
  camera.position.z = cell.p[2];
  let dir = directions[cameradir];
  camera.rotation.x = dir.rotx;
  camera.rotation.y = dir.roty;

  renderer.render(scene, camera);
}

function redraw()
{
  meshindex=0; scanvalue++;

  scan(cameracell, 10, directions[cameradir].oppo);
  for(let i=meshindex;i<meshes.count;i++) 
  {
    console.log('lessmeshes');
    meshes[i].visible = false;
  }
  
  rerender();
}

function push(cellid, dirid)
{
  const c = world[cellid];
  if(c.n[dirid]==0)
  {
    const d = directions[dirid];
    const i = world.length;
    const cell = {
      p: [c.p[0]+d.mov[0], c.p[1]+d.mov[1], c.p[2]+d.mov[2]],
      n: [0,0,0,0,0,0],
      w: c.w.map((v,i)=>(v==0 && c.n[i]>0 ? (i+1) : v)),

       /*
        c.w[0],
        c.w[1],
        c.w[2],
        c.w[3],
        c.w[4],
        c.w[5],
        c.w[0]?c.w[0]:1,
        c.w[1]?c.w[1]:2,
        c.w[2]?c.w[2]:3,
        c.w[3]?c.w[3]:4,
        c.w[4]?c.w[4]:5,
        c.w[5]?c.w[5]:6
        */
      
      s: c.s,
    }

    cell.n[d.oppi] = cellid;
    cell.w[d.oppi] = 0;

    c.n[dirid] = i;
    c.w[dirid] = 0;

    world.push(cell);
  }
}


function keydown(e) {
  if (keystate[e.keyCode]) return;
  keystate[e.keyCode] = true;
  keytrigs.add(e.keyCode);
  switch(e.keyCode)
  {
    case 13: // ENTER
    push(cameracell,cameradir);
    redraw();
    break;

    case 32: // SPACE
    selcells.forEach((c)=>push(c,seldir));
    selcells.clear();
    redraw();
    break;

    case 37: // LEFT
    case 'a':
      cameradir = directions[cameradir].sx;
      redraw();
    break;

    case 39: // RIGHT
    case 'd':
      cameradir = directions[cameradir].dx;
      redraw();
    break;

    case 38: // FORWARD
    case 'w':
      cameradir = directions[cameradir].up;
      redraw();
    break;

    case 40: // DOWN
    case 's':
      cameradir = directions[cameradir].dw;
      redraw();
    break;

  }
}
function keyup(e) {
  keystate[e.keyCode] = false;
}
function clicked(e) {
  
  pointer.x = ( fov/90 * e.clientX / xres )  - 1;
	pointer.y = 1 - ( fov/90 * e.clientY / yres ) ;
  
  raycaster.setFromCamera( pointer, camera );
	const intersects = raycaster.intersectObjects( scene.children, false );
  
  if(intersects.length>0)
  {
    const data = intersects[0].object.userData;
    console.log('data',data);

    if(seldir!=data.dirid)
    {
      selcells.clear();
    }
    if(selcells.has(data.cellid)) selcells.delete(data.cellid);
    else selcells.add(data.cellid);
    seldir=data.dirid;
    redraw();
  }
  
  //console.log(e.buttons, e.clientX, e.clientY);
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
  scene.fog = new THREE.Fog(0, 0, 3);
  camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 1000);
  renderer = new THREE.WebGLRenderer({ canvas: canvas });
  raycaster = new THREE.Raycaster();


  let up = await new THREE.TextureLoader().loadAsync( "data/up.png" );
  // checkertexture(128, 128, 0xffff00);

  let materials = [
    new THREE.MeshBasicMaterial({wireframe:true, color:0xffffff, fog:false }),
    new THREE.MeshBasicMaterial({map: up, color: 0xffff00 }),
    new THREE.MeshBasicMaterial({map: up, color: 0xafaf00 }),
    new THREE.MeshBasicMaterial({map: up, color: 0x00ffff }),
    new THREE.MeshBasicMaterial({map: up, color: 0x00afaf }),
    new THREE.MeshBasicMaterial({map: up, color: 0xff00ff }),
    new THREE.MeshBasicMaterial({map: up, color: 0xaf00af }),
   ];

  let geometries = [
    new THREE.PlaneGeometry(1, 1, 4, 4).translate(0, 0, -0.49),
    new THREE.PlaneGeometry(1, 1, 1, 1).translate(0, 0, -0.5)
  ];

  walls = [
    { material: materials[0], geometry: geometries[0] },
    { material: materials[1], geometry: geometries[1] },
    { material: materials[2], geometry: geometries[1] },
    { material: materials[3], geometry: geometries[1] },
    { material: materials[4], geometry: geometries[1] },
    { material: materials[5], geometry: geometries[1] },
    { material: materials[6], geometry: geometries[1] },
  ];

  redraw();
   

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
    jsons[v] = await res.json();
  });

  //txt = TXT(gfx, jsons["gamefont.json"]);

  canvas.addEventListener("keydown", keydown);
  canvas.addEventListener("keyup", keyup);
  canvas.addEventListener("click", clicked);

  init();
  //window.requestAnimationFrame(step);
}

window.addEventListener("load", load);
