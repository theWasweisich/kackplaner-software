class UIHandler:
    def info(self, msg: str):
        print(f"INFO: {msg}")

    def success(self, msg: str):
        print(f"SUCCESS: {msg}")

    def error(self, msg: str):
        print(f"ERROR: {msg}")

    def command(self, msg: str):
        print(f"    > {msg}")