// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectPackages, readGitHead, readVendorStatus } from "../packages/core/src/vendor/status";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function git(cwd: string, ...args: string[]) {
  const child = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  if (child.exitCode !== 0) throw new Error(child.stderr.toString());
  return child.stdout.toString().trim();
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "yolo-vendor-refs-"));
  roots.push(root);
  const repository = join(root, "vendor/tauri");
  mkdirSync(repository, { recursive: true });
  git(repository, "init", "--quiet", "--initial-branch=main");
  git(
    repository,
    "-c",
    "user.name=fixture-owner",
    "-c",
    "user.email=fixture@localhost",
    "commit",
    "--quiet",
    "--allow-empty",
    "-m",
    "fixture",
  );
  const sha = git(repository, "rev-parse", "HEAD");
  return { root, repository, sha };
}
test("full SHA survives packed refs and vendor comparison rejects a matching short prefix", async () => {
  const value = fixture();
  git(value.repository, "pack-refs", "--all");
  expect(await readGitHead(value.repository)).toBe(value.sha);
  const packages = await inspectPackages(join(value.root, "vendor"));
  expect(packages.find((entry) => entry.name === "tauri")?.headCommit).toBe(value.sha);
  writeFileSync(
    join(value.root, "vendor.lock"),
    JSON.stringify({ sources: [{ name: "tauri", sha: value.sha }], crates: [] }),
  );
  expect((await readVendorStatus(value.root))?.sources[0]?.inSync).toBe(true);
  writeFileSync(
    join(value.root, "vendor.lock"),
    JSON.stringify({
      sources: [{ name: "tauri", sha: `${value.sha.slice(0, 10)}${"0".repeat(30)}` }],
      crates: [],
    }),
  );
  expect((await readVendorStatus(value.root))?.sources[0]?.inSync).toBe(false);
});
test("linked fixture worktree resolves common packed refs and detached HEAD", async () => {
  const value = fixture();
  const linked = join(value.root, "linked-fixture");
  git(value.repository, "worktree", "add", "--quiet", "-b", "linked", linked);
  git(value.repository, "pack-refs", "--all");
  expect(await readGitHead(linked)).toBe(value.sha);
  git(linked, "checkout", "--quiet", "--detach", value.sha);
  expect(await readGitHead(linked)).toBe(value.sha);
});
test("bounded symbolic refs resolve while malformed or cyclic metadata stays unqualified", async () => {
  const value = fixture();
  git(value.repository, "symbolic-ref", "refs/heads/alias", "refs/heads/main");
  git(value.repository, "symbolic-ref", "HEAD", "refs/heads/alias");
  expect(await readGitHead(value.repository)).toBe(value.sha);
  writeFileSync(join(value.repository, ".git/refs/heads/alias"), "ref: refs/heads/alias\n");
  expect(await readGitHead(value.repository)).toBeUndefined();
  writeFileSync(join(value.repository, ".git/HEAD"), "ref: refs/../outside\n");
  expect(await readGitHead(value.repository)).toBeUndefined();
});
