"""A scripted Mini-SWE-Agent model that records every request it is sent (offline harness only)."""

import json
import os

from minisweagent.models.test_models import DeterministicToolcallModel


class RecordingModel(DeterministicToolcallModel):
    def query(self, messages, **kwargs):
        with open(os.environ["RECORDING_MODEL_LOG"], "a", encoding="utf-8") as handle:
            handle.write(json.dumps([{k: v for k, v in m.items() if k != "extra"} for m in messages]) + "\n")
        return super().query(messages, **kwargs)
