import { execSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const getLatestTag = () => {
  try {
    const tag = execSync("git describe --tags --abbrev=0", {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
    if (!tag) throw new Error("No git tags found");
    return tag.startsWith("v") ? tag.slice(1) : tag;
  } catch (error) {
    throw new Error(`Unable to determine latest git tag: ${error.message}`);
  }
};

const setVersion = async (packageJsonPath, version) => {
  const data = await readFile(packageJsonPath, "utf8");
  const pkg = JSON.parse(data);
  if (pkg.version !== version) {
    pkg.version = version;
    await writeFile(
      packageJsonPath,
      JSON.stringify(pkg, null, 2) + "\n",
      "utf8",
    );
    console.log(`Updated ${packageJsonPath} to version ${version}`);
  }
};

const run = async () => {
  const version = getLatestTag();
  const packageJsonPath = join(process.cwd(), "package.json");

  await setVersion(packageJsonPath, version);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
