const BASE = import.meta.env.BASE_URL;

const IMAGE_PATHS = {
  explosion: 'assets/sprites/explosion.png',
  arrowLeft: 'assets/sprites/arrow-left.png',
  arrowRight: 'assets/sprites/arrow-right.png',
  bgGame: 'assets/bg/space.webp',
  splash: 'assets/bg/splash.webp',
} as const;

export type ImageKey = keyof typeof IMAGE_PATHS;

export const assetUrl = (key: ImageKey): string => BASE + IMAGE_PATHS[key];

/** Сховище зображень (аналог AssetStore з WinForms-версії). */
class AssetStore {
  private readonly images = new Map<ImageKey, HTMLImageElement>();
  ready = false;

  get(key: ImageKey): HTMLImageElement {
    const img = this.images.get(key);
    if (!img) throw new Error(`Asset not loaded: ${key}`);
    return img;
  }

  async loadAll(onProgress: (p: number) => void): Promise<void> {
    const keys = Object.keys(IMAGE_PATHS) as ImageKey[];
    let done = 0;
    await Promise.all(
      keys.map(
        (key) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.decoding = 'async';
            img.onload = img.onerror = () => {
              done++;
              onProgress(done / keys.length);
              resolve();
            };
            img.src = assetUrl(key);
            this.images.set(key, img);
          }),
      ),
    );
    await document.fonts?.ready;
    this.ready = true;
  }
}

export const Assets = new AssetStore();
