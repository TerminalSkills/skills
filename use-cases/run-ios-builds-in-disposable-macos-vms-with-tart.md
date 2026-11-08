---
title: Run iOS Builds in Disposable macOS VMs with Tart
slug: run-ios-builds-in-disposable-macos-vms-with-tart
description: Give every iOS pull request a fresh macOS VM on a Mac mini, so builds stop failing from leftover Xcode state, and publish one golden image for the whole team.
skills:
  - tart
  - fastlane
  - github-actions
category: devops
tags:
  - macos-ci
  - ios
  - virtual-machines
  - apple-silicon
  - self-hosted-runner
---

# Run iOS Builds in Disposable macOS VMs with Tart

## The Problem

Priya Raman leads a four-person iOS team. Their CI is a single self-hosted Mac mini (M2, 32 GB) in a closet, and it has become the least trusted part of the pipeline. After three months of builds, DerivedData holds 90 GB, three Xcode versions fight over the command-line tools selection, simulators from old runtimes pile up, and a Ruby gem installed for one branch changes the result of another. Roughly one build in ten fails for reasons nobody can reproduce, and the standard fix is "reboot it and re-run". When Xcode is updated, the whole queue stops for an afternoon because the same machine is both the runner and the thing being upgraded.

She wants every job to start from a known macOS install with a known Xcode, and to be thrown away when the job ends.

## The Solution

Tart runs macOS guests on Apple Silicon and stores them as OCI images, so a golden image can be pulled by any Mac in the team from `ghcr.io`. The agent uses the **tart** skill to clone a fresh VM per job, run the build inside it with `tart exec`, and delete the clone. The **fastlane** skill supplies the lanes that run inside the guest, and the **github-actions** skill covers the workflow that triggers the job; the Mac host only needs a short shell script between the two.

## Step-by-Step Walkthrough

### Step 1: Install Tart and fetch a pinned base image

Prompt to the agent: "Install Tart on the Mac mini and pull the Sequoia image with Xcode 16.2. Tell me how big it is before I commit the disk."

```bash
brew install openai/tools/tart
tart --version
df -h ~/.tart 2>/dev/null || df -h ~
tart clone ghcr.io/cirruslabs/macos-sequoia-xcode:16.2 sequoia-xcode
tart list
```

The image is a download of tens of gigabytes. The agent checks free space first and keeps well over 100 GB available for the base image, clones and a second image version.

### Step 2: Add the team's tools to a golden image

Prompt: "Install our Ruby version and Bundler gems into the image, then publish it so the other Macs can pull it."

```bash
tart set sequoia-xcode --cpu 4 --memory 12288
tart run sequoia-xcode &
tart ip sequoia-xcode --resolver agent --wait 120
tart exec sequoia-xcode sh -c 'xcodebuild -version && ruby -v'
```

The agent installs the Ruby and gem versions the project's `.ruby-version` and `Gemfile.lock` ask for (through `tart exec` or an SSH session as `admin`), then stops the guest and publishes it:

```bash
tart stop sequoia-xcode
tart login ghcr.io --username ios-ci-bot --password-stdin < ~/.secrets/ghcr-token
tart push sequoia-xcode ghcr.io/hopscotch-labs/macos-golden:xcode-16.2 ghcr.io/hopscotch-labs/macos-golden:latest
```

The token comes from a GitHub personal access token with package write rights that Priya creates and stores in a file readable only by the CI user. The agent never prints it.

### Step 3: Write the per-job script

Prompt: "Write the script the runner calls for each job. It must always delete the VM, even when the build fails."

```bash
#!/bin/bash
# run-in-vm.sh <job-id> <repo-dir> <command...>
set -euo pipefail
JOB="job-$1"; REPO="$2"; shift 2

cleanup() { tart stop "$JOB" 2>/dev/null || true; tart delete "$JOB" 2>/dev/null || true; }
trap cleanup EXIT

tart clone ghcr.io/hopscotch-labs/macos-golden:xcode-16.2 "$JOB"
tart run --no-graphics --dir=repo:"$REPO":ro "$JOB" &
tart ip "$JOB" --resolver agent --wait 120 >/dev/null
tart exec "$JOB" sh -c 'cp -R "/Volumes/My Shared Files/repo" "$HOME/repo"'
tart exec "$JOB" sh -c "cd \"\$HOME/repo\" && $*"
```

The source folder is shared read-only (`--dir=repo:<path>:ro`, mounted at `/Volumes/My Shared Files/repo` in macOS guests), so the job copies it to the guest's home before building. The `trap` guarantees `tart stop` and `tart delete` run on success, failure and Ctrl-C.

### Step 4: Run the test lane in a clone

Prompt: "Run `bundle exec fastlane test` for PR 1842 through that script."

```bash
./run-in-vm.sh 1842 "$PWD" "bundle install && bundle exec fastlane test"
tart list
```

`tart list` afterwards shows only the cached golden image and no `job-1842`. A build that used to leave 6 GB of DerivedData on the host now leaves nothing.

### Step 5: Hook it into the pipeline

Prompt: "Make the pull-request workflow call the script on the Mac mini."

The **github-actions** skill produces a workflow with `runs-on` set to the self-hosted runner's labels and a single step that calls `./run-in-vm.sh "$GITHUB_RUN_ID" "$GITHUB_WORKSPACE" "bundle install && bundle exec fastlane test"`. The agent keeps the runner service itself outside any VM: only the build runs in the guest.

### Step 6: Update Xcode without stopping the queue

Prompt: "Xcode 16.3 is out. Build a new image and switch over, keeping the old one for a week."

```bash
tart clone ghcr.io/cirruslabs/macos-sequoia-xcode:16.3 candidate
tart run candidate &
tart ip candidate --resolver agent --wait 120
tart exec candidate xcodebuild -version
# install the team's Ruby and gems again, then:
tart stop candidate
tart push candidate ghcr.io/hopscotch-labs/macos-golden:xcode-16.3
```

The new tag is tried on one branch by changing the image tag in `run-in-vm.sh`. The `xcode-16.2` tag keeps working until it is deleted, so rollback is a one-line change.

## Real-World Example

Priya's team ran this for two weeks against 61 pull requests. The unexplained failures that had hit about one build in ten stopped, because no job could see another job's gems, simulators or caches. Each job pays for a `tart clone` of the local image plus a guest boot before the build starts; the team accepts that cost for clean results, and installs the gems into the golden image so the first `bundle install` is fast. Moving from Xcode 16.2 to 16.3 became a tag change instead of an afternoon of downtime. The numbers are this invented team's own and will differ on other hardware.

## Related Skills

- [tart](/skills/tart) — clones, boots, executes in and deletes the macOS VMs, and pushes the golden image to a registry.
- [fastlane](/skills/fastlane) — defines the `test` and later `beta` lanes that run inside the guest.
- [github-actions](/skills/github-actions) — triggers the per-job script from pull requests through a self-hosted runner.
