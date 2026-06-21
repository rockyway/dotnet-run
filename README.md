# dotnetrun

Build a .NET project, copy its output to a separate temp directory, and run the
binary **from there** — so `bin/` stays unlocked and coding agents / tools can
keep rebuilding while the app runs.

`dotnet run` executes the binary straight out of `bin/`, locking e.g.
`Rephlo.exe`. That lock blocks the next `dotnet build`. `dotnetrun` builds in
place, mirrors the output into a run dir (default `D:\temp\<name>-dev` on
Windows), and launches from the copy.

## Install

```sh
npm install -g dnrun   # installs the global `dotnetrun` command
```

Or, for local development of this tool:

```sh
# from the repo
npm link        # exposes the global `dotnetrun` command
```

> The npm package is `dnrun`, but the command it installs is **`dotnetrun`**.

Requires Node.js >= 22.4 and the .NET SDK on `PATH`.

## Usage

```sh
dotnetrun --project <path> [options] [-- <app args>]
```

| Option | Default | Description |
| --- | --- | --- |
| `-p, --project <path>` | — (required) | `.csproj` file, or a directory containing exactly one |
| `-c, --configuration <cfg>` | `Debug` | `Debug` or `Release` |
| `--temp <path>` | `<tempRoot>/<name>-dev` | Explicit run directory |
| `--sync <additive\|mirror>` | `additive` | `additive` keeps extra files; `mirror` purges them (robocopy `/MIR`) |
| `--no-build` | build on | Skip build; copy + run only |
| `--no-run` | run on | Build + copy only |
| `--detach` | attach | Launch and return instead of attaching and streaming logs |
| `-h, --help` | | Show help |
| `--` | | Everything after is forwarded to the executable |

Logs stream to the console by default. In attached mode, `Ctrl+C` stops the app.

### Default run directory

- **Windows:** `D:\temp\<name>-dev` (falls back to the system temp dir if `D:\` is absent)
- **macOS / Linux:** `<system temp>/<name>-dev`

`<name>` is the project's **AssemblyName** lowercased — so `Rephlo.UI` →
`rephlo` → `…\rephlo-dev`. Override the whole path with `--temp`.

## Examples

```sh
# Build Debug, copy, attach and stream logs
dotnetrun --project ./Rephlo.UI

# Release, launch detached
dotnetrun -p ./Rephlo.UI -c Release --detach

# Forward args to the app (e.g. enable Langfuse tracing)
dotnetrun -p ./Rephlo.UI -- --enable-langfuse

# Re-copy and run without rebuilding
dotnetrun -p ./Rephlo.UI --no-build

# Clean room: mirror output, purging stale DLLs
dotnetrun -p ./Rephlo.UI --sync mirror
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
