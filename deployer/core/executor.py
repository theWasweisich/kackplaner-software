import subprocess
from pathlib import Path
from .ui import UIHandler

class DeployError(Exception):
    pass

class Executor:
    def __init__(self, ui: UIHandler, dry_run: bool = False):
        self.ui = ui
        self.dry_run = dry_run

    def run(self, cmd: list[str], cwd: str | Path | None = None, run_as: str | None = None):
        if run_as:
            cmd = ['sudo', '-u', run_as] + cmd

        self.ui.command(' '.join(cmd))

        if self.dry_run:
            return

        try:
            subprocess.run(cmd, cwd=cwd, check=True, text=True)
        except subprocess.CalledProcessError as e:
            self.ui.error(f"Command failed. Exit code: {e.returncode}")
            raise DeployError()