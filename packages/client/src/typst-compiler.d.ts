declare module "virtual:pinkslip-typst-compiler" {
  export function loadTypstCompilerModule(): string | Promise<Uint8Array>;
}
