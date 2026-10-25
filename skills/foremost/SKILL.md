---
name: foremost
description: >-
  Recover deleted files and carve artifacts from disk images and memory
  dumps with Foremost. Use when a user asks to extract files from a raw
  disk image, recover accidentally deleted photos, pull embedded files out
  of a CTF blob, or carve artifacts from unallocated space.
license: Apache-2.0
compatibility: 'Foremost 1.5.7 (apt install foremost on Debian/Ubuntu), Linux'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  tags: "foremost, file-carving, digital-forensics, data-recovery, ctf"
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

Install with `sudo apt install foremost` (Debian and Ubuntu ship 1.5.7). Without `-t` it runs every built-in type (`-t all`).

```bash
# Default run: all built-in types
foremost -i disk.img -o recovered/

# Specific types only (built-in: jpg gif png bmp avi exe mpg wav riff wmv mov pdf ole doc zip rar htm cpp mp4 ...)
foremost -t jpg,png,pdf,zip -i disk.img -o recovered/

# Skip the first 100 blocks, or write only the audit file (a dry run)
foremost -s 100 -t jpg -i disk.img -o recovered/
foremost -w -i disk.img -o dry-run/

# Timestamp the output directory so reruns never collide
foremost -T -v -t all -i disk.img -o recovered/
```

Output layout (file names are the sector number where the file starts, not a running counter; the audit lists byte offsets):

```console
$ foremost -t png,zip -i blob.bin -o out1
$ ls -R out1
out1:
audit.txt  png  zip

out1/png:
00000008.png

out1/zip:
00000013.zip
```

The output directory must be empty or absent. If it has files in it Foremost stops with "is not empty"; use a new name or `-T`.

Quick mode (`-q`) only checks the start of each 512-byte sector. It is faster but misses files embedded inside other files and files that do not start on a sector boundary. Do not use it for CTF blobs, NTFS (small files live in the MFT), or any case where completeness matters.

### Step 3: Review the Audit File

```console
$ cat recovered/audit.txt
...
Num	 Name (bs=512)	       Size	 File Offset	 Comment

0:	00000008.png 	       69 B 	       4096 	  (1 x 1)
1:	00000013.zip 	      334 B 	       7165 	 
Finish: Sat Oct 24 16:37:55 2026

2 FILES EXTRACTED
png:= 1
zip:= 1
```

Count files per type with `find recovered -type f -not -name audit.txt | awk -F/ '{print $(NF-1)}' | sort | uniq -c`.

### Step 4: Custom File Types with a Config File

Each line of `foremost.conf` is: extension, case-sensitive (`y`/`n`), maximum size in bytes, header, optional footer. Headers and footers accept `\x4F` hex, octal, `\s` for a space and `?` as a wildcard. The packaged default config is `/etc/foremost.conf`.

```bash
cp /etc/foremost.conf ./foremost.conf
printf 'flag y 5000 CTFFLAG END\n' >> foremost.conf     # carve CTFFLAG ... END

foremost -c ./foremost.conf -i challenge.bin -o out/
ls out/flag/          # 00000000.flag
```

The carved file includes the header and the footer. `-t` accepts only built-in type names (`-t flag` prints the usage text and does nothing); types defined in the config file are always searched for, whatever `-t` says.

### Step 5: Combine with Other Tools

```bash
# scalpel: a fork of foremost; its config ships with every type commented out, uncomment the ones you need
sudo apt install scalpel
scalpel -c /etc/scalpel/scalpel.conf -o scalpel-out disk.img

# binwalk: firmware and embedded filesystems
binwalk -e firmware.bin

# photorec / testdisk: interactive recovery that understands filesystems
sudo photorec /dev/sdb

# First-pass triage
strings -a disk.img | less
file recovered/jpg/00000008.jpg
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
foremost -t jpg,png,mov,mp4 -i sdcard.img -o photos/

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
# 1: 00004097.zip   45 KB   2097664
# 2: 00004186.pdf   1 MB    2143232

# Inspect the carved ZIP
unzip -l carved/zip/00004097.zip
# flag.txt
unzip -p carved/zip/00004097.zip flag.txt
# flag{foremost_carves_everything}
```

## Guidelines

- Never run Foremost against a live, mounted device. Image first (`dd`, `dcfldd`), hash the image, then carve the copy. Work from a write-blocker or a read-only attachment to keep the source intact.
- Carving is signature-based: it recovers neither file names nor directory structure, and fragmented files come out truncated or corrupt. For intact filesystems try `testdisk`, `photorec` or (ext3/ext4) `extundelete` first.
- The output directory must be empty or absent; use `-T` for reruns.
- Skip `-q` unless speed matters more than completeness (see Step 2).
- Foremost is single-threaded and slow on large images; `scalpel` is the faster alternative for the same job.
- Carved files from untrusted images can be malicious: open them in a sandbox or VM, not on the analysis host.
- For firmware images `binwalk` is the better first tool; for CTF blobs run both.
