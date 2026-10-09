import { describe, expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { checkWebappDependencies, checkWebappSource } from "../scripts/check-webapp-governance";

const sourceRoot = resolve(import.meta.dir, "../apps/webapp/src");
const kitFile = join(sourceRoot, "kit/button/Button.tsx");
const routeFile = join(sourceRoot, "routes/index.tsx");

describe("webapp governance", () => {
  test("allows Base UI imports under the kit only", () => {
    expect(checkWebappSource(kitFile, `import { Button } from "@base-ui/react/button";`)).toEqual([]);
    expect(checkWebappSource(routeFile, `import { Button } from "@base-ui/react/button";`)).toHaveLength(1);
    expect(checkWebappSource(routeFile, `const BaseButton = await import("@base-ui/react/button");`)).toHaveLength(1);
  });

  test("rejects string-literal class names", () => {
    expect(checkWebappSource(routeFile, `<div className="job" />`)).toHaveLength(1);
    expect(checkWebappSource(routeFile, `<div className={'job'} />`)).toHaveLength(1);
    expect(checkWebappSource(routeFile, "<div className={`job`} />")).toHaveLength(1);
    expect(checkWebappSource(routeFile, `<div className={styles.job} />`)).toEqual([]);
    expect(checkWebappSource(routeFile, "<div className={`job ${extra}`} />")).toEqual([]);
  });

  test("allows only custom-property inline styles", () => {
    expect(checkWebappSource(routeFile, `<div style={{ "--progress": progress }} />`)).toEqual([]);
    expect(checkWebappSource(routeFile, `<div style={{ color: "red" }} />`)).toHaveLength(1);
    expect(checkWebappSource(routeFile, `<div style={{ width, color: "red" }} />`)).toHaveLength(2);
    expect(checkWebappSource(routeFile, `<div style={{ ...placement, "--progress": progress }} />`)).toEqual([]);
    expect(checkWebappSource(routeFile, `<div style="color: red" />`)).toHaveLength(1);
    expect(checkWebappSource(routeFile, `<div style={placementStyle} />`)).toEqual([]);
  });

  test("rejects Tailwind dependencies and imports", () => {
    expect(checkWebappDependencies("package.json", JSON.stringify({ dependencies: { tailwindcss: "1" } }))).toHaveLength(1);
    expect(checkWebappDependencies("package.json", JSON.stringify({ devDependencies: { "@tailwindcss/vite": "1" } }))).toHaveLength(1);
    expect(checkWebappDependencies("package.json", JSON.stringify({ dependencies: { react: "1" } }))).toEqual([]);
    expect(checkWebappSource(routeFile, `import "@tailwindcss/vite";`)).toHaveLength(1);
  });
});
