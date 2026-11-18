import sys
from pathlib import Path

# ml/ is a flat scripts directory (not a package), put it on the path so
# tests can `import preprocess`.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
