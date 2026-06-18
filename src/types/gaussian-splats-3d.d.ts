// @mkkellogg/gaussian-splats-3d は型定義を同梱しないため、最小限のアンビエント宣言を用意する。
declare module '@mkkellogg/gaussian-splats-3d' {
  export interface ViewerOptions {
    rootElement?: HTMLElement;
    selfDrivenMode?: boolean;
    useBuiltInControls?: boolean;
    sphericalHarmonicsDegree?: number;
    [key: string]: unknown;
  }

  export interface AddSplatSceneOptions {
    showLoadingUI?: boolean;
    [key: string]: unknown;
  }

  /** 内部 OrbitControls（読み込み完了後に利用可能）の最小宣言 */
  export interface SplatOrbitControls {
    autoRotate: boolean;
    autoRotateSpeed: number;
    enableDamping: boolean;
  }

  /** splatMesh（THREE.Object3D 互換）の最小宣言。向き補正に rotation を使う。 */
  export interface SplatMesh {
    rotation: { set(x: number, y: number, z: number): void };
  }

  export class Viewer {
    constructor(options?: ViewerOptions);
    addSplatScene(path: string, options?: AddSplatSceneOptions): Promise<void>;
    start(): void;
    dispose?(): void;
    /** 手動ループ用（selfDrivenMode:false + 外部 renderer/camera）。 */
    update(): void;
    render(): void;
    getSplatMesh?(): SplatMesh | null | undefined;
    /** 組み込みコントロール。useBuiltInControls + 読み込み完了後に生成される */
    controls?: SplatOrbitControls;
  }

  /** .ksplat のバイト列を保持する SplatBuffer（最小宣言） */
  export interface SplatBuffer {
    bufferData: ArrayBuffer;
  }

  /** PLY ローダ。Gaussian Splatting の .ply を SplatBuffer に変換する */
  export class PlyLoader {
    static loadFromFileData(
      plyFileData: ArrayBuffer,
      minimumAlpha: number,
      compressionLevel: number,
      optimizeSplatData: boolean,
      outSphericalHarmonicsDegree?: number
    ): Promise<SplatBuffer>;
  }
}
