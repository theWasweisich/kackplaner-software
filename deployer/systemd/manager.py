import subprocess
from pathlib import Path
from ..core.executor import Executor
from ..core.ui import UIHandler


class SystemdManager:
    def __init__(self, repo_dir: Path, base_dest: Path, executor: Executor, ui: UIHandler):
        self.repo_dir = repo_dir
        self.base_dest = base_dest
        self.executor = executor
        self.ui = ui

        self.services_src = self.repo_dir / "services"
        self.services_dest = self.base_dest / "services"

    def _get_unit_files(self) -> list[Path]:
        if not self.services_src.is_dir():
            return []
        return [f for f in self.services_src.iterdir() if f.suffix in ('.service', '.timer')]

    def stop_services(self):
        units = self._get_unit_files()
        if not units:
            return

        self.ui.info("Stopping systemd services...")
        for unit in units:
            self.ui.command(f"systemctl stop {unit.name}")
            if not self.executor.dry_run:
                subprocess.run(['systemctl', 'stop', unit.name], stderr=subprocess.DEVNULL)

    def deploy_and_link(self):
        units = self._get_unit_files()
        if not units:
            return

        self.ui.info("Deploying systemd configurations...")
        self.services_dest.mkdir(parents=True, exist_ok=True)
        self.executor.run(['rsync', '-av', '--delete', f"{self.services_src}/", str(self.services_dest)])

        for unit in units:
            dest_path = self.services_dest / unit.name
            self.executor.run(['systemctl', 'link', str(dest_path)])

        self.executor.run(['systemctl', 'daemon-reload'])

    def start_services(self):
        units = self._get_unit_files()
        if not units:
            return

        self.ui.info("Starting systemd services...")
        unit_names = [unit.name for unit in units]
        self.executor.run(['systemctl', 'start'] + unit_names)