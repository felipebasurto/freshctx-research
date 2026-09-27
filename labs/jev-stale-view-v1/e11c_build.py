"""E11c items: the E11 items plus a whole-repository workspace, an investigation topic that does not ask the question, and a real unified diff for the notice arm. See PROTOCOL-E11c.md.

Downloads each repository at its base commit into .work/e11c_repos/<id>/ (GitHub codeload tarball) and checks that the file there equals E11's `before`.
"""
import difflib, hashlib, io, json, os, shutil, tarfile, time, urllib.request

# Author-written before any E11c model call: what to investigate, without asking the E11 question.
TOPICS = {
    "e11-00": "Review how the helpers in this file validate and normalise the `shotnum` argument.",
    "e11-01": "Explain what `_remove_names` does and how `schema_as_dict` uses it.",
    "e11-02": "Explain how the `Event` class dispatches updates to its listeners.",
    "e11-03": "Summarise what the `Submission` class does with the attributes it receives from the API.",
    "e11-04": "Summarise how this file parses, fixes and sorts requirement lines.",
    "e11-05": "Explain how the parser handles index definitions and their per-column parameters.",
    "e11-06": "Explain how the parser handles generated or computed column definitions.",
    "e11-07": "Summarise how the Containerfile steps for the Ansible configuration and the galaxy stage are generated.",
    "e11-08": "Explain how readline history and completion are set up in this file.",
    "e11-09": "Explain how the code decides when redundant parentheses can be removed.",
    "e11-10": "Explain what `maybe_reset_index` does for each kind of input.",
    "e11-15": "Explain how `remote_path` values are computed and used in this file.",
    "e11-17": "Explain how the `systemctl list-sockets` output is parsed in this file.",
    "e11-18": "Explain which input types `get_bytes` accepts and how it reads each of them.",
    "e11-20": "Summarise which filesystem methods `DirFileSystem` wraps, and how it wraps them.",
    "e11-21": "Explain how `inject` writes the sampling flag and the related B3 headers to the carrier.",
    "e11-22": "Explain how the `name` property of an instance is computed.",
    "e11-23": "Explain how the port is handled when a URL is built or modified.",
    "e11-24": "Explain how the lexer tokenises literals and special characters.",
}

items = json.load(open("results/e11_items.json"))
assert set(TOPICS) == {it["id"] for it in items}
os.makedirs(".work/e11c_repos", exist_ok=True)
out = []
for it in items:
    dest = f".work/e11c_repos/{it['id']}"
    if not os.path.isdir(dest):
        data = None
        url = f"https://codeload.github.com/{it['repo']}/tar.gz/{it['base_commit']}"
        for attempt in range(5):
            try:
                data = urllib.request.urlopen(url, timeout=120).read()
                break
            except Exception as error:
                if attempt == 4:
                    raise
                print("retry", it["id"], error)
                time.sleep(5)
        tmp = dest + ".tmp"
        shutil.rmtree(tmp, ignore_errors=True)
        with tarfile.open(fileobj=io.BytesIO(data)) as tar:
            members = [m for m in tar.getmembers() if (m.isfile() or m.isdir()) and ".." not in m.name.split("/") and not m.name.startswith("/")]
            tar.extractall(tmp, members=members)
        (top,) = os.listdir(tmp)
        os.rename(os.path.join(tmp, top), dest)
        shutil.rmtree(tmp)
    on_disk = open(os.path.join(dest, it["rel"]), encoding="utf-8", newline="").read()
    assert on_disk == it["before"], it["id"]
    files = sum(len(f) for _, _, f in os.walk(dest))
    diff = "".join(difflib.unified_diff(it["before"].splitlines(True), it["after"].splitlines(True), f"a/{it['rel']}", f"b/{it['rel']}", n=3))
    out.append(dict(it, topic=TOPICS[it["id"]], repo_dir=dest, repo_files=files, file_diff=diff))
    print(it["id"], it["repo"], files, "files")

json.dump(out, open("results/e11c_items.json", "w"), indent=1, ensure_ascii=False)
print("items", len(out), "sha256", hashlib.sha256(open("results/e11c_items.json", "rb").read()).hexdigest())
