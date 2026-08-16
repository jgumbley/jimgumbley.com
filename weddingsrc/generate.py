#!/usr/bin/env python3
"""Validate and build the static Grace & James wedding site."""

from __future__ import annotations

import argparse
import copy
import hashlib
import html
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import shutil
import struct
import sys
import tempfile
from datetime import date, datetime
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "weddingsrc"
OUTPUT = ROOT / "wedding"
MANIFEST = SOURCE / "manifest.json"
SCHEMA = SOURCE / "manifest.schema.json"
TEMPLATE = SOURCE / "page.html"
STATIC = SOURCE / "static"
STATIC_FILES = (
    "wedding.css",
    "assets/botanical-frame.svg",
    "assets/botanical-divider.svg",
    "assets/flower-favicon.svg",
    "assets/favicon-32.png",
    "assets/apple-touch-icon.png",
    "assets/social-preview.svg",
    "assets/social-preview.png",
)
CONTROLLED = ("index.html", "manifest.json", *STATIC_FILES)
ID_PATTERN = re.compile(r"^[a-z][a-z0-9-]*$")
DISPLAY_TIME_PATTERN = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")
HTML_LIKE = re.compile(r"<[^>]*>")
TEMPLATE_MARKER = re.compile(r"{{[A-Z_]+}}")
CONTROL_CHAR = re.compile(r"[\x00-\x1f\x7f]")


class BuildError(Exception):
    pass


def fail(path: str, message: str) -> None:
    raise BuildError(f"{path}: {message}")


def read_json(path: Path, label: str) -> tuple[dict, bytes]:
    try:
        raw = path.read_bytes()
        text = raw.decode("utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        raise BuildError(f"{label}: cannot read UTF-8 JSON: {exc}") from exc
    try:
        value = json.loads(text)
    except json.JSONDecodeError as exc:
        raise BuildError(f"{label}: invalid JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}") from exc
    if not isinstance(value, dict):
        fail("$", "must be an object")
    return value, raw


def closed(value: object, path: str, required: set[str], optional: set[str] = frozenset()) -> dict:
    if not isinstance(value, dict):
        fail(path, "must be an object")
    missing = sorted(required - value.keys())
    if missing:
        fail(path, f"missing required key {missing[0]!r}")
    unknown = sorted(value.keys() - required - optional)
    if unknown:
        fail(f"{path}.{unknown[0]}", "unknown key")
    return value


def text(value: object, path: str) -> str:
    if not isinstance(value, str) or not value.strip():
        fail(path, "must be a non-empty string")
    if HTML_LIKE.search(value):
        fail(path, "must not contain HTML-like content")
    return value


def text_list(value: object, path: str, minimum: int = 1) -> list[str]:
    if not isinstance(value, list) or len(value) < minimum:
        fail(path, f"must be an array with at least {minimum} item(s)")
    return [text(item, f"{path}[{index}]") for index, item in enumerate(value)]


def https_url(value: object, path: str) -> str:
    value = text(value, path)
    if value.startswith("//") or CONTROL_CHAR.search(value):
        fail(path, "must be an absolute HTTPS URL without control characters")
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.netloc or not parsed.hostname:
        fail(path, "must be an absolute HTTPS URL with a host")
    if parsed.username is not None or parsed.password is not None:
        fail(path, "must not contain credentials")
    return value


def validate_link(value: object, path: str) -> dict:
    link = closed(value, path, {"label", "href"})
    text(link["label"], f"{path}.label")
    https_url(link["href"], f"{path}.href")
    return link


def validate_links(value: object, path: str) -> list[dict]:
    if not isinstance(value, list) or not value:
        fail(path, "must be a non-empty array")
    return [validate_link(item, f"{path}[{index}]") for index, item in enumerate(value)]


def validate_manifest(data: dict) -> None:
    closed(data, "$", {"schemaVersion", "site", "event", "sections", "footer"})
    if type(data["schemaVersion"]) is not int or data["schemaVersion"] != 1:
        fail("$.schemaVersion", "must be the supported version 1")

    site = closed(data["site"], "$.site", {
        "language", "title", "documentTitle", "description", "canonicalUrl", "robots",
        "themeColor", "socialPreview",
    })
    for key in ("language", "title", "documentTitle", "description", "robots", "themeColor"):
        text(site[key], f"$.site.{key}")
    https_url(site["canonicalUrl"], "$.site.canonicalUrl")
    social = closed(site["socialPreview"], "$.site.socialPreview", {
        "title", "description", "imageUrl", "imageAlt", "imageType", "imageWidth", "imageHeight",
    })
    for key in ("title", "description", "imageAlt"):
        text(social[key], f"$.site.socialPreview.{key}")
    https_url(social["imageUrl"], "$.site.socialPreview.imageUrl")
    if social["imageType"] != "image/png":
        fail("$.site.socialPreview.imageType", "must be 'image/png'")
    if social["imageWidth"] != 1200 or type(social["imageWidth"]) is not int:
        fail("$.site.socialPreview.imageWidth", "must be 1200")
    if social["imageHeight"] != 630 or type(social["imageHeight"]) is not int:
        fail("$.site.socialPreview.imageHeight", "must be 630")

    event = closed(data["event"], "$.event", {"date", "dateDisplay", "timezone", "ceremonyVenue"})
    for key in ("dateDisplay", "timezone", "ceremonyVenue"):
        text(event[key], f"$.event.{key}")
    try:
        event_date = date.fromisoformat(text(event["date"], "$.event.date"))
    except ValueError as exc:
        fail("$.event.date", f"invalid ISO date: {exc}")
    try:
        timezone = ZoneInfo(event["timezone"])
    except ZoneInfoNotFoundError:
        fail("$.event.timezone", "unknown IANA timezone")

    sections = data["sections"]
    if not isinstance(sections, list) or len(sections) < 2:
        fail("$.sections", "must contain at least the hero and closing sections")
    types = [section.get("type") if isinstance(section, dict) else None for section in sections]
    if types[0] != "hero" or types.count("hero") != 1:
        fail("$.sections", "must contain exactly one hero as the first section")
    if types[-1] != "closing" or types.count("closing") != 1:
        fail("$.sections", "must contain exactly one closing as the last section")

    ids = {"main-content"}
    previous_instant: datetime | None = None
    for index, section_value in enumerate(sections):
        path = f"$.sections[{index}]"
        if not isinstance(section_value, dict):
            fail(path, "must be an object")
        kind = section_value.get("type")
        common = {"id", "type"}
        optional_nav = {"navLabel"}
        if kind == "hero":
            section = closed(section_value, path, common | {"eyebrow", "title", "date", "venue"})
            for key in ("eyebrow", "title"):
                text(section[key], f"{path}.{key}")
            date_value = closed(section["date"], f"{path}.date", {"display", "datetime"})
            text(date_value["display"], f"{path}.date.display")
            try:
                hero_date = date.fromisoformat(text(date_value["datetime"], f"{path}.date.datetime"))
            except ValueError as exc:
                fail(f"{path}.date.datetime", f"invalid ISO date: {exc}")
            if hero_date != event_date:
                fail(f"{path}.date.datetime", "must match $.event.date")
            venue = closed(section["venue"], f"{path}.venue", {"label", "name"})
            text(venue["label"], f"{path}.venue.label")
            text(venue["name"], f"{path}.venue.name")
        elif kind == "timeline":
            section = closed(section_value, path, common | {"heading", "items"}, optional_nav | {"note"})
            text(section["heading"], f"{path}.heading")
            items = section["items"]
            if not isinstance(items, list) or not items:
                fail(f"{path}.items", "must be a non-empty array")
            for item_index, item_value in enumerate(items):
                item_path = f"{path}.items[{item_index}]"
                item = closed(item_value, item_path, {"time", "datetime", "text"})
                display_time = text(item["time"], f"{item_path}.time")
                if not DISPLAY_TIME_PATTERN.fullmatch(display_time):
                    fail(f"{item_path}.time", "must use 24-hour HH:MM format")
                text(item["text"], f"{item_path}.text")
                try:
                    instant = datetime.fromisoformat(text(item["datetime"], f"{item_path}.datetime"))
                except ValueError as exc:
                    fail(f"{item_path}.datetime", f"invalid ISO date-time: {exc}")
                if instant.tzinfo is None or instant.utcoffset() is None:
                    fail(f"{item_path}.datetime", "must include a timezone offset")
                if instant.astimezone(timezone).date() != event_date:
                    fail(f"{item_path}.datetime", "falls outside the event's local calendar date")
                if instant.astimezone(timezone).strftime("%H:%M") != display_time:
                    fail(f"{item_path}.time", "must match the local time in datetime")
                if previous_instant is not None and instant <= previous_instant:
                    fail(f"{item_path}.datetime", "timeline items must be in chronological order")
                previous_instant = instant
            if "note" in section:
                text(section["note"], f"{path}.note")
        elif kind == "venues":
            section = closed(section_value, path, common | {"heading", "items", "note"}, optional_nav | {"intro"})
            text(section["heading"], f"{path}.heading")
            text(section["note"], f"{path}.note")
            if "intro" in section:
                text(section["intro"], f"{path}.intro")
            items = section["items"]
            if not isinstance(items, list) or len(items) < 2:
                fail(f"{path}.items", "must contain at least two venues")
            for item_index, item_value in enumerate(items):
                item_path = f"{path}.items[{item_index}]"
                item = closed(
                    item_value, item_path, {"label", "name", "addressLines", "timingNote"}, {"links"}
                )
                for key in ("label", "name", "timingNote"):
                    text(item[key], f"{item_path}.{key}")
                text_list(item["addressLines"], f"{item_path}.addressLines")
                if "links" in item:
                    validate_links(item["links"], f"{item_path}.links")
        elif kind == "cards":
            section = closed(section_value, path, common | {"heading", "items"}, optional_nav | {"intro"})
            text(section["heading"], f"{path}.heading")
            if "intro" in section:
                text(section["intro"], f"{path}.intro")
            items = section["items"]
            if not isinstance(items, list) or not items:
                fail(f"{path}.items", "must be a non-empty array")
            for item_index, item_value in enumerate(items):
                item_path = f"{path}.items[{item_index}]"
                item = closed(item_value, item_path, {"heading", "body"}, {"links"})
                text(item["heading"], f"{item_path}.heading")
                text_list(item["body"], f"{item_path}.body")
                if "links" in item:
                    validate_links(item["links"], f"{item_path}.links")
        elif kind == "callout":
            section = closed(
                section_value, path, common | {"heading", "body"},
                optional_nav | {"variant", "eyebrow", "link", "tagline"},
            )
            text(section["heading"], f"{path}.heading")
            text_list(section["body"], f"{path}.body")
            for key in ("eyebrow", "tagline"):
                if key in section:
                    text(section[key], f"{path}.{key}")
            if "variant" in section and section["variant"] not in {"gift", "photo"}:
                fail(f"{path}.variant", "must be 'gift' or 'photo'")
            if "link" in section:
                validate_link(section["link"], f"{path}.link")
        elif kind == "closing":
            section = closed(section_value, path, common | {"heading"}, optional_nav)
            text(section["heading"], f"{path}.heading")
        else:
            fail(f"{path}.type", "unknown section type")

        section_id = text(section["id"], f"{path}.id")
        if not ID_PATTERN.fullmatch(section_id):
            fail(f"{path}.id", "must match ^[a-z][a-z0-9-]*$")
        if section_id == "main-content":
            fail(f"{path}.id", "is reserved by the document shell")
        if section_id in ids:
            fail(f"{path}.id", "duplicate document ID")
        ids.add(section_id)
        if "navLabel" in section:
            text(section["navLabel"], f"{path}.navLabel")

    footer = closed(data["footer"], "$.footer", {"text"})
    text(footer["text"], "$.footer.text")


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def paragraphs(items: list[str]) -> str:
    return "\n".join(f"      <p>{esc(item)}</p>" for item in items)


def render_links(items: list[dict] | None) -> str:
    if not items:
        return ""
    links = "\n".join(
        f'          <li><a href="{esc(item["href"])}">{esc(item["label"])}</a></li>' for item in items
    )
    return f'''        <ul class="detail-links">
{links}
        </ul>'''


def divider() -> str:
    return '    <img class="botanical-divider" src="./assets/botanical-divider.svg" alt="" aria-hidden="true">'


def render_hero(section: dict) -> str:
    return f'''<header class="hero ornate-panel" id="{esc(section['id'])}">
    <div class="hero__content">
      <p class="eyebrow">{esc(section['eyebrow'])}</p>
      <h1>{esc(section['title'])}</h1>
      <time class="hero__date" datetime="{esc(section['date']['datetime'])}">{esc(section['date']['display'])}</time>
      <p class="hero__venue"><span>{esc(section['venue']['label'])}</span> · {esc(section['venue']['name'])}</p>
    </div>
  </header>'''


def render_timeline(section: dict) -> str:
    rows = "\n".join(
        f'''      <li>
        <time datetime="{esc(item['datetime'])}">{esc(item['time'])}</time>
        <span>{esc(item['text'])}</span>
      </li>''' for item in section["items"]
    )
    note = f'    <p class="section-note">{esc(section["note"])}</p>' if section.get("note") else ""
    return f'''<section class="site-section timeline-section" id="{esc(section['id'])}">
    <h2>{esc(section['heading'])}</h2>
{divider()}
    <ol class="timeline">
{rows}
    </ol>
{note}
  </section>'''


def render_venues(section: dict) -> str:
    cards = []
    for item in section["items"]:
        address = "<br>\n          ".join(esc(line) for line in item["addressLines"])
        cards.append(f'''      <article class="detail-card venue-card">
        <p class="card-label">{esc(item['label'])}</p>
        <h3>{esc(item['name'])}</h3>
        <address>{address}</address>
        <p class="timing-note">{esc(item['timingNote'])}</p>
{render_links(item.get('links'))}
      </article>''')
    intro = f'    <p class="section-intro">{esc(section["intro"])}</p>' if section.get("intro") else ""
    return f'''<section class="site-section" id="{esc(section['id'])}">
    <h2>{esc(section['heading'])}</h2>
{divider()}
{intro}
    <div class="venue-grid">
{chr(10).join(cards)}
    </div>
    <p class="section-note">{esc(section['note'])}</p>
  </section>'''


def render_cards(section: dict) -> str:
    cards = []
    for item in section["items"]:
        cards.append(f'''      <article class="detail-card">
        <h3>{esc(item['heading'])}</h3>
{paragraphs(item['body'])}
{render_links(item.get('links'))}
      </article>''')
    intro = f'    <p class="section-intro">{esc(section["intro"])}</p>' if section.get("intro") else ""
    return f'''<section class="site-section" id="{esc(section['id'])}">
    <h2>{esc(section['heading'])}</h2>
{divider()}
{intro}
    <div class="card-grid card-grid--{len(section['items'])}">
{chr(10).join(cards)}
    </div>
  </section>'''


def render_callout(section: dict) -> str:
    variant = f" callout--{section['variant']}" if section.get("variant") else ""
    eyebrow = f'    <p class="eyebrow">{esc(section["eyebrow"])}</p>\n' if section.get("eyebrow") else ""
    link = ""
    if section.get("link"):
        link = f'''    <p class="callout__action"><a href="{esc(section['link']['href'])}">{esc(section['link']['label'])}</a></p>'''
    tagline = f'    <p class="tagline">{esc(section["tagline"])}</p>' if section.get("tagline") else ""
    return f'''<section class="site-section callout{variant}" id="{esc(section['id'])}">
{eyebrow}    <h2>{esc(section['heading'])}</h2>
{divider()}
{paragraphs(section['body'])}
{link}
{tagline}
  </section>'''


def render_closing(section: dict) -> str:
    return f'''<section class="closing ornate-panel" id="{esc(section['id'])}">
    <h2>{esc(section['heading'])}</h2>
  </section>'''


RENDERERS = {
    "hero": render_hero,
    "timeline": render_timeline,
    "venues": render_venues,
    "cards": render_cards,
    "callout": render_callout,
    "closing": render_closing,
}


def render(data: dict) -> bytes:
    try:
        shell = TEMPLATE.read_text(encoding="utf-8")
    except OSError as exc:
        raise BuildError(f"weddingsrc/page.html: cannot read template: {exc}") from exc
    rendered = [RENDERERS[section["type"]](section) for section in data["sections"]]
    nav_items = [section for section in data["sections"] if section.get("navLabel")]
    nav_links = "\n".join(
        f'      <li><a href="#{esc(section["id"])}">{esc(section["navLabel"])}</a></li>'
        for section in nav_items
    )
    nav = f'''<nav class="page-nav" aria-label="Wedding information">
    <ul>
{nav_links}
    </ul>
  </nav>'''
    social = data["site"]["socialPreview"]
    replacements = {
        "LANG": data["site"]["language"],
        "DOCUMENT_TITLE": data["site"]["documentTitle"],
        "DESCRIPTION": data["site"]["description"],
        "ROBOTS": data["site"]["robots"],
        "THEME_COLOR": data["site"]["themeColor"],
        "CANONICAL_URL": data["site"]["canonicalUrl"],
        "OG_LOCALE": data["site"]["language"].replace("-", "_"),
        "SITE_TITLE": data["site"]["title"],
        "OG_TITLE": social["title"],
        "OG_DESCRIPTION": social["description"],
        "OG_IMAGE": social["imageUrl"],
        "OG_IMAGE_TYPE": social["imageType"],
        "OG_IMAGE_WIDTH": social["imageWidth"],
        "OG_IMAGE_HEIGHT": social["imageHeight"],
        "OG_IMAGE_ALT": social["imageAlt"],
        "HERO": rendered[0],
        "NAV": nav,
        "CONTENT": "\n    ".join(rendered[1:]),
        "FOOTER": data["footer"]["text"],
    }
    for marker, value in replacements.items():
        shell = shell.replace("{{" + marker + "}}", value if marker in {"HERO", "NAV", "CONTENT"} else esc(value))
    if TEMPLATE_MARKER.search(shell):
        raise BuildError("weddingsrc/page.html: unresolved template marker")
    return (shell.rstrip() + "\n").encode("utf-8")


def png_info(path: Path) -> tuple[int, int, int]:
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise BuildError(f"{path}: cannot read PNG: {exc}") from exc
    if len(raw) < 33 or raw[:8] != b"\x89PNG\r\n\x1a\n" or raw[12:16] != b"IHDR":
        raise BuildError(f"{path}: invalid PNG signature or IHDR")
    width, height, _, colour_type = struct.unpack(">IIBB", raw[16:26])
    return width, height, colour_type


def check_svg(path: Path, require_square: bool = False) -> None:
    try:
        root = ET.parse(path).getroot()
    except (OSError, ET.ParseError) as exc:
        raise BuildError(f"{path}: invalid SVG XML: {exc}") from exc
    view_box = root.attrib.get("viewBox", "").split()
    if len(view_box) != 4:
        raise BuildError(f"{path}: SVG must have an explicit viewBox")
    if require_square and float(view_box[2]) != float(view_box[3]):
        raise BuildError(f"{path}: favicon SVG viewBox must be square")
    banned = {"script", "foreignObject", "image", "animate", "set"}
    for element in root.iter():
        tag = element.tag.rsplit("}", 1)[-1]
        if tag in banned:
            raise BuildError(f"{path}: forbidden SVG element <{tag}>")
        for name, value in element.attrib.items():
            local_name = name.rsplit("}", 1)[-1]
            if local_name.lower().startswith("on"):
                raise BuildError(f"{path}: forbidden SVG event attribute {local_name}")
            if local_name == "href" and value and not value.startswith("#"):
                raise BuildError(f"{path}: SVG href must be a local fragment")
            if "url(" in value and not re.search(r"url\(\s*['\"]?#", value):
                raise BuildError(f"{path}: SVG url() must reference a local fragment")
        if element.text and "@import" in element.text:
            raise BuildError(f"{path}: SVG CSS imports are forbidden")


class DocumentInspector(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.ids: list[str] = []
        self.fragments: list[str] = []
        self.anchors: list[str] = []
        self.resources: list[str] = []
        self.h1_count = 0
        self.tags: list[str] = []
        self.metas: dict[tuple[str, str], list[str]] = {}
        self.links: list[dict[str, str]] = []

    def handle_starttag(self, tag: str, attrs_value: list[tuple[str, str | None]]) -> None:
        attrs = {name: value or "" for name, value in attrs_value}
        self.tags.append(tag)
        if "id" in attrs:
            self.ids.append(attrs["id"])
        if tag == "h1":
            self.h1_count += 1
        if tag == "a" and attrs.get("href"):
            self.anchors.append(attrs["href"])
            if attrs["href"].startswith("#"):
                self.fragments.append(attrs["href"][1:])
        if tag in {"img", "script", "iframe", "source"} and attrs.get("src"):
            self.resources.append(attrs["src"])
        if tag == "link":
            self.links.append(attrs)
            resource_rels = {"stylesheet", "icon", "apple-touch-icon"}
            if attrs.get("href") and resource_rels.intersection(attrs.get("rel", "").split()):
                self.resources.append(attrs["href"])
        if tag == "meta":
            for key in ("property", "name", "http-equiv"):
                if attrs.get(key):
                    self.metas.setdefault((key, attrs[key]), []).append(attrs.get("content", ""))


def safe_local_path(base: Path, value: str, label: str) -> Path:
    if value.startswith(("/", "//")) or "\\" in value:
        raise BuildError(f"{label}: local path must be relative")
    parts = Path(value.split("#", 1)[0].split("?", 1)[0]).parts
    if not parts or ".." in parts:
        raise BuildError(f"{label}: local path must not contain '..'")
    candidate = (base / Path(*parts)).resolve()
    if base.resolve() not in (candidate, *candidate.parents):
        raise BuildError(f"{label}: local path escapes wedding output")
    return candidate


def check_tree(folder: Path, data: dict, manifest_raw: bytes, expected_html: bytes) -> None:
    for relative in CONTROLLED:
        if not (folder / relative).is_file():
            raise BuildError(f"wedding/{relative}: required output file is missing")
    if (folder / "manifest.json").read_bytes() != manifest_raw:
        raise BuildError("wedding/manifest.json: differs from weddingsrc/manifest.json")
    html_bytes = (folder / "index.html").read_bytes()
    if html_bytes != expected_html:
        raise BuildError("wedding/index.html: generated output is stale or non-deterministic")
    html_text = html_bytes.decode("utf-8")
    if not html_text.startswith("<!doctype html>\n<!-- Generated from weddingsrc/manifest.json"):
        raise BuildError("wedding/index.html: missing generated-file comment after doctype")
    if TEMPLATE_MARKER.search(html_text):
        raise BuildError("wedding/index.html: contains an unresolved template marker")
    if re.search(r"\[\s*(?:Name|phone number)\s*\]", html_text, re.I):
        raise BuildError("wedding/index.html: contains an unfinished contact placeholder")

    inspector = DocumentInspector()
    inspector.feed(html_text)
    if inspector.h1_count != 1:
        raise BuildError("wedding/index.html: must contain exactly one h1")
    if inspector.ids.count("main-content") != 1:
        raise BuildError("wedding/index.html: must contain one main-content target")
    if len(inspector.ids) != len(set(inspector.ids)):
        raise BuildError("wedding/index.html: contains duplicate IDs")
    for fragment in inspector.fragments:
        if inspector.ids.count(fragment) != 1:
            raise BuildError(f"wedding/index.html: fragment #{fragment} does not resolve exactly once")
    for href in inspector.anchors:
        if not href.startswith("#"):
            https_url(href, "wedding/index.html anchor href")
    positions = [html_text.find(f'id="{section["id"]}"') for section in data["sections"]]
    if any(position < 0 for position in positions) or positions != sorted(positions):
        raise BuildError("wedding/index.html: sections are not rendered in manifest order")
    if "script" in inspector.tags or "iframe" in inspector.tags:
        raise BuildError("wedding/index.html: scripts and iframes are forbidden")
    if any("manifest" in link.get("rel", "").split() for link in inspector.links):
        raise BuildError("wedding/index.html: content manifest must not be linked as a web app manifest")
    for resource in inspector.resources:
        if urlsplit(resource).scheme or resource.startswith("//"):
            raise BuildError(f"wedding/index.html: remote resource is forbidden: {resource}")
        path = safe_local_path(folder, resource, "wedding/index.html")
        if not path.is_file():
            raise BuildError(f"wedding/index.html: missing local resource {resource}")

    social = data["site"]["socialPreview"]
    expected_meta = {
        ("property", "og:type"): "website",
        ("property", "og:locale"): data["site"]["language"].replace("-", "_"),
        ("property", "og:site_name"): data["site"]["title"],
        ("property", "og:title"): social["title"],
        ("property", "og:description"): social["description"],
        ("property", "og:url"): data["site"]["canonicalUrl"],
        ("property", "og:image"): social["imageUrl"],
        ("property", "og:image:secure_url"): social["imageUrl"],
        ("property", "og:image:type"): social["imageType"],
        ("property", "og:image:width"): str(social["imageWidth"]),
        ("property", "og:image:height"): str(social["imageHeight"]),
        ("property", "og:image:alt"): social["imageAlt"],
        ("name", "twitter:card"): "summary_large_image",
    }
    for key, value in expected_meta.items():
        if inspector.metas.get(key) != [value]:
            raise BuildError(f"wedding/index.html: metadata {key[1]} must appear exactly once with the manifest value")
    https_url(data["site"]["canonicalUrl"], "$.site.canonicalUrl")
    https_url(social["imageUrl"], "$.site.socialPreview.imageUrl")

    css = (folder / "wedding.css").read_text(encoding="utf-8")
    if "@import" in css:
        raise BuildError("wedding/wedding.css: CSS imports are forbidden")
    for match in re.finditer(r"url\(\s*(['\"]?)(.*?)\1\s*\)", css, re.I):
        value = match.group(2)
        if value.startswith("data:"):
            continue
        path = safe_local_path(folder, value, "wedding/wedding.css")
        if not path.is_file():
            raise BuildError(f"wedding/wedding.css: missing local resource {value}")

    for name in ("botanical-frame.svg", "botanical-divider.svg", "flower-favicon.svg", "social-preview.svg"):
        check_svg(folder / "assets" / name, require_square=name == "flower-favicon.svg")
    for name, dimensions in {
        "favicon-32.png": (32, 32),
        "apple-touch-icon.png": (180, 180),
        "social-preview.png": (1200, 630),
    }.items():
        width, height, colour_type = png_info(folder / "assets" / name)
        if (width, height) != dimensions:
            raise BuildError(f"wedding/assets/{name}: must be {dimensions[0]} x {dimensions[1]}")
        if name != "favicon-32.png" and colour_type in {4, 6}:
            raise BuildError(f"wedding/assets/{name}: must be opaque")
    if (folder / "assets/social-preview.png").stat().st_size > 500 * 1024:
        raise BuildError("wedding/assets/social-preview.png: must not exceed 500 KiB")


def stage_site(data: dict, manifest_raw: bytes, destination: Path) -> bytes:
    expected_html = render(data)
    (destination / "assets").mkdir(parents=True, exist_ok=True)
    (destination / "index.html").write_bytes(expected_html)
    (destination / "manifest.json").write_bytes(manifest_raw)
    for relative in STATIC_FILES:
        source = STATIC / relative
        if not source.is_file():
            raise BuildError(f"weddingsrc/static/{relative}: required source asset is missing")
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    check_tree(destination, data, manifest_raw, expected_html)
    return expected_html


def digest_tree(folder: Path) -> dict[str, str]:
    return {relative: hashlib.sha256((folder / relative).read_bytes()).hexdigest() for relative in CONTROLLED}


def install(data: dict, manifest_raw: bytes) -> None:
    stage = Path(tempfile.mkdtemp(prefix=".wedding-stage-", dir=ROOT))
    try:
        stage_site(data, manifest_raw, stage)
        OUTPUT.mkdir(exist_ok=True)
        (OUTPUT / "assets").mkdir(exist_ok=True)
        for relative in CONTROLLED:
            os.replace(stage / relative, OUTPUT / relative)
    finally:
        shutil.rmtree(stage, ignore_errors=True)


def check(data: dict, manifest_raw: bytes) -> None:
    schema, _ = read_json(SCHEMA, "weddingsrc/manifest.schema.json")
    if schema.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
        raise BuildError("weddingsrc/manifest.schema.json: must declare JSON Schema Draft 2020-12")
    expected_html = render(data)
    check_tree(OUTPUT, data, manifest_raw, expected_html)
    first = Path(tempfile.mkdtemp(prefix=".wedding-check-a-", dir=ROOT))
    second = Path(tempfile.mkdtemp(prefix=".wedding-check-b-", dir=ROOT))
    try:
        stage_site(data, manifest_raw, first)
        stage_site(data, manifest_raw, second)
        if digest_tree(first) != digest_tree(second):
            raise BuildError("wedding: two unchanged builds produced different output")
        before = digest_tree(OUTPUT)
        invalid = copy.deepcopy(data)
        invalid["sections"][0]["id"] = "main-content"
        try:
            validate_manifest(invalid)
        except BuildError as exc:
            if "$.sections[0].id" not in str(exc):
                raise BuildError("negative validation check did not report a useful field path") from exc
        else:
            raise BuildError("negative validation check accepted a reserved document ID")
        if digest_tree(OUTPUT) != before:
            raise BuildError("invalid input changed the last valid generated site")
    finally:
        shutil.rmtree(first, ignore_errors=True)
        shutil.rmtree(second, ignore_errors=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="validate the built site without replacing it")
    args = parser.parse_args()
    try:
        data, manifest_raw = read_json(MANIFEST, "weddingsrc/manifest.json")
        validate_manifest(data)
        if args.check:
            check(data, manifest_raw)
            print("Wedding site checks passed.")
        else:
            install(data, manifest_raw)
            print("Wedding site generated in wedding/.")
    except BuildError as exc:
        print(f"wedding build failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
