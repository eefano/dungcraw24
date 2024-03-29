
// I'll never make that mistake againnn

function scan_frustum(cellid, energy, sxdx, updw, maindir, xp, yp, zp) {
  if (energy <= 0) return;
  let cell = world[cellid];
  const selected = selcells.get(cellid);

  //console.log("cell", cellid, "xp", xp, "yp", yp, "zp", zp);
  county++;

  for (let dirid = 0; dirid < directions.length; dirid++) {
    if (dirid == maindir.back) continue;
    const dir = directions[dirid];

    if (cell.scanvalue != scanvalue) {
      let wallindex = cell.w[dirid];
      if (wallindex != 0) {
        //console.log('cellid',cellid,'dirid',dirid,'wall',wallindex, 'walls',walls[wallindex]);
        getmesh(wallindex, cellid, dir, xp, yp, zp).layers.enable(1);

        if (dirid == 4 && birdeye && energy < 10) {
          const test = getmesh("number" + energy, cellid, dir, xp, yp, zp);
          test.position.y = -0.49;
          test.scale.x = 1 / 16;
          test.scale.y = 1 / 16;
        }

        if (selected !== undefined && selected & dir.mask) {
          getmesh(0, cellid, dir, xp, yp, zp).layers.disable(1);
        }
      }
    }

    let nextsxdx = sxdx,
      nextupdw = updw;

    if (dirid == maindir.sx || dirid == maindir.dx) {
      if (sxdx == 0) continue;
      else nextsxdx--;
    }
    if (dirid == maindir.up || dirid == maindir.dw) {
      if (updw == 0) continue;
      else nextupdw--;
    }
    if (dirid == maindir.front) {
      nextupdw++;
      nextsxdx++;
    }

    const next = cell.n[dirid];
    if (next != 0) {
      const mov = dir.mov;
      scan_frustum(
        next,
        energy - 1,
        nextsxdx,
        nextupdw,
        maindir,
        xp + mov[0],
        yp + mov[1],
        zp + mov[2]
      );
    }
  }
  cell.scanvalue = scanvalue;
}

function scan_arc(distance, min, max, rotate) {
  if (distance > ViewDistance || min >= max) return;
  console.log("distance", distance, "min", min, "max", max);
  for (
    var i = Math.round(distance * min);
    i <= Math.round(distance * max);
    i++
  ) {
    const r = rotate(distance, 0, i);
    const p = playerpos.map((v, j) => v + r[j]);

    //console.log('playerpos',playerpos,'r',r,'p',p);
    console.log(p);

    const cellid = toCellId(p);
    const cell = world[cellid];

    if (cell === undefined) {
      // BLOCKED  - 0.6 works better than 0.5 somehow
      scan_arc(distance + 1, min, (i - 0.6) / distance, rotate);
      min = (i + 0.6) / distance;
    } else {
      // VISIBLE
      if (cell.scanvalue != scanvalue) {
        cell.scanvalue = scanvalue;
        directions.forEach((dir, dirid) => {
          let wallindex = cell.w[dirid];
          if (wallindex != 0) {
            //console.log('cellid',cellid,'dirid',dirid,'wall',wallindex);
            getmesh(wallindex, cellid, dir, p[0], p[1], p[2]).layers.enable(1);

            if (dirid == 4 && birdeye && county < 10) {
              const test = getmesh(
                "number" + county++,
                cellid,
                dir,
                p[0],
                p[1],
                p[2]
              );
              test.position.y = -0.49;
              test.scale.x = 1 / 16;
              test.scale.y = 1 / 16;
            }

            const selected = selcells.get(cellid);

            if (selected !== undefined && selected & dir.mask) {
              getmesh(0, cellid, dir, p[0], p[1], p[2]).layers.disable(1);
            }
          }
        });
      }
    }
  }
  scan_arc(distance + 1, min, max, rotate);
}

  /*
  directions.forEach((dir, dirid) => {
    if (dirid ==0) scan_arc(0, -1.1, 1.1, dir.rotate);
  });
  */
