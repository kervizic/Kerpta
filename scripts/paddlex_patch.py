# Kerpta - Patch PaddleX GPU compatibility
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 - https://www.gnu.org/licenses/agpl-3.0.html

"""Patch PaddleX pour compatibilite paddlepaddle-gpu recent.

Wrappe tous les appels a .set_optimization_level() dans un try/except
car cette methode n'existe pas dans les versions recentes de PaddlePaddle GPU.
"""

import os
import sys


def patch_paddlex():
    try:
        import paddlex
    except ImportError:
        print("[ERREUR] paddlex non installe")
        return 0

    pkg_dir = os.path.dirname(paddlex.__file__)
    print(f"  Dossier paddlex : {pkg_dir}")

    count = 0
    for root, dirs, files in os.walk(pkg_dir):
        for fname in files:
            if not fname.endswith(".py"):
                continue
            fpath = os.path.join(root, fname)
            try:
                with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
            except Exception:
                continue

            if "set_optimization_level" not in content:
                continue

            # Deja patche ?
            if "# paddlex_gpu_patch" in content:
                print(f"  Deja patche : {fname}")
                continue

            lines = content.split("\n")
            new_lines = []
            changed = False

            for line in lines:
                # Ne patcher que les lignes de CODE (pas commentaires, pas except, pas deja dans un try)
                stripped = line.lstrip()
                if (
                    "set_optimization_level" in line
                    and not stripped.startswith("#")
                    and not stripped.startswith("except")
                    and "try:" not in line
                    and "hasattr" not in line
                ):
                    indent = len(line) - len(stripped)
                    sp = " " * indent
                    new_lines.append(sp + "try:  # paddlex_gpu_patch")
                    new_lines.append(sp + "    " + stripped)
                    new_lines.append(sp + "except AttributeError:")
                    new_lines.append(sp + "    pass  # paddlepaddle-gpu compat")
                    changed = True
                else:
                    new_lines.append(line)

            if changed:
                with open(fpath, "w", encoding="utf-8") as f:
                    f.write("\n".join(new_lines))
                count += 1
                relpath = os.path.relpath(fpath, pkg_dir)
                print(f"  Patche : {relpath}")

    return count


if __name__ == "__main__":
    n = patch_paddlex()
    print(f"  Total : {n} fichier(s) patche(s)")
