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

  export class Viewer {
    constructor(options?: ViewerOptions);
    addSplatScene(path: string, options?: AddSplatSceneOptions): Promise<void>;
    start(): void;
    dispose?(): void;
  }
}
