#!/usr/bin/env python3
"""Print the real dependency graph between JS modules.

Reports which module owns each top-level name and which modules reference it,
ignoring comments and string literals. Use it after moving code around: a module
that everything depends on, or one that depends on the boot file, is drift.

    python3 tools/audit.py
"""
import collections
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = sorted(glob.glob(os.path.join(ROOT, "src", "js", "*.js")))


def strip(text):
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"\"[^\"\n]*\"|'[^'\n]*'", "", text)


def main():
    src = {os.path.basename(f): open(f, encoding="utf-8").read() for f in FILES}
    decl = {
        f: set(re.findall(r"^function (\w+)", t, re.M))
        | set(re.findall(r"^(?:const|let|var) (\w+)", t, re.M))
        for f, t in src.items()
    }

    owner = {}
    for f in sorted(src):
        for name in decl[f]:
            owner.setdefault(name, f)

    deps = {f: set() for f in src}
    for f, text in src.items():
        body = strip(text)
        for name, home in owner.items():
            if home != f and len(name) > 2 and re.search(r"\b" + re.escape(name) + r"\b", body):
                deps[f].add(home)

    used = collections.Counter()
    for f in deps:
        for home in deps[f]:
            used[home] += 1

    print("%-18s %5s %5s  %s" % ("module", "defs", "used", "depends on"))
    for f in sorted(src):
        short = sorted(x.split("-")[0] for x in deps[f])
        print("%-18s %5d %5d  %s" % (f, len(decl[f]), used[f], ", ".join(short) or "-"))

    problems = []
    boot = [f for f in src if "boot" in f]
    for b in boot:
        if used[b]:
            problems.append("%s is depended on by %d modules; boot must be a leaf" % (b, used[b]))
    model = [f for f in src if "model" in f]
    for m in model:
        if deps[m]:
            problems.append("%s depends on %s; the model must depend on nothing" % (m, ", ".join(sorted(deps[m]))))

    print()
    if problems:
        for p in problems:
            print("drift: " + p)
        sys.exit(1)
    print("no drift: the model is a leaf and boot is a leaf")


if __name__ == "__main__":
    main()
