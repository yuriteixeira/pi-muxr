import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function openMessageInEditor(message: string, onStart: () => void, onEnd: () => void): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "pi-muxr-message-"));
  try {
    const file = join(directory, "message.md");
    await writeFile(file, message, { mode: 0o600 });
    onStart();
    try {
      const editor = process.env.EDITOR?.trim() || "vi";
      await runEditor(`${editor} '${file.replace(/'/g, "'\\''")}'`);
    } finally {
      onEnd();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function runEditor(command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { shell: true, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Editor exited with code ${code ?? "unknown"}`));
    });
  });
}
