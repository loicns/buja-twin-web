import type { PMTiles } from "pmtiles";

/** Reads ground elevation from the Terrarium terrain tiles already used for the map, so the cursor readout works in 2D too. */
export class ElevationSampler {
  private cache = new Map<string, Promise<Uint8ClampedArray | null>>();
  constructor(private readonly pm: PMTiles, private readonly z = 13) {}

  private tile(x: number, y: number): Promise<Uint8ClampedArray | null> {
    const key = `${x}/${y}`;
    let hit = this.cache.get(key);
    if (!hit) {
      hit = this.decode(x, y).catch(() => null);
      this.cache.set(key, hit);
      if (this.cache.size > 16) this.cache.delete(this.cache.keys().next().value as string);
    }
    return hit;
  }

  private async decode(x: number, y: number): Promise<Uint8ClampedArray | null> {
    const r = await this.pm.getZxy(this.z, x, y);
    if (!r) return null;
    const bmp = await createImageBitmap(new Blob([r.data], { type: "image/png" }));
    const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(256, 256) : Object.assign(document.createElement("canvas"), { width: 256, height: 256 });
    const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    return ctx.getImageData(0, 0, 256, 256).data;
  }

  /** Metres above the EGM2008 geoid (FABDEM-derived), or null outside the terrain tiles. */
  async at(lng: number, lat: number): Promise<number | null> {
    const n = 2 ** this.z;
    const rad = (lat * Math.PI) / 180;
    const fx = ((lng + 180) / 360) * n;
    const fy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
    const px = this.tile(Math.floor(fx), Math.floor(fy));
    const data = await px;
    if (!data) return null;
    const i = (Math.min(255, Math.floor((fy % 1) * 256)) * 256 + Math.min(255, Math.floor((fx % 1) * 256))) * 4;
    return data[i] * 256 + data[i + 1] + data[i + 2] / 256 - 32768;
  }
}
