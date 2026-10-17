#!/usr/bin/env python3
"""Import the approved TORSH website brief into the editable site content model.

Run from the website folder:
  python tools/refresh_from_brief.py path/to/TORSH_Website_Content_and_Codex_Brief.docx

The importer is intentionally conservative: public copy is taken only from LIVE
COPY sections and category-level product pages remain availability-neutral.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from docx import Document


ROOT = Path(__file__).resolve().parents[1]
CONTENT_PATH = ROOT / "content" / "site-content.json"


def value_after(text: str, label: str) -> str:
    if not text.startswith(label):
        return ""
    return text[len(label):].strip("  —")


def field_value(items: list[dict], label: str) -> str:
    for item in items:
        value = value_after(item["text"], label)
        if value:
            return value
    return ""


def route_slug(route: str) -> str:
    return route.strip().strip("/").split("/")[-1]


def split_cta(value: str) -> tuple[str, str]:
    parts = [x.strip() for x in value.split("→", 1)]
    return (parts[0], parts[1] if len(parts) > 1 else "/contact")


def clean_heading(value: str) -> str:
    return value.replace(" — LIVE COPY", "").strip()


def paragraphs_between(items: list[dict], heading: str) -> list[str]:
    found = False
    result: list[str] = []
    for item in items:
        if item["style"].startswith("Heading 3"):
            current = clean_heading(item["text"])
            if found:
                break
            found = current == heading
            continue
        if found and item["style"] == "Normal" and item["text"]:
            result.append(item["text"])
    return result


def bullets_between(items: list[dict], heading: str) -> list[str]:
    found = False
    result: list[str] = []
    for item in items:
        if item["style"].startswith("Heading 3"):
            current = clean_heading(item["text"])
            if found:
                break
            found = current == heading
            continue
        if found and item["style"].startswith("List Bullet") and item["text"]:
            result.append(item["text"])
    return result


def faq_between(items: list[dict]) -> list[dict]:
    entries = paragraphs_between(items, "Frequently asked questions")
    faqs = []
    for entry in entries:
        match = re.match(r"(.+?\?)\s{2,}(.+)", entry)
        if match:
            faqs.append({"question": match.group(1), "answer": match.group(2)})
        else:
            faqs.append({"question": entry, "answer": "Confirm against the selected model and its approved documentation."})
    return faqs


def section_groups(paragraphs: list[dict], prefix: str, stop_heading: str) -> list[list[dict]]:
    groups: list[list[dict]] = []
    current: list[dict] | None = None
    for item in paragraphs:
        if item["style"] == "Heading 1" and item["text"].startswith(stop_heading):
            if current:
                groups.append(current)
            break
        if item["style"] == "Heading 2" and re.match(prefix, item["text"]):
            if current:
                groups.append(current)
            current = [item]
        elif current is not None:
            current.append(item)
    return groups


def parse_families(paragraphs: list[dict]) -> list[dict]:
    icon_map = {
        "single-use-flexible-ureteroscopes": "endoscopy",
        "single-use-flexible-cystoscopes": "endoscopy",
        "ureteral-access-sheaths": "access-and-suction",
        "suction-ureteral-access-sheaths": "access-and-suction",
        "stone-retrieval-baskets": "stone-retrieval",
        "urology-guidewires": "guidewires",
        "double-j-ureteral-stents": "ureteral-stents",
    }
    family_groups = section_groups(paragraphs, r"7\.\d+\s+", "08 ")
    families = []
    for index, items in enumerate(family_groups, 1):
        route = field_value(items, "Route")
        slug = route_slug(route)
        cta_label, cta_path = split_cta(field_value(items, "Primary CTA"))
        eyebrow = field_value(items, "Eyebrow — LIVE COPY")
        family = {
            "id": slug,
            "slug": slug,
            "num": f"{index:02d}",
            "status": "category_only",
            "availability": False,
            "icon": icon_map[slug],
            "name": field_value(items, "H1 — LIVE COPY"),
            "eyebrow": eyebrow,
            "category": eyebrow.split("/")[0].strip().title(),
            "hero": field_value(items, "Hero line — LIVE COPY"),
            "seoTitle": field_value(items, "SEO title"),
            "metaDescription": field_value(items, "Meta description"),
            "overview": " ".join(paragraphs_between(items, "Overview")),
            "why": " ".join(paragraphs_between(items, "Why the details matter")),
            "intendedContext": " ".join(paragraphs_between(items, "Typical clinical context")),
            "selectionChecks": bullets_between(items, "Specification questions"),
            "faqs": faq_between(items),
            "relatedText": field_value(items, "Related content"),
            "cta": {"label": cta_label, "path": cta_path},
        }
        families.append(family)
    if len(families) != 7:
        raise ValueError(f"Expected 7 product families, found {len(families)}")
    return families


def parse_solutions(paragraphs: list[dict]) -> list[dict]:
    groups = section_groups(paragraphs, r"8\.\d+\s+", "09 ")
    icon_map = ["endoscopy", "endoscopy", "stone-retrieval"]
    solutions = []
    for index, items in enumerate(groups):
        route = field_value(items, "Route")
        cta_label, cta_path = split_cta(field_value(items, "CTA"))
        body = [x["text"] for x in items if x["style"] == "Normal" and x["text"]]
        solutions.append({
            "slug": route_slug(route),
            "route": route,
            "icon": icon_map[index],
            "seoTitle": field_value(items, "SEO title"),
            "metaDescription": field_value(items, "Meta description"),
            "h1": field_value(items, "H1 — LIVE COPY"),
            "body": body,
            "relatedText": field_value(items, "Relevant product links"),
            "cta": {"label": cta_label, "path": cta_path},
        })
    if len(solutions) != 3:
        raise ValueError(f"Expected 3 solution pages, found {len(solutions)}")
    return solutions


def parse_articles(paragraphs: list[dict]) -> list[dict]:
    groups = section_groups(paragraphs, r"10\.\d+\s+", "11 ")
    icon_by_category = {
        "Ureteroscopy & RIRS": "endoscopy",
        "Device Selection": "catalogue",
        "Access & Fluid Management": "access-and-suction",
        "Retrieval & Navigation": "stone-retrieval",
        "Urology Innovation": "innovation",
    }
    articles = []
    for items in groups:
        route = field_value(items, "Route")
        category = field_value(items, "Category")
        cta_label, cta_path = split_cta(field_value(items, "CTA — LIVE COPY"))
        sections = []
        active: dict | None = None
        for item in items:
            if item["style"] == "Heading 3":
                if active:
                    sections.append(active)
                active = {"heading": clean_heading(item["text"]), "paragraphs": []}
            elif active and item["style"] == "Normal" and item["text"]:
                active["paragraphs"].append(item["text"])
        if active:
            sections.append(active)
        articles.append({
            "id": route_slug(route),
            "slug": route_slug(route),
            "status": "editorial_review",
            "icon": icon_by_category.get(category, "research"),
            "category": category,
            "seoTitle": field_value(items, "SEO title"),
            "metaDescription": field_value(items, "Meta description"),
            "excerpt": field_value(items, "Excerpt — LIVE COPY"),
            "title": field_value(items, "H1 — LIVE COPY"),
            "readingTime": f"{max(4, len(sections) + 1)} min read",
            "sections": sections,
            "editorialReferences": field_value(items, "Endnote / editorial references"),
            "cta": {"label": cta_label, "path": cta_path},
        })
    if len(articles) != 6:
        raise ValueError(f"Expected 6 insight articles, found {len(articles)}")
    return articles


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: refresh_from_brief.py BRIEF.docx", file=sys.stderr)
        return 2
    brief = Path(sys.argv[1]).resolve()
    document = Document(brief)
    paragraphs = [{"style": p.style.name, "text": p.text.strip()} for p in document.paragraphs]
    content = json.loads(CONTENT_PATH.read_text(encoding="utf-8"))

    content["version"] = "4.0"
    content["company"].update({
        "tagline": "Built around the procedure. Driven by clinical insight.",
        "descriptor": "Clinician-informed endourology and medical-device innovation.",
        "header_note": ["Precision.", "Integration.", "Responsible progress."],
    })
    content["status"].update({
        "portfolio": "Category overview · availability by enquiry",
        "portfolio_notice": "This page explains a device category for professional discussion. Availability, features, intended use and regulatory status depend on the selected model and its approved documentation.",
        "footer": "Product-category information is for professional discussion. Availability, features, intended use and regulatory status are model-specific.",
    })
    content["nav"] = [
        {"label": "Home", "path": "index.html"},
        {"label": "About", "path": "about.html"},
        {"label": "Urology Products", "path": "products/index.html"},
        {"label": "Insights", "path": "insights/index.html"},
        {"label": "Contact", "path": "contact.html"},
    ]

    content["home"].update({
        "title": "TORSH Medical Technologies | Clinician-Led Endourology",
        "meta": "Explore TORSH Medical Technologies, a clinician-led MedTech company focused on endourology devices, surgical consumables and translational innovation.",
        "eyebrow": "TORSH Medical Technologies",
        "headline": ["Urology technology", "shaped by clinical need."],
        "lead": "We are building a focused portfolio of endourology devices and advancing medical-device innovation informed by the realities of surgical practice. From visualization and access to navigation, retrieval and drainage, our work begins with the procedure.",
        "stage": "Category-led information. Product details verified model by model.",
        "visual_note": ["Endourology.", "Connected systems.", "Responsible evidence."],
        "principles": [
            {"icon": "clinician", "title": "Observe the procedure", "text": "Start with specific clinical tasks, constraints and unmet needs."},
            {"icon": "innovation", "title": "Understand the system", "text": "Evaluate dimensions, compatibility, handling and workflow together."},
            {"icon": "evidence", "title": "Validate before claiming", "text": "Let testing, documentation and regulation define what can be stated."},
        ],
        "work": {
            "eyebrow": "Urology products",
            "heading": "A focused view of the devices behind endoscopy.",
            "text": "Seven product families organized by procedural function, with category-level information for clinicians, hospitals and technical partners.",
        },
        "focus": {
            "eyebrow": "A connected approach",
            "heading": "The right technology is more than a device.",
            "text": "A flexible scope must work with its processor. An access sheath must fit the intended endoscopic workflow. A retrieval basket must be compatible with the working channel. TORSH looks at these interfaces together so product conversations are clearer for clinical and procurement teams.",
        },
        "purpose": {
            "eyebrow": "Who we work with",
            "heading": "For care teams—and the people behind their devices.",
            "text": "We engage with urologists evaluating technique-related needs, hospitals comparing device fit and supply requirements, and partners working on product development or commercialization.",
            "link": "How TORSH approaches development",
            "principles": [
                {"icon": "clinician", "label": "Clinical teams"},
                {"icon": "quality", "label": "Hospitals & procurement"},
                {"icon": "partnerships", "label": "Technical partners"},
            ],
        },
        "insights": {
            "eyebrow": "Insights",
            "heading": "Practical perspectives from the endourology workflow.",
            "text": "Device-selection questions, system interfaces and engineering topics written for specialist readers.",
        },
        "connect": {
            "heading": "Discuss an endourology requirement.",
            "text": "Tell us what procedure or product family you are evaluating. We will review the details and identify the appropriate next conversation.",
            "link": "Start a conversation",
        },
    })

    content["about"].update({
        "title": "About TORSH | Clinician-Led Medical Technology",
        "meta": "Learn about TORSH Medical Technologies and its focus on clinically informed endourology products, surgical workflows and responsible medical-device innovation.",
        "eyebrow": "About TORSH",
        "heading": "Built around practical clinical problems.",
        "lead": "TORSH Medical Technologies is a clinician-led MedTech company working at the intersection of surgical practice, biomedical engineering and device commercialization.",
        "intro": {
            "eyebrow": "Our perspective",
            "heading": "Understand the device in the context of the procedure.",
            "paragraphs": [
                "Our initial focus is endourology—a specialty where visualization, access, navigation, retrieval and drainage must function together inside tightly constrained anatomy.",
                "We ask how devices fit, how they are handled, which procedural interfaces matter and what evidence is needed to support each claim.",
                "Commercial product information is published only with verified supporting documentation. Investigational concepts remain clearly separated from clinical availability.",
            ],
        },
        "approach": {
            "eyebrow": "Our approach",
            "heading": "Clinical insight. Engineering discipline. Responsible commercialization.",
            "steps": [
                {"icon": "clinician", "title": "Clinically informed", "text": "Begin with specific needs observed during diagnosis and treatment rather than assuming a long feature list translates into better care."},
                {"icon": "innovation", "title": "Technically deliberate", "text": "Evaluate the interfaces between scopes, access systems, guidewires, retrieval instruments and the rest of the workflow."},
                {"icon": "evidence", "title": "Evidence conscious", "text": "Progress from design and bench evaluation to appropriate testing and regulatory review before making performance or clinical claims."},
            ],
        },
        "model": {
            "eyebrow": "What we are building",
            "heading": "A focused portfolio with a separate innovation track.",
            "paragraphs": [
                "TORSH is developing a focused urology product portfolio intended to address practical needs in endoscopic procedures.",
                "In parallel, the company is advancing investigational technology arising from clinical problem identification and iterative biomaterial research. The two paths remain distinct in both status and public communication.",
            ],
        },
        "stage": {
            "heading": "Mission and direction",
            "text": "Our mission is to develop and enable access to thoughtful medical-device solutions that address practical challenges encountered by surgical teams.",
        },
    })

    content["portfolio"].update({
        "title": "Urology Products & Endourology Focus | TORSH",
        "meta": "Explore TORSH’s endourology product focus: flexible scopes, access sheaths, suction-enabled access, stone baskets, guidewires and ureteral stents.",
        "eyebrow": "Urology products",
        "heading": "A focused view of the devices behind endoscopic urology.",
        "lead": "TORSH organizes its urology focus by procedural function so clinicians and procurement teams can explore relevant product families without navigating a general-purpose catalogue. Individual models, configurations and availability are subject to confirmation.",
        "group_heading": "Seven product families. One connected workflow.",
        "group_text": "These pages provide neutral category explanations and the questions worth confirming before a procurement decision. They are not TORSH SKU data sheets.",
        "faq_heading": "How to use this catalogue",
        "faqs": [
            {"question": "Are these products available to order?", "answer": "Availability is not assumed. Use the enquiry link for a product family and request the current, model-specific portfolio details."},
            {"question": "Where are the specifications and approvals?", "answer": "Specifications, intended use, manufacturer details and regulatory status are published only when verified for a specific model."},
            {"question": "Why are product families organized by workflow?", "answer": "Endourology systems depend on compatibility between visualization, access, navigation, retrieval and drainage devices. The structure makes those interfaces easier to understand."},
        ],
    })

    content["families"] = parse_families(paragraphs)
    content["solutions"] = parse_solutions(paragraphs)
    content["insights"] = {
        "title": "Endourology Insights & Device Guides | TORSH",
        "meta": "Read TORSH insights on flexible ureteroscopy, urology devices, access systems, stone retrieval, guidewires and translational device research.",
        "eyebrow": "Endourology knowledge",
        "heading": "Insights",
        "lead": "A practical resource for the technologies that support endourology. We examine device families, system compatibility, procurement questions and the engineering challenges behind modern surgical workflows.",
        "disclaimer": "Educational content only. Articles are not instructions for clinical use, medical advice or product-performance claims. Clinical review is required before public editorial release.",
        "articles": parse_articles(paragraphs),
    }

    content["contact"].update({
        "title": "Contact TORSH Medical Technologies",
        "meta": "Contact TORSH Medical Technologies about endourology product categories, technical requirements, partnerships and medical-device research.",
        "eyebrow": "Contact TORSH",
        "heading": "Start with the procedure or product requirement.",
        "lead": "Whether you are exploring an endourology device category, defining a procurement requirement or discussing a technical collaboration, share a brief outline of your need. We will direct your enquiry to the appropriate team member.",
        "topics_heading": "What would you like to discuss?",
        "topics": [
            {"icon": "product-segments", "title": "Product discussion", "text": "Share the intended procedure, product category and specifications you need to evaluate."},
            {"icon": "distribution", "title": "Hospital or distributor enquiry", "text": "Tell us about your organization, location, expected application and commercial questions."},
            {"icon": "research", "title": "Research collaboration", "text": "Describe the clinical or engineering question and the type of collaboration you are considering."},
        ],
        "safety": "Please do not submit patient-identifiable information, medical records or sensitive personal health information.",
    })

    CONTENT_PATH.write_text(json.dumps(content, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(content['families'])} families, {len(content['solutions'])} solutions and {len(content['insights']['articles'])} articles.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
