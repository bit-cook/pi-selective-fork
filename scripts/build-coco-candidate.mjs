#!/usr/bin/env node

import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = join(repoRoot, "packages", "coding-agent");
const args = process.argv.slice(2);

function option(name) {
	const index = args.indexOf(name);
	if (index < 0 || index === args.length - 1) throw new Error(`Missing ${name}`);
	return args[index + 1];
}

if (args.length !== 4 || !args.includes("--out") || !args.includes("--tag")) throw new Error("Usage: build-coco-candidate --tag <coco-vX.Y.Z-coco.N> --out <directory>");
const sourceTag = option("--tag");
if (!/^coco-v\d+\.\d+\.\d+-coco\.\d+$/.test(sourceTag)) throw new Error("Invalid candidate tag");
const outputDirectory = resolve(option("--out"));
const sourceCommit = (await exec("git", ["rev-parse", "HEAD"], { cwd: repoRoot })).stdout.trim();
const baseCommit = (await exec("git", ["rev-list", "-n", "1", "v0.82.1"], { cwd: repoRoot })).stdout.trim();
const temporary = await mkdtemp(join(tmpdir(), "pi-coco-candidate-"));

async function installedPackages(nodeModules) {
	const packages = [];
	for (const entry of await readdir(nodeModules, { withFileTypes: true })) {
		if (!entry.isDirectory() || entry.name === ".bin") continue;
		if (!entry.name.startsWith("@")) packages.push(entry.name);
		else for (const child of await readdir(join(nodeModules, entry.name), { withFileTypes: true })) if (child.isDirectory()) packages.push(`${entry.name}/${child.name}`);
	}
	return packages.sort();
}

try {
	const baseOutput = join(temporary, "base");
	const consumer = join(temporary, "consumer");
	const stage = join(temporary, "stage");
	await Promise.all([mkdir(baseOutput), mkdir(consumer), mkdir(stage), mkdir(outputDirectory, { recursive: true })]);
	await exec("npm", ["pack", "--pack-destination", baseOutput], { cwd: packageRoot, maxBuffer: 64 * 1024 * 1024 });
	const baseTarball = join(baseOutput, (await readdir(baseOutput)).find((entry) => entry.endsWith(".tgz")));
	await writeFile(join(consumer, "package.json"), '{"name":"coco-candidate-builder","private":true,"version":"0.0.0"}\n');
	await exec("npm", ["install", baseTarball, "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false"], { cwd: consumer, maxBuffer: 64 * 1024 * 1024, timeout: 300_000 });
	await exec("tar", ["-xzf", baseTarball, "--no-same-owner", "--no-same-permissions", "-C", stage]);
	const stagedPackage = join(stage, "package");
	const manifestPath = join(stagedPackage, "package.json");
	const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
	manifest.cocoCandidate = { baseCommit, baseTag: "v0.82.1", repository: "https://github.com/bit-cook/pi-selective-fork", schemaVersion: 1, sourceCommit, sourceTag };
	manifest.bundledDependencies = await installedPackages(join(consumer, "node_modules"));
	await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
	await cp(join(consumer, "node_modules"), join(stagedPackage, "node_modules"), { filter: (path) => !path.endsWith("/@earendil-works/pi-coding-agent"), recursive: true, verbatimSymlinks: false });
	const packed = JSON.parse((await exec("npm", ["pack", "--json", "--pack-destination", outputDirectory], { cwd: stagedPackage, maxBuffer: 64 * 1024 * 1024 })).stdout)[0];
	const sourcePath = join(outputDirectory, packed.filename);
	const targetPath = join(outputDirectory, `earendil-works-pi-coding-agent-${manifest.version}-${sourceTag.split("-").at(-1)}.tgz`);
	await rename(sourcePath, targetPath);
	console.log(JSON.stringify({ bundled: packed.bundled.length, bytes: packed.size, file: basename(targetPath), sourceCommit, sourceTag, status: "approved" }));
} finally {
	await rm(temporary, { force: true, recursive: true });
}
