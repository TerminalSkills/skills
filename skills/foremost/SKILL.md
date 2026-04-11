---
name: foremost
description: >-
  Recover deleted files and carve artifacts from disk images and memory
  dumps with Foremost. Use when a user asks to extract files from a raw
  disk image, recover accidentally deleted photos, pull embedded files out
  of a CTF blob, or carve artifacts from unallocated space.
license: Apache-2.0
compatibility: 'Foremost 1.5.7, Linux/macOS'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - foremost
    - file-carving
    - digital-forensics
    - data-recovery
    - ctf
---

# Foremost

## Overview

Foremost is a file carving tool: it scans raw disk images, memory dumps, or any blob byte-by-byte for magic headers and footers, then writes out the recovered files into neat per-type directories. It doesn't care about filesystem metadata — it looks for the on-disk bytes that identify a JPEG, PNG, PDF, ZIP, Office document, MP3, and so on. That makes it the right tool for recovering files the filesystem has forgotten or for CTF challenges where a blob hides multiple embedded files.

## Instructions

### Step 1: Create a Disk Image (Never Carve the Live Device)

```bash
# Always work from an image, never the source device
sudo dd if=/dev/sdb of=disk.img bs=4M status=progress conv=noerror,sync

# Or use dcfldd (forensic fork of dd with hashing)
sudo dcfldd if=/dev/sdb of=disk.img bs=4M hash=sha256 hashlog=disk.sha256

# Verify integrity before working
sha256sum disk.img
cat disk.sha256
```

### Step 2: Run Foremost

```bash
# Default run — uses built-in config, all supported types
foremost -i disk.img -o recovered/

# Specific types only (jpg, png, pdf, zip, doc, mp3, ...)
foremost -t jpg,png,pdf -i disk.img -o recovered/

# Verbose + quick mode (scan only file headers, faster)
foremost -v -q -t all -i disk.img -o recovered/

# Output tree
tree -L 2 recovered/
# recovered/
# ├── audit.txt
# ├── jpg/
# │   ├── 00000001.jpg
# │   └── 00000125.jpg
# ├── pdf/
# │   └── 00000007.pdf
# └── zip/
#     └── 00000042.zip
```

### Step 3: Review the Audit File

```bash
# Summary of what was carved
cat recovered/audit.txt
# Foremost version 1.5.7 by Jesse Kornblum ...
# Num      Name (bs=512)         Size      File Offset     Comment
# 0:       00000001.jpg          185 KB    16384
# 1:       00000007.pdf          1 MB      67108864

# Count files by type
find recovered -type f -not -name audit.txt | awk -F/ '{print $(NF-1)}' | sort | uniq -c
```

### Step 4: Custom File Types with foremost.conf

```bash
# Copy the default config
cp /etc/foremost.conf ./foremost.conf

# Add a signature: extension  case  max-size  header  footer
# Example: a custom "FLAG" binary starting with 'CTFFLAG' and ending with 'END'
cat >> foremost.conf <<'EOF'
flag y 5000 CTFFLAG END
EOF

# Run with the custom config
foremost -c ./foremost.conf -i challenge.bin -o out/
ls out/flag/
```

### Step 5: Combine with Other Carvers

```bash
# scalpel is foremost's faster fork; use it when foremost is too slow
sudo apt install scalpel
scalpel -c /etc/scalpel/scalpel.conf -o scalpel-out disk.img

# binwalk — better for firmware and embedded filesystems
binwalk -e firmware.bin

# photorec — interactive, stronger for photo/video recovery
sudo photorec /dev/sdb

# strings + file — first-pass triage
strings -a disk.img | less
file recovered/jpg/00000001.jpg
```

## Examples

### Example 1: Recover Photos from a Formatted SD Card

```bash
# Plug in the SD card — DO NOT mount and DO NOT write anything to it
lsblk
# sdb     1  29.8G  0 disk
# └─sdb1  1  29.8G  0 part

# Image the card
sudo dd if=/dev/sdb of=sdcard.img bs=4M status=progress
sudo sha256sum sdcard.img > sdcard.sha256

# Unplug the card and work from the image only
foremost -t jpg,png,raw,mov,mp4 -i sdcard.img -o photos/

ls photos/jpg | wc -l
# 842

# Sort by size to spot real photos vs thumbnails
find photos/jpg -type f -printf '%s %p\n' | sort -nr | head
```

### Example 2: CTF — Files Hidden Inside a PNG

```bash
# The challenge: "Something is hidden inside this harmless image."
file challenge.png
# challenge.png: PNG image data, 1920 x 1080, ...

# Foremost scans through the whole blob, not just the top PNG
foremost -t all -i challenge.png -o carved/

cat carved/audit.txt
# 0: 00000000.png   2 MB    0
# 1: 00000001.zip   45 KB   2097664
# 2: 00000002.pdf   1 MB    2143000

# Inspect the carved ZIP
unzip -l carved/zip/00000001.zip
# flag.txt
unzip -p carved/zip/00000001.zip flag.txt
# flag{foremost_carves_everything}
```

## Guidelines

- **Never run Foremost against a live mounted device.** Always image first, hash the image, then carve.
- Write-block the source media (physical write blocker, or at minimum mount read-only) to preserve chain of custody.
- Carving is signature-based — it cannot recover file *names* or directory structure. Metadata is lost.
- Overlapping or fragmented files are reconstructed poorly. For heavily fragmented disks, try `photorec` or a filesystem-aware tool like `extundelete`/`testdisk` first.
- The output directory must NOT exist beforehand — Foremost refuses to overwrite it.
- Foremost is single-threaded and slow on big images. `scalpel` is a faster fork for the same job.
- For CTFs, always try `foremost -t all -i challenge.blob` as a reflex — it finds embedded ZIPs, PDFs, and images that `binwalk` sometimes misses.
- Pair with `exiftool`, `strings`, and `file` on the recovered artifacts to pull metadata and hidden content.
