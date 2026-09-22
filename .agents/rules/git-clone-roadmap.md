# Git Clone Project Roadmap & Session Management

## Session Management & Context Rules
- **At the start of each session**: Remind the user which phase/step we are on and give a 1-line recap of the current state.
- **Mental Map**: Maintain a mental map of the project's file structure so code suggestions align with what has already been built.
- **Strict Progression**: NEVER advance to the next phase until the current phase's code runs and passes the tests.

## Project Roadmap
- **Phase 0** — Explore a real Git repo by hand (git init, git add, look inside .git/ manually).
- **Phase 1** — Project setup + `init`: what a repository actually is on disk.
- **Phase 2** — Content-addressable storage: SHA-1 hashing, the object format, writing/reading blobs, zlib compression.
- **Phase 3** — The staging area (index): what "staging" really means, `add`.
- **Phase 4** — Trees: representing directories, building/reading nested trees.
- **Phase 5** — Commits: commit object format, parent chains, updating a ref.
- **Phase 6** — log / diff / status: traversing history, comparing snapshots.
- **Phase 7** — Branches, HEAD, checkout: detached HEAD, rewriting working directory.
- **Phase 8** — Merge: fast-forward vs. three-way merge, common ancestor.
- **Phase 9** — Remotes: clone / fetch / push / pull.
- **Phase 10** — Turn it into a real CLI tool: package.json, bin entry, npm link.
