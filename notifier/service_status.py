import logging
import subprocess
from enum import Enum, auto

class ServiceStatus(Enum):
    UNKNOWN = auto()
    ACTIVE = auto()
    INACTIVE = auto()
    FAILED = auto()
    ACTIVATING = auto()
    DEACTIVATING = auto()
    MAINTENANCE = auto()
    RELOADING = auto()
    REFRESHING = auto()

def check_service_status(service_name: str) -> ServiceStatus:
    try:
        result = subprocess.run(
            ["systemctl", "is-active", service_name],
            capture_output=True,
            text=True,
            check=False
        )
        status = result.stdout.strip()
        match status:
            case "active":
                return ServiceStatus.ACTIVE
            case "inactive":
                return ServiceStatus.INACTIVE
            case "failed":
                return ServiceStatus.FAILED
            case "activating":
                return ServiceStatus.ACTIVATING
            case "deactivating":
                return ServiceStatus.DEACTIVATING
            case "maintenance":
                return ServiceStatus.MAINTENANCE
            case "reloading":
                return ServiceStatus.RELOADING
            case "refreshing":
                return ServiceStatus.REFRESHING
            case _:
                return ServiceStatus.UNKNOWN

    except Exception as e:
        logging.error(e)

    return ServiceStatus.UNKNOWN