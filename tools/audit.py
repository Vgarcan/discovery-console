#!/usr/bin/env python3
"""Print the real dependency graph between JS modules.

Reports which module owns each top-level name and which modules reference it,
ignoring comments and string literals. Use it after moving code around: a module
that everything depends on, or one that depends on the boot file, is drift.

    python3 tools/audit.py
"""
import collections
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = sorted(glob.glob(os.path.join(ROOT, "src", "js", "*.js")))


def strip(text):
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"\"[^\"\n]*\"|'[^'\n]*'", "", text)


def vocabulary_drift():
    """Every capture type must resolve to a tag its area declares.

    The grid stores the action's tag, the PDD looks tags up, and the two used to
    drift apart silently: a button labelled "Average volume" wrote a tag the PDD
    never searched for, so the field rendered TBC on a live capture while the
    sample session filled it. An action whose label is not a declared tag has to
    name the tag as its third element.
    """
    text = open(os.path.join(ROOT, "src", "js", "01-model.js"), encoding="utf-8").read()
    body = text[text.index("const DEF"):text.index("function tagOf")]
    body = body[body.index("{"):body.rindex("};") + 1]
    areas = json.loads(re.sub(r"(\w+):", r'"\1":', body.rstrip().rstrip(";")))
    out = []
    for area, spec in areas.items():
        declared = set(spec["tags"])
        for action in spec["actions"]:
            tag = action[2] if len(action) > 2 else action[0]
            if tag not in declared:
                out.append("%s: type %r stores tag %r, which the area does not declare"
                           % (area, action[0], tag))
    return out


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

    problems = list(vocabulary_drift())
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
    print("no drift: the model is a leaf, boot is a leaf, every capture type has a declared tag")


if __name__ == "__main__":
    main()
