#!/usr/bin/python3
import os
import subprocess
import time
import urllib.request
import logging
from urllib.error import URLError

ENV_FILE = "/opt/kackplaner.env"

def wait_for_wayland(uid: int):
    wayland_socket = f"/run/user/{uid}/wayland-0"

    logging.info(f"[STARTUP] Checking for wayland sockets at {wayland_socket}")

    attempts = 0
    while not os.path.exists(wayland_socket):
        attempts += 1
        logging.info(f"Wayland socket not found (Attempt: {attempts})")
        time.sleep(2)
    logging.info("Wayland socket found.")

def get_target_url():
    """Parse .env file"""
    port = "2222"
    if not os.path.exists(ENV_FILE):
        return f"http://localhost:{port}"

    with open(ENV_FILE, "r") as f:
        for line in f:
            if line.startswith("FRONTEND_PORT="):
                port = line.strip().split("=")[1]
    return f"http://localhost:{port}"

def wait_for_backend(url):
    """Block until the Vite frontend is serving HTTP 200."""
    logging.info(f"Waiting for {url} to come online...")
    while True:
        try:
            response = urllib.request.urlopen(url, timeout=2)
            if response.getcode() == 200:
                logging.info("Frontend is online.")
                return
        except (URLError, TimeoutError):
            pass
        time.sleep(1)

def main():
    uid = os.getuid()
    kiosk_env = os.environ.copy()
    kiosk_env["XDG_RUNTIME_DIR"] = f"/run/user/{uid}"
    kiosk_env["WAYLAND_DISPLAY"] = "wayland-0"
    kiosk_env["DBUS_SESSION_BUS_ADDRESS"] = f"unix:path=/run/user/{uid}/bus"

    target_url = get_target_url()

    chromium_cmd = [
        "chromium",
	"--user-data-dir=/tmp/chromium-profile",
        "--kiosk",
        "--noerrdialogs",
        "--disable-infobars",
        "--no-first-run",
        "--incognito",
        "--ozone-platform=wayland",
        "--enable-features=OverlayScrollbar",
        "--check-for-update-interval=31536000",
        "--disk-cache-dir=/tmp/chromium-cache",
        "--remote-debugging-port=9222",
        target_url
    ]

    logging.info("Chromium CMD: %s", chromium_cmd)

    while True:
        wait_for_backend(target_url)

        subprocess.run(["wlopm", "--on", "*"], env=kiosk_env, stderr=subprocess.DEVNULL)

        logging.info("Launching Chromium...")
        browser_proc = subprocess.Popen(chromium_cmd, env=kiosk_env)

        browser_proc.wait()

        logging.info(f"Chromium exited with code %s. Blacking out screen.", browser_proc.returncode)

        subprocess.run(["wlopm", "--off", "*"], env=kiosk_env, stderr=subprocess.DEVNULL)

        time.sleep(0.5)

if __name__ == "__main__":
    logging.basicConfig()
    logging.debug("Alive!")
    main()
