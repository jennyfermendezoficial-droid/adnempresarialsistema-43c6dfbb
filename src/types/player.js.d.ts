declare module "player.js" {
  export class Player {
    constructor(el: HTMLIFrameElement | string);
    on(event: string, cb: (data: { seconds: number; duration: number }) => void): void;
    off(event: string): void;
  }
}