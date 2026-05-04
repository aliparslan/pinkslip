declare module "@resvg/resvg-js" {
  export class Resvg {
    constructor(
      svg: string,
      options?: {
        fitTo?: {
          mode: "width" | "height" | "zoom";
          value: number;
        };
      }
    );

    render(): {
      asPng(): Uint8Array;
    };
  }
}

declare module "web-push" {
  const webpush: {
    generateVAPIDKeys(): {
      publicKey: string;
      privateKey: string;
    };
  };

  export default webpush;
}
