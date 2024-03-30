import { world, state } from "./main.js";
import { directions } from "./tables.js";
import { linked_walls, linked_objects } from "./walls.js";

let selcells = new Map();
let selobjs = new Map();

const eflags = {
  world: 0b1,
  state: 0b10,
};

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
    return eflags.world;
  }
  return 0;
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
    const obj = objects[slotid];
    if (obj === undefined || obj.w != wallid) {
      objects[slotid] = {
        w: wallid,
      };
    } else {
      objects[slotid] = undefined;
    }
    //console.log(cell);
    return eflags.world;
  }
  return 0;
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
    return eflags.world;
  }
  return 0;
}

function selOp(func) {
  if (selcells.size > 0) {
    let res = false;
    selcells.forEach((selmask, cellid) => {
      directions.forEach((d, dirid) => {
        if (selmask & d.mask) res |= func(cellid, dirid);
      });
    });
    //selcells.clear();
    return res;
  } else {
    return func(state.cameracell, state.cameradir, false);
  }
}

function selOpObj(func) {
  if (selobjs.size > 0) {
    let res = false;
    selobjs.forEach((data, objid) => {
      res |= func(data, objid);
    });
    //selobjs.clear();
    return res;
  }
  return 0;
}

function movement(dirid) {
  const cell = world[state.cameracell];
  const next = cell.n[dirid];
  if (next != 0) {
    state.cameracell = next;
  }
}

function editorkeydown(e) {
  switch (e.keyCode) {
    case 13: // ENTER
    case 32: // SPACE
      return selOp((cellid, dirid) => push(cellid, dirid, !e.shiftKey));

    case 8: // BACKSPACE
      selcells.clear();
      selobjs.clear();
      return 0;

    case 37: // LEFTARROW
    case 65: // A
      if (e.shiftKey) movement(directions[state.cameradir].sx);
      else state.camerary = directions[state.camerary].sx;
      return eflags.state;

    case 39: // RIGHTARROW
    case 68: // D
      if (e.shiftKey) movement(directions[state.cameradir].dx);
      else state.camerary = directions[state.camerary].dx;
      return eflags.state;

    case 38: // UPARROW
    case 87: // W
      if (e.shiftKey) movement(directions[state.camerary].up);
      else movement(directions[state.camerary].front);
      return eflags.state;

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
        return 0;
      }
    case 40: // DOWNARROW
      if (e.shiftKey) movement(directions[state.camerary].dw);
      else movement(directions[state.camerary].back);
      return eflags.state;

    case 33: // PAGE UP
    case 82: // R
      state.camerarx = directions[state.camerarx].up;
      return eflags.state;

    case 34: // PAGE DOWN
    case 70: // F
      state.camerarx = directions[state.camerarx].dw;
      return eflags.state;

    case 77: // M
      state.birdeye = !state.birdeye;
      return eflags.state;

    case 88: // X
      return selOp((cellid, dirid) => paint(cellid, dirid, "mirror"));

    case 97: // numpad 1
    case 98: // numpad 2
    case 99: // numpad 3
    case 100: // numpad 4
    case 101: // numpad 5
    case 102: // numpad 6
    case 103: // numpad 7
    case 104: // numpad 8
    case 105: // numpad 9
      return selOp((cellid, dirid) => spawn(cellid, dirid, e.keyCode - 96, "cube"));

    case 49: // 1
    case 50: // 2
    case 51: // 3
    case 52: // 4
    case 53: // 5
    case 54: // 6
    case 55: // 7
    case 56: // 8
    case 57: // 9
      return selOp((cellid, dirid) => spawn(cellid, dirid, e.keyCode - 48, "cube"));

    case 46: // Delete
      return selOpObj((data, objid) => {
        world[data.cellid].o[data.dirid][data.slotid] = undefined;
        return eflags.world;
      });
  }

  return 0;
}

function cycle(e, linkedlist, actualvalue) {
  if (e.deltaY > 0) return linkedlist[actualvalue].next;
  else return linkedlist[actualvalue].prev;
}

function editorwheel(e) {
  if (selcells.size > 0) {
    return selOp((cellid, dirid) => {
      world[cellid].w[dirid] = cycle(e, linked_walls, world[cellid].w[dirid]);
      return eflags.world;
    });
  } else if (selobjs.size > 0) {
    return selOpObj((data, objid) => {
      //console.log(data);
      world[data.cellid].o[data.dirid][data.slotid].w = cycle(
        e,
        linked_objects,
        world[data.cellid].o[data.dirid][data.slotid].w
      );
      return eflags.world;
    });
  }
  return 0;
}

export { eflags, editorkeydown, editorwheel, toCellId, selcells, selobjs };
