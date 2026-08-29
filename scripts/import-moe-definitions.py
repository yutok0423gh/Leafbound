#!/usr/bin/env python3
"""Build Leafbound's local Chinese-definition subset from the official MOE XLSX.

The source dictionary is CC BY-ND 3.0 TW. Definitions are copied verbatim apart
from decoding Excel's newline escape and normalizing line endings. Do not edit,
summarize, translate, or convert the extracted entries.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path
from xml.etree.ElementTree import iterparse


SPREADSHEET_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
SOURCE_URL_TEMPLATE = (
    "https://language.moe.gov.tw/001/Upload/Files/site_content/"
    "M0001/respub/download/dict_revised_{version}.zip"
)
SOURCE_PAGE = (
    "https://language.moe.gov.tw/001/Upload/Files/site_content/"
    "M0001/respub/index.html"
)
DICTIONARY_URL = "https://dict.revised.moe.edu.tw/"
LICENSE_URL = "https://creativecommons.org/licenses/by-nd/3.0/tw/"
USAGE_GUIDE_URL = (
    "https://language.moe.gov.tw/001/Upload/Files/site_content/"
    "M0001/respub/reviseddict_10312.pdf"
)


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract unchanged MOE Chinese definitions for Leafbound's local terms."
    )
    parser.add_argument("xlsx", type=Path, help="Official dict_revised_*.xlsx file")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/moe-revised-definitions.json"),
        help="Generated JSON destination",
    )
    parser.add_argument(
        "--words",
        type=Path,
        default=Path("data/words-hk-wordslist.json"),
        help="Leafbound words.hk pronunciation payload",
    )
    parser.add_argument(
        "--characters",
        type=Path,
        default=Path("data/rime-cantonese-chars.json"),
        help="Leafbound Rime Cantonese character payload",
    )
    return parser.parse_args()


def load_targets(*payload_paths: Path) -> set[str]:
    targets: set[str] = set()
    for path in payload_paths:
        with path.open(encoding="utf-8") as handle:
            payload = json.load(handle)
        targets.update(str(term).strip() for term in payload.get("entries", {}) if str(term).strip())
    return targets


def shared_strings(archive: zipfile.ZipFile) -> list[str]:
    values: list[str] = []
    with archive.open("xl/sharedStrings.xml") as source:
        for _, element in iterparse(source, events=("end",)):
            if element.tag != f"{SPREADSHEET_NS}si":
                continue
            values.append(
                "".join(
                    node.text or ""
                    for node in element.iter(f"{SPREADSHEET_NS}t")
                )
            )
            element.clear()
    return values


def column_number(reference: str) -> int:
    letters = re.match(r"[A-Z]+", reference or "")
    if not letters:
        return -1
    value = 0
    for character in letters.group(0):
        value = value * 26 + ord(character) - 64
    return value - 1


def cell_text(cell, strings: list[str]) -> str:
    value_node = cell.find(f"{SPREADSHEET_NS}v")
    if value_node is None or value_node.text is None:
        inline = cell.find(f"{SPREADSHEET_NS}is")
        if inline is None:
            return ""
        return "".join(node.text or "" for node in inline.iter(f"{SPREADSHEET_NS}t"))
    if cell.attrib.get("t") == "s":
        return strings[int(value_node.text)]
    return value_node.text


def spreadsheet_rows(archive: zipfile.ZipFile, strings: list[str]):
    with archive.open("xl/worksheets/sheet1.xml") as source:
        for _, element in iterparse(source, events=("end",)):
            if element.tag != f"{SPREADSHEET_NS}row":
                continue
            row: dict[int, str] = {}
            for cell in element.findall(f"{SPREADSHEET_NS}c"):
                index = column_number(cell.attrib.get("r", ""))
                if index >= 0:
                    row[index] = cell_text(cell, strings)
            yield row
            element.clear()


def decode_excel_text(value: str) -> str:
    return (
        str(value or "")
        .replace("_x000D_\r\n", "\n")
        .replace("_x000D_\n", "\n")
        .replace("_x000D_", "\n")
        .replace("\r\n", "\n")
        .replace("\r", "\n")
        .strip()
    )


def source_version(path: Path) -> str:
    match = re.search(r"dict_revised_(\d+_\d+)", path.name)
    if not match:
        raise ValueError("The official source filename must contain its dictionary version.")
    return match.group(1)


def main() -> None:
    options = arguments()
    targets = load_targets(options.words, options.characters)
    definitions: dict[str, list[str]] = {}

    with zipfile.ZipFile(options.xlsx) as archive:
        strings = shared_strings(archive)
        rows = spreadsheet_rows(archive, strings)
        header = next(rows)
        columns = {decode_excel_text(value): index for index, value in header.items()}
        for required in ("字詞名", "釋義"):
            if required not in columns:
                raise ValueError(f"Official worksheet is missing the {required} column.")

        term_column = columns["字詞名"]
        definition_column = columns["釋義"]
        for row in rows:
            term = decode_excel_text(row.get(term_column, ""))
            if term not in targets:
                continue
            definition = decode_excel_text(row.get(definition_column, ""))
            if not definition:
                continue
            term_definitions = definitions.setdefault(term, [])
            if definition not in term_definitions:
                term_definitions.append(definition)

    ordered_entries = {term: definitions[term] for term in sorted(definitions)}
    digest = hashlib.sha256(options.xlsx.read_bytes()).hexdigest()
    version = source_version(options.xlsx)
    payload = {
        "meta": {
            "source": "中華民國教育部《重編國語辭典修訂本》",
            "version": version,
            "license": "CC BY-ND 3.0 TW",
            "attribution": (
                "中華民國教育部（Ministry of Education, R.O.C.）。"
                f"《重編國語辭典修訂本》（版本編號：{version}）"
            ),
            "sourceUrl": SOURCE_PAGE,
            "dictionaryUrl": DICTIONARY_URL,
            "downloadUrl": SOURCE_URL_TEMPLATE.format(version=version),
            "licenseUrl": LICENSE_URL,
            "usageGuideUrl": USAGE_GUIDE_URL,
            "sourceSha256": digest,
            "entries": len(ordered_entries),
            "targetTerms": len(targets),
            "transformation": (
                "Exact headword subset matched to Leafbound's local pronunciation terms; "
                "definitions remain unchanged apart from decoding Excel newline escapes."
            ),
        },
        "entries": ordered_entries,
    }
    options.output.parent.mkdir(parents=True, exist_ok=True)
    options.output.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(
        f"Wrote {len(ordered_entries):,} unchanged Chinese-definition entries "
        f"to {options.output} ({options.output.stat().st_size:,} bytes)."
    )


if __name__ == "__main__":
    main()
