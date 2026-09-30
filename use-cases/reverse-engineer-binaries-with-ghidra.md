---
title: Reverse Engineer Binaries with Ghidra
slug: reverse-engineer-binaries-with-ghidra
description: Audit closed-source binaries in your own firmware for unsafe calls and produce a reviewable findings report, for product security engineers.
skills:
  - ghidra
  - markdown-writer
category: development
tags:
  - reverse-engineering
  - firmware-analysis
  - vulnerability-research
  - decompiler
  - security-review
---

## The Problem

Dana Whitfield is the only security engineer at Harbor Metering, a 14-person company that builds a gateway for smart water meters. Firmware 2.8.1 contains 23 executables and libraries from the chipset vendor's SDK, delivered as binaries without source. A utility that plans to install 6,000 gateways has sent a security questionnaire: which network-facing services use memory-unsafe string functions, and has anyone reviewed them?

Harbor Metering's SDK licence permits security analysis of the delivered binaries, so Dana may look. What she lacks is time. Opening 23 files one by one in a GUI, waiting for analysis and searching each for `strcpy` takes about three working days, and the answer is due in one week.

## The Solution

Use the **ghidra** skill to import and analyze all binaries headlessly, run one script over the whole project and decompile only the functions that matter. Use the **markdown-writer** skill to turn the raw results into a findings report the vendor and the customer can read.

## Step-by-Step Walkthrough

### 1. Install Ghidra and check the download

```text
Install Ghidra 12.1.4 under ~/tools on my analysis VM and verify the checksum. JDK 21 is already installed.
```

```bash
java -version
curl -LO https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_12.1.4_build/ghidra_12.1.4_PUBLIC_20260921.zip
echo "ddac49f903da9d5bac833e5cc79395098b9c33cfd3279be5f31bd00387d2d4db  ghidra_12.1.4_PUBLIC_20260921.zip" | sha256sum -c -
unzip -q ghidra_12.1.4_PUBLIC_20260921.zip -d "$HOME/tools"
export GHIDRA_INSTALL_DIR="$HOME/tools/ghidra_12.1.4_PUBLIC"
```

`sha256sum` prints `ghidra_12.1.4_PUBLIC_20260921.zip: OK`.

### 2. Import and analyze every SDK binary

```text
The unpacked firmware is in /srv/re/samples/gateway-2.8.1. Import everything under usr/sbin and usr/lib/vendor into one project and analyze it. Limit each file to 15 minutes.
```

```bash
mkdir -p /srv/re/projects /srv/re/out
GHIDRA_HEADLESS_MAXMEM=8G "$GHIDRA_INSTALL_DIR/support/analyzeHeadless" /srv/re/projects gateway-2.8.1 \
  -import /srv/re/samples/gateway-2.8.1/usr/sbin /srv/re/samples/gateway-2.8.1/usr/lib/vendor \
  -recursive -analysisTimeoutPerFile 900 -max-cpu 4 \
  -log /srv/re/out/analysis.log
```

Each imported directory becomes a folder in the project, so the programs end up under `/sbin` and `/vendor`.

### 3. List every call to an unsafe function

```text
For each program in the project, list the call sites of strcpy, strcat, sprintf, gets and system, with the calling function.
```

The agent saves `ListRiskyCalls.java` from the ghidra skill to `/srv/re/scripts` and runs it over the project without changing it:

```bash
"$GHIDRA_INSTALL_DIR/support/analyzeHeadless" /srv/re/projects gateway-2.8.1 \
  -process -recursive -noanalysis -readOnly \
  -scriptPath /srv/re/scripts -postScript ListRiskyCalls.java /srv/re/out \
  -scriptlog /srv/re/out/script.log
ls /srv/re/out/*-risky-calls.tsv | wc -l
cat /srv/re/out/*-risky-calls.tsv | cut -f1 | sort | uniq -c | sort -rn
wc -l /srv/re/out/*-risky-calls.tsv | sort -rn | head -4
```

```text
23
     97 sprintf
     71 strcpy
     29 strcat
     15 system
  212 total
   64 /srv/re/out/cfgd-risky-calls.tsv
   41 /srv/re/out/libvendor_net.so-risky-calls.tsv
   33 /srv/re/out/meterd-risky-calls.tsv
```

### 4. Decompile the callers in the network-facing service

```text
cfgd listens on port 8443. Decompile every function in cfgd that calls strcpy or sprintf and save the C code so I can review it.
```

```python
import csv, re
from pathlib import Path
import pyghidra

pyghidra.start()
from ghidra.app.decompiler import DecompInterface

with open("/srv/re/out/cfgd-risky-calls.tsv") as tsv:
    rows = list(csv.reader(tsv, delimiter="\t"))
callers = {caller for name, _addr, caller in rows if name in ("strcpy", "sprintf")}
out_dir = Path("/srv/re/out/cfgd-review")
out_dir.mkdir(parents=True, exist_ok=True)

with pyghidra.open_project("/srv/re/projects", "gateway-2.8.1") as project:
    with pyghidra.program_context(project, "/sbin/cfgd") as program:
        decomp = DecompInterface()
        decomp.openProgram(program)
        for func in program.getFunctionManager().getFunctions(True):
            if str(func.getName()) not in callers:
                continue
            res = decomp.decompileFunction(func, 60, pyghidra.task_monitor())
            if res.decompileCompleted():
                name = re.sub(r"[^\w.-]", "_", str(func.getName()))
                (out_dir / f"{func.getEntryPoint()}_{name}.c").write_text(str(res.getDecompiledFunction().getC()))
        decomp.dispose()
print(len(list(out_dir.glob("*.c"))), "functions written to", out_dir)
```

```text
19 functions written to /srv/re/out/cfgd-review
```

Dana reads the 19 files. In `00013e90_set_hostname.c` a request parameter is copied with `strcpy` into a 64-byte stack buffer without a length check.

### 5. Write the findings report

```text
Write a findings report in Markdown for the vendor. Include scope, method, a table of call counts per binary, and the two confirmed issues with function name, address and the decompiled snippet. Mark everything else as "not yet reviewed".
```

The report is saved as `/srv/re/out/gateway-2.8.1-sdk-review.md` with these sections:

```text
1. Scope — 23 SDK binaries from firmware 2.8.1, analyzed under the SDK licence
2. Method — Ghidra 12.1.4 headless analysis, ListRiskyCalls.java, manual review of cfgd
3. Call sites per binary — 212 in total, 64 in cfgd
4. Confirmed findings — set_hostname (00013e90), parse_ntp_server (000148c4)
5. Not yet reviewed — 161 call sites: 148 in the other 22 binaries, 13 strcat and system calls in cfgd
```

## Real-World Example

Dana starts on Tuesday morning. The batch import of 23 binaries finishes in 31 minutes while she answers other parts of the questionnaire. The script run over the project takes four minutes and reports 212 call sites.

1. She narrows the review to `cfgd`, the only SDK service that accepts network input, and gets 19 decompiled functions to read instead of 23 whole binaries.
2. Two of the 19 copy request parameters into fixed-size stack buffers without checking the length. She confirms both in the disassembly before writing them down.
3. The agent drafts the report, and she sends it to the vendor on Wednesday afternoon. The vendor ships a fixed SDK build 16 days later.
4. For firmware 2.8.2 she reruns steps 2 and 3 on the new binaries. The two findings are gone and the total drops from 212 to 188 call sites.

The questionnaire goes back to the utility with a documented method and a dated report, two days before the deadline. The review took about a day and a half instead of the three days she had estimated for doing it by hand.

## Related Skills

- [ghidra](/skills/ghidra) — imports and analyzes the binaries headlessly, runs the call-site script and decompiles the flagged functions
- [markdown-writer](/skills/markdown-writer) — turns the TSV results and decompiled snippets into the findings report for the vendor
