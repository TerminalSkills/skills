---
name: ghidra
description: >-
  Ghidra is an open-source reverse engineering suite from the NSA that
  disassembles and decompiles compiled programs so their behaviour can be read
  and scripted. Use when a user asks to analyze a binary with Ghidra from the
  command line, run analyzeHeadless, batch-import firmware or malware samples
  into a Ghidra project, decompile functions to C, write a Ghidra script in
  Java or Python, or automate analysis with PyGhidra. For authorized work only:
  malware analysis, vulnerability research, firmware the user owns, CTF
  challenges.
license: Apache-2.0
compatibility: "Ghidra 12.1.x with a 64-bit JDK 21; Python 3.9–3.14 for PyGhidra; Linux, macOS or Windows; 4 GB RAM minimum"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["reverse-engineering", "decompiler", "malware-analysis", "headless-analysis", "pyghidra"]
  repository: https://github.com/NationalSecurityAgency/ghidra
---
# Ghidra — Scriptable reverse engineering from the command line

## Overview

Ghidra loads executables, libraries and firmware images, recovers functions and data types, and decompiles machine code to C-like source. Besides the GUI it ships a headless analyzer (`analyzeHeadless`) and a Python library (PyGhidra), so an agent can import binaries, run analysis and extract results without opening a window.

## Instructions

### Installation

Ghidra has no installer: install a JDK, download the release zip, verify it and unpack it into a new directory.

```bash
java -version        # Ghidra 12.1.x needs JDK 21 (Temurin or Corretto builds work)
curl -LO https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_12.1.4_build/ghidra_12.1.4_PUBLIC_20260921.zip
echo "ddac49f903da9d5bac833e5cc79395098b9c33cfd3279be5f31bd00387d2d4db  ghidra_12.1.4_PUBLIC_20260921.zip" | sha256sum -c -
unzip -q ghidra_12.1.4_PUBLIC_20260921.zip -d "$HOME/tools"
export GHIDRA_INSTALL_DIR="$HOME/tools/ghidra_12.1.4_PUBLIC"
```

The SHA-256 value is published in the notes of each release. Take the asset whose name contains `_PUBLIC_`, not the "Source code" archives, and never unpack over an existing installation. The `master` branch already requires JDK 25, so check `Ghidra/application.properties` when building from source.

### Headless analysis

The first two arguments are the directory that holds projects and the project name (optionally `name/folder`). Then choose `-import` for new files or `-process` for programs already in the project. The project is created on first import, and auto-analysis runs unless `-noanalysis` is given.

```bash
mkdir -p /srv/re/projects /srv/re/out
"$GHIDRA_INSTALL_DIR/support/analyzeHeadless" /srv/re/projects fw-audit \
  -import /srv/re/samples/router-rootfs/usr/sbin/httpd \
  -analysisTimeoutPerFile 900 -max-cpu 4 \
  -log /srv/re/out/analysis.log -scriptlog /srv/re/out/script.log
```

| Option | Effect |
|---|---|
| `-import /srv/re/samples/lib` | Import and analyze a file or directory; repeatable. Add `-recursive` for subdirectories and archives |
| `-process httpd` | Work on programs already in the project; without a name, every program in the project folder (add `-recursive` for subfolders). Quote wildcards: `-process '*.so'` |
| `-overwrite` | Replace a program of the same name on import instead of skipping it |
| `-readOnly` | Do not save imports or changes |
| `-noanalysis` | Skip auto-analysis (useful when only running a script) |
| `-preScript Setup.java` / `-postScript Report.java out.tsv` | Run a script before or after analysis, with optional arguments; repeatable |
| `-scriptPath "/srv/re/scripts;/opt/team-scripts"` | Extra script directories (default: `~/ghidra_scripts` and the bundled ones) |
| `-processor ARM:LE:32:v7 -cspec default` | Force the language and compiler instead of relying on the file header |
| `-loader BinaryLoader -loader-baseAddr 08000000` | Load a raw image at a hexadecimal base address |
| `-analysisTimeoutPerFile 900` | Stop analysis of one file after 900 seconds, then continue with the scripts |
| `-deleteProject` | Remove a project created in this run when finished |

Headless runs use a 2 GB Java heap by default. Raise it for large binaries with `GHIDRA_HEADLESS_MAXMEM=8G` in the environment.

### Scripts in Java

Scripts extend `GhidraScript` and see `currentProgram`, `monitor` and the flat API. Pass the file name only; the directory goes into `-scriptPath`. Arguments after the script name arrive in `getScriptArgs()`.

```java
// ListRiskyCalls.java — writes call sites of risky libc functions as TSV, one file per program
// Args: output directory, then optional function names
//@category Analysis
import java.io.File;
import java.io.PrintWriter;
import java.util.Arrays;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.listing.Function;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.Symbol;

public class ListRiskyCalls extends GhidraScript {
    @Override
    public void run() throws Exception {
        String[] args = getScriptArgs();
        String[] names = args.length > 1
                ? Arrays.copyOfRange(args, 1, args.length)
                : new String[] {"strcpy", "strcat", "sprintf", "gets", "system"};
        File report = new File(args[0], currentProgram.getName() + "-risky-calls.tsv");
        try (PrintWriter out = new PrintWriter(report)) {
            for (String name : names) {
                for (Symbol sym : currentProgram.getSymbolTable().getSymbols(name)) {
                    for (Reference ref : getReferencesTo(sym.getAddress())) {
                        if (!ref.getReferenceType().isCall()) {
                            continue;
                        }
                        Function caller = getFunctionContaining(ref.getFromAddress());
                        out.println(name + "\t" + ref.getFromAddress() + "\t"
                                + (caller == null ? "-" : caller.getName()));
                    }
                }
            }
        }
        println("Wrote " + report);
    }
}
```

```bash
"$GHIDRA_INSTALL_DIR/support/analyzeHeadless" /srv/re/projects fw-audit \
  -process httpd -noanalysis -readOnly \
  -scriptPath /srv/re/scripts -postScript ListRiskyCalls.java /srv/re/out
```

This writes `/srv/re/out/httpd-risky-calls.tsv` with the columns function, call address and caller.

GUI-only calls throw `ImproperUseException` in headless mode. The `askFile`, `askString`, `askInt` family works: each call consumes the next script argument, or a value from a `.properties` file named after the script. Extend `HeadlessScript` for headless-only controls such as `setHeadlessContinuationOption(...)`.

### Python with PyGhidra

PyGhidra runs CPython 3 against the Ghidra API. Install the wheel that ships with the release into a virtual environment:

```bash
python3 -m venv "$HOME/.venvs/ghidra" && source "$HOME/.venvs/ghidra/bin/activate"
python3 -m pip install --no-index -f "$GHIDRA_INSTALL_DIR/Ghidra/Features/PyGhidra/pypkg/dist" pyghidra
```

`pip install pyghidra` from PyPI also works; PyGhidra 3.x needs Ghidra 12.0 or later. To run a Python GhidraScript headlessly, start the analyzer through the PyGhidra launcher with the same arguments:

```python
# count_externals.py
# @category Analysis
# @runtime PyGhidra
externals = list(currentProgram.getSymbolTable().getExternalSymbols())
println(f"{currentProgram.getName()}: {len(externals)} external symbols")
```

```bash
"$GHIDRA_INSTALL_DIR/support/pyghidraRun" --headless /srv/re/projects fw-audit \
  -process httpd -noanalysis -readOnly -scriptPath /srv/re/scripts -postScript count_externals.py
```

As a library, PyGhidra opens projects and programs directly. Import `ghidra.*` packages only after `pyghidra.start()`:

```python
import pyghidra

pyghidra.start()                              # reads $GHIDRA_INSTALL_DIR

with pyghidra.open_project("/srv/re/projects", "fw-audit", create=True) as project:
    def report(domain_file, program):
        fm = program.getFunctionManager()
        print(domain_file.getPathname(), program.getLanguageID(), fm.getFunctionCount())
    pyghidra.walk_programs(project, report)
```

Key functions: `open_project`, `program_loader` (import), `program_context` (open a program), `analyze`, `transaction` (required around changes), `ghidra_script` (run any GhidraScript) and `task_monitor(timeout_seconds)`.

## Examples

### Example 1: Inventory the functions of a firmware binary

**User request:** "I pulled httpd out of my own router's firmware. Import it into Ghidra and give me the function list as JSON."

```bash
"$GHIDRA_INSTALL_DIR/support/analyzeHeadless" /srv/re/projects fw-audit \
  -import /srv/re/samples/router-rootfs/usr/sbin/httpd -overwrite \
  -postScript ExportFunctionInfoScript.java /srv/re/out/httpd-functions.json
jq 'length' /srv/re/out/httpd-functions.json
jq -c '.[] | select(.name | test("login|auth"))' /srv/re/out/httpd-functions.json
```

`ExportFunctionInfoScript.java` ships with Ghidra; its output file is taken from the script argument.

**Result:**

```text
1284
{"name":"check_auth_cookie","entry":"00014a3c"}
{"name":"handle_login_cgi","entry":"00015f10"}
{"name":"auth_compare_password","entry":"0001622c"}
```

### Example 2: Decompile a CTF binary to C files

**User request:** "Decompile every function of the `gatekeeper` challenge binary so I can grep the source."

```python
import re
from pathlib import Path
import pyghidra

pyghidra.start()
from ghidra.app.decompiler import DecompInterface

out_dir = Path("/srv/re/out/gatekeeper-c")
out_dir.mkdir(parents=True, exist_ok=True)

with pyghidra.open_project("/srv/re/projects", "ctf-2026", create=True) as project:
    try:
        with pyghidra.program_context(project, "/gatekeeper"):
            pass                                  # already imported
    except FileNotFoundError:
        loader = pyghidra.program_loader().project(project)
        loader = loader.source("/srv/re/samples/gatekeeper").name("gatekeeper")
        with loader.load() as results:
            results.save(pyghidra.task_monitor())

    with pyghidra.program_context(project, "/gatekeeper") as program:
        pyghidra.analyze(program, pyghidra.task_monitor(600))
        program.save("auto-analysis", pyghidra.task_monitor())
        decomp = DecompInterface()
        decomp.openProgram(program)
        written = 0
        for func in program.getFunctionManager().getFunctions(True):
            if func.isThunk() or func.isExternal():
                continue
            res = decomp.decompileFunction(func, 60, pyghidra.task_monitor())
            if res.decompileCompleted():
                name = re.sub(r"[^\w.-]", "_", str(func.getName()))
                target = out_dir / f"{func.getEntryPoint()}_{name}.c"
                target.write_text(str(res.getDecompiledFunction().getC()))
                written += 1
        decomp.dispose()

print(f"decompiled {written} functions into {out_dir}")
```

**Result:**

```text
decompiled 47 functions into /srv/re/out/gatekeeper-c
```

`grep -l strcmp /srv/re/out/gatekeeper-c/*.c` then points at `00101289_check_password.c`.

## Guidelines

- **Authorized use only.** Use this skill for malware analysis, vulnerability research on software the user is allowed to analyse, firmware of devices the user owns, and CTF challenges. Confirm the authorization when it is unclear. Do not use it to remove licence checks, defeat copy protection or build cracks, and decline requests for that.
- **Treat samples as hostile.** Ghidra does not execute the program it analyzes, but read the project's Security Advisories and keep Ghidra current. Analyze malware inside an isolated virtual machine without network access, and never run the sample itself on the host.
- **One process per project.** Headless analysis may not run while the same project is open in the GUI or in another headless process. Use a separate project per parallel job.
- **Script names, not paths.** `-postScript` takes `Name.java` or `name.py` with its extension; directories belong in `-scriptPath`. A plain `analyzeHeadless` run cannot execute PyGhidra scripts; use `pyghidraRun --headless`.
- **Quote wildcards for `-process`.** Unquoted `*` is expanded by the shell against the current directory, not against the project.
- **Destructive flags.** `-deleteProject`, `-overwrite` and the `ABORT_AND_DELETE` / `CONTINUE_THEN_DELETE` script options remove data. Deleting existing programs in `-process` mode also requires `-okToDelete`; do not add it unless the user asked for deletion.
- **Check import-heavy results.** How calls to imported functions are referenced depends on the file format and loader. Compare a few entries of a script report with the listing before trusting the counts.
- **Logging from Python.** `print` writes to stdout; `println` writes to the script log set with `-scriptlog`.
- **Decompiler output is an approximation.** Names, types and control flow are reconstructed; confirm findings in the disassembly before reporting a vulnerability.
- **When not to use it.** Ghidra is the wrong tool when source code is available, when a quick `strings` or `objdump` answers the question, or when the task needs a live process: it is a static analysis framework, and debugging malware needs a separate sandbox.
