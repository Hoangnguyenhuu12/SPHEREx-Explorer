import json
import sys
from types import SimpleNamespace
from urllib.parse import urlencode

import download_selected_spherex as downloader


def test_503_is_deferred_without_retry(tmp_path, monkeypatch):
    path = 'spherex/dr1/level2/2025W33_1A/test/1/level2_2025W33_1A_0001_1D1_spx_test.fits'
    url = 'https://irsa.ipac.caltech.edu/ibe/cutout?' + urlencode({'path': path})
    urls = tmp_path / 'urls.txt'
    urls.write_text(url + '\n', encoding='utf8')
    monkeypatch.setattr(downloader, 'ROOT', tmp_path)
    monkeypatch.setattr(downloader, 'OUT', tmp_path / 'data' / 'spherex')
    calls = []
    def fail(*args, **kwargs):
        calls.append(args)
        return SimpleNamespace(returncode=22, stderr='curl: (22) The requested URL returned error: 503')
    monkeypatch.setattr(downloader.subprocess, 'run', fail)
    monkeypatch.setattr(sys, 'argv', ['download', '--target', 'barnard', '--url-list', str(urls), '--defer-503'])
    assert downloader.main() == 1
    report = json.loads((tmp_path / 'data/spherex/barnard/selection_report.json').read_text(encoding='utf8'))
    entry = report['files']['2025W33_1A_0001_1_D1']
    assert len(calls) == 1
    assert entry['status'] == 'deferred_503' and entry['selection_url'] == url
