import { describe, expect, it } from "bun:test";
import { remoteCommand, remotePaths, stopCommand } from "../apps/cli/src/aphrody";

const factory = {
  target: "vps",
  workspaceRoot: "/srv/aphrody-build/workspaces/aphrody",
  artifactRoot: "/srv/aphrody-build/artifacts",
  lockPath: "/srv/aphrody-build/locks/heavy.lock",
};

describe("aphrody bridge", () => {
  it("places the yolo workspace next to the other first-party workspaces", () => {
    const p = remotePaths(factory, "abc123");
    expect(p.workspace).toBe("/srv/aphrody-build/workspaces/yolo");
    expect(p.artifacts).toBe("/srv/aphrody-build/artifacts/yolo/abc123");
  });

  it("runs the remote build in a detached tmux session behind the heavy lock", () => {
    const cmd = remoteCommand(factory, "abcdef0123456789");
    expect(cmd).toContain("tmux new-session -d -s 'yolo-ship-abcdef012345'");
    expect(cmd).toContain("scripts/release/ship_unit.sh");
    expect(cmd).toContain("'/srv/aphrody-build/locks/heavy.lock'");
    expect(cmd.endsWith("echo started")).toBe(true);
  });

  it("stops the tmux session and the systemd unit together", () => {
    const cmd = stopCommand("abcdef0123456789");
    expect(cmd).toContain("tmux kill-session -t 'yolo-ship-abcdef012345'");
    expect(cmd).toContain("systemctl stop 'yolo-ship-abcdef012345.service'");
  });
});
