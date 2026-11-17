import json
import logging
from typing import Optional

from pydantic import BaseModel, ValidationError

class AlertRule(BaseModel):
    message: str
    exact_day: Optional[int] = None
    every: Optional[int] = None
    starting_after: int = 0

    def matches(self, days_since: int) -> bool:
        if self.exact_day is not None:
            return days_since == self.exact_day

        if self.every is not None and days_since >= self.starting_after:
            return (days_since - self.starting_after) % self.every == 0

        return False

class AlertConfig(BaseModel):
    rules: list[AlertRule]

def load_config(config_path: str) -> Optional[AlertConfig]:
    try:
        with open(config_path, "r") as f:
            data = json.load(f)
        return AlertConfig.model_validate(data)
    except FileNotFoundError:
        logging.error(f"Configuration file not found at {config_path}")
    except json.JSONDecodeError as e:
        logging.error(f"Invalid JSON in configuration file: {e}")
    except ValidationError as e:
        logging.error(f"Configuration schema validation failed: {e}")

    return None