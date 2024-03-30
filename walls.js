import * as THREE from "three";
import * as Procedural from "./procedural.js";

const wflags = {
  wall: 0b1,
  mirror: 0b10,
  object: 0b100,
};

const objsize = 0.15;

let walls = {};
let linked_walls;
let linked_objects;

function makeLinkedList(flags) {
  let prev, next;
  let linkedlist = {};

  for (const wallid in walls) {
    const wall = walls[wallid];
    if (wall.type & flags) {
      if (next === undefined) next = wallid;
      else linkedlist[prev].next = wallid;

      linkedlist[wallid] = { prev };
      prev = wallid;
    }
  }
  linkedlist[next].prev = prev;
  linkedlist[prev].next = next;
  //console.log(linkedlist);
  return linkedlist;
}

function buildwalls(textures, txt) {
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
  const cubey = new THREE.Mesh(new THREE.BoxGeometry().translate(0, 0, 0.5).scale(objsize, objsize, objsize), [
    mats[3],
    mats[4],
    mats[2],
    mats[1],
    mats[5],
    mats[6],
  ]);

  walls[0] = { type: 0 };

  for (let i = 1; i < 7; i++) walls[i] = { type: wflags.wall, mesh: new THREE.Mesh(plane, mats[i]) };

  for (let i = 0; i < 100; i++) walls["number" + i] = { type: 0, mesh: txt.toMesh(String(i), 0, 0, 0xc0c0c0) };

  ["cube", "enemy", "button"].forEach((i) => (walls[i] = { type: wflags.object, mesh: cubey }));

  walls.alt5 = {
    type: wflags.wall,
    mesh: new THREE.Mesh(floor, [mats.black, mats.black, mats.black, mats.black, mats[5], mats.black]),
  };

  walls.mirror = {
    type: wflags.wall | wflags.mirror,
    mesh: new THREE.Mesh(plane, mats.checker),
  };

  walls.pool = {
    type: wflags.wall | wflags.mirror,
    mesh: new THREE.Mesh(pooly, mats.pool),
  };

  linked_walls = makeLinkedList(wflags.wall);
  linked_objects = makeLinkedList(wflags.object);

  for (const wallid in walls) {
    const wall = walls[wallid];

    if (wall.type & (wflags.object | wflags.wall)) {
      const mesh = wall.mesh.clone();
      mesh.material = mats[0];
      walls["_" + wallid] = {
        type: 0,
        mesh: mesh,
      };
    }

    if (wall.type & wflags.object) {
      wall.mesh.geometry.computeBoundingBox();
      //console.log(mesh.geometry.boundingBox);
      const tmesh = txt.toMesh(wallid, 0, 0, 0xffffff, true);
      tmesh.geometry.scale(1 / 128, 1 / 128, 1);
      // .translate(0, 0, mesh.geometry.boundingBox.max.z*1.1);
      //tmesh.position.z = mesh.geometry.boundingBox.max.z;

      walls["__" + wallid] = {
        type: 0,
        mesh: tmesh,
      };
    }
  }
}

export { walls, buildwalls, linked_walls, linked_objects, wflags };
