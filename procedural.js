import * as THREE from "three";

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

export { checkertexture };
