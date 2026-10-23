from pathlib import Path

APP_NAME = "kackplaner"
APP_USER = "user"

REPO_DIR = Path(__file__).parent.parent.resolve()
BASE_DEST = Path(f'/opt/{APP_NAME}')
MASTER_ENV = Path(f'/opt/{APP_NAME}.env')