from pathlib import Path
from ..builders.base_builder import BaseBuilder
from ..builders.node_builder import NodeBuilder
from ..builders.python_builder import PythonBuilder
from ..core.executor import Executor
from ..core.ui import UIHandler

class Scanner:
    def __init__(self, repo_dir: Path, base_dest: Path, executor: Executor, ui: UIHandler):
        self.repo_dir = repo_dir
        self.base_dest = base_dest
        self.executor = executor
        self.ui = ui

    def _identify_builder(self, folder_path: Path, name: str) -> BaseBuilder | None:
        dest_path = self.base_dest / name

        if (folder_path / 'package.json').exists():
            return NodeBuilder(name, src_dir=folder_path, dest_dir=dest_path, executor=self.executor, ui=self.ui)

        if any(folder_path.glob('*.py')):
            return PythonBuilder(name, folder_path, dest_path, self.executor, self.ui)

        return None

    def get_builders(self, changed_dirs: set[str]) -> list[BaseBuilder]:
        builders = []

        for item in self.repo_dir.iterdir():
            if not item.is_dir() or item.name.startswith("."):
                continue
            if item.name in ['deployer', 'services']:
                continue

            if "all" in changed_dirs or item.name in changed_dirs:
                builder = self._identify_builder(item, item.name)
                if builder:
                    builders.append(builder)
                else:
                    self.ui.info(f"Skipped {item.name}: No recognized component signatures")
        return builders