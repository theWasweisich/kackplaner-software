#!/usr/bin/env python3
import os
import subprocess
import sys
import shutil
from pathlib import Path

# ==========================================
# CONFIGURATION
# ==========================================
APP_NAME = "kackplaner"
APP_USER = "user"

REPO_DIR = Path(__file__).parent.resolve()
BASE_DEST = Path(f'/opt/{APP_NAME}')
MASTER_ENV = Path(f'/opt/{APP_NAME}.env')

ACTIVE_SERVICES = [
    f'{APP_NAME}-backend.service',
    f'{APP_NAME}-frontend.service',
    f'{APP_NAME}-alert.timer',
]

SYSTEMD_UNITS = ACTIVE_SERVICES + [
    f"{APP_NAME}-alert.service"
]

# ==========================================
# CORE UTILITIES
# ==========================================
class DeployError(Exception):
    """Custom exception to halt deployment on command failure."""
    pass

def run_cmd(cmd: list[str], cwd: str | Path | None = None, run_as: str | None = None):
    """Executes a shell command. Raises DeployError if it fails."""
    if run_as:
        cmd = ['sudo', '-u', run_as] + cmd

    print(f"  > {' '.join(cmd)}")
    try:
        subprocess.run(cmd, cwd=cwd, check=True, text=True)
    except subprocess.CalledProcessError as e:
        print(f"\n❌ Command failed with exit code {e.returncode}")
        raise DeployError()

def sync_folder(src_dir: Path, dest_dir: Path, exclude: str | None = None):
    """Creates destination, syncs files via rsync, and sets ownership."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    
    rsync_cmd = ["rsync", "-av", "--delete"]
    if exclude:
        rsync_cmd.append(f"--exclude={exclude}")
    rsync_cmd.extend([f"{src_dir}/", str(dest_dir)])
    
    run_cmd(rsync_cmd)
    run_cmd(['chown', '-R', f"{APP_USER}:{APP_USER}", str(dest_dir)])

def verify_prerequisites():
    get_euid = getattr(os, "geteuid", None)
    if get_euid and get_euid() != 0:
        print("❌ This script must be run as root (use sudo).")
        sys.exit(1)

    if not MASTER_ENV.exists():
        print(f"❌ Master config not found at {MASTER_ENV}")
        sys.exit(1)

def manage_services(action: str):
    """Handles stopping or starting the systemd services."""
    print(f"\n[DEPLOY] {action.capitalize()}ing services...")
    if action == "start":
        run_cmd(['systemctl', 'daemon-reload'])
    run_cmd(['systemctl', action] + ACTIVE_SERVICES)

def deploy_services():
    print("\n[DEPLOY] Deploying systemd services...")
    services_src = REPO_DIR / "services"
    services_dest = BASE_DEST / "services"

    sync_folder(services_src, services_dest)

    for unit_file in SYSTEMD_UNITS:
        unit_path = services_dest / unit_file
        if unit_path.exists():
            run_cmd(['systemctl', 'link', str(unit_path)])

def setup_data_directory():
    print("\n[DEPLOY] Setting up persistent data directory...")
    data_dest = BASE_DEST / 'data'
    data_dest.mkdir(parents=True, exist_ok=True)
    run_cmd(['chown', '-R', f"{APP_USER}:{APP_USER}", str(data_dest)])

def deploy_backend():
    print("\n[DEPLOY] Deploying Backend...")
    backend_dest = BASE_DEST / 'backend'
    
    sync_folder(REPO_DIR / 'backend', backend_dest, exclude="node_modules")
    run_cmd(['npm', 'install'], cwd=backend_dest, run_as=APP_USER)
    run_cmd(['npx', 'tsc'], cwd=backend_dest, run_as=APP_USER)

def deploy_notifier():
    print("\n[DEPLOY] Deploying Notifier...")
    notifier_dest = BASE_DEST / 'notifier'
    
    sync_folder(REPO_DIR / 'notifier', notifier_dest)
    
    alert_script = notifier_dest / 'notify.py'
    if alert_script.exists():
        run_cmd(["chmod", "+x", str(alert_script)])

def deploy_frontend():
    print("\n[DEPLOY] Deploying Frontend...")
    frontend_src = REPO_DIR / 'frontend'
    frontend_env_temp = frontend_src / '.env'
    
    try:
        shutil.copy2(MASTER_ENV, frontend_env_temp)
        run_cmd(['npm', 'install'], cwd=frontend_src)
        run_cmd(['npm', 'run', 'build'], cwd=frontend_src)
        
        sync_folder(frontend_src / 'dist', BASE_DEST / 'frontend' / 'dist')
    finally:
        if frontend_env_temp.exists():
            frontend_env_temp.unlink()
            print("  > Cleaned up temporary frontend .env file")

def reload_display():
    print("\n[DEPLOY] Restarting Chromium display...")
    subprocess.run(['pkill', '-f', 'chromium'], stderr=subprocess.DEVNULL)

def main():
    verify_prerequisites()
    
    try:
        manage_services('stop')
        setup_data_directory()
        
        deploy_backend()
        deploy_notifier()
        deploy_frontend()
        deploy_services()
        
        manage_services('start')
        reload_display()
        
        print("\n✅ Deployment complete!")
    except DeployError:
        print("\n🚨 Deployment aborted due to an error.")
        sys.exit(1)

if __name__ == '__main__':
    main()