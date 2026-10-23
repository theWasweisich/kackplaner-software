import subprocess
from pathlib import Path
from ..core.ui import UIHandler

class GitTracker:
    def __init__(self, repo_dir: Path, state_file: Path, ui: UIHandler):
        self.repo_dir = repo_dir
        self.state_file = state_file
        self.ui = ui

    def get_current_commit(self) -> str:
        try:
            return subprocess.check_output(
                ['git', 'rev-parse', 'HEAD'],
                cwd=self.repo_dir,
                text=True,
                stderr=subprocess.DEVNULL
            ).strip()
        except subprocess.CalledProcessError:
            self.ui.error("Failed to retrieve current git commit")
            return ""

    def get_changed_dirs(self, current_commit: str) -> set[str]:
        if not current_commit:
            return {"all"}

        if not self.state_file.exists():
            self.ui.info("No previous deployment found. Doing full deployment.")
            return {"all"}

        last_commit = self.state_file.read_text().strip()

        try:
            diff = subprocess.check_output(
                ['git', 'diff', '--name-only', last_commit, current_commit],
                cwd=self.repo_dir,
                text=True,
                stderr=subprocess.DEVNULL
            )
        except subprocess.CalledProcessError:
            self.ui.info("Git diff failed. Doing full deployment.")
            return {"all"}

        changed = set()
        for line in diff.strip().split('\n'):
            if not line:
                continue

            if '/' not in line or line.startswith('deployer/'):
                self.ui.info(f"Core file modified ({line}). Doing full deployment.")
                return {"all"}

            changed.add(line.split('/')[0])

        return changed

    def save_state(self, commit: str):
        if commit:
            self.state_file.write_text(commit)