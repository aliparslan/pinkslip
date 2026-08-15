declare module "virtual:pinkslip-typst-compiler" {
  export function loadTypstCompilerModule(): Promise<string | Uint8Array>;
}
