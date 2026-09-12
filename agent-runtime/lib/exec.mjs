import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const execFileAsync = promisify(execFile);

const CMD_UNSAFE_CHARACTERS = /[&|<>^%!()"]/;

function quoteForCmd(value) {
  const text = String(value);
  if (CMD_UNSAFE_CHARACTERS.test(text)) {
    throw new Error(`Argument contains characters that cannot be safely passed to a Windows .cmd/.bat wrapper: ${text}`);
  }
  return /\s/.test(text) ? `"${text}"` : text;
}

function windowsShellFallback(command, args) {
  const commandLine = [command, ...args].map(quoteForCmd).join(" ");
  return { file: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", commandLine] };
}

// Node's execFile cannot invoke a .cmd/.bat file directly on Windows - it requires a
// shell and fails with ENOENT even when PATH/PATHEXT correctly resolve the command
// (this affects npm-installed CLI tools like axe-cli). Rather than the unescaped
// shell:true option Node itself warns against, this retries once through cmd.exe with
// metacharacter-rejecting quoting: arguments with shell-significant characters throw
// instead of being executed, so a failure here is a refusal, not a miss-escape.
const CMD_NOT_RECOGNIZED = /is not recognized as an internal or external command/i;

export async function execLocalToolAsync(command, args, options) {
  try {
    return await execFileAsync(command, args, options);
  } catch (error) {
    if (process.platform === "win32" && error?.code === "ENOENT") {
      const fallback = windowsShellFallback(command, args);
      try {
        return await execFileAsync(fallback.file, fallback.args, options);
      } catch (fallbackError) {
        if (CMD_NOT_RECOGNIZED.test(String(fallbackError?.stderr ?? ""))) {
          const notFound = new Error(fallbackError.message);
          notFound.code = "ENOENT";
          throw notFound;
        }
        throw fallbackError;
      }
    }
    throw error;
  }
}
