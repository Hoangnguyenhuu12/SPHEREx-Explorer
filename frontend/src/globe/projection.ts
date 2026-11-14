const radians = Math.PI / 180;

export interface View {
  ra: number;
  dec: number;
  zoom: number;
}

export interface SurveyImage {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

export const HOME: View = { ra: 266.4, dec: -29, zoom: 1 };

export function rotateView(view: View, ra: number, dec: number): View {
  return { ...view, ra: ((view.ra + ra) % 360 + 360) % 360,
    dec: Math.max(-89.9, Math.min(89.9, view.dec + dec)) };
}

export function project(view: View, ra: number, dec: number) {
  const longitude = (ra - view.ra) * radians;
  const latitude = dec * radians;
  const tilt = view.dec * radians;
  const horizontal = Math.cos(latitude) * Math.cos(longitude);
  const vertical = Math.sin(latitude);
  return {
    x: -Math.cos(latitude) * Math.sin(longitude),
    y: vertical * Math.cos(tilt) - horizontal * Math.sin(tilt),
    visible: horizontal * Math.cos(tilt) + vertical * Math.sin(tilt) > 0,
  };
}

export function renderGlobe(
  context: CanvasRenderingContext2D,
  view: View,
  primary: SurveyImage,
  secondary?: SurveyImage,
) {
  const { width, height } = context.canvas;
  const radius = Math.min(width, height) * 0.44 * view.zoom;
  const result = context.createImageData(width, height);
  const tilt = view.dec * radians;
  const cosTilt = Math.cos(tilt);
  const sinTilt = Math.sin(tilt);
  for (let row = 0; row < height; row++) {
    const y = (height / 2 - row - 0.5) / radius;
    for (let col = 0; col < width; col++) {
      const x = (col + 0.5 - width / 2) / radius;
      const depth = 1 - x * x - y * y;
      if (depth <= 0) continue;
      const front = Math.sqrt(depth);
      const longitude = Math.atan2(-x, front * cosTilt - y * sinTilt);
      const latitude = Math.asin(Math.max(-1, Math.min(1, y * cosTilt + front * sinTilt)));
      const u = (view.ra / 360 + longitude / (2 * Math.PI) + 1) % 1;
      const v = 0.5 - latitude / Math.PI;
      const a = intensity(primary, u, v);
      const b = secondary ? intensity(secondary, u, v) : a;
      const shade = 0.83 + front * 0.17;
      const offset = 4 * (row * width + col);
      result.data[offset] = (8 + b * (secondary ? 1.15 : 0.61)) * shade;
      result.data[offset + 1] = (11 + a * 0.97) * shade;
      result.data[offset + 2] = (23 + a * 1.15) * shade;
      result.data[offset + 3] = Math.min(255, depth * radius * 255);
    }
  }
  context.putImageData(result, 0, 0);
}

function intensity(image: SurveyImage, u: number, v: number) {
  const col = Math.min(image.width - 1, Math.floor(u * image.width));
  const row = Math.min(image.height - 1, Math.floor(v * image.height));
  return image.pixels[4 * (row * image.width + col)];
}
