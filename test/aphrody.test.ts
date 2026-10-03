import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  remoteCommand,
  remotePaths,
  remoteSyncCommand,
  stopCommand,
  waitCommand,
} from "../apps/cli/src/aphrody";
import { findCheckout } from "../apps/cli/src/home";

const factory = {
  target: "vps",
  workspaceRoot: "/srv/aphrody-build/workspaces/aphrody",
  artifactRoot: "/srv/aphrody-build/artifacts",
  lockPath: "/srv/aphrody-build/locks/heavy.lock",
};
const sha = "abcdef0123456789abcdef0123456789abcdef01";

describe("aphrody bridge", () => {
  it("places the yolo workspace next to the other first-party workspaces", () => {
    const p = remotePaths(factory, "abc123");
    expect(p.workspace).toBe("/srv/aphrody-build/workspaces/yolo");
    expect(p.artifacts).toBe("/srv/aphrody-build/artifacts/yolo/abc123");
  });

  it("runs the commit's own unit script from the artifacts in a detached tmux session, behind the heavy lock", () => {
    const cmd = remoteCommand(factory, sha);
    const art = `/srv/aphrody-build/artifacts/yolo/${sha}`;
    expect(cmd).toContain(
      `git -C '/srv/aphrody-build/workspaces/yolo' show '${sha}:scripts/release/ship_unit.sh' > '${art}/ship_unit.sh'`,
    );
    expect(cmd).toContain("tmux new-session -d -s 'yolo-ship-abcdef012345'");
    expect(cmd).toContain(`bash '${art}/ship_unit.sh'`);
    expect(cmd).toContain("'/srv/aphrody-build/locks/heavy.lock'");
  });

  it("leaves a build already running for the commit alone unless forced", () => {
    const cmd = remoteCommand(factory, sha);
    expect(cmd.startsWith("if tmux has-session -t 'yolo-ship-abcdef012345'")).toBe(true);
    expect(cmd).toContain("already running");
    const forced = remoteCommand(factory, sha, true);
    expect(forced).not.toContain("has-session");
    expect(forced.indexOf("tmux kill-session")).toBeLessThan(forced.indexOf("tmux new-session"));
  });

  it("fetches the commit and the tags but never touches the working tree outside the lock", () => {
    const cmd = remoteSyncCommand(factory, sha, "https://github.com/aphrody-labs/yolo.git");
    expect(cmd).toContain("git clone --filter=blob:none --no-checkout");
    expect(cmd).toContain("git fetch --prune --tags --filter=blob:none origin");
    expect(cmd).not.toContain("checkout -f");
    expect(cmd).not.toContain("submodule update");
  });

  it("stops the tmux session and the systemd unit together", () => {
    const cmd = stopCommand(sha);
    expect(cmd).toContain("tmux kill-session -t 'yolo-ship-abcdef012345'");
    expect(cmd).toContain("systemctl stop 'yolo-ship-abcdef012345.service'");
  });

  it("waits for a terminal status and succeeds only on ok", () => {
    const cmd = waitCommand(factory, sha);
    expect(cmd).toContain("until grep -qE '^(ok|failed|stopped)'");
    expect(
      cmd.trimEnd().endsWith(`grep -qx ok '/srv/aphrody-build/artifacts/yolo/${sha}/STATUS'`),
    ).toBe(true);
  });
});

describe("checkout lookup for the installed executable", () => {
  const root = resolve(import.meta.dir, "..");

  it("finds the checkout from any directory inside it", () => {
    expect(findCheckout(join(root, "apps/cli/src"))).toBe(root);
    expect(findCheckout(root)).toBe(root);
  });

  it("returns null outside a checkout", () => {
    const dir = mkdtempSync(join(tmpdir(), "yolo-no-checkout-"));
    try {
      expect(findCheckout(dir)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
