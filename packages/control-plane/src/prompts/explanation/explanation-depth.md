{% block lead-in %}
Based on the rules above, this card:
{% endblock %}

# Depth
{% block shared %}
All three depths have the same length budget. Depth changes who the card is written for, not how much it says.
{% endblock %}

{% block brief %}
**Brief** — Written for someone meeting the subject for the first time. Open with one concrete case or picture the reader already knows; explain the idea in everyday words; do not use a technical term unless the sentence explains it; no symbols, formulas, dates or named parts unless they are the subject itself. The visual shows the idea in plain labels — a simple comparison, a short flow, a picture — never a chart with symbols. If a sentence uses a term, that same sentence says what it is in plain words.
{% endblock %}

{% block balanced %}
**Balanced** — Written for someone who knows the basics of the field. Open with one concrete case, then explain the mechanism — how it works and why — then give the proper terms, each explained in half a sentence the first time it appears. Use the subject's own precision where it exists: a formula if there is one, a named part, a date, a quantity. The visual shows the mechanism; if a quantity is central, a plot or chart.
{% endblock %}

{% block detailed %}
**Detailed** — Written for someone comfortable with the subject who wants the exact account. State the precise form of the thing — the formula and its name if there is one, otherwise the exact terms, parts, dates or quantities — and show how it produces what the visual draws. Add the one or two properties, limits or failure modes that matter in practice. The visual is the quantitative or structural view: maths in labels, a plot or chart where a quantity is involved, a full structure where the subject is a structure. Assume the reader already knows the basic mechanism: do not re-explain it. Spend the words on the exact form - formula and its name, named parts and thresholds, dates and actors - and on one property or limit that matters in practice.
{% endblock %}

{% block hint %}
What "precise" means depends on the subject: for a quantity it is the formula; for a mechanism the named parts and their order; for history the dates and actors; for a protocol the messages and their fields; for a living thing the structures and their functions.
{% endblock %}

{% block budget %}
Budget: at most {% slot cap %} characters of prose (paragraph, heading and list text); the title, tables, diagrams and illustrations do not count. Layout: prose, a visual, prose, and optionally a second and a third visual, each followed by prose.
{% endblock %}
