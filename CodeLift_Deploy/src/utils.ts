import { exec } from "child_process";
import fs from "fs";
import path from "path";

type PackageJson = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function runCommand(command: string, cwd: string) {
  return new Promise<void>((resolve, reject) => {
    const child = exec(command, { cwd });

    child.stdout?.on("data", (data) => {
      console.log(data.toString());
    });

    child.stderr?.on("data", (data) => {
      console.error(data.toString());
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} failed in ${cwd} with exit code ${code}`));
    });
  });
}

function readPackageJson(packageJsonPath: string): PackageJson {
  return JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as PackageJson;
}

function isReactProject(packageJson: PackageJson) {
  return Boolean(
    packageJson.dependencies?.react ||
      packageJson.devDependencies?.react ||
      packageJson.dependencies?.next ||
      packageJson.devDependencies?.next ||
      packageJson.dependencies?.vite ||
      packageJson.devDependencies?.vite ||
      packageJson.dependencies?.["react-scripts"] ||
      packageJson.devDependencies?.["react-scripts"]
  );
}

function isNextProject(packageJson: PackageJson) {
  return Boolean(packageJson.dependencies?.next || packageJson.devDependencies?.next);
}

function ensureNextStaticExport(projectDir: string) {
  const nextConfigPath = path.join(projectDir, "next.config.mjs");
  const nextConfig = [
    "const nextConfig = {",
    '  output: "export",',
    "  images: {",
    "    unoptimized: true,",
    "  },",
    "};",
    "",
    "export default nextConfig;",
    ""
  ].join("\n");

  fs.writeFileSync(nextConfigPath, nextConfig);
}

function findReactProjectDirs(folderPath: string) {
  const reactProjectDirs: string[] = [];

  if (!fs.existsSync(folderPath)) {
    return reactProjectDirs;
  }

  const entries = fs.readdirSync(folderPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") {
      continue;
    }

    const fullPath = path.join(folderPath, entry.name);

    if (entry.isFile() && entry.name === "package.json") {
      const packageJson = readPackageJson(fullPath);

      if (isReactProject(packageJson) && packageJson.scripts?.build) {
        reactProjectDirs.push(folderPath);
      }
    }

    if (entry.isDirectory()) {
      reactProjectDirs.push(...findReactProjectDirs(fullPath));
    }
  }

  return reactProjectDirs;
}

function getStaticOutputDir(projectDir: string) {
  const outDir = path.join(projectDir, "out");
  const distDir = path.join(projectDir, "dist");
  const buildDir = path.join(projectDir, "build");

  if (fs.existsSync(outDir)) {
    return outDir;
  }

  if (fs.existsSync(distDir)) {
    return distDir;
  }

  if (fs.existsSync(buildDir)) {
    return buildDir;
  }

  return null;
}

function copyStaticFiles(sourceDir: string, targetDir: string) {
  if (path.resolve(sourceDir) === path.resolve(targetDir)) {
    return;
  }

  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }

  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  fs.cpSync(sourceDir, targetDir, { recursive: true });
}






export async function buildProject(id: string) {
  const projectDir = path.join(process.cwd(), "output", id);
  const convertedDir = path.join(projectDir, "converted");
  const reactProjectDirs = findReactProjectDirs(projectDir);

  if (reactProjectDirs.length === 0) {
    console.log("No React project with build script found:", projectDir);
    return [];
  }

  const staticOutputDirs: string[] = [];

  for (const reactProjectDir of reactProjectDirs) {
    const packageJson = readPackageJson(path.join(reactProjectDir, "package.json"));

    if (isNextProject(packageJson)) {
      console.log("Preparing Next.js static export in:", reactProjectDir);
      ensureNextStaticExport(reactProjectDir);
    }

    console.log("Installing React app dependencies in:", reactProjectDir);
    await runCommand("npm install", reactProjectDir);

    console.log("Converting React app to static HTML, CSS, and JS in:", reactProjectDir);
    await runCommand("npm run build", reactProjectDir);

    const staticOutputDir = getStaticOutputDir(reactProjectDir);

    if (!staticOutputDir) {
      console.log("Build finished, but no out, dist, or build folder was found:", reactProjectDir);
      continue;
    }

    console.log("Static files ready:", staticOutputDir);
    copyStaticFiles(staticOutputDir, convertedDir);
    console.log("Copied static files to:", convertedDir);
    staticOutputDirs.push(staticOutputDir);
  }

  return staticOutputDirs;
}
