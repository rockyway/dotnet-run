import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI_PATH = fileURLToPath(new URL('../bin/dotnetrun.js', import.meta.url));
const cleanupDirs = [];

function makeTempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanupDirs.push(dir);
  return dir;
}

function git(cwd, args) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${res.stderr}`);
  }
}

function initRepoWithCommit(repoDir) {
  git(repoDir, ['init']);
  git(repoDir, ['config', 'user.email', 'test@example.com']);
  git(repoDir, ['config', 'user.name', 'Test']);
  writeFileSync(join(repoDir, 'README.md'), 'test repo');
  git(repoDir, ['add', 'README.md']);
  git(repoDir, ['commit', '-m', 'init']);
}

function runCli(cwd, args) {
  const res = spawnSync('node', [CLI_PATH, ...args], { cwd, encoding: 'utf8' });
  return { exitCode: res.status ?? 1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

after(() => {
  while (cleanupDirs.length > 0) {
    const dir = cleanupDirs.pop();
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('dotnetrun CLI --branch', () => {
  test('-b resolves --project relative to the worktree, not the invocation cwd', () => {
    const repoDir = makeTempDir('dotnetrun-cli-repo-');
    const worktreeDir = makeTempDir('dotnetrun-cli-wt-');
    rmSync(worktreeDir, { recursive: true, force: true });

    initRepoWithCommit(repoDir);
    git(repoDir, ['worktree', 'add', '-b', 'feature/login', worktreeDir]);

    const projectDir = join(worktreeDir, 'TodoApp.UI');
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, 'Fake.csproj'), '<Project />');

    // No .NET build output exists, so this fails past resolution — the
    // point of this test is that the failure names a path *inside the
    // worktree*, proving --project was resolved after the chdir, without
    // needing the .NET SDK or a real build to succeed.
    const result = runCli(repoDir, ['-b', 'feature/login', '--project', './TodoApp.UI']);

    assert.notEqual(result.exitCode, 0);
    assert.match(result.stderr, /Could not determine build output directory/);
    assert.match(result.stderr, new RegExp(escapeRegExp(join(projectDir, 'Fake.csproj'))));
  });

  test('exits non-zero with a message naming the branch when it has no worktree', () => {
    const repoDir = makeTempDir('dotnetrun-cli-missing-');
    initRepoWithCommit(repoDir);

    const result = runCli(repoDir, ['-b', 'no-such-branch', '--project', '.']);
    assert.notEqual(result.exitCode, 0);
    assert.match(result.stderr, /no-such-branch/);
    assert.match(result.stderr, /git worktree add/);
  });

  test('--help lists the -b/--branch option', () => {
    const repoDir = makeTempDir('dotnetrun-cli-help-');
    const result = runCli(repoDir, ['--help']);
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /-b, --branch/);
  });
});

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
