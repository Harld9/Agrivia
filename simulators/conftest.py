"""Configuration pytest partagée.

Ajoute les dossiers des simulateurs au `sys.path` afin que les modules
`esp32_logic`, `gateway_logic`, `simulate_esp32` et `simulate_gateway`
soient importables directement dans les tests, comme ils le sont en
production (chaque script est exécuté depuis son propre dossier).
"""

import os
import sys

_ROOT = os.path.dirname(os.path.abspath(__file__))

for _sub in ("esp32", "gateway"):
    _path = os.path.join(_ROOT, _sub)
    if _path not in sys.path:
        sys.path.insert(0, _path)
