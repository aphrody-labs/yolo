import { describe, expect, it } from "bun:test";
import { remoteCommand, remotePaths } from "../apps/cli/src/aphrody";

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

  it("runs the remote build detached and behind the heavy lock", () => {
    const cmd = remoteCommand(factory, "abc123");
    expect(cmd).toContain("flock '/srv/aphrody-build/locks/heavy.lock'");
    expect(cmd).toContain("nohup");
    expect(cmd).toContain("scripts/release/ship_remote.sh");
    expect(cmd.endsWith("echo started")).toBe(true);
  });
});
