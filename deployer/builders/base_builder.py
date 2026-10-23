from abc import ABC, abstractmethod
from pathlib import Path

from ..core.executor import Executor
from ..core.ui import UIHandler
from ..config import Path, APP_USER

class BaseBuilder(ABC):
    def __init__(self, name: str, src_dir: Path, dest_dir: Path, executor: Executor, ui: UIHandler):
        self.name = name
        self.src_dir = src_dir
        self.dest_dir = dest_dir
        self.executor = executor
        self.ui = ui

    @abstractmethod
    def build(self):
        pass

    @abstractmethod
    def deploy(self):
        pass

    def sync_files(self, source: Path, exclude: list[str] | None = None):
        self.dest_dir.mkdir(parents=True, exist_ok=True)
        self.ui.info(f"Syncing {self.name} to {self.dest_dir}")

        rsync_cmd = ['rsync', '-av', '--delete']
        if exclude:
            for excluded in exclude:
                rsync_cmd.append(f"--exclude={excluded}")
        rsync_cmd.extend([f"{source}/", str(self.dest_dir)])

        self.executor.run(rsync_cmd)
        self.executor.run(['chown', '-R', f"{APP_USER}:{APP_USER}", str(self.dest_dir)])