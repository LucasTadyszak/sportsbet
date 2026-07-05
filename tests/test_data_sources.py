import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import data_sources


class DataSourcesParsingTests(unittest.TestCase):
    def test_extract_team_name_falls_back_when_payload_is_missing(self):
        self.assertEqual(data_sources.extract_team_name(None), "TBD")
        self.assertEqual(data_sources.extract_team_name({}), "TBD")
        self.assertEqual(data_sources.extract_team_name({"name": "Arsenal"}), "Arsenal")
        self.assertEqual(data_sources.extract_team_name({"team": {"name": "Chelsea"}}), "Chelsea")


if __name__ == "__main__":
    unittest.main()
