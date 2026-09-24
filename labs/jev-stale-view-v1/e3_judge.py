"""E3 second labeller: claude-opus-5 with the PROTOCOL.md rubric verbatim. Writes labels/opus.json."""
import json, os, concurrent.futures as cf
import anthropic

RUBRIC = """A statement is stale (1) when it makes a concrete claim about the code in the edited file (its lines, names, values, structure or behaviour) that was true before `edit_diff` and is false after it. Otherwise 0: plans, proposals, runtime observations, claims about other files, and claims still true after the edit. Exclude when the diff alone cannot decide."""

SCHEMA = {
    "type": "object",
    "properties": {
        "reason": {"type": "string"},
        "label": {"type": "string", "enum": ["1", "0", "exclude"]},
    },
    "required": ["reason", "label"],
    "additionalProperties": False,
}

client = anthropic.Anthropic()


def judge(x):
    prompt = (f"You are labelling data for an experiment.\n\n{RUBRIC}\n\n"
              f"<file>{x['path']}</file>\n<edit_diff>\n{x['diff']}\n</edit_diff>\n"
              f"<statement>\n{x['stmt']}\n</statement>\n\n"
              "The statement was written by a coding agent before the edit. Give a one-sentence reason, then the label.")
    r = client.messages.create(
        model="claude-opus-5", max_tokens=2000,
        output_config={"effort": "medium", "format": {"type": "json_schema", "schema": SCHEMA}},
        messages=[{"role": "user", "content": prompt}],
    )
    if r.stop_reason == "refusal":
        return x["id"], {"label": "exclude", "reason": "refusal"}
    text = next(b.text for b in r.content if b.type == "text")
    return x["id"], json.loads(text)


if __name__ == "__main__":
    C = json.load(open("results/e3_cands.json"))
    with cf.ThreadPoolExecutor(6) as ex:
        out = dict(ex.map(judge, C))
    os.makedirs("labels", exist_ok=True)
    json.dump({"labeller": "claude-opus-5", "labels": out}, open("labels/opus.json", "w"), indent=1)
    print("done", len(out))
