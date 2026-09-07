import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

/**
 * Parse the output of `git worktree list --porcelain` into structured records.
 *
 * @param {string} output
 * @returns {{ path: string, branch: string | undefined }[]}
 */
export function parseWorktreePorcelain(output) {
  const worktrees = [];
  const blocks = output
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  for (const block of blocks) {
    let path;
    let branch;

    for (const line of block.split('\n')) {
      if (line.startsWith('worktree ')) {
        path = line.slice('worktree '.length).trim();
      } else if (line.startsWith('branch ')) {
        const ref = line.slice('branch '.length).trim();
        branch = ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref;
      }
    }

    if (path !== undefined) {
      worktrees.push({ path, branch });
    }
  }

  return worktrees;
}

function runGit(args, cwd) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (res.error) {
    throw new Error('Git is not installed or not available in PATH.');
  }
  return { exitCode: res.status ?? 1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

/**
 * Resolve a branch name to the absolute path of its registered Git worktree.
 *
 * @param {string} branch
 * @param {string} cwd  directory to run Git from (the invocation cwd)
 * @returns {string} absolute, native-separator path to the worktree
 */
export function resolveWorktree(branch, cwd) {
  const repoCheck = runGit(['rev-parse', '--is-inside-work-tree'], cwd);
  if (repoCheck.exitCode !== 0 || repoCheck.stdout.trim() !== 'true') {
    throw new Error(`Not inside a Git repository: '${cwd}'.`);
  }

  const listResult = runGit(['worktree', 'list', '--porcelain'], cwd);
  if (listResult.exitCode !== 0) {
    throw new Error(`Failed to list Git worktrees: ${listResult.stderr.trim()}`);
  }

  const worktrees = parseWorktreePorcelain(listResult.stdout);
  const matches = worktrees.filter((w) => w.branch === branch);

  if (matches.length === 0) {
    throw new Error(
      `No worktree found for branch '${branch}'. Add it first with: git worktree add <path> ${branch}`
    );
  }

  if (matches.length > 1) {
    throw new Error(
      `Branch '${branch}' matches multiple worktrees: ${matches.map((m) => m.path).join(', ')}`
    );
  }

  // Git may report paths with forward slashes even on Windows; resolvePath()
  // normalizes to the platform's native, absolute form for comparison and use.
  const resolved = resolvePath(matches[0].path);

  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    throw new Error(
      `Worktree path for branch '${branch}' does not exist or is inaccessible: '${resolved}'.`
    );
  }

  return resolved;
}
