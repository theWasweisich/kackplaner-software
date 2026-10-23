from ..builders.base_builder import BaseBuilder

class PythonBuilder(BaseBuilder):
    def build(self):
        self.ui.info(f"No compilation required for python component: {self.name}")

    def deploy(self):
        self.sync_files(self.src_dir)
        self.ui.info(f"Setting executable permissions for {self.name} scripts")
        for script in self.dest_dir.rglob('*.py'):
            self.executor.run(['chmod', '+x', str(script)])