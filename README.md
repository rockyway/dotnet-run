# dotnetrun

Build a .NET project, copy its output to a separate temp directory, and run the
binary **from there** — so `bin/` stays unlocked and coding agents / tools can
keep rebuilding while the app runs.

`dotnet run` executes the binary straight out of `bin/`, locking e.g.
`TodoApp.exe`. That lock blocks the next `dotnet build`. `dotnetrun` builds in
place, mirrors the output into a run dir (default `D:\temp\<name>-dev` on
Windows), and launches from the copy.

## Install

```sh
npm install -g dotnet-shadowrun
```

Or, for local development of this tool:

```sh
# from the repo
npm link
```

> Installs three equivalent commands — use whichever you like:
> **`dotnetrun`**, **`dnrun`**, or **`dotnet-shadowrun`**.

Requires Node.js >= 22.4 and the .NET SDK on `PATH`.

## Usage

```sh
dotnetrun --project <path> [options] [-- <app args>]
dotnetrun --project <path> [options] --args <app args>
```

| Option | Default | Description |
| --- | --- | --- |
| `-p, --project <path>` | — (required) | `.csproj` file, or a directory containing exactly one |
| `-b, --branch <name>` | | Run against the Git worktree registered for `<name>` — `--project`/`--temp` resolve relative to that worktree, as if you'd `cd`'d there first |
| `-c, --configuration <cfg>` | `Debug` | `Debug` or `Release` |
| `--temp <path>` | `<tempRoot>/<name>-dev` | Explicit run directory |
| `--sync <additive\|mirror>` | `additive` | `additive` keeps extra files; `mirror` purges them (robocopy `/MIR`) |
| `--no-build` | build on | Skip build; copy + run only |
| `--no-run` | run on | Build + copy only |
| `--detach` | attach | Launch and return instead of attaching and streaming logs |
| `--launch-profile <name>` | first `Project` profile | Apply a profile from `Properties/launchSettings.json` (env vars, `applicationUrl`, `commandLineArgs`) — same default `dotnet run` uses |
| `--no-launch-profile` | | Don't apply any launch profile |
| `--env <KEY=VALUE>` | | Set an env var on the child (repeatable, highest precedence — overrides the launch profile, same as `dotnet run`'s `-e`) |
| `-h, --help` | | Show help |
| `--` | | Everything after is forwarded to the executable |
| `--args` | | Same as `--`, but safe in PowerShell (see note below) |

> **`-b, --branch`:** looks up `<name>` among the Git worktrees already
> registered for the current repository (`git worktree list`) and runs as if
> you'd `cd`'d into that worktree first. It does not create, remove, or
> switch worktrees — the branch must already be checked out in one via
> `git worktree add <path> <branch>`.

> **PowerShell note:** npm's generated `.ps1` shim has no `param()` block, so
> args flow through PowerShell's automatic `$args` array — and PowerShell
> silently drops a bare `--` token before the child process ever sees it.
> `--` works fine in bash/cmd, but if you're on PowerShell (the default on
> Windows), use `--args` instead so the separator actually survives.

> **Why `--launch-profile` is a dedicated flag, not a forwarded arg:**
> `dotnetrun` builds and spawns the compiled `.exe` directly — it never calls
> `dotnet run`. Real `dotnet run --launch-profile <name>` reads
> `launchSettings.json` and translates the profile into environment variables
> before starting the app; the compiled binary itself has no idea what
> `--launch-profile` means. Passing it as a forwarded app arg (`-- --launch-profile X`)
> does nothing. Use `--launch-profile <name>` as a top-level `dotnetrun` option
> instead — it reads the same `Properties/launchSettings.json` and applies the
> profile's `environmentVariables` (and `applicationUrl` → `ASPNETCORE_URLS`,
> and `commandLineArgs` if you didn't pass your own app args) to the spawned process.
> It also sets `DOTNET_LAUNCH_PROFILE` to the profile name, same as `dotnet run`.
>
> Like `dotnet run`, if you don't pass `--launch-profile` at all, `dotnetrun`
> still auto-applies the **first profile whose `commandName` is `"Project"`**
> in `launchSettings.json` — pass `--no-launch-profile` to opt out entirely.
> (`workingDirectory` in a profile is intentionally not honored — real
> `dotnet run` doesn't support it either;
> [dotnet/sdk#20885](https://github.com/dotnet/sdk/issues/20885) closed it "not planned".)

Logs stream to the console by default. In attached mode, `Ctrl+C` stops the app.

### Default run directory

- **Windows:** `D:\temp\<name>-dev` (falls back to the system temp dir if `D:\` is absent)
- **macOS / Linux:** `<system temp>/<name>-dev`

`<name>` is the project's **AssemblyName** lowercased — so `TodoApp.UI` →
`todoapp` → `…\todoapp-dev`. Override the whole path with `--temp`.

## Examples

```sh
# Build Debug, copy, attach and stream logs
dotnetrun --project ./TodoApp.UI

# Run against a branch checked out in a registered Git worktree, without
# cd'ing there first — --project resolves relative to that worktree
dotnetrun -b feature/login --project ./TodoApp.UI

# Release, launch detached
dotnetrun -p ./TodoApp.UI -c Release --detach

# Forward args to the app (e.g. enable Langfuse tracing)
dotnetrun -p ./TodoApp.UI -- --enable-langfuse

# Same, but PowerShell-safe (bash/cmd's -- gets swallowed by PowerShell)
dotnetrun -p ./TodoApp.UI --args --enable-langfuse

# Re-copy and run without rebuilding
dotnetrun -p ./TodoApp.UI --no-build

# Clean room: mirror output, purging stale DLLs
dotnetrun -p ./TodoApp.UI --sync mirror

# Apply a specific launch profile (env vars, applicationUrl, commandLineArgs)
dotnetrun -p ./TodoApp.UI --launch-profile Staging

# Skip launch profile application (dotnetrun otherwise auto-applies the
# first "Project" profile, same default dotnet run uses)
dotnetrun -p ./TodoApp.UI --no-launch-profile

# Override/add an env var on top of the launch profile (highest precedence)
dotnetrun -p ./TodoApp.UI --env ASPNETCORE_ENVIRONMENT=Staging
```

## How it works

1. **Resolve** — `dotnet msbuild -getProperty:AssemblyName,TargetDir,OutputType`
   finds the real assembly name and output dir (no build needed). Falls back to
   scanning `bin/<config>` for the newest executable.
2. **Build** — `dotnet build -c <config>` (skip with `--no-build`).
3. **Copy** — Windows `robocopy /MT` (`/E` additive or `/MIR` mirror);
   macOS/Linux `rsync -a [--delete]`, falling back to a recursive copy.
4. **Run** — spawn the copied executable with the run dir as its working
   directory, forwarding any `-- ` args.

## Notes / limitations

- If a previous instance is still running and holding files in the run dir, the
  copy can fail with a lock error (robocopy exit ≥ 8). Close it first.
- Multi-targeted projects: MSBuild reports the first `TargetFramework`'s output.
- v1 does not inject environment variables or run `dotnet publish` packaging.
