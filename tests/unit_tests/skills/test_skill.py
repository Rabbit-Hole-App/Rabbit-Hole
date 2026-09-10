"""Consistency lint for skills/small: the skill's failure mode is rot — code
moves, prose lies. Pin the load-bearing claims to the source so a feature
change that invalidates the skill fails here, not in front of an agent.
Run: pytest tests/unit_tests/skills/test_skill.py
"""

import re

from tests.consts import PROJECT_DIR

SKILL_DIR = PROJECT_DIR / "skills" / "small"
SKILL = (SKILL_DIR / "SKILL.md").read_text(encoding="utf-8")
REFS = {p.name: p.read_text(encoding="utf-8") for p in (SKILL_DIR / "references").glob("*.md")}
ALL_TEXT = SKILL + "".join(REFS.values())
CLI = (PROJECT_DIR / "packages" / "cli" / "bin" / "small.js").read_text(encoding="utf-8")


def test_frontmatter():
    assert SKILL.startswith("---"), "SKILL.md needs YAML frontmatter"
    head = SKILL.split("---")[1]
    assert re.search(r"^name: small$", head, re.M), head
    assert re.search(r"^description: .{20,}", head, re.M), "description missing or too thin to trigger on"


def test_every_pointed_reference_exists_and_none_orphaned():
    pointed = set(re.findall(r"references/([\w-]+\.md)", ALL_TEXT))
    on_disk = set(REFS)
    assert pointed <= on_disk, f"skill points at missing files: {pointed - on_disk}"
    assert on_disk <= pointed, f"orphan reference files nothing points at: {on_disk - pointed}"


def test_every_mentioned_cli_command_exists():
    # commands live as methods on the `const commands = {...}` dispatch object
    body = re.search(r"const commands = \{(.*?)\n\};", CLI, re.S)
    assert body, "commands object missing from small.js"
    commands = set(re.findall(r"^  (?:async )?([\w-]+)\(", body.group(1), re.M))
    assert commands, "no commands parsed from small.js"
    # prose that reads "small <word>" without meaning a command
    not_commands = {"role", "may", "itself", "demo", "and", "already", "app"}
    mentioned = set(re.findall(r"\bsmall ([a-z]+)\b", ALL_TEXT)) - not_commands
    assert mentioned <= commands, f"skill mentions commands small.js does not have: {mentioned - commands}"


def test_input_types_match_the_validator():
    inputs_js = (PROJECT_DIR / "packages" / "cli" / "lib" / "inputs.js").read_text(encoding="utf-8")
    types = re.search(r"TYPES = \[([^\]]+)\]", inputs_js)
    assert types, "TYPES gone from inputs.js"
    for t in re.findall(r"'(\w+)'", types.group(1)):
        assert f"`{t}`" in REFS["jobs.md"], f"jobs.md does not list input type {t}"


def test_mentioned_platform_env_vars_exist_in_source():
    source = ""
    for pkg in ["cli", "runtime", "control-plane", "byoc"]:
        for p in (PROJECT_DIR / "packages" / pkg).rglob("*"):
            if p.suffix in (".js", ".py") and "node_modules" not in p.parts and ".wrangler" not in p.parts:
                source += p.read_text(encoding="utf-8", errors="replace")
    # placeholders like SMALL_INPUT_<NAME> reduce to their literal prefix, and
    # concrete per-app examples (SMALL_INPUT_SOURCE) reduce to the family prefix
    # the runtime builds dynamically
    mentioned = {re.sub(r"(SMALL_INPUT)_[A-Z0-9_]+", r"\1", v) for v in re.findall(r"SMALL_[A-Z0-9_]+", ALL_TEXT)}
    for var in {v.rstrip("_") for v in mentioned}:
        assert var in source, f"skill mentions {var} but no package source contains it"


def test_toml_sections_mentioned_exist_in_the_products_vocabulary():
    # every [section] the skill tells an agent to write must be one the code reads
    known = {"inputs", "outputs", "secrets", "storage", "access", "aws", "deps", "deploy"}
    for section in re.findall(r"^\[(\w+)\]$", ALL_TEXT, re.M):
        assert section in known, f"skill writes [{section}] which nothing implements"
