#!/usr/bin/env node
import { initRepo } from "./commands/init.js";
import { runHashObject } from "./commands/hashObject.js";
import { runCatFile, CatFileMode } from "./commands/catFile.js";
import { runAdd } from "./commands/add.js";
import { runLsFiles } from "./commands/lsFiles.js";
import { runWriteTree } from "./commands/writeTree.js";
import { runLsTree } from "./commands/lsTree.js";
import { runCommitTree } from "./commands/commitTree.js";
import { runCommit } from "./commands/commit.js";
import { runLog } from "./commands/log.js";
import { runStatus } from "./commands/status.js";
import { runDiff } from "./commands/diff.js";
import { runBranch } from "./commands/branch.js";
import { runCheckout } from "./commands/checkout.js";
import { runMerge } from "./commands/merge.js";
import { runRemote } from "./commands/remote.js";
import { runClone } from "./commands/clone.js";
import { runFetch } from "./commands/fetch.js";
import { runPush } from "./commands/push.js";
import { runPull } from "./commands/pull.js";

const VERSION = "0.1.0";
const args = process.argv.slice(2);
const command = args[0];

function printUsage(): void {
  console.log(`mygit version ${VERSION}`);
  console.log("Usage: mygit [--version] [--help] <command> [<args>]\n");
  console.log("These are common mygit commands used in various situations:\n");
  console.log("start a working area");
  console.log("   init       Create an empty Git repository or reinitialize an existing one");
  console.log("   clone      Clone a repository into a new directory\n");
  console.log("work on the current change");
  console.log("   add        Add file contents to the index (staging area)");
  console.log("   status     Show the working tree status");
  console.log("   diff       Show changes between commits, commit and working tree, etc\n");
  console.log("examine the history and state");
  console.log("   log        Show commit logs");
  console.log("   branch     List, create, or delete branches\n");
  console.log("grow, mark and tweak your common history");
  console.log("   commit     Record changes to the repository");
  console.log("   checkout   Switch branches or restore working tree files");
  console.log("   merge      Join two or more development histories together\n");
  console.log("collaborate");
  console.log("   fetch      Download objects and refs from another repository");
  console.log("   pull       Fetch from and integrate with another repository or branch");
  console.log("   push       Update remote refs along with associated objects");
  console.log("   remote     Manage set of tracked repositories\n");
  console.log("low-level plumbing commands");
  console.log("   hash-object  Compute object ID and optionally create a blob from a file");
  console.log("   cat-file     Provide content or type and size information for repository objects");
  console.log("   ls-files     Information about files in the index and the working tree");
  console.log("   write-tree   Create a tree object from the current index");
  console.log("   ls-tree      List the contents of a tree object");
  console.log("   commit-tree  Create a new commit object from a tree OID and parent(s)");
}

function main(): void {
  if (!command || command === "--help" || command === "-h" || command === "help") {
    printUsage();
    process.exit(command ? 0 : 1);
  }

  if (command === "--version" || command === "-v" || command === "version") {
    console.log(`mygit version ${VERSION}`);
    process.exit(0);
  }

  try {
    switch (command) {
      case "init": {
        const targetDir = args[1] || process.cwd();
        const result = initRepo(targetDir);
        if (result.status === "reinitialized") {
          console.log(`Reinitialized existing Git repository in ${result.gitDir}/`);
        } else {
          console.log(`Initialized empty Git repository in ${result.gitDir}/`);
        }
        break;
      }

      case "hash-object": {
        let write = false;
        let filePath = "";

        for (let i = 1; i < args.length; i++) {
          if (args[i] === "-w") {
            write = true;
          } else if (!filePath) {
            filePath = args[i];
          }
        }

        if (!filePath) {
          console.error("fatal: no file specified for hash-object");
          process.exit(1);
        }

        const oid = runHashObject({ filePath, write });
        console.log(oid);
        break;
      }

      case "cat-file": {
        let mode: CatFileMode = "pretty";
        let oid = "";

        for (let i = 1; i < args.length; i++) {
          if (args[i] === "-p") {
            mode = "pretty";
          } else if (args[i] === "-t") {
            mode = "type";
          } else if (args[i] === "-s") {
            mode = "size";
          } else if (!oid) {
            oid = args[i];
          }
        }

        if (!oid) {
          console.error("fatal: no object ID specified for cat-file");
          process.exit(1);
        }

        const output = runCatFile({ oid, mode });
        if (mode === "pretty") {
          process.stdout.write(output);
        } else {
          console.log(output);
        }
        break;
      }

      case "add": {
        const paths = args.slice(1);
        if (paths.length === 0) {
          console.error("fatal: nothing specified, nothing added.");
          process.exit(1);
        }
        runAdd({ paths });
        break;
      }

      case "ls-files": {
        const stage = args.includes("--stage") || args.includes("-s");
        const output = runLsFiles({ stage });
        if (output) {
          console.log(output);
        }
        break;
      }

      case "write-tree": {
        const treeOid = runWriteTree();
        console.log(treeOid);
        break;
      }

      case "ls-tree": {
        const recursive = args.includes("-r");
        const nameOnly = args.includes("--name-only");
        let treeOid = "";

        for (let i = 1; i < args.length; i++) {
          if (!args[i].startsWith("-")) {
            treeOid = args[i];
            break;
          }
        }

        if (!treeOid) {
          console.error("fatal: no tree object specified for ls-tree");
          process.exit(1);
        }

        const output = runLsTree({ treeOid, recursive, nameOnly });
        if (output) {
          console.log(output);
        }
        break;
      }

      case "commit-tree": {
        const treeOid = args[1];
        const parents: string[] = [];
        let message = "";

        for (let i = 2; i < args.length; i++) {
          if (args[i] === "-p" && args[i + 1]) {
            parents.push(args[i + 1]);
            i++;
          } else if (args[i] === "-m" && args[i + 1]) {
            message = args[i + 1];
            i++;
          }
        }

        if (!treeOid) {
          console.error("fatal: no tree object specified for commit-tree");
          process.exit(1);
        }
        if (!message) {
          console.error("fatal: empty commit message");
          process.exit(1);
        }

        const commitOid = runCommitTree({ treeOid, parents, message });
        console.log(commitOid);
        break;
      }

      case "commit": {
        let message = "";

        for (let i = 1; i < args.length; i++) {
          if (args[i] === "-m" && args[i + 1]) {
            message = args[i + 1];
            i++;
          }
        }

        if (!message) {
          console.error("fatal: no commit message given (-m <msg>)");
          process.exit(1);
        }

        const res = runCommit({ message });
        const shortOid = res.commitOid.slice(0, 7);
        const rootLabel = res.isRoot ? " (root-commit)" : "";
        console.log(`[${res.branch}${rootLabel} ${shortOid}] ${message}`);
        break;
      }

      case "log": {
        const oneline = args.includes("--oneline");
        let maxCount: number | undefined = undefined;

        for (let i = 1; i < args.length; i++) {
          if (args[i] === "-n" && args[i + 1]) {
            maxCount = parseInt(args[i + 1], 10);
            i++;
          }
        }

        const output = runLog({ oneline, maxCount });
        if (output) {
          process.stdout.write(output);
        }
        break;
      }

      case "status": {
        const output = runStatus();
        process.stdout.write(output);
        break;
      }

      case "diff": {
        const staged = args.includes("--staged") || args.includes("--cached");
        const output = runDiff({ staged });
        if (output) {
          process.stdout.write(output);
        }
        break;
      }

      case "branch": {
        const deleteIdx = args.indexOf("-d");
        if (deleteIdx !== -1 && args[deleteIdx + 1]) {
          const output = runBranch({ delete: args[deleteIdx + 1] });
          process.stdout.write(output);
        } else if (args[1] && !args[1].startsWith("-")) {
          const output = runBranch({ create: args[1], startPoint: args[2] });
          if (output) process.stdout.write(output);
        } else {
          const output = runBranch({ list: true });
          process.stdout.write(output);
        }
        break;
      }

      case "checkout": {
        const isB = args[1] === "-b";
        const target = isB ? args[2] : args[1];

        if (!target) {
          console.error("fatal: no branch or commit specified for checkout");
          process.exit(1);
        }

        const output = runCheckout({ target, createBranch: isB });
        process.stdout.write(output);
        break;
      }

      case "merge": {
        const targetBranch = args[1];
        if (!targetBranch) {
          console.error("fatal: no branch specified for merge");
          process.exit(1);
        }

        const res = runMerge({ branchName: targetBranch });
        process.stdout.write(res.message);
        break;
      }

      case "remote": {
        if (args[1] === "add") {
          const name = args[2];
          const url = args[3];
          if (!name || !url) {
            console.error("fatal: usage: mygit remote add <name> <url>");
            process.exit(1);
          }
          runRemote({ add: { name, url } });
        } else {
          const verbose = args.includes("-v");
          const output = runRemote({ list: true, verbose });
          if (output) process.stdout.write(output);
        }
        break;
      }

      case "clone": {
        const remotePath = args[1];
        const targetDir = args[2];
        if (!remotePath) {
          console.error("fatal: You must specify a repository to clone.");
          process.exit(1);
        }
        const output = runClone({ remotePath, targetDir });
        process.stdout.write(output);
        break;
      }

      case "fetch": {
        const remoteName = args[1];
        const output = runFetch({ remoteName });
        process.stdout.write(output);
        break;
      }

      case "push": {
        const remoteName = args[1];
        const branchName = args[2];
        const output = runPush({ remoteName, branchName });
        process.stdout.write(output);
        break;
      }

      case "pull": {
        const remoteName = args[1];
        const branchName = args[2];
        const output = runPull({ remoteName, branchName });
        process.stdout.write(output);
        break;
      }

      default: {
        console.error(`mygit: '${command}' is not a mygit command. See 'mygit --help'.`);
        process.exit(1);
      }
    }
  } catch (err: any) {
    console.error(err.message || err);
    process.exit(1);
  }
}

main();
