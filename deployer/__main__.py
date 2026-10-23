#!/usr/bin/env python3
import os
import sys
import subprocess

# Configuration
from config import REPO_DIR, BASE_DEST, MASTER_ENV, APP_USER

# Core Engine
from core.ui import UIHandler
from core.executor import Executor, DeployError
from core.git_tracker import GitTracker

# Domain Managers
from discovery.scanner import Scanner
from systemd.manager import SystemdManager


def verify_prerequisites(ui: UIHandler):
    get_euid = getattr(os, "geteuid", None)
    if get_euid and get_euid() != 0:
        ui.error("This script must be run as root (use sudo).")
        sys.exit(1)

    if not MASTER_ENV.exists():
        ui.error(f"Master config not found at {MASTER_ENV}")
        sys.exit(1)


def setup_data_directory(executor: Executor):
    data_dest = BASE_DEST / 'data'
    data_dest.mkdir(parents=True, exist_ok=True)
    executor.run(['chown', '-R', f"{APP_USER}:{APP_USER}", str(data_dest)])


def reload_display(ui: UIHandler):
    ui.info("Restarting Chromium display...")
    subprocess.run(['pkill', '-f', 'chromium'], stderr=subprocess.DEVNULL)


def main():
    ui = UIHandler()

    # Check for CLI flags
    dry_run = "--dry-run" in sys.argv
    if dry_run:
        ui.info("Running in DRY RUN mode. Commands will be logged but not executed.")

    # 1. Dependency Injection
    executor = Executor(ui=ui, dry_run=dry_run)
    verify_prerequisites(ui)

    # 2. State Tracking
    state_file = BASE_DEST / '.last_commit'
    tracker = GitTracker(repo_dir=REPO_DIR, state_file=state_file, ui=ui)

    current_commit = tracker.get_current_commit()
    changed_dirs = tracker.get_changed_dirs(current_commit)

    if not changed_dirs:
        ui.success("No changes detected. Everything is up to date.")
        return

    ui.info(f"Deployment targets: {', '.join(changed_dirs)}")

    systemd = SystemdManager(repo_dir=REPO_DIR, base_dest=BASE_DEST, executor=executor, ui=ui)
    scanner = Scanner(repo_dir=REPO_DIR, base_dest=BASE_DEST, executor=executor, ui=ui)

    try:
        # 3. Stop running processes
        systemd.stop_services()
        setup_data_directory(executor)

        # 4. Discover and Build Components dynamically
        builders = scanner.get_builders(changed_dirs)
        for builder in builders:
            builder.build()
            builder.deploy()

        # 5. Handle Systemd updates
        if "all" in changed_dirs or "services" in changed_dirs:
            systemd.deploy_and_link()

        # 6. Restart processes
        systemd.start_services()

        # 7. Post-deployment hooks
        if "all" in changed_dirs or "frontend" in changed_dirs:
            reload_display(ui)

        # 8. Finalize
        if not dry_run:
            tracker.save_state(current_commit)

        ui.success("Deployment complete!")

    except DeployError:
        ui.error("Deployment aborted due to an execution error.")
        sys.exit(1)
    except KeyboardInterrupt:
        ui.error("Deployment cancelled by user.")
        sys.exit(1)


if __name__ == '__main__':
    main()