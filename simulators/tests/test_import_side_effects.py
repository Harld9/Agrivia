"""Vérifie que l'import des scripts principaux n'a AUCUN effet de bord.

Importer `simulate_esp32` ou `simulate_gateway` ne doit ni ouvrir de
connexion réseau, ni démarrer de boucle. La boucle est protégée par
`if __name__ == "__main__":`.
"""

import subprocess
import sys


def _import_in_subprocess(module_dir, module_name):
    """Importe `module_name` dans un sous-processus avec un court timeout.

    Si l'import démarrait une boucle infinie, le sous-processus ne se
    terminerait jamais et `subprocess.run` lèverait `TimeoutExpired`.
    """
    return subprocess.run(
        [sys.executable, "-c", f"import {module_name}"],
        cwd=module_dir,
        capture_output=True,
        text=True,
        timeout=15,
    )


def _repo_subdir(name):
    import os
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), name)


def test_import_simulate_esp32_has_no_side_effects():
    result = _import_in_subprocess(_repo_subdir("esp32"), "simulate_esp32")
    assert result.returncode == 0, (
        f"L'import de simulate_esp32 a échoué :\nstdout={result.stdout}\nstderr={result.stderr}"
    )


def test_import_simulate_gateway_has_no_side_effects():
    result = _import_in_subprocess(_repo_subdir("gateway"), "simulate_gateway")
    assert result.returncode == 0, (
        f"L'import de simulate_gateway a échoué :\nstdout={result.stdout}\nstderr={result.stderr}"
    )
