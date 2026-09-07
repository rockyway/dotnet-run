import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { parseWorktreePorcelain, resolveWorktree } from '../src/worktree.js';

describe('parseWorktreePorcelain', () => {
  test('parses a single worktree with a branch', () => {
    const output = ['worktree /repo/main', 'HEAD abc123', 'branch refs/heads/main', ''].join('\n');
    assert.deepEqual(parseWorktreePorcelain(output), [{ path: '/repo/main', branch: 'main' }]);
  });

  test('parses multiple worktrees separated by blank lines', () => {
    const output = [
      'worktree /repo/main',
      'HEAD abc123',
      'branch refs/heads/main',
      '',
      'worktree /repo/feature-login',
      'HEAD def456',
      'branch refs/heads/feature/login',
      '',
    ].join('\n');
    assert.deepEqual(parseWorktreePorcelain(output), [
      { path: '/repo/main', branch: 'main' },
      { path: '/repo/feature-login', branch: 'feature/login' },
    ]);
  });

  test('marks detached worktrees with an undefined branch', () => {
    const output = ['worktree /repo/detached', 'HEAD abc123', 'detached', ''].join('\n');
    assert.deepEqual(parseWorktreePorcelain(output), [{ path: '/repo/detached', branch: undefined }]);
  });

  test('does not derive the branch from the worktree folder name', () => {
    const output = [
      'worktree /repo/some-unrelated-folder-name',
      'HEAD abc123',
      'branch refs/heads/feature/login',
      '',
    ].join('\n');
    assert.deepEqual(parseWorktreePorcelain(output), [
      { path: '/repo/some-unrelated-folder-name', branch: 'feature/login' },
    ]);
  });

  test('can surface multiple worktrees registered under the same branch name', () => {
    const output = [
      'worktree /repo/one',
      'HEAD abc123',
      'branch refs/heads/dup',
      '',
      'worktree /repo/two',
      'HEAD def456',
      'branch refs/heads/dup',
      '',
    ].join('\n');
    const dupMatches = parseWorktreePorcelain(output).filter((w) => w.branch === 'dup');
    assert.equal(dupMatches.length, 2);
  });
});

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

after(() => {
  while (cleanupDirs.length > 0) {
    const dir = cleanupDirs.pop();
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('resolveWorktree', () => {
  test('resolves the path of a registered worktree by branch name', () => {
    const repoDir = makeTempDir('dotnetrun-wt-repo-');
    const worktreeDir = makeTempDir('dotnetrun-wt-target-');
    rmSync(worktreeDir, { recursive: true, force: true });

    initRepoWithCommit(repoDir);
    git(repoDir, ['worktree', 'add', '-b', 'feature/login', worktreeDir]);

    const resolved = resolveWorktree('feature/login', repoDir);
    assert.equal(resolved, resolve(worktreeDir));
  });

  test('throws a helpful error naming the branch when it has no worktree', () => {
    const repoDir = makeTempDir('dotnetrun-wt-missing-');
    initRepoWithCommit(repoDir);

    assert.throws(() => resolveWorktree('does-not-exist', repoDir), /does-not-exist/);
    assert.throws(() => resolveWorktree('does-not-exist', repoDir), /git worktree add/);
  });

  test('throws when the current directory is not a Git repository', () => {
    const plainDir = makeTempDir('dotnetrun-wt-notgit-');
    assert.throws(() => resolveWorktree('main', plainDir), /[Gg]it repository/);
  });
});
