import json
import shutil
from ..builders.base_builder import BaseBuilder
from ..config import MASTER_ENV

class NodeBuilder(BaseBuilder):
    def build(self):
        self.ui.info(f"Building Node.js component: {self.name}...")
        package_json = self.src_dir / 'package.json'
        env_tmp = self.src_dir / '.env'

        if MASTER_ENV.exists():
            shutil.copy2(MASTER_ENV, env_tmp)

        try:
            self.executor.run(['npm', 'install'], cwd=self.src_dir)

            with open(package_json) as f:
                scripts = json.load(f).get('scripts', {})

            if 'build' in scripts:
                self.executor.run(['npm', 'run', 'build'], cwd=self.src_dir)
            elif (self.src_dir / 'tsconfig.json').exists():
                self.executor.run(['npx', 'tsc'], cwd=self.src_dir)
        finally:
            if env_tmp.exists():
                env_tmp.unlink()

    def deploy(self):
        dist_dir = self.src_dir / 'dist'

        if dist_dir.exists():
            self.sync_files(dist_dir)
        else:
            self.sync_files(self.src_dir, exclude=["node_modules"])