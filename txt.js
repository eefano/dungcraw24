import * as THREE from "three";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";

function TXT(map, font, scale) {
  const indices = [0, 2, 1, 0, 3, 2];
  const materials = {};

  font.glyphs.forEach((g) => {
    const geometry = new THREE.BufferGeometry();

    const positions = new Float32Array([
      g.xoffset,
      -g.yoffset,
      0, // v0
      g.xoffset + g.width,
      -g.yoffset,
      0, // v1
      g.xoffset + g.width,
      -g.yoffset - g.height,
      0, // v2
      g.xoffset,
      -g.yoffset - g.height,
      0, // v3
    ]);

    g.x /= scale;
    g.y /= scale;
    g.width /= scale;
    g.height /= scale;

    const uvs = new Float32Array([
      g.x,
      1 - g.y, // v0
      g.x + g.width,
      1 - g.y, // v1
      g.x + g.width,
      1 - g.y - g.height, // v2
      g.x,
      1 - g.y - g.height, // v3
    ]);

    geometry.setIndex(indices);
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    g.geometry = geometry;
  });

  function toMesh(text, xo, yo, color, centered=false) {
    let material = materials[color];
    if (material === undefined) {
      material = new THREE.MeshBasicMaterial({ map, color });
      material.transparent = true;
      material.forceSinglePass = true;
      material.alphaTest = 0;
      materials[color] = material;
    }

    let xoff = 0;
    if (centered)
    {
      for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        const g = font.glyphs[c - 32];
        xoff += g.xadvance;
      }  
      xoff /= 2;
    }

    const group = [];
    let x = xo+xoff,
      y = yo + font.baseline;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      const g = font.glyphs[c - 32];

      if (c == 10) {
        y += font.height;
        x = xo+xoff;
      } else {
        group.push(g.geometry.clone().translate(x, y, 0));
        x += g.xadvance;
      }
    }
    return new THREE.Mesh(BufferGeometryUtils.mergeGeometries(group,false),material);
  }

  return { toMesh };
}

export { TXT };
